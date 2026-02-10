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
import type { DeviceStatus } from './device';

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
  /** TypeID of the owning account */
  account_id: string;
  /** Hardware MAC address (e.g., "00:04:13:aa:bb:cc") */
  mac_address: string;
  /** Detected vendor (e.g., "snom") */
  vendor: string;
  /** Device model (e.g., "M500", "M700", "M900") */
  model?: string;
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
 * - `registered`: Handset is paired with the base
 * - `provisioned`: Handset has SIP lines configured
 */
export type HandsetStatus = 'unpaired' | 'registered' | 'provisioned';

/**
 * A DECT handset paired with a base station.
 */
export interface DECTHandset {
  /** TypeID with `decth_` prefix */
  id: string;
  /** TypeID of the parent base station */
  base_id: string;
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
  handset_id: string;
  /** TypeID of the SIP endpoint */
  endpoint_id: string;
  /** Optional display name override */
  display_name?: string;
  /** Associated endpoint (when eager-loaded) */
  endpoint?: {
    id: string;
    sip_username: string;
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
  /** Display name for the handset */
  display_name?: string;
}

/**
 * Request payload for creating a DECT extension.
 */
export interface CreateDECTExtensionRequest {
  /** TypeID of the SIP endpoint to assign */
  endpoint_id: string;
  /** Optional display name override */
  display_name?: string;
}
