/**
 * Phone number ordering types for DialStack SDK
 */

import type { BaseComponentClasses } from './appearance';
import type { BaseComponentElement } from './components';

export interface SearchAvailableNumbersOptions {
  areaCode?: string;
  city?: string;
  state?: string;
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
  setOnOrderComplete: (cb: (event: { orderId: string; order: NumberOrder }) => void) => void;
  setOnOrderError: (cb: (event: { error: string }) => void) => void;
}
