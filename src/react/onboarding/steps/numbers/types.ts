import React from 'react';
import type {
  AvailablePhoneNumber,
  NumberOrder,
  PortEligibilityResult,
  DIDItem,
  PhoneNumberItem,
  SearchType,
  OnboardingLocation,
} from '../../../../types';
import type { NumSubStep } from '../../constants';

export type { NumSubStep };

export interface NumState {
  subStep: NumSubStep;
  isComplete: boolean;
  isLoadingNumbers: boolean;
  loadError: string | null;
  phoneNumbers: PhoneNumberItem[];
  orderSearchType: SearchType;
  orderSearchValue: string;
  orderSearchCity: string;
  orderSearchState: string;
  orderQuantity: number;
  orderIsSearching: boolean;
  orderAvailableNumbers: AvailablePhoneNumber[];
  orderSelectedNumbers: string[];
  orderCurrentOrder: NumberOrder | null;
  orderIsPlacing: boolean;
  orderError: string | null;
  orderPollCount: number;
  portPhoneInputs: string[];
  portPhoneErrors: Record<number, string>;
  portEligibilityResult: PortEligibilityResult | null;
  portIsCheckingEligibility: boolean;
  portEligibilityError: string | null;
  portSubscriberBtn: string;
  portSubscriberBusinessName: string;
  portSubscriberApproverName: string;
  portSubscriberAccountNumber: string;
  portSubscriberPin: string;
  portSubscriberHouseNumber: string;
  portSubscriberStreetName: string;
  portSubscriberLine2: string;
  portSubscriberCity: string;
  portSubscriberState: string;
  portSubscriberZip: string;
  portSubscriberErrors: Record<string, string>;
  portFocDate: string;
  portFocTime: string;
  portFocErrors: Record<string, string>;
  portCsrFile: File | null;
  portBillFile: File | null;
  portDocUploadError: string | null;
  portSignature: string;
  portIsSubmitting: boolean;
  portSubmitError: string | null;
  activeDIDs: DIDItem[];
  selectedPrimaryDIDId: string | null;
  primaryDIDAutoMatched: boolean;
  isLoadingDIDs: boolean;
  didLoadError: string | null;
  hasAttemptedDIDLoad: boolean;
  gateError: string | null;
  primaryDIDError: string | null;
  callerIdInputs: Record<string, string>;
  callerIdStatuses: Record<string, 'idle' | 'submitting' | 'submitted' | 'error'>;
  callerIdErrors: Record<string, string>;
  callerIdBulkAttempted: boolean;
  portCarrierGroups: Map<string, string[]>;
  portCurrentCarrier: string | null;
  portCompletedCarriers: string[];
  portOrderResults: Array<{ carrier: string; orderId: string; status: string }>;
  e911FlowState: 'idle' | 'running' | 'polling' | 'simple' | 'complex' | 'failed';
  e911ProvisionedLocation: OnboardingLocation | null;
  e911PollCount: number;
}

