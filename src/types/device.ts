/**
 * Device Provisioning Types
 *
 * Types for managing provisioned devices in the DialStack platform.
 */

import type { DeviceSettings } from './provisioning';
import type { MulticellRole, DECTHandset } from './dect';
import type { ButtonCompatibilitySummary } from './button';

// ============================================================================
// Device Type (unified API)
// ============================================================================

/**
 * Discriminator for the unified `/v1/devices` endpoint.
 */
export type DeviceType = 'deskphone' | 'dect_base' | 'dect_handset';

// ============================================================================
// Device
// ============================================================================

/**
 * A device returned by `GET /v1/devices` or `GET /v1/devices/:id`.
 * The `type` field discriminates between deskphones and DECT bases.
 * Type-specific fields are present only for the corresponding type.
 *
 * Use the `isDeskphone()` and `isDECTBase()` type guards for safe narrowing.
 */
export interface Device {
  /** TypeID with `dev_` or `dectb_` prefix */
  id: string;
  /** Device type discriminator */
  type: DeviceType;
  /** Hardware MAC address (e.g., "00:04:13:aa:bb:cc") */
  mac_address: string;
  /** Detected vendor (e.g., "snom", "yealink") */
  vendor: string;
  /** Device model (e.g., "D785", "M700") */
  model?: string;
  /**
   * Human-friendly label for the device. Set by admins on deskphones,
   * DECT bases, and DECT handsets; `null` when unassigned. (Handset
   * responses also expose this value as `display_name` for backwards
   * compatibility with the legacy DECT API.)
   */
  name?: string | null;
  /**
   * Physical E911 location for this device. Set on deskphones and DECT
   * bases; `null` when unassigned. DECT handsets have no `location_id` of
   * their own — they inherit from the paired base and the handset
   * response carries `null` here.
   */
  location_id?: string | null;
  /** Reusable programmable-key template bound to this device. */
  button_template_id?: string | null;
  /** Current provisioning status */
  status: DeviceStatus;
  /** Device-specific settings overrides */
  overrides?: DeviceSettings;
  /** Last known IP address from provisioning request */
  current_ip_address?: string;
  /** ISO 8601 timestamp of last successful config fetch */
  last_provisioned_at?: string;
  /**
   * Whether the device is currently reachable (online). Live-derived from the
   * device's assigned lines; distinct from `status`, which only reflects
   * whether the device has fetched its config. Always present.
   */
  registration_status: RegistrationStatus;
  /**
   * ISO 8601 timestamp of when reachability was last confirmed; `null` when
   * the device is not currently reachable.
   */
  last_registered_at: string | null;
  /**
   * ISO 8601 timestamp of the latest call attempt involving the device (any
   * outcome), or `null` until its first call. Presence means the device has
   * carried a call; recency indicates whether it is still in use.
   */
  last_call_at: string | null;
  /** ISO 8601 timestamp */
  created_at: string;
  /** ISO 8601 timestamp */
  updated_at: string;

  /**
   * User assignments (deskphones and DECT handsets). Only hydrated when the
   * device is fetched with `expand[]=users`; absent otherwise. DECT bases
   * always carry an empty array — handsets, not bases, are user-assigned.
   */
  assignments?: DeviceUserAssignment[];

  // Deskphone-specific fields (present when type === 'deskphone')
  /** TypeID of the primary line */
  primary_line_id?: string;
  /** Configured lines on this device */
  lines?: DeviceLine[];

  // DECT base-specific fields (present when type === 'dect_base')
  /** Role in multicell deployment */
  multicell_role?: MulticellRole;
  /** Maximum number of handsets this base supports */
  max_handsets?: number;
  /** Current firmware version */
  firmware_version?: string;
  /** Associated handsets (when eager-loaded) */
  handsets?: DECTHandset[];

  /** Programmable-key compatibility for the current effective button set. */
  compatibility?: ButtonCompatibilitySummary;
}

/**
 * Type guard: returns true if the device is a deskphone.
 */
export function isDeskphone(device: Device): boolean {
  return device.type === 'deskphone';
}

/**
 * Type guard: returns true if the device is a DECT base station.
 */
