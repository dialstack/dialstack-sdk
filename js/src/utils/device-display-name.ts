/**
 * The name a device is shown under.
 *
 * Devices are mostly "the phone on someone's desk", so an unnamed device takes
 * its user's name and follows that user through reassignment and
 * renames. A stored name is an explicit override and always wins; clearing it
 * restores inheritance. Nothing here is persisted — it is resolved on read so
 * there is no copied name to keep in sync.
 */

import type { DeviceType } from '../types/device';

interface DisplayNameUser {
  name?: string | null;
  email?: string | null;
}

/** Structural subset of `Device` the resolution needs. */
export interface DeviceDisplayNameInput {
  id: string;
  type?: DeviceType;
  /** The override, on every device type. */
  name?: string | null;
  /** Deprecated handset alias of `name`, read only when `name` is absent. */
  display_name?: string | null;
  mac_address?: string | null;
  ipei?: string | null;
  /** `user` is an id string unless the user itself was expanded. */
  assignments?: ReadonlyArray<{
    line_number?: number;
    user_id?: string;
    user?: DisplayNameUser | string | null;
  }>;
  assigned_users?: ReadonlyArray<DisplayNameUser>;
}

export type DeviceDisplayNameSource = 'override' | 'user' | 'hardware';

export interface DeviceDisplayName {
  name: string;
  source: DeviceDisplayNameSource;
}

function nonBlank(value: string | null | undefined): string | undefined {
  const trimmed = value?.trim();
  return trimmed ? trimmed : undefined;
}

function userLabel(user: DisplayNameUser | string | null | undefined): string | undefined {
  if (!user || typeof user === 'string') return undefined;
  return nonBlank(user.name) ?? nonBlank(user.email);
}

/**
 * The device's one user. A device shared by several users belongs to none of
 * them, so it inherits nobody's name.
 */
function soleUserLabel(device: DeviceDisplayNameInput): string | undefined {
  // Assignments name their users only when expanded; otherwise only
  // assigned_users can.
  const fromAssignments = (device.assignments ?? [])
    .map((a) => userLabel(a.user))
    .filter((l): l is string => !!l);
  const labels = new Set(
    fromAssignments.length > 0
      ? fromAssignments
      : (device.assigned_users ?? []).map(userLabel).filter((l): l is string => !!l)
  );
  // Distinct users, not lines: one user on two lines is still that user's phone.
  const assignmentUsers = new Set(
    (device.assignments ?? []).map(
      (a, i) => a.user_id ?? (typeof a.user === 'string' ? a.user : `line-${i}`)
    )
  );
  const assignees = Math.max(assignmentUsers.size, device.assigned_users?.length ?? 0);
  if (assignees !== 1 || labels.size !== 1) return undefined;
  return [...labels][0];
}

export function deviceDisplayName(device: DeviceDisplayNameInput): DeviceDisplayName {
  const override =
    nonBlank(device.name) ??
    (device.type === 'dect_handset' ? nonBlank(device.display_name) : undefined);
  if (override) return { name: override, source: 'override' };

  const user = soleUserLabel(device);
  if (user) return { name: user, source: 'user' };

  return {
    name: nonBlank(device.mac_address) ?? nonBlank(device.ipei) ?? device.id,
    source: 'hardware',
  };
}