export type NumAction =
  | { type: 'set_substep'; subStep: NumSubStep }
  | { type: 'set_complete' }
  | { type: 'load_numbers_start' }
  | { type: 'load_numbers_success'; phoneNumbers: PhoneNumberItem[] }
  | { type: 'load_numbers_error'; error: string }
  | { type: 'order_set_search_type'; searchType: SearchType }
  | { type: 'order_set_search_value'; value: string }
  | { type: 'order_set_search_city'; city: string }
  | { type: 'order_set_search_state'; state: string }
  | { type: 'order_set_quantity'; quantity: number }
  | { type: 'order_search_start' }
  | { type: 'order_search_success'; results: AvailablePhoneNumber[] }
  | { type: 'order_search_error'; error: string }
  | { type: 'order_toggle_number'; phone: string }
  | { type: 'order_select_all' }
  | { type: 'order_place_start' }
  | { type: 'order_place_success'; order: NumberOrder }
  | { type: 'order_place_error'; error: string }
  | { type: 'order_poll_update'; order: NumberOrder; pollCount: number }
  | { type: 'order_reset' }
  | { type: 'port_set_phone_input'; index: number; value: string }
  | { type: 'port_add_phone' }
  | { type: 'port_remove_phone'; index: number }
  | { type: 'port_set_phone_errors'; errors: Record<number, string> }
  | { type: 'port_check_eligibility_start' }
  | { type: 'port_check_eligibility_success'; result: PortEligibilityResult }
  | { type: 'port_check_eligibility_error'; error: string }
  | { type: 'port_set_subscriber_btn'; value: string }
  | { type: 'port_set_subscriber_field'; field: string; value: string }
  | { type: 'port_set_subscriber_errors'; errors: Record<string, string> }
  | { type: 'port_set_foc_date'; date: string }
  | { type: 'port_set_foc_time'; time: string }
  | { type: 'port_set_foc_errors'; errors: Record<string, string> }
  | { type: 'port_set_csr_file'; file: File | null }
  | { type: 'port_set_bill_file'; file: File | null }
  | { type: 'port_set_doc_upload_error'; error: string | null }
  | { type: 'port_set_signature'; signature: string }
  | { type: 'port_set_carrier_groups'; groups: Map<string, string[]> }
  | { type: 'port_set_current_carrier'; carrier: string }
  | { type: 'port_carrier_submitted'; carrier: string; orderId: string; status: string }
  | { type: 'port_submit_start' }
  | { type: 'port_submit_success' }
  | { type: 'port_submit_error'; error: string }
  | { type: 'port_reset' }
  | { type: 'load_dids_start' }
  | { type: 'load_dids_success'; dids: DIDItem[]; selectedId: string | null; autoMatched: boolean }
  | { type: 'load_dids_error'; error: string }
  | { type: 'set_primary_did'; didId: string }
  | { type: 'set_gate_error'; error: string | null }
  | { type: 'set_primary_did_error'; error: string | null }
  | {
      type: 'caller_id_init';
      inputs: Record<string, string>;
      statuses: Record<string, 'idle' | 'submitting' | 'submitted' | 'error'>;
    }
  | { type: 'caller_id_set_input'; didId: string; value: string }
  | {
      type: 'caller_id_batch_update';
      statuses: Record<string, 'idle' | 'submitting' | 'submitted' | 'error'>;
      errors: Record<string, string>;
      attempted: boolean;
    }
  | { type: 'caller_id_persist_name'; didId: string; name: string }
  | {
      type: 'e911_set_state';
      state: 'idle' | 'running' | 'polling' | 'simple' | 'complex' | 'failed';
      location?: OnboardingLocation | null;
      pollCount?: number;
    };

export type Dispatcher = React.Dispatch<NumAction>;
export type TFn = (key: string, params?: Record<string, string | number>) => string;
export type CardMode = 'overview' | 'primary-did' | 'caller-id';

export const E911_POLL_MAX = 5;

export function makeFocDate(): string {
  const d = new Date();
  d.setDate(d.getDate() + 14);
  return d.toISOString().split('T')[0]!;
}

