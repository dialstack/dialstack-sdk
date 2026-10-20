/**
 * Phone number ordering types for DialStack SDK
 */

import type { BaseComponentClasses } from './appearance';
import type { BaseComponentElement } from './components';

export type SearchType = 'area_code' | 'zip';

export interface SearchAvailableNumbersOptions {
  areaCode?: string;
  zip?: string;
  quantity?: number;
}

export interface AvailablePhoneNumber {
  phone_number: string;
  city: string;
  state: string;
  rate_center: string;
  lata: string;
}

export interface NumberOrder {
  id: string;
  order_type: 'purchase' | 'disconnect';
  status: 'pending' | 'complete' | 'partial' | 'failed';
  phone_numbers: string[];
  completed_numbers: string[];
  failed_numbers: string[];
  error_message: string | null;
  created_at: string;
  updated_at: string;
}

/**
 * Passed to the ordering component's `onOrderError` callback, for an order the
 * API refused or the carrier could not fulfill.
 */
export interface PhoneNumberOrderErrorEvent {
  /**
   * What went wrong, in the component's locale: the same text the component
   * shows, so it is safe to display.
   */
  error: string;
  /**
   * The underlying error text: the API's message for a refused order, or the
   * carrier's reason for a failed one. For logs, not for display: it is in
   * English and may be technical.
   */
  message?: string;
  /**
   * The API's stable error code when it sent one, such as
   * `phone_number_limit_exceeded` or `phone_numbers_already_claimed`.
   */
  code?: string;
  /** HTTP status of the rejected request. Absent when a placed order failed. */
  status?: number;
  /** The API's `details` for the code, when it sent any. */
  details?: Record<string, unknown>;
  /** The order, when it was placed and then failed. */
  order?: NumberOrder;
}

/**
 * Passed to the ordering component's `onOrderPending` callback, when the
 * component stops checking an order that the carrier has not finished yet.
 */
export interface PhoneNumberOrderPendingEvent {
  orderId: string;
  /** The order as last seen, still `pending`. */
  order: NumberOrder;
}

export interface PhoneNumberOrderingClasses extends BaseComponentClasses {
  searchForm?: string;
  resultsTable?: string;
  resultRow?: string;
  resultRowSelected?: string;
  confirmPanel?: string;
  orderComplete?: string;
}

export interface PhoneNumberOrderingElement extends Omit<BaseComponentElement, 'setClasses'> {
  setClasses: (classes: PhoneNumberOrderingClasses) => void;
  setSearchTypes: (types: SearchType[]) => void;
  setOnOrderComplete: (cb: (event: { orderId: string; order: NumberOrder }) => void) => void;
  setOnOrderError: (cb: (event: PhoneNumberOrderErrorEvent) => void) => void;
  setOnOrderPending: (cb: (event: PhoneNumberOrderPendingEvent) => void) => void;
}
