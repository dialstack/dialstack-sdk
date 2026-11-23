/**
 * Phone number ordering types for DialStack SDK
 */

import type { BaseComponentClasses } from './appearance';
import type { BaseComponentElement } from './components';

/**
 * How the number search is filtered. `region` searches a US state or a
 * Canadian province, optionally narrowed to a city.
 */
export type SearchType = 'area_code' | 'zip' | 'region' | 'toll_free';

/** `local` for a geographic number, `toll_free` for an 8YY number. */
export type PhoneNumberType = 'local' | 'toll_free';

export interface SearchAvailableNumbersOptions {
  /** Which numbers to search. Defaults to `local`. */
  numberType?: PhoneNumberType;
  /** A local area code, or with `numberType: 'toll_free'`, one toll-free code. */
  areaCode?: string;
  /**
   * With `numberType: 'toll_free'`, 4 to 7 letters or digits that the number's
   * last seven digits spell on a phone keypad, anywhere in them (`HELLO` finds
   * 1-844-75-HELLO). Case, spaces and hyphens are ignored.
   */
  contains?: string;
  /** A five-digit US ZIP code. Canadian postal codes can't be searched. */
  zip?: string;
  /**
   * A two-letter US state or Canadian province code (`NC`, `ON`, `QC`). A
   * province searches Canadian numbers.
   */
  state?: string;
  /** A city name. Requires `state`. */
  city?: string;
  /**
   * The two-letter country to search. Optional: worked out from `state` or
   * `areaCode` when omitted; a `state` or `areaCode` outside it is refused.
   */
  country?: string;
  quantity?: number;
}

export interface AvailablePhoneNumber {
  phone_number: string;
  /** Always set by the API. Optional so code building these by hand still compiles. */
  number_type?: PhoneNumberType;
  /** Omitted for toll-free numbers, which have no geography. */
  city?: string;
  /** Two-letter US state or Canadian province code. */
  state?: string;
  rate_center?: string;
  lata?: string;
}

export interface NumberOrder {
  id: string;
  order_type: 'purchase' | 'disconnect';
  status: 'pending' | 'complete' | 'partial' | 'failed';
  /** The numbers requested, in E.164 format. */
  phone_numbers: string[];
  completed_numbers: string[];
  failed_numbers: string[];
  error_message: string | null;
  /** ISO 8601 timestamp. */
  created_at: string;
  /** ISO 8601 timestamp. */
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
  /** Class for the search step */
  searchForm?: string;
  /** Class for the results step */
  resultsTable?: string;
  /** Class for each result row */
  resultRow?: string;
  /** Class for a selected result row */
  resultRowSelected?: string;
  /** Class for the confirm step */
  confirmPanel?: string;
  /** Class for the step shown once the order is placed */
  orderComplete?: string;
}

export interface PhoneNumberOrderingElement extends Omit<BaseComponentElement, 'setClasses'> {
  setClasses: (classes: PhoneNumberOrderingClasses) => void;
  /**
   * What a search may name (default: all of `area_code`, `zip`, `region` and
   * `toll_free`). A list starting with `toll_free` opens on toll-free; an empty
   * list is ignored.
   */
  setSearchTypes: (types: SearchType[]) => void;
  /**
   * Called when an order completes, fully or `partial`ly. A failed order goes
   * to `onOrderError` instead.
   */
  setOnOrderComplete: (
    cb: ((event: { orderId: string; order: NumberOrder }) => void) | undefined
  ) => void;
  setOnOrderError: (cb: ((event: PhoneNumberOrderErrorEvent) => void) | undefined) => void;
  setOnOrderPending: (cb: ((event: PhoneNumberOrderPendingEvent) => void) | undefined) => void;
}
