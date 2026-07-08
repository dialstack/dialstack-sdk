/**
 * DECT System Types
 *
 * Types for managing DECT (Digital Enhanced Cordless Telecommunications)
 * base stations, handsets, and extensions in the DialStack platform.
 *
 * DECT systems have a hierarchical structure:
 * - Base Station: The central unit that connects to the network
 * - Handsets: Portable devices that pair with the base
 * - Extensions: SIP lines assigned to each handset
 */

import type { DeviceSettings } from './provisioning';
import type { DeviceStatus, DeviceUserAssignment } from './device';

// ============================================================================
// DECT Base Types
// ============================================================================

/**
 * Role of a DECT base in a multicell deployment.
 *
 * - `single`: Standalone base station (default)
 * - `data_master`: Primary base in a multicell setup
 * - `secondary`: Secondary base in a multicell setup
 */
export type MulticellRole = 'single' | 'data_master' | 'secondary';

/**
 * A DECT base station.
 */
export interface DECTBase {
  /** TypeID with `dectb_` prefix */
  id: string;
  /** Hardware MAC address (e.g., "00:04:13:aa:bb:cc") */
  mac_address: string;
  /** Detected vendor (e.g., "snom") */
  vendor: string;
  /** Device model (e.g., "M500", "M700", "M900") */
  model?: string;
  /** Human-friendly label for the base. `null` when unassigned. */
  name?: string | null;
  /** Current provisioning status */
  status: DeviceStatus;
  /** Role in multicell deployment */
  multicell_role: MulticellRole;
  /** Maximum number of handsets this base supports */
  max_handsets: number;
  /** Current firmware version */
  firmware_version?: string;
  /** Device-specific settings overrides */
  overrides?: DeviceSettings;
  /** Last known IP address from provisioning request */
  current_ip_address?: string;
  /** ISO 8601 timestamp of last successful config fetch */
  last_provisioned_at?: string;
  /** Physical E911 location for this base. All handsets paired with this base
   *  share this location. `null` when unassigned. */
  location?: string | null;
  /** @deprecated Use `location`. Retained for backwards compatibility. */
  location_id?: string | null;
  /** Associated handsets (when eager-loaded) */
  handsets?: DECTHandset[];
  /** ISO 8601 timestamp */
  created_at: string;
  /** ISO 8601 timestamp */
  updated_at: string;
}

// ============================================================================
// DECT Handset Types
// ============================================================================

/**
 * Status of a DECT handset.
 *
 * - `unpaired`: Handset slot is empty or handset was unpaired
 * - `pending-sync`: Handset created, base hasn't fetched config with this IPEI yet
 * - `registered`: Handset is paired with the base
 * - `provisioned`: Handset has SIP lines configured
 */
export type HandsetStatus = 'unpaired' | 'pending-sync' | 'registered' | 'provisioned';

/**
 * A DECT handset paired with a base station.
 */
export interface DECTHandset {
  /** TypeID with `decth_` prefix */
  id: string;
  /** Parent base station. `null` when the handset is stocked but not yet
   *  paired with a base — set this field to a base ID to pair it. */
  base?: string | null;
  /** @deprecated Use `base`. Retained for backwards compatibility. */
  base_id: string | null;
  /** International Portable Equipment Identity (20-char unique identifier) */
  ipei: string;
  /** Current handset status */
  status: HandsetStatus;
  /** Optional display name */
  display_name?: string;
  /** Slot number on the base (1-based) */
  slot_number: number;
  /** Handset model */
  model?: string;
  /** Handset firmware version */
  firmware_version?: string;
  /** ISO 8601 timestamp when handset was registered */
  registered_at?: string;
  /** Associated extensions (when eager-loaded) */
  extensions?: DECTExtension[];
  /** User assignments (handset IDs are device IDs; populated via
   *  `devices.users.list` or `expand[]=users`). */
  assignments?: DeviceUserAssignment[];
  /** ISO 8601 timestamp */
  created_at: string;
  /** ISO 8601 timestamp */
  updated_at: string;
}

// ============================================================================
// DECT Extension Types
// ============================================================================

/**
 * A SIP line assignment on a DECT handset.
 */
export interface DECTExtension {
  /** TypeID with `decte_` prefix */
  id: string;
  /** TypeID of the parent handset */
  handset?: string;
  /** @deprecated Use `handset`. Retained for backwards compatibility. */
  handset_id: string;
  /** TypeID of the SIP endpoint */
  endpoint_id: string;
  /** Optional display name override */
  display_name?: string;
  /** Associated endpoint (when eager-loaded) */
  endpoint?: {
    id: string;
    name?: string;
  };
  /** ISO 8601 timestamp */
  created_at: string;
  /** ISO 8601 timestamp */
  updated_at: string;
}

// ============================================================================
// Request Types
// ============================================================================

/**
 * Request payload for creating a new DECT base station.
 *
 * Note: location_id is not on this legacy request type. To set or clear a
 * base's E911 location, use the unified `/v1/devices` endpoint, which
 * supports tri-state `location_id` (omit / `loc_…` / `null`).
 */
export interface CreateDECTBaseRequest {
  /** Hardware MAC address (e.g., "00:04:13:aa:bb:cc") */
  mac_address: string;
  /** Device model (optional, can be auto-detected) */
  model?: string;
  /** Role in multicell deployment (default: "single") */
  multicell_role?: MulticellRole;
  /** Device-specific settings overrides */
  overrides?: DeviceSettings;
}

/**
 * Request payload for updating a DECT base station.
 *
 * See CreateDECTBaseRequest for the rationale on the missing location_id.
 */
export interface UpdateDECTBaseRequest {
  /** Device model */
  model?: string;
  /** Device status */
  status?: DeviceStatus;
  /** Role in multicell deployment */
  multicell_role?: MulticellRole;
  /** Device-specific settings overrides */
  overrides?: DeviceSettings;
}

/**
 * Request payload for creating a new DECT handset.
 */
export interface CreateDECTHandsetRequest {
  /** International Portable Equipment Identity */
  ipei: string;
  /** Optional display name */
  display_name?: string;
  /** Handset model */
  model?: string;
}

/**
 * Request payload for updating a DECT handset.
 */
export interface UpdateDECTHandsetRequest {
  /** International Portable Equipment Identity */
  ipei?: string;
  /** Display name for the handset */
  display_name?: string;
}

/**
 * Request payload for creating a DECT extension.
 */
export interface CreateDECTExtensionRequest {
  /** TypeID of the SIP endpoint to assign */
  endpoint?: string;
  /** @deprecated Use `endpoint`. Retained for backwards compatibility. */
  endpoint_id: string;
  /** Optional display name override */
  display_name?: string;
}
