/**
 * DeviceAssignment — main content for the hardware onboarding step.
 * Handles data loading, drag-and-drop device assignment, and submission.
 */

import React, { useEffect, useCallback, useState, useMemo, useRef } from 'react';
import type {
  Device,
  DECTBase,
  DECTHandset,
  DeviceUserAssignment,
  OnboardingLocation,
} from '../../../../types';
import type { Extension } from '../../../../types/dial-plan';
import { useOnboarding } from '../../OnboardingContext';
import { StepNavigation } from '../../StepNavigation';
import { ErrorAlert } from '../../components/ErrorAlert';
import { SkeletonLine, SkeletonCircle, SkeletonCard } from '../../components/Skeleton';
import { DeviceCard } from './DeviceCard';
import type { AssignableDevice } from './DeviceCard';

// ============================================================================
// Pure helpers
// ============================================================================

/** Resolve the assigned user's TypeID from an assignment (the API returns the
 *  id string, or a summary object when eager-loaded). */
function assignmentUserId(assignment: DeviceUserAssignment): string | undefined {
  const { user } = assignment;
  if (typeof user === 'string') return user;
  if (user && typeof user === 'object') return user.id;
  return assignment.user_id;
}

/** First assignment whose user is one of the onboarding users. */
function firstKnownAssignedUser(
  assignments: DeviceUserAssignment[] | undefined,
  knownUserIds: Set<string>
): string | undefined {
  for (const a of assignments ?? []) {
    const userId = assignmentUserId(a);
    if (userId && knownUserIds.has(userId)) return userId;
  }
  return undefined;
}

/**
 * Reconstruct the current device→user assignments from the device-assignment
 * data (`Device.assignments` on deskphones, `DECTHandset.assignments` on
 * handsets), keyed by the assignable device id.
 */
function buildInitialAssignments(
  devices: Device[],
  dectHandsets: Map<string, DECTHandset[]>,
  knownUserIds: Set<string>
): Map<string, string> {
  const assignments = new Map<string, string>();

  for (const dev of devices) {
    const userId = firstKnownAssignedUser(dev.assignments, knownUserIds);
    if (userId) assignments.set(dev.id, userId);
  }

  for (const handsets of dectHandsets.values()) {
    for (const hs of handsets) {
      const userId = firstKnownAssignedUser(hs.assignments, knownUserIds);
      if (userId) assignments.set(hs.id, userId);
    }
  }

  return assignments;
}

function getAllAssignableDevices(
  devices: Device[],
  dectHandsets: Map<string, DECTHandset[]>,
  deskPhoneLabel: string,
  cordlessLabel: string
): AssignableDevice[] {
  const result: AssignableDevice[] = [];
  for (const dev of devices) {
    const vendor = dev.vendor ? dev.vendor.charAt(0).toUpperCase() + dev.vendor.slice(1) : '';
    const label = `${vendor}${dev.model ? ' ' + dev.model : ''}`.trim() || dev.mac_address;
    result.push({ id: dev.id, type: 'deskphone', label, typeLabel: deskPhoneLabel });
  }
  for (const [baseId, handsets] of dectHandsets.entries()) {
    for (const hs of handsets) {
      result.push({
        id: hs.id,
        type: 'dect-handset',
        label: hs.display_name ?? hs.ipei,
        typeLabel: cordlessLabel,
        baseId,
      });
    }
  }
  return result;
}

// ============================================================================
// Component props
// ============================================================================

export interface DeviceAssignmentProps {
  onDone: () => void;
  onLocationLoaded: (location: OnboardingLocation | null) => void;
  onBack?: () => void;
}

// ============================================================================
// DeviceAssignment component
// ============================================================================

