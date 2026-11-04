/**
 * Number porting types for DialStack SDK
 */

import type { PhoneNumberType } from './phone-number-ordering';

export interface PortOrderAddress {
  house_number: string;
  street_name: string;
  line2?: string | null;
  city: string;
  state: string;
  zip: string;
}

/** Who the numbers of a local order belong to. */
export interface PortOrderSubscriber {
  // NEXT MAJOR: make `btn` and `address` optional. A toll-free order's
  // subscriber has neither (see TollFreePortOrderSubscriber), so on a read this
  // type claims fields the API does not send; widening it now would break code
  // that reads them as strings.
  btn: string;
  business_name: string;
  approver_name: string;
  account_number?: string | null;
  pin?: string | null;
  address: PortOrderAddress;
}

/**
 * Who the numbers of a toll-free order belong to. A toll-free order takes no
 * `btn`, `account_number` or `pin`, and its address is optional: printed on the
 * letter of authorization when given.
 */
export interface TollFreePortOrderSubscriber {
  business_name: string;
  approver_name: string;
  address?: PortOrderAddress;
}

export interface PortCarrier {
  name?: string;
  spid?: string;
  port_type?: string;
}

export interface PortRejection {
  code?: string;
  message?: string;
}

export interface PortDocumentMeta {
  s3_key: string;
  content_type: string;
  file_size: number;
}

export interface PortApproval {
  signature: string;
  ip: string;
  timestamp: string;
}

export interface ApprovePortOrderRequest {
  signature: string;
  ip: string;
}

/**
 * `validating` is a toll-free order the carrier is checking against the
 * toll-free registry, before it is `submitted`. Local orders never enter it.
 */
export type PortOrderStatus =
  | 'draft'
  | 'approved'
  | 'validating'
  | 'submitted'
  | 'exception'
  | 'foc'
  | 'complete'
  | 'cancelled';

export interface PortNumberEligibility {
  phone_number: string;
  losing_carrier_name?: string;
  losing_carrier_spid?: string;
  is_wireless: boolean;
  account_number_required: boolean;
}

export interface PortOrderDetails {
  phone_numbers: string[];
  /**
   * On a toll-free order (`number_type: 'toll_free'`), `btn` and `account_number`
   * are absent, and `address` is absent unless one was given.
   */
  subscriber?: PortOrderSubscriber | null;
  requested_foc_date?: string;
  requested_foc_time?: string | null;
  /**
   * IANA zone `requested_foc_date` and `requested_foc_time` are wall-clock
   * values in. Absent unless set on the order, in which case they are Eastern.
   */
  requested_foc_timezone?: string;
  actual_foc_date?: string | null;
  losing_carrier?: PortCarrier | null;
  eligibility?: PortNumberEligibility[] | null;
  rejection?: PortRejection | null;
  approval?: PortApproval | null;
  loa?: PortDocumentMeta | null;
  csr?: PortDocumentMeta | null;
  bill_copy?: PortDocumentMeta | null;
}

export interface PortOrder {
  id: string;
  status: PortOrderStatus;
  /**
   * Derived from the numbers: an order is all local or all toll-free. Always set
   * by the API; optional only so objects built by hand before it existed keep
   * compiling.
   */
  number_type?: PhoneNumberType;
  details: PortOrderDetails;
  submitted_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface CreatePortOrderRequest {
  phone_numbers: string[];
  subscriber: PortOrderSubscriber | TollFreePortOrderSubscriber;
  requested_foc_date: string;
  requested_foc_time?: string;
  /** IANA zone the date and time are read in. Defaults to `America/New_York`. */
  requested_foc_timezone?: string;
}

export interface PortableNumber {
  phone_number: string;
  losing_carrier_name?: string;
  losing_carrier_spid?: string;
  is_wireless: boolean;
  account_number_required: boolean;
}

/**
 * The API may add reasons, so the `string` member makes an exhaustive `switch`
 * still need a default branch.
 */
export type NonPortabilityReason =
  'unsupported_rate_center' | 'unsupported_carrier' | 'unsupported_number' | (string & {});

export interface NonPortableNumber {
  phone_number: string;
  /**
   * Always set by the API. Optional only so objects built by hand before it
   * existed keep compiling; make it required at the next major version.
   */
  reason?: NonPortabilityReason;
  /** The current carrier, when known. */
  losing_carrier_name?: string;
  rate_center?: string;
  city?: string;
  state?: string;
}

export interface PortEligibilityResult {
  portable_numbers: PortableNumber[];
  non_portable_numbers: NonPortableNumber[];
}
