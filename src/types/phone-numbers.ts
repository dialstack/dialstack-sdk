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
export interface DIDItem {
  id: string;
  phone_number: string;
  status: 'active' | 'inactive' | 'released';
  number_class?: 'account_owned' | 'temporary';
  expires_at?: string | null;
  outbound_enabled: boolean;
  caller_id_name?: string | null;
  directory_listing_name?: string | null;
  directory_listing_type?: DirectoryListingType;
  directory_listing_location_id?: string | null;
  routing_target?: string | null;
  created_at: string;
  updated_at: string;
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
  directory_listing_name?: string;
  directory_listing_type?: DirectoryListingType;
  directory_listing_location_id?: string;
  caller_id_name?: string;
  caller_id_visibility?: 'PUBLIC' | 'PRIVATE';
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
  outbound_enabled: boolean | null;
  caller_id_name?: string | null;
  routing_target?: string | null;
  carrier?: string;
  transfer_date?: string;
  source: 'did' | 'number_order' | 'port_order';
  created_at: string;
  updated_at: string;
  did_id?: string;
  order_id?: string;
  port_order_id?: string;
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
  setOnRowClick: (
    callback: (event: { phoneNumber: string; item: PhoneNumberItem }) => void
  ) => void;
}