export const DeviceAssignment: React.FC<DeviceAssignmentProps> = ({
  onDone,
  onLocationLoaded,
  onBack,
}) => {
  const {
    dialstack,
    locale,
    users: contextUsers,
    extensions: contextExtensions,
    locations: contextLocations,
  } = useOnboarding();
  const hw = locale.accountOnboarding.hardware;
  const nav = locale.accountOnboarding.nav;

  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [devices, setDevices] = useState<Device[]>([]);
  const [dectBases, setDectBases] = useState<DECTBase[]>([]);
  const [dectHandsets, setDectHandsets] = useState<Map<string, DECTHandset[]>>(new Map());
  const [deviceAssignments, setDeviceAssignments] = useState<Map<string, string>>(new Map());
  // Frozen snapshot of the assignments loaded from the server; the submit diffs
  // the current assignments against it to decide what to add/remove.
  const [initialAssignments, setInitialAssignments] = useState<Map<string, string>>(new Map());
  const [selectedDeviceId, setSelectedDeviceId] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);

  const [dragOverUserId, setDragOverUserId] = useState<string | null>(null);

  const assignDevice = useCallback((deviceId: string, userId: string) => {
    setDeviceAssignments((prev) => {
      const next = new Map(prev);
      for (const [existingDeviceId, existingUserId] of next.entries()) {
        if (existingUserId === userId) {
          next.delete(existingDeviceId);
          break;
        }
      }
      next.set(deviceId, userId);
      return next;
    });
    setSelectedDeviceId(null);
  }, []);

  const unassignUser = useCallback((userId: string) => {
    setDeviceAssignments((prev) => {
      const next = new Map(prev);
      for (const [deviceId, assignedUserId] of next.entries()) {
        if (assignedUserId === userId) {
          next.delete(deviceId);
          break;
        }
      }
      return next;
    });
    setSelectedDeviceId(null);
  }, []);

  // Load device-specific data (users/extensions/locations come from context).
  // Only seed deviceAssignments / initialAssignments on the FIRST load —
  // a parent-triggered reload (e.g. from the previous step's handleDone)
  // could otherwise wipe in-flight user clicks that haven't been submitted.
  const hasSeededRef = useRef(false);
  useEffect(() => {
    let cancelled = false;
    async function load() {
      if (!hasSeededRef.current) setIsLoading(true);
      setLoadError(null);
      try {
        // expand[]=users hydrates Device.assignments in the same list call.
        const [devicesResult, dectBasesResult] = await Promise.all([
          dialstack.devices
            .list({ type: 'deskphone', expand: ['users'] })
            .catch(() => [] as Device[]),
          dialstack.dectBases.list().catch(() => [] as DECTBase[]),
        ]);

        if (cancelled) return;

        const devices = devicesResult ?? [];
        const dectBases = dectBasesResult ?? [];
        const handsetMap = new Map<string, DECTHandset[]>();
        // Handset IDs are device IDs, so their assignments come from the
        // device-assignment endpoint (there is no expand on the handset list).
        await Promise.all(
          dectBases.map(async (b) => {
            const hs = await dialstack.dectBases.handsets.list(b.id);
            await Promise.all(
              hs.map(async (h) => {
                h.assignments = await dialstack.devices.users.list(h.id).catch(() => []);
              })
            );
            handsetMap.set(b.id, hs);
          })
        );

        if (cancelled) return;

        const knownUserIds = new Set(contextUsers.map((u) => u.id));
        const loc = contextLocations[0] ?? null;
        const assignments = buildInitialAssignments(devices, handsetMap, knownUserIds);

        setDevices(devices);
        setDectBases(dectBases);
        setDectHandsets(handsetMap);
        if (!hasSeededRef.current) {
          setDeviceAssignments(assignments);
          setInitialAssignments(assignments);
          hasSeededRef.current = true;
        }
        setIsLoading(false);
        setLoadError(null);

        onLocationLoaded(loc);
      } catch (err) {
        if (!cancelled) {
          setIsLoading(false);
          setLoadError(err instanceof Error ? err.message : String(err));
        }
      }
    }
    void load();
    return () => {
      cancelled = true;
    };
  }, [dialstack, contextUsers, contextLocations, onLocationLoaded]);

  const allDevices = useMemo(
    () => getAllAssignableDevices(devices, dectHandsets, hw.deskPhone, hw.cordless),
    [devices, dectHandsets, hw.deskPhone, hw.cordless]
  );
  const hasDevices = allDevices.length > 0;
  const unassignedDevices = allDevices.filter((d) => !deviceAssignments.has(d.id));
  const allAssigned = hasDevices && deviceAssignments.size === allDevices.length;
  const getDeviceForUser = useCallback(
    (userId: string): AssignableDevice | undefined => {
      for (const [deviceId, assignedUserId] of deviceAssignments.entries()) {
        if (assignedUserId === userId) {
          return allDevices.find((d) => d.id === deviceId);
        }
      }
      return undefined;
    },
    [deviceAssignments, allDevices]
  );

  const getExtensionForUser = useCallback(
    (userId: string): Extension | undefined => {
      return contextExtensions.find((e) => e.target === userId);
    },
    [contextExtensions]
  );

  const handleSelectDevice = useCallback((deviceId: string) => {
    setSelectedDeviceId((prev) => (prev === deviceId ? null : deviceId));
  }, []);

  const handleDropZoneClick = useCallback(
    (userId: string) => {
      if (selectedDeviceId) {
        assignDevice(selectedDeviceId, userId);
      }
    },
    [selectedDeviceId, assignDevice]
  );

  const handleSubmitAssignments = useCallback(async () => {
    if (isSubmitting) return;

    setIsSubmitting(true);
    setActionError(null);

    try {
      // Remove assignments the user changed or cleared. Do all removals before
      // additions: a user holds a single endpoint, so reassigning a user to a
      // new device would 409 (user_already_has_endpoint) if the old assignment
      // still exists. Assigning a user provisions the endpoint + line/extension
      // server-side, and removing it cleans them up.
      for (const [deviceId, initialUserId] of initialAssignments.entries()) {
        if (deviceAssignments.get(deviceId) !== initialUserId) {
          await dialstack.devices.users.del(deviceId, initialUserId);
        }
      }

      for (const [deviceId, userId] of deviceAssignments.entries()) {
        if (initialAssignments.get(deviceId) === userId) continue;
        await dialstack.devices.users.create(deviceId, { user: userId });
      }

      // Baseline the applied assignment state now, before the (idempotent)
      // location backfill. If backfill fails, a retry re-runs only the backfill
      // rather than replaying the create/delete calls (which would 409/404).
      setInitialAssignments(new Map(deviceAssignments));

      // Backfill location_id on assigned devices that don't have one yet, so
      // outbound PSTN works as soon as onboarding completes. Devices that
      // already carry a location keep it; we never override.
      const defaultLocationId = contextLocations[0]?.id;
      if (defaultLocationId) {
        const basesUpdated = new Set<string>();
        for (const deviceId of deviceAssignments.keys()) {
          const device = allDevices.find((d) => d.id === deviceId);
          if (!device) continue;
          if (device.type === 'deskphone') {
            const dev = devices.find((d) => d.id === deviceId);
            if (dev && !dev.location_id) {
              await dialstack.devices.update(dev.id, { location_id: defaultLocationId });
            }
          } else if (device.type === 'dect-handset' && device.baseId) {
            if (basesUpdated.has(device.baseId)) continue;
            const base = dectBases.find((b) => b.id === device.baseId);
            if (base && !base.location_id) {
              await dialstack.devices.update(base.id, { location_id: defaultLocationId });
              basesUpdated.add(base.id);
            }
          }
        }
      }

      setIsSubmitting(false);
      onDone();
    } catch (err) {
      setIsSubmitting(false);
      setActionError(err instanceof Error ? err.message : String(err));
    }
  }, [
    isSubmitting,
    initialAssignments,
    deviceAssignments,
    devices,
    dectBases,
    allDevices,
    contextLocations,
    dialstack,
    onDone,
  ]);

  const handleNext = useCallback(() => {
    // Submit when there is anything to add (current assignments) OR anything
    // to remove (an initial assignment the user unassigned). Skipping submit on
    // an all-unassigned state left previously-saved assignments in place — the
    // user would see the device "still assigned" on the next mount.
    if (deviceAssignments.size > 0 || initialAssignments.size > 0) {
      void handleSubmitAssignments();
    } else {
      onDone();
    }
  }, [deviceAssignments.size, initialAssignments.size, handleSubmitAssignments, onDone]);

  // ============================================================================
  // Render
  // ============================================================================

  if (isLoading) {
    return (
      <div>
        <div className="card" style={{ padding: 'var(--ds-layout-spacing-lg)' }}>
          <SkeletonLine width="200px" height="24px" style={{ marginBottom: 8 }} />
          <SkeletonLine width="300px" height="14px" style={{ marginBottom: 24 }} />
          {/* Device cards row */}
          <div style={{ display: 'flex', gap: 12, marginBottom: 24 }}>
            {[0, 1, 2, 3].map((i) => (
              <SkeletonCard key={i}>
                <SkeletonLine width="40px" height="40px" style={{ marginBottom: 8 }} />
                <SkeletonLine width="80px" height="12px" style={{ marginBottom: 4 }} />
                <SkeletonLine width="60px" height="10px" />
              </SkeletonCard>
            ))}
          </div>
          {/* Table rows skeleton */}
          {[0, 1].map((i) => (
            <div
              key={i}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 12,
                padding: '12px 0',
                borderTop: '1px solid var(--ds-color-border-subtle)',
              }}
            >
              <SkeletonCircle size="32px" />
              <SkeletonLine width="120px" height="14px" />
              <SkeletonLine width="50px" height="14px" />
              <SkeletonLine height="32px" style={{ flex: 1 }} />
            </div>
          ))}
        </div>
      </div>
    );
  }

  if (loadError) {
    return (
      <div>
        <div className="card">
          <ErrorAlert message={loadError} />
        </div>
      </div>
    );
  }

  if (contextUsers.length === 0) {
    return (
      <div>
        <div className="card">
          <h2 className="section-title">{hw.title}</h2>
          <p className="section-subtitle">{hw.noUsers}</p>
        </div>
        <StepNavigation nextLabel={`${nav.next} \u2192`} isNextDisabled />
      </div>
    );
  }

  const MAX_VISUAL_LAYERS = 3;

  // Group unassigned devices by label for stacking
  const groups = new Map<string, AssignableDevice[]>();
  for (const d of unassignedDevices) {
    const group = groups.get(d.label) ?? [];
    group.push(d);
    groups.set(d.label, group);
  }

  const availableSection = hasDevices ? (
    <div className="hw-available-devices">
      <div className="hw-available-devices-label">{hw.availableDevices}</div>
      {allAssigned ? (
        <div className="hw-all-assigned">{hw.allAssigned}</div>
      ) : (
        <div className="hw-device-cards">
          {[...groups.values()].map((group, groupIdx) => {
            const count = group.length;
            const visualCount = Math.min(count, MAX_VISUAL_LAYERS);
            const visualSlice = group.slice(group.length - visualCount);
            const extraPx = (visualCount - 1) * 2.5;
            return (
              <div
                key={groupIdx}
                className="hw-device-stack"
                style={{ marginRight: extraPx, marginBottom: extraPx }}
              >
                {count > 1 && <span className="hw-stack-count">{count}</span>}
                {visualSlice.map((device, i) => {
                  const isTop = i === visualSlice.length - 1;
                  const offset = (visualCount - 1 - i) * 2.5;
                  return (
                    <DeviceCard
                      key={device.id}
                      device={device}
                      isSelected={isTop && device.id === selectedDeviceId}
                      isStacked={!isTop}
                      stackOffset={offset}
                      stackZIndex={i}
                      onSelect={handleSelectDevice}
                    />
                  );
                })}
              </div>
            );
          })}
        </div>
      )}
    </div>
  ) : (
    <div className="placeholder">
      <div className="placeholder-text">{hw.noDevices}</div>
    </div>
  );

  const teamTable = (
    <table className="hw-team-table">
      <thead>
        <tr>
          <th>{hw.tableHeaderName}</th>
          <th>{hw.tableHeaderExtension}</th>
          <th>{hw.tableHeaderDevice}</th>
        </tr>
      </thead>
      <tbody>
        {contextUsers.map((u) => {
          const displayName = u.name ?? u.email ?? u.id;
          const initials = (u.name ?? u.email ?? '?')
            .split(' ')
            .map((w) => w[0])
            .slice(0, 2)
            .join('');
          const ext = getExtensionForUser(u.id);
          const extNumber = ext?.number ?? '—';
          const assignedDevice = getDeviceForUser(u.id);
          const isDragOver = dragOverUserId === u.id;

          return (
            <tr key={u.id}>
              <td>
                <div className="hw-team-name">
                  <span className="hw-team-avatar">{initials}</span>
                  <span className="hw-team-name-text">{displayName}</span>
                </div>
              </td>
              <td>{extNumber}</td>
              <td>
                {assignedDevice ? (
                  <span className="hw-device-badge-chip">
                    {assignedDevice.label}
                    <button
                      className="hw-device-badge-chip__remove"
                      title={hw.unassign}
                      onClick={() => unassignUser(u.id)}
                    >
                      &times;
                    </button>
                  </span>
                ) : (
                  <div
                    className={`hw-drop-zone${selectedDeviceId ? ' hw-drop-zone--selectable' : ''}${isDragOver ? ' drag-over' : ''}`}
                    onDragOver={(e) => {
                      e.preventDefault();
                      e.dataTransfer.dropEffect = 'move';
                      setDragOverUserId(u.id);
                    }}
                    onDragEnter={() => setDragOverUserId(u.id)}
                    onDragLeave={() => setDragOverUserId(null)}
                    onDrop={(e) => {
                      e.preventDefault();
                      setDragOverUserId(null);
                      const draggedDeviceId = e.dataTransfer.getData('text/plain');
                      if (draggedDeviceId) {
                        assignDevice(draggedDeviceId, u.id);
                      }
                    }}
                    onClick={() => handleDropZoneClick(u.id)}
                  >
                    <span className="hw-drop-zone__placeholder">
                      {selectedDeviceId ? hw.clickToAssign : hw.dragDropHint}
                    </span>
                  </div>
                )}
              </td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );

  const errorMargin = { marginBottom: 'var(--ds-layout-spacing-sm)' };
  const actionErrorEl = <ErrorAlert message={actionError} style={errorMargin} />;

  // Enable Next whenever there is something to persist \u2014 a new assignment to
  // add, or a previously-saved assignment the user has just removed. (Disabling
  // on an empty assignment set made the removal-submit branch in handleNext
  // unreachable, so unassigning your only device couldn't be saved.) With
  // nothing to add and nothing to remove there is no work, so keep it disabled.
  const hasPendingChange = deviceAssignments.size > 0 || initialAssignments.size > 0;
  const footer = (
    <>
      <StepNavigation
        onBack={onBack}
        backLabel={onBack ? `\u2190 ${nav.back}` : undefined}
        onNext={handleNext}
        nextLabel={isSubmitting ? hw.submitting : hw.assignAndComplete}
        isNextDisabled={isSubmitting || !hasPendingChange}
      />
    </>
  );

  return (
    <div>
      <div className="card">
        <h2 className="section-title">{hw.title}</h2>
        <p className="section-subtitle">{hw.subtitle}</p>
        {actionErrorEl}
        {availableSection}
        {hasDevices && teamTable}
      </div>
      {footer}
    </div>
  );
};