export function isDECTBase(device: Device): boolean {
  return device.type === 'dect_base';
}

/**
 * A user assignment on a device, present on `/v1/devices` responses fetched
 * with `expand[]=users`. On deskphones one assignment exists per assigned
 * line; on DECT handsets one per extension.
 */
export interface DeviceUserAssignment {
  /** TypeID of the assigned user */
  user_id: string;
  /** TypeID of the device */
  device_id: string;
  /** Line number on the device (deskphones; 1-based) */
  line_number?: number;
  /** ISO 8601 timestamp */
  created_at: string;
  /** Assigned user summary (when eager-loaded) */
  user?: {
    id: string;
    name?: string | null;
    email?: string | null;
  };
}

// ============================================================================
// Device Status
// ============================================================================

/**
 * Status of a provisioned device.
 *
 * - `pending-sync`: Device has been registered but not yet provisioned
 * - `provisioned`: Device has successfully fetched its configuration
 */
export type DeviceStatus = 'pending-sync' | 'provisioned';

/**
 * Live reachability of a device, derived at read time from its assigned lines.
 *
 * - `registered`: the device is currently reachable (online)
 * - `not_registered`: the device is not currently reachable, or has no lines
 */
export type RegistrationStatus = 'registered' | 'not_registered';

// ============================================================================
// Device Line
// ============================================================================

/**
 * A SIP line configured on a provisioned device.
 */
export interface DeviceLine {
  /** TypeID with `dln_` prefix */
  id: string;
  /** TypeID of the parent device */
  device_id: string;
  /** Line number on the device (1-based) */
  line_number: number;
  /** TypeID of the associated endpoint, if any */
  endpoint_id?: string;
  /** ISO 8601 timestamp */
  created_at: string;
  /** ISO 8601 timestamp */
  updated_at: string;
}

// ============================================================================
// Provisioned Device
// ============================================================================

/**
 * A provisioned device (desk phone, DECT base, etc.).
 * @deprecated Use `Device` from the `/v1/devices` endpoint instead.
 * Still used for create/update return types that hit `/v1/deskphones`.
 */
export interface ProvisionedDevice {
  /** TypeID with `dev_` prefix */
  id: string;
  /** Hardware MAC address (e.g., "00:04:13:aa:bb:cc") */
  mac_address: string;
  /** Detected vendor (e.g., "snom", "yealink") */
  vendor: string;
  /** Device model (e.g., "D785", "T48S") */
  model?: string;
  /** Human-friendly label for the deskphone. `null` when unassigned. */
  name?: string | null;
  /** Physical E911 location. `null` when unassigned. */
  location_id?: string | null;
  /** Reusable programmable-key template bound to this deskphone. */
  button_template_id?: string | null;
  /** Current provisioning status */
  status: DeviceStatus;
  /** TypeID of the provisioning profile, if using profile-based config */
  profile_id?: string;
  /** Device-specific settings overrides */
  overrides?: DeviceSettings;
  /** Last known IP address from provisioning request */
  current_ip_address?: string;
  /** ISO 8601 timestamp of last successful config fetch */
  last_provisioned_at?: string;
  /** TypeID of the primary line */
  primary_line_id?: string;
  /** Configured lines on this device */
  lines?: DeviceLine[];
  /** ISO 8601 timestamp */
  created_at: string;
  /** ISO 8601 timestamp */
  updated_at: string;
}

// ============================================================================
// Request Types
// ============================================================================

/**
 * Request payload for creating a new deskphone.
 */
export interface CreateDeskphoneRequest {
  /** Hardware MAC address (e.g., "00:04:13:aa:bb:cc") */
  mac_address: string;
  /** Device model (optional, can be auto-detected) */
  model?: string;
  /** Device-specific settings overrides */
  overrides?: DeviceSettings;
}

/**
 * Request payload for updating a deskphone.
 */
export interface UpdateDeskphoneRequest {
  /** Device model */
  model?: string;
  /** Device status */
  status?: DeviceStatus;
  /** Device-specific settings overrides */
  overrides?: DeviceSettings;
}

