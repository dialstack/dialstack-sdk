/**
 * Number porting types for DialStack SDK
 */

export interface PortOrderAddress {
  house_number: string;
  street_name: string;
  line2?: string | null;
  city: string;
  state: string;
  zip: string;
}

export interface PortOrderSubscriber {
  btn: string;
  business_name: string;
  approver_name: string;
  account_number?: string | null;
  pin?: string | null;
  address: PortOrderAddress;
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

export type PortOrderStatus =
  | 'draft'
  | 'approved'
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
  subscriber?: PortOrderSubscriber | null;
  requested_foc_date?: string;
  requested_foc_time?: string | null;
  actual_foc_date?: string | null;
  losing_carrier?: PortCarrier | null;
  eligibility?: PortNumberEligibility[] | null;
  rejection?: PortRejection | null;
  approval?: PortApproval | null;
  loa?: PortDocumentMeta | null;
  csr?: PortDocumentMeta | null;
}

export interface PortOrder {
  id: string;
  status: PortOrderStatus;
  details: PortOrderDetails;
  submitted_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface CreatePortOrderRequest {
  phone_numbers: string[];
  subscriber: PortOrderSubscriber;
  requested_foc_date: string;
  requested_foc_time?: string;
}

export interface PortableNumber {
  phone_number: string;
  losing_carrier_name?: string;
  losing_carrier_spid?: string;
  is_wireless: boolean;
  account_number_required: boolean;
}

export interface NonPortableNumber {
  phone_number: string;
  rate_center?: string;
  city?: string;
  state?: string;
}

export interface PortEligibilityResult {
  portable_numbers: PortableNumber[];
  non_portable_numbers: NonPortableNumber[];
}
