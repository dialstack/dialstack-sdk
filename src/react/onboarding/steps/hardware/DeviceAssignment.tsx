/**
 * DeviceAssignment — main content for the hardware onboarding step.
 * Handles data loading, drag-and-drop device assignment, and submission.
 */

import React, { useEffect, useCallback, useState, useMemo } from 'react';
import type {
  Device,
  DECTBase,
  DECTHandset,
  OnboardingEndpoint,
  OnboardingLocation,
} from '../../../../types';
import type { Extension } from '../../../../types/dial-plan';
import type { DialStackInstance } from '../../../../types';
import { useOnboarding } from '../../OnboardingContext';
import { StepNavigation } from '../../StepNavigation';
import { ErrorAlert } from '../../components/ErrorAlert';
import { SkeletonLine, SkeletonCircle, SkeletonCard } from '../../components/Skeleton';
import { DeviceCard } from './DeviceCard';
import type { AssignableDevice } from './DeviceCard';

// ============================================================================
// Types
// ============================================================================

interface InitialDeviceRecord {
  type: 'line' | 'dect';
  recordId: string;
  endpointId: string;
  deviceId: string;
  baseId?: string;
  handsetId?: string;
}

// ============================================================================
// Pure helpers
// ============================================================================

function buildInitialAssignments(
  devices: Device[],
  dectHandsets: Map<string, DECTHandset[]>,
  userEndpointMap: Map<string, OnboardingEndpoint[]>
): { assignments: Map<string, string>; initialRecords: Map<string, InitialDeviceRecord> } {
  const endpointToUser = new Map<string, string>();
  for (const [userId, eps] of userEndpointMap.entries()) {
    for (const ep of eps) endpointToUser.set(ep.id, userId);
  }

  const assignments = new Map<string, string>();
  const initialRecords = new Map<string, InitialDeviceRecord>();

  for (const dev of devices) {
    const lines = dev.lines ?? [];
    const assignedLine = lines.find((l) => l.endpoint_id && endpointToUser.has(l.endpoint_id));
    if (assignedLine) {
      const userId = endpointToUser.get(assignedLine.endpoint_id!)!;
      assignments.set(dev.id, userId);
      initialRecords.set(dev.id, {
        type: 'line',
        recordId: assignedLine.id,
        endpointId: assignedLine.endpoint_id!,
        deviceId: dev.id,
      });
    }
  }

  for (const [baseId, handsets] of dectHandsets.entries()) {
    for (const hs of handsets) {
      const ext = (hs.extensions ?? []).find((e) => endpointToUser.has(e.endpoint_id));
      if (ext) {
        const userId = endpointToUser.get(ext.endpoint_id)!;
        assignments.set(hs.id, userId);
        initialRecords.set(hs.id, {
          type: 'dect',
          recordId: ext.id,
          endpointId: ext.endpoint_id,
          deviceId: hs.id,
          baseId,
          handsetId: hs.id,
        });
      }
    }
  }

  return { assignments, initialRecords };
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

async function ensureEndpoint(
  userId: string,
  userEndpointMap: Map<string, OnboardingEndpoint[]>,
  dialstack: DialStackInstance
): Promise<{ endpoint: OnboardingEndpoint; isNew: boolean }> {
  const existing = userEndpointMap.get(userId) ?? [];
  if (existing.length > 0) return { endpoint: existing[0]!, isNew: false };
  const endpoint = await dialstack.createEndpoint(userId);
  return { endpoint, isNew: true };
}

async function deleteDeviceRecord(
  record: {
    type: 'line' | 'dect';
    recordId: string;
    deviceId: string;
    baseId?: string;
    handsetId?: string;
  },
  dialstack: DialStackInstance
): Promise<void> {
  if (record.type === 'line') {
    await dialstack.deleteDeskphoneLine(record.deviceId, record.recordId);
  } else if (record.baseId && record.handsetId) {
    await dialstack.deleteDECTExtension(record.baseId, record.handsetId, record.recordId);
  }
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
  const [dectHandsets, setDectHandsets] = useState<Map<string, DECTHandset[]>>(new Map());
  const [userEndpointMap, setUserEndpointMap] = useState<Map<string, OnboardingEndpoint[]>>(
    new Map()
  );
  const [deviceAssignments, setDeviceAssignments] = useState<Map<string, string>>(new Map());
  const [initialDeviceRecords, setInitialDeviceRecords] = useState<
    Map<string, InitialDeviceRecord>
  >(new Map());
  const [selectedDeviceId, setSelectedDeviceId] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const [gateError, setGateError] = useState<string | null>(null);
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
    setGateError(null);
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
  useEffect(() => {
    let cancelled = false;
    async function load() {
      setIsLoading(true);
      setLoadError(null);
      try {
        const [devicesResult, dectBasesResult] = await Promise.all([
          dialstack.listDevices({ type: 'deskphone' }).catch(() => [] as Device[]),
          dialstack.listDECTBases().catch(() => [] as DECTBase[]),
        ]);

        if (cancelled) return;

        if (cancelled) return;

        const devices = devicesResult ?? [];
        await Promise.all(
          devices.map(async (dev) => {
            dev.lines = await dialstack.listDeskphoneLines(dev.id);
          })
        );

        if (cancelled) return;

        const dectBases = dectBasesResult ?? [];
        const handsetMap = new Map<string, DECTHandset[]>();
        await Promise.all(
          dectBases.map(async (b) => {
            const hs = await dialstack.listDECTHandsets(b.id);
            handsetMap.set(b.id, hs);
          })
        );

        if (cancelled) return;

        const endpointMap = new Map<string, OnboardingEndpoint[]>();
        await Promise.all(
          contextUsers.map(async (u) => {
            const eps = await dialstack.listEndpoints(u.id);
            endpointMap.set(u.id, eps);
          })
        );

        const loc = contextLocations[0] ?? null;
        const { assignments, initialRecords } = buildInitialAssignments(
          devices,
          handsetMap,
          endpointMap
        );

        setDevices(devices);
        setDectHandsets(handsetMap);
        setUserEndpointMap(endpointMap);
        setDeviceAssignments(assignments);
        setInitialDeviceRecords(initialRecords);
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
  const allUsersHaveDevices =
    contextUsers.length > 0 &&
    contextUsers.every((u) => new Set(deviceAssignments.values()).has(u.id));

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
    setGateError(null);
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

    if (!allUsersHaveDevices) {
      setGateError(hw.gate.allUsersMustHaveDevice);
      return;
    }

    setIsSubmitting(true);
    setActionError(null);
    setGateError(null);

    // We need a mutable copy of the endpoint map for ensureEndpoint
    const localEndpointMap = new Map(userEndpointMap);

    try {
      // Remove stale assignments
      for (const [deviceId, initial] of initialDeviceRecords.entries()) {
        const currentUserId = deviceAssignments.get(deviceId);
        if (!currentUserId) {
          await deleteDeviceRecord(initial, dialstack);
          continue;
        }
        const { endpoint, isNew } = await ensureEndpoint(
          currentUserId,
          localEndpointMap,
          dialstack
        );
        if (isNew) {
          const existing = localEndpointMap.get(currentUserId) ?? [];
          localEndpointMap.set(currentUserId, [...existing, endpoint]);
        }
        if (endpoint.id !== initial.endpointId) {
          await deleteDeviceRecord(initial, dialstack);
        }
      }

      for (const [deviceId, userId] of deviceAssignments.entries()) {
        const device = allDevices.find((d) => d.id === deviceId);
        if (!device) continue;

        const { endpoint, isNew } = await ensureEndpoint(userId, localEndpointMap, dialstack);
        if (isNew) {
          const existing = localEndpointMap.get(userId) ?? [];
          localEndpointMap.set(userId, [...existing, endpoint]);
          setUserEndpointMap((prev) => {
            const next = new Map(prev);
            const existing = next.get(userId) ?? [];
            next.set(userId, [...existing, endpoint]);
            return next;
          });
        }

        if (device.type === 'deskphone') {
          const dev = devices.find((d) => d.id === deviceId);
          const lines = dev?.lines ?? [];
          const existingLine = lines.find((l) => l.endpoint_id === endpoint.id);
          if (!existingLine) {
            await dialstack.createDeskphoneLine(deviceId, { endpoint_id: endpoint.id });
          }
        } else if (device.type === 'dect-handset' && device.baseId) {
          const handsets = dectHandsets.get(device.baseId) ?? [];
          const hs = handsets.find((h) => h.id === deviceId);
          const exts = hs?.extensions ?? [];
          const existingExt = exts.find((e) => e.endpoint_id === endpoint.id);
          if (!existingExt) {
            await dialstack.createDECTExtension(device.baseId, deviceId, {
              endpoint_id: endpoint.id,
            });
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
    initialDeviceRecords,
    deviceAssignments,
    devices,
    dectHandsets,
    userEndpointMap,
    allUsersHaveDevices,
    allDevices,
    dialstack,
    hw.gate.allUsersMustHaveDevice,
    onDone,
  ]);

  const handleNext = useCallback(() => {
    if (hasDevices && !allUsersHaveDevices) {
      setGateError(hw.gate.allUsersMustHaveDevice);
      return;
    }
    setGateError(null);
    onDone();
  }, [hasDevices, allUsersHaveDevices, hw.gate.allUsersMustHaveDevice, onDone]);

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
        <StepNavigation onNext={onDone} nextLabel={`${nav.next} \u2192`} />
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
  const gateErrorEl = <ErrorAlert message={gateError} style={errorMargin} />;
  const actionErrorEl = <ErrorAlert message={actionError} style={errorMargin} />;

  const footer =
    hasDevices && allUsersHaveDevices ? (
      <>
        {gateErrorEl}
        <div className={`footer-bar${onBack ? '' : ' footer-bar-end'}`}>
          {onBack && (
            <button type="button" className="btn-ghost" onClick={onBack}>
              ← {nav.back}
            </button>
          )}
          <button
            type="button"
            className="btn btn-primary"
            disabled={isSubmitting}
            onClick={() => void handleSubmitAssignments()}
          >
            {isSubmitting ? hw.submitting : hw.assignAndComplete}
          </button>
        </div>
      </>
    ) : (
      <>
        {gateErrorEl}
        <StepNavigation
          onBack={onBack}
          backLabel={onBack ? `\u2190 ${nav.back}` : undefined}
          onNext={handleNext}
          nextLabel={`${nav.next} \u2192`}
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
