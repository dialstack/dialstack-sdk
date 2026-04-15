/**
 * Device Provisioning Types
 *
 * Types for managing provisioned devices in the DialStack platform.
 */

import type { DeviceSettings } from './provisioning';
import type { MulticellRole, DECTHandset } from './dect';

// ============================================================================
// Device Type (unified API)
// ============================================================================

/**
 * Discriminator for the unified `/v1/devices` endpoint.
 */
export type DeviceType = 'deskphone' | 'dect_base';

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
  /** Current provisioning status */
  status: DeviceStatus;
  /** Device-specific settings overrides */
  overrides?: DeviceSettings;
  /** Last known IP address from provisioning request */
  current_ip_address?: string;
  /** ISO 8601 timestamp of last successful config fetch */
  last_provisioned_at?: string;
  /** ISO 8601 timestamp */
  created_at: string;
  /** ISO 8601 timestamp */
  updated_at: string;

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
