/**
 * Device onboarding-readiness derivation.
 *
 * Derives the readiness conditions of a device from the raw fields shipped by
 * `GET /v1/devices` so every consumer (admin portal, embedded components,
 * partner integrations) computes the same answer. Nothing here is stored —
 * each condition reflects a live signal:
 *
 * - **provisioned** — the device has fetched its settings (`status`).
 * - **online** — the device is reachable right now (`registration_status`).
 *   Online does NOT mean the device can place a call.
 * - **assigned** — the device belongs to a user. A floating gate: it can flip
 *   true at any point and is the prerequisite of `readyToCall`, not a fixed
 *   step. Derived from `assignments` (deskphones/handsets — requires the
 *   device to have been fetched with `expand[]=users`). DECT bases are never
 *   user-assigned (their handsets are), so the gate does not apply to them
 *   and `assigned` always reads true.
 * - **readyToCall** — assigned AND online: the user's line is live, the
 *   device can make and receive calls.
 * - **firstCall** — the device has carried a call (`last_call_at` non-null).
 *
 * `graduated` (=== `firstCall`) is the one-way gate out of onboarding UX: a
 * device that has carried a call shows a calm steady-state view instead of
 * the checklist. It is derived, not frozen — the backend computes
 * `last_call_at` over the device's *current* lines, so reassigning a device
 * re-opens onboarding for the new user's line.
 */

import type { DeviceType, RegistrationStatus } from '../types/device';

/**
 * Structural subset of `Device` that readiness derivation needs. Accepting a
 * subset (rather than the full `Device`) lets callers with their own device
 * row shapes reuse the derivation as long as they carry the raw fields.
 */
export interface DeviceReadinessInput {
  /** Device type discriminator; assignment derivation differs for DECT bases. */
  type?: DeviceType;
  /** Persisted provisioning status (`pending-sync` | `provisioned`). */
  status: string;
  /** Live reachability, always present on `/v1/devices` responses. */
  registration_status: RegistrationStatus;
  /** Latest call involving the device, or `null` until its first call. */
  last_call_at: string | null;
  /**
   * User assignments (deskphones and DECT handsets). Only hydrated when the
   * device was fetched with `expand[]=users`; without it, `assigned` reads
   * false.
   */
  assignments?: readonly unknown[];
  /** E911 dispatch location (deskphones and DECT bases; handsets inherit). */
  location_id?: string | null;
  /** Paired DECT base (handsets only). */
  base_id?: string | null;
}

/** A configuration prerequisite the device is still missing. */
export type DeviceReadinessPrerequisite = 'user' | 'location' | 'base';

/** Onboarding spine steps, in order. */
export type DeviceReadinessStep = 'provisioned' | 'online' | 'ready_to_call' | 'first_call';

export interface DeviceReadiness {
  /** The device has fetched its settings. */
  provisioned: boolean;
  /** The device is reachable right now (not the same as call-capable). */
  online: boolean;
  /** The device belongs to a user — the floating gate into `readyToCall`. */
  assigned: boolean;
  /** Assigned and online: the device can make and receive calls. */
  readyToCall: boolean;
  /** The device has carried a call (`last_call_at` non-null). */
  firstCall: boolean;
  /** Whether the device has left onboarding (=== `firstCall`). */
  graduated: boolean;
  /** First incomplete step on the spine, or `null` when all are satisfied. */
  currentStep: DeviceReadinessStep | null;
  /** How many of the four spine steps are satisfied (0–4). */
  completedCount: number;
  /**
   * Configuration prerequisites the device is still missing, per device
   * type: a user for the line (deskphones/handsets), an E911 location
   * (deskphones/bases — handsets inherit their base's), and a paired base
   * (handsets — their config flows through it). The single source of truth
   * for "what must be filled in before this phone can place calls".
   */
  missing: DeviceReadinessPrerequisite[];
}

/**
 * Derive the readiness conditions for a device.
 *
 * The spine is provisioned → online → ready to call → first call, but it is
 * not a strict sequence: `assigned` floats and gates `readyToCall`, so e.g. a
 * userless device can be online while blocked on assignment.
 */
export function deviceReadiness(device: DeviceReadinessInput): DeviceReadiness {
  // Note: the backend never reports a registered device that hasn't
  // provisioned (a registration requires a fetched configuration), so the
  // raw fields are taken at face value — no client-side reconciliation.
  const provisioned = device.status === 'provisioned';
  const online = device.registration_status === 'registered';
  // DECT bases are never user-assigned — their handsets carry the
  // assignments — so the gate doesn't apply: a base that is online is as
  // call-ready as a base gets (the backend aggregates its handsets'
  // extensions for the registration and call signals).
  const assigned = device.type === 'dect_base' ? true : (device.assignments?.length ?? 0) > 0;
  const readyToCall = assigned && online;
  const firstCall = device.last_call_at !== null && device.last_call_at !== undefined;

  const missing: DeviceReadinessPrerequisite[] = [];
  if (device.type !== 'dect_base' && !assigned) missing.push('user');
  if (device.type !== 'dect_handset' && !device.location_id) missing.push('location');
  if (device.type === 'dect_handset' && !device.base_id) missing.push('base');

  const spine: Array<[DeviceReadinessStep, boolean]> = [
    ['provisioned', provisioned],
    ['online', online],
    ['ready_to_call', readyToCall],
    ['first_call', firstCall],
  ];
  const firstIncomplete = spine.find(([, done]) => !done);

  return {
    provisioned,
    online,
    assigned,
    readyToCall,
    firstCall,
    graduated: firstCall,
    currentStep: firstIncomplete ? firstIncomplete[0] : null,
    completedCount: spine.filter(([, done]) => done).length,
    missing,
  };
}