export const INITIAL_STATE: NumState = {
  subStep: 'overview',
  isComplete: false,
  isLoadingNumbers: true,
  loadError: null,
  phoneNumbers: [],
  orderSearchType: 'area_code',
  orderSearchValue: '',
  orderSearchCity: '',
  orderSearchState: '',
  orderQuantity: 5,
  orderIsSearching: false,
  orderAvailableNumbers: [],
  orderSelectedNumbers: [],
  orderCurrentOrder: null,
  orderIsPlacing: false,
  orderError: null,
  orderPollCount: 0,
  portPhoneInputs: [''],
  portPhoneErrors: {},
  portEligibilityResult: null,
  portIsCheckingEligibility: false,
  portEligibilityError: null,
  portSubscriberBtn: '',
  portSubscriberBusinessName: '',
  portSubscriberApproverName: '',
  portSubscriberAccountNumber: '',
  portSubscriberPin: '',
  portSubscriberHouseNumber: '',
  portSubscriberStreetName: '',
  portSubscriberLine2: '',
  portSubscriberCity: '',
  portSubscriberState: '',
  portSubscriberZip: '',
  portSubscriberErrors: {},
  portFocDate: makeFocDate(),
  portFocTime: '',
  portFocErrors: {},
  portCsrFile: null,
  portBillFile: null,
  portDocUploadError: null,
  portSignature: '',
  portIsSubmitting: false,
  portSubmitError: null,
  portCarrierGroups: new Map(),
  portCurrentCarrier: null,
  portCompletedCarriers: [],
  portOrderResults: [],
  activeDIDs: [],
  selectedPrimaryDIDId: null,
  primaryDIDAutoMatched: false,
  isLoadingDIDs: false,
  didLoadError: null,
  hasAttemptedDIDLoad: false,
  gateError: null,
  primaryDIDError: null,
  callerIdInputs: {},
  callerIdStatuses: {},
  callerIdErrors: {},
  callerIdBulkAttempted: false,
  e911FlowState: 'idle',
  e911ProvisionedLocation: null,
  e911PollCount: 0,
};

