/**
 * Device Provisioning Types
 *
 * Types for managing provisioned devices in the DialStack platform.
 */

import type { DeviceSettings } from './provisioning';

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
  /** Display name for this line */
  display_name?: string;
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
 */
export interface ProvisionedDevice {
  /** TypeID with `dev_` prefix */
  id: string;
  /** TypeID of the owning account */
  account_id: string;
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
 * Request payload for creating a new device.
 */
export interface CreateDeviceRequest {
  /** Hardware MAC address (e.g., "00:04:13:aa:bb:cc") */
  mac_address: string;
  /** Device model (optional, can be auto-detected) */
  model?: string;
  /** Device-specific settings overrides */
  overrides?: DeviceSettings;
}

/**
 * Request payload for updating a device.
 */
export interface UpdateDeviceRequest {
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
 * Options for listing devices with cursor-based pagination.
 */
export interface DeviceListOptions {
  /** Maximum number of devices to return (default: 10, max: 100) */
  limit?: number;
  /** Cursor for forward pagination (device ID to start after) */
  starting_after?: string;
  /** Cursor for backward pagination (device ID to end before) */
  ending_before?: string;
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
 * Options for listing provisioning events.
 */
export interface ProvisioningEventListOptions extends DeviceListOptions {
  /** ISO 8601 timestamp to filter events from */
  from?: string;
  /** ISO 8601 timestamp to filter events to */
  to?: string;
}
