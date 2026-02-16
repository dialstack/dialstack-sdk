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
  outbound_enabled: boolean;
  created_at: string;
  updated_at: string;
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
  outbound_enabled: boolean | null;
  source: 'did' | 'number_order' | 'port_order';
  created_at: string;
  updated_at: string;
  notes: string;
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
 * Display options for the PhoneNumbers component
 */
export interface PhoneNumbersDisplayOptions {
  /**
   * Show the status column
   * @default true
   */
  showStatus?: boolean;

  /**
   * Show the outbound column
   * @default true
   */
  showOutbound?: boolean;

  /**
   * Show the notes column
   * @default true
   */
  showNotes?: boolean;

  /**
   * Show the last updated column
   * @default true
   */
  showLastUpdated?: boolean;
}

/**
 * PhoneNumbers component element interface
 */
export interface PhoneNumbersElement extends Omit<BaseComponentElement, 'setClasses'> {
  setClasses: (classes: PhoneNumbersClasses) => void;
  setLimit: (limit: number) => void;
  setDisplayOptions: (options: PhoneNumbersDisplayOptions) => void;
  setOnRowClick: (
    callback: (event: { phoneNumber: string; item: PhoneNumberItem }) => void
  ) => void;
}