export function numReducer(state: NumState, action: NumAction): NumState {
  switch (action.type) {
    case 'set_substep':
      return { ...state, subStep: action.subStep };
    case 'set_complete':
      return { ...state, isComplete: true };
    case 'load_numbers_start':
      return { ...state, isLoadingNumbers: true, loadError: null };
    case 'load_numbers_success':
      return { ...state, isLoadingNumbers: false, phoneNumbers: action.phoneNumbers };
    case 'load_numbers_error':
      return { ...state, isLoadingNumbers: false, loadError: action.error };
    case 'order_set_search_type':
      return {
        ...state,
        orderSearchType: action.searchType,
        orderSearchValue: '',
        orderSearchCity: '',
        orderSearchState: '',
      };
    case 'order_set_search_value':
      return { ...state, orderSearchValue: action.value };
    case 'order_set_search_city':
      return { ...state, orderSearchCity: action.city };
    case 'order_set_search_state':
      return { ...state, orderSearchState: action.state };
    case 'order_set_quantity':
      return { ...state, orderQuantity: action.quantity };
    case 'order_search_start':
      return {
        ...state,
        orderIsSearching: true,
        orderError: null,
        orderAvailableNumbers: [],
        orderSelectedNumbers: [],
      };
    case 'order_search_success':
      return {
        ...state,
        orderIsSearching: false,
        orderAvailableNumbers: action.results,
        subStep: 'order-results',
      };
    case 'order_search_error':
      return { ...state, orderIsSearching: false, orderError: action.error };
    case 'order_toggle_number': {
      const sel = new Set(state.orderSelectedNumbers);
      if (sel.has(action.phone)) sel.delete(action.phone);
      else sel.add(action.phone);
      return { ...state, orderSelectedNumbers: Array.from(sel) };
    }
    case 'order_select_all': {
      const all = state.orderSelectedNumbers.length === state.orderAvailableNumbers.length;
      return {
        ...state,
        orderSelectedNumbers: all ? [] : state.orderAvailableNumbers.map((n) => n.phone_number),
      };
    }
    case 'order_place_start':
      return { ...state, orderIsPlacing: true, orderError: null };
    case 'order_place_success':
      return {
        ...state,
        orderIsPlacing: false,
        orderCurrentOrder: action.order,
        orderPollCount: 0,
        subStep: 'order-status',
      };
    case 'order_place_error':
      return { ...state, orderIsPlacing: false, orderError: action.error };
    case 'order_poll_update':
      return { ...state, orderCurrentOrder: action.order, orderPollCount: action.pollCount };
    case 'order_reset':
      return {
        ...state,
        orderSearchType: 'area_code',
        orderSearchValue: '',
        orderSearchCity: '',
        orderSearchState: '',
        orderQuantity: 5,
        orderIsSearching: false,
        orderIsPlacing: false,
        orderAvailableNumbers: [],
        orderSelectedNumbers: [],
        orderCurrentOrder: null,
        orderError: null,
        orderPollCount: 0,
      };
    case 'port_set_phone_input': {
      const inputs = [...state.portPhoneInputs];
      inputs[action.index] = action.value;
      return { ...state, portPhoneInputs: inputs };
    }
    case 'port_add_phone':
      return { ...state, portPhoneInputs: [...state.portPhoneInputs, ''] };
    case 'port_remove_phone': {
      if (state.portPhoneInputs.length <= 1) return state;
      return {
        ...state,
        portPhoneInputs: state.portPhoneInputs.filter((_, i) => i !== action.index),
      };
    }
    case 'port_set_phone_errors':
      return { ...state, portPhoneErrors: action.errors };
    case 'port_check_eligibility_start':
      return {
        ...state,
        portIsCheckingEligibility: true,
        portEligibilityError: null,
        portPhoneErrors: {},
      };
    case 'port_check_eligibility_success':
      return {
        ...state,
        portIsCheckingEligibility: false,
        portEligibilityResult: action.result,
        subStep: 'port-eligibility',
      };
    case 'port_check_eligibility_error':
      return { ...state, portIsCheckingEligibility: false, portEligibilityError: action.error };
    case 'port_set_subscriber_btn':
      return { ...state, portSubscriberBtn: action.value };
    case 'port_set_subscriber_field': {
      const fieldMap: Partial<Record<string, keyof NumState>> = {
        businessName: 'portSubscriberBusinessName',
        approverName: 'portSubscriberApproverName',
        accountNumber: 'portSubscriberAccountNumber',
        pin: 'portSubscriberPin',
        houseNumber: 'portSubscriberHouseNumber',
        streetName: 'portSubscriberStreetName',
        line2: 'portSubscriberLine2',
        city: 'portSubscriberCity',
        state: 'portSubscriberState',
        zip: 'portSubscriberZip',
      };
      const key = fieldMap[action.field];
      return key ? { ...state, [key]: action.value } : state;
    }
    case 'port_set_subscriber_errors':
      return { ...state, portSubscriberErrors: action.errors };
    case 'port_set_foc_date':
      return { ...state, portFocDate: action.date };
    case 'port_set_foc_time':
      return { ...state, portFocTime: action.time };
    case 'port_set_foc_errors':
      return { ...state, portFocErrors: action.errors };
    case 'port_set_csr_file':
      return { ...state, portCsrFile: action.file };
    case 'port_set_bill_file':
      return { ...state, portBillFile: action.file };
    case 'port_set_doc_upload_error':
      return { ...state, portDocUploadError: action.error };
    case 'port_set_signature':
      return { ...state, portSignature: action.signature };
    case 'port_set_carrier_groups':
      return {
        ...state,
        portCarrierGroups: action.groups,
        portCompletedCarriers: [],
        portOrderResults: [],
      };
    case 'port_set_current_carrier':
      return {
        ...state,
        portCurrentCarrier: action.carrier,
        // Reset subscriber form fields for new carrier group
        portSubscriberBtn: '',
        portSubscriberBusinessName: '',
        portSubscriberApproverName: '',
        portSubscriberAccountNumber: '',
        portSubscriberPin: '',
        portSubscriberHouseNumber: '',
        portSubscriberStreetName: '',
        portSubscriberLine2: '',
        portSubscriberCity: '',
        portSubscriberState: '',
        portSubscriberZip: '',
        portSubscriberErrors: {},
        portFocDate: makeFocDate(),
        portFocTime: '',
        portFocErrors: {},
        portCsrFile: null,
        portBillFile: null,
        portDocUploadError: null,
        portSignature: '',
        portIsSubmitting: false,
        portSubmitError: null,
      };
    case 'port_carrier_submitted':
      return {
        ...state,
        portIsSubmitting: false,
        portCompletedCarriers: [...state.portCompletedCarriers, action.carrier],
        portOrderResults: [
          ...state.portOrderResults,
          { carrier: action.carrier, orderId: action.orderId, status: action.status },
        ],
      };
    case 'port_submit_start':
      return { ...state, portIsSubmitting: true, portSubmitError: null };
    case 'port_submit_success':
      return { ...state, portIsSubmitting: false, subStep: 'port-submitted' };
    case 'port_submit_error':
      return { ...state, portIsSubmitting: false, portSubmitError: action.error };
    case 'port_reset':
      return {
        ...state,
        portPhoneInputs: [''],
        portPhoneErrors: {},
        portEligibilityResult: null,
        portIsCheckingEligibility: false,
        portEligibilityError: null,
        portSubscriberBtn: '',
        portSubscriberBusinessName: '',
        portSubscriberApproverName: '',
        portSubscriberAccountNumber: '',
        portSubscriberPin: '',
        portSubscriberHouseNumber: '',
        portSubscriberStreetName: '',
        portSubscriberLine2: '',
        portSubscriberCity: '',
        portSubscriberState: '',
        portSubscriberZip: '',
        portSubscriberErrors: {},
        portFocDate: makeFocDate(),
        portFocTime: '',
        portFocErrors: {},
        portCsrFile: null,
        portBillFile: null,
        portDocUploadError: null,
        portSignature: '',
        portIsSubmitting: false,
        portSubmitError: null,
        portCarrierGroups: new Map(),
        portCurrentCarrier: null,
        portCompletedCarriers: [],
        portOrderResults: [],
      };
    case 'load_dids_start':
      return { ...state, isLoadingDIDs: true, didLoadError: null };
    case 'load_dids_success':
      return {
        ...state,
        isLoadingDIDs: false,
        didLoadError: null,
        hasAttemptedDIDLoad: true,
        activeDIDs: action.dids,
        selectedPrimaryDIDId: action.selectedId,
        primaryDIDAutoMatched: action.autoMatched,
      };
    case 'load_dids_error':
      return {
        ...state,
        isLoadingDIDs: false,
        didLoadError: action.error,
        hasAttemptedDIDLoad: true,
        activeDIDs: [],
        selectedPrimaryDIDId: null,
      };
    case 'set_primary_did':
      return { ...state, selectedPrimaryDIDId: action.didId, primaryDIDAutoMatched: false };
    case 'set_gate_error':
      return { ...state, gateError: action.error };
    case 'set_primary_did_error':
      return { ...state, primaryDIDError: action.error };
    case 'caller_id_init':
      return {
        ...state,
        callerIdInputs: action.inputs,
        callerIdStatuses: action.statuses,
        callerIdErrors: {},
        callerIdBulkAttempted: false,
      };
    case 'caller_id_set_input': {
      const prevStatus = state.callerIdStatuses[action.didId];
      const newStatus =
        prevStatus === 'submitted' || prevStatus === 'error' ? 'idle' : (prevStatus ?? 'idle');
      const newErrors = { ...state.callerIdErrors };
      delete newErrors[action.didId];
      return {
        ...state,
        callerIdInputs: { ...state.callerIdInputs, [action.didId]: action.value },
        callerIdStatuses: { ...state.callerIdStatuses, [action.didId]: newStatus },
        callerIdErrors: newErrors,
      };
    }
    case 'caller_id_batch_update':
      return {
        ...state,
        callerIdStatuses: { ...state.callerIdStatuses, ...action.statuses },
        callerIdErrors: { ...state.callerIdErrors, ...action.errors },
        callerIdBulkAttempted: action.attempted,
      };
    case 'caller_id_persist_name':
      return {
        ...state,
        activeDIDs: state.activeDIDs.map((d) =>
          d.id === action.didId ? { ...d, caller_id_name: action.name } : d
        ),
      };
    case 'e911_set_state':
      return {
        ...state,
        e911FlowState: action.state,
        ...(action.location !== undefined ? { e911ProvisionedLocation: action.location } : {}),
        ...(action.pollCount !== undefined ? { e911PollCount: action.pollCount } : {}),
      };
    default:
      return state;
  }
}
