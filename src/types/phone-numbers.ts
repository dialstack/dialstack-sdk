/**
 * Phone numbers component types for DialStack SDK
 */

import type { BaseComponentClasses } from './appearance';
import type { BaseComponentElement } from './components';

/**
 * Paginated list response from the API
 */
export interface PaginatedResponse<T> {
  object: 'list';
  url: string;
  next_page_url: string | null;
  previous_page_url: string | null;
  data: T[];
}

/**
 * A DID (Direct Inward Dial) as returned by the API
 */
/**
 * How inbound calls to a number are handled. `default` follows `routing_target`
 * (routing to the target when set, otherwise ringing all users on the account);
 * `drop` deliberately drops inbound calls with no ring and no message.
 */
export type InboundRouting = 'default' | 'drop';

export interface DIDItem {
  id: string;
  phone_number: string;
  status: 'active' | 'inactive' | 'released';
  number_class?: 'account_owned' | 'temporary';
  expires_at?: string | null;
  disconnected_at?: string | null;
  outbound_enabled: boolean;
  fax_enabled: boolean;
  config?: DIDConfig;
  caller_id_name?: string | null;
  directory_listing_name?: string | null;
  directory_listing_type?: DirectoryListingType;
  directory_listing_location?: string | null;
  /** @deprecated Use `directory_listing_location`. Retained for backwards compatibility. */
  directory_listing_location_id?: string | null;
  routing_target?: string | null;
  /** Inbound call handling. `routing_target` is null when this is `drop`. */
  inbound_routing: InboundRouting;
  created_at: string;
  updated_at: string;
}

/**
 * DID-level configuration blob (fax notification recipients today, more
 * sub-keys later). Mirrors lib/models/did.go DIDConfig.
 */
export interface DIDConfig {
  fax_notifications?: {
    recipients?: string[];
    /**
     * When true, fax documents are not retained on the server (defaults false).
     * Inbound: the received fax is attached to the notification email and the
     * stored copy is removed after sending. Outbound: the uploaded source is
     * deleted once the fax reaches a terminal status (delivered or failed).
     * When false, the email includes a time-bounded link to the received fax
     * and documents are retained.
     *
     * Requires at least one entry in `recipients`: enabling this with an empty
     * recipient list is rejected, since a received fax would be neither stored
     * nor delivered.
     */
    delete_documents?: boolean;
    /**
     * Deprecated, kept only for backwards compatibility. Accepted on input but
     * ignored (not stored, no effect) and always returned as `true`. Use
     * `delete_documents` to control document handling.
     * @deprecated Use `delete_documents` instead.
     */
    attach_pdf?: boolean;
  };
}

/**
 * Directory listing type for a phone number
 */
export type DirectoryListingType = 'listed' | 'non_listed' | 'non_published' | 'non_registered';

/**
 * Request body for updating a phone number via POST /v1/phone-numbers/:id
 */
export interface UpdatePhoneNumberRequest {
  outbound_enabled?: boolean;
  status?: 'active' | 'inactive';
  /** Pass `null` to convert a temporary number to permanent. Extending the expiry is not supported. */
  expires_at?: null;
  directory_listing_name?: string;
  directory_listing_type?: DirectoryListingType;
  directory_listing_location?: string;
  /** @deprecated Use `directory_listing_location`. Retained for backwards compatibility. */
  directory_listing_location_id?: string;
  caller_id_name?: string;
  caller_id_visibility?: 'PUBLIC' | 'PRIVATE';
  fax_enabled?: boolean;
  /** Pass `null` to clear the per-DID config blob. */
  config?: DIDConfig | null;
}

/**
 * The SMS port-out window for a number. `expires_at` is the instant until which
 * an inbound SMS port-out (messaging transfer) request is authorized; `null`
 * means the window is locked (requests are denied). Platform-only.
 */
export interface SmsPortOutWindow {
  /** RFC 3339 timestamp, or `null` when locked. */
  expires_at: string | null;
}

/**
 * Request body for POST /v1/phone-numbers/:id/sms-port-out. Set `expires_at` to
 * a future RFC 3339 timestamp to open the window until then, or `null` to lock.
 */
export interface UpdateSmsPortOutRequest {
  expires_at: string | null;
}

/**
 * Unified phone number status across DIDs, number orders, and port orders
 */
export type PhoneNumberStatus =
  | 'active'
  | 'inactive'
  | 'released'
  | 'ordering'
  | 'order_failed'
  | 'porting_draft'
  | 'porting_submitted'
  | 'porting_exception'
  | 'porting_foc'
  | 'porting_approved';

/**
 * A unified phone number item merging data from DIDs, number orders, and port orders
 */
export interface PhoneNumberItem {
  phone_number: string;
  status: PhoneNumberStatus;
  number_class?: 'account_owned' | 'temporary';
  expires_at?: string | null;
  disconnected_at?: string | null;
  outbound_enabled: boolean | null;
  fax_enabled?: boolean;
  caller_id_name?: string | null;
  routing_target?: string | null;
  /**
   * Inbound call handling. `routing_target` is null when this is `drop`.
   * Number-order and port-order rows are not yet DIDs and are always `default`.
   */
  inbound_routing: InboundRouting;
  carrier?: string;
  transfer_date?: string;
  source: 'did' | 'number_order' | 'port_order';
  created_at: string;
  updated_at: string;
  did?: string;
  /** @deprecated Use `did`. Retained for backwards compatibility. */
  did_id?: string;
  order?: string;
  /** @deprecated Use `order`. Retained for backwards compatibility. */
  order_id?: string;
  port_order?: string;
  /** @deprecated Use `port_order`. Retained for backwards compatibility. */
  port_order_id?: string;
}

/**
 * Which surface a row interaction targets.
 *
 * - `detail` (default): the row body. For an in-flight order/port this resolves
 *   to the order/port detail so its progress stays reachable.
 * - `routing`: the routing-target cell. Always the number's own routing surface,
 *   so a pre-created (inactive) number can have its routing target configured
 *   before its order completes — it then routes the instant it activates.
 */
export type PhoneNumberRowSection = 'detail' | 'routing';

/**
 * Payload passed to the `onRowClick` host callback.
 */
export interface PhoneNumberRowClickEvent {
  phoneNumber: string;
  item: PhoneNumberItem;
  section: PhoneNumberRowSection;
}

/**
 * CSS classes for the PhoneNumbers component
 */
export interface PhoneNumbersClasses extends BaseComponentClasses {
  table?: string;
  row?: string;
  statusBadge?: string;
  pagination?: string;
}

/**
 * PhoneNumbers component element interface
 */
export interface PhoneNumbersElement extends Omit<BaseComponentElement, 'setClasses'> {
  setClasses: (classes: PhoneNumbersClasses) => void;
  setLimit: (limit: number) => void;
  setOnRowClick: (callback: (event: PhoneNumberRowClickEvent) => void) => void;
}