/**
 * Minimal response returned by `POST /v1/devices`. Carries only the
 * server-assigned ID and the discriminator; call
 * `dialstack.devices.retrieve(id)` to fetch the full device.
 */
export interface CreateDeviceResponse {
  /** TypeID with `dev_`, `dectb_`, or `decth_` prefix */
  id: string;
  /** The kind of device that was created. */
  type: DeviceType;
}

/**
 * Request payload for `POST /v1/devices`. The `type` field selects which
 * device kind to create; type-specific fields are required as noted.
 */
export interface CreateDeviceRequest {
  /**
   * Device kind to create. Optional for MAC-addressable devices: omit it and
   * the type is detected from `mac_address` via the vendor product catalog.
   * The request is rejected with `400` if the MAC can't be classified, or if a
   * supplied `type` contradicts a positive catalog match. `dect_handset` is
   * IPEI-identified and must always be supplied.
   */
  type?: DeviceType;
  /** Hardware MAC address. Required for `deskphone` and `dect_base`. */
  mac_address?: string;
  /** Device model (optional, can be auto-detected for deskphones). */
  model?: string;
  /** Human-friendly label. */
  name?: string;
  /** Device-specific settings overrides. */
  overrides?: DeviceSettings;
  /** Multicell role. `dect_base` only. */
  multicell_role?: MulticellRole;
  /** Parent DECT base. `dect_handset` only; omit to stock as unpaired. */
  base_id?: string;
  /** Handset IPEI. Required for `dect_handset`. */
  ipei?: string;
  /**
   * Physical E911 location. Set on `deskphone` or `dect_base`; handsets
   * inherit from their paired base.
   */
  location_id?: string;
}

/**
 * Request payload for `POST /v1/devices/{id}`. Tri-state fields (`name`,
 * `location_id`, `base_id`) accept three values: omit to leave unchanged,
 * a string to set, or explicit JSON `null` to clear.
 */
export interface UpdateDeviceRequest {
  /** Device model. */
  model?: string;
  /** Device status. */
  status?: DeviceStatus;
  /** Device-specific settings overrides. */
  overrides?: DeviceSettings;
  /** Handset IPEI. `dect_handset` only. */
  ipei?: string;
  /** Tri-state human-friendly label. */
  name?: string | null;
  /** Tri-state dispatch location. `deskphone` and `dect_base` only. */
  location_id?: string | null;
  /** Tri-state programmable-key template binding. */
  button_template_id?: string | null;
  /**
   * Tri-state parent base. `dect_handset` only — repair to a different
   * base (string) or unpair (`null`).
   */
  base_id?: string | null;
}

// ============================================================================
// List Options
// ============================================================================

/**
 * Options for listing devices.
 */
export interface DeviceListOptions {
  /** Maximum number of devices to return (default: 10, max: 100) */
  limit?: number;
  /** Filter by device type ('deskphone' or 'dect_base') */
  type?: DeviceType;
}

// ============================================================================
// Provisioning Events
// ============================================================================

/**
 * A provisioning event logged when a device fetches its configuration.
 */
export interface ProvisioningEvent {
  /** TypeID with `preve_` prefix */
  id: string;
  /** TypeID of the device */
  device_id: string;
  /** Type of event (e.g., "config_fetch", "config_error") */
  event_type: string;
  /** IP address that initiated the request */
  source_ip?: string;
  /** User-Agent header from the request */
  user_agent?: string;
  /** Additional event details */
  details?: Record<string, unknown>;
  /** ISO 8601 timestamp */
  created_at: string;
}

/**
 * Request payload for creating a deskphone line.
 */
export interface CreateDeskphoneLineRequest {
  /** TypeID of the endpoint to assign */
  endpoint_id: string;
}

/**
 * Request payload for updating a deskphone line (reassigning endpoint).
 */
export interface UpdateDeskphoneLineRequest {
  /** TypeID of the new endpoint to assign */
  endpoint_id: string;
}

/**
 * Options for listing provisioning events.
 */
export interface ProvisioningEventListOptions extends DeviceListOptions {
  /** ISO 8601 timestamp to filter events from */
  from?: string;
  /** ISO 8601 timestamp to filter events to */
  to?: string;
}
