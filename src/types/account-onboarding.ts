/**
 * Account onboarding types for DialStack SDK
 */

import type { BaseComponentClasses } from './appearance';
import type { BaseComponentElement } from './components';

export type AccountOnboardingStep = 'account' | 'numbers' | 'hardware' | 'final_complete';

/**
 * Options to control which onboarding steps are presented.
 *
 * - `include` scopes collection to only the listed steps.
 * - `exclude` hides the listed steps.
 * - When both are set, `include` is applied first, then `exclude` removes from that result.
 * - The `final_complete` step is always shown regardless of these options.
 */
export interface OnboardingCollectionOptions {
  steps?: {
    /** Show only these steps (the `final_complete` step is always included). */
    include?: AccountOnboardingStep[];
    /** Hide these steps, preventing the user from seeing them. */
    exclude?: AccountOnboardingStep[];
  };
  /** Jump straight to this step after data loads. Useful for development. */
  initialStep?: AccountOnboardingStep;
}

export interface OnboardingPortalClasses extends BaseComponentClasses {
  sidebar?: string;
  mainContent?: string;
}

export interface AccountOnboardingClasses extends BaseComponentClasses {
  stepAccount?: string;
  stepNumbers?: string;
  stepHardware?: string;
  stepComplete?: string;
}

export interface AccountOnboardingElement extends Omit<BaseComponentElement, 'setClasses'> {
  setClasses: (classes: AccountOnboardingClasses) => void;
  setOnExit: (cb: () => void) => void;
  setOnStepChange: (cb: (event: { step: AccountOnboardingStep }) => void) => void;
  setCollectionOptions: (options?: OnboardingCollectionOptions | null) => void;
  setFullTermsOfServiceUrl: (url?: string | null) => void;
  setRecipientTermsOfServiceUrl: (url?: string | null) => void;
  setPrivacyPolicyUrl: (url?: string | null) => void;
  getCurrentStep: () => AccountOnboardingStep;
  getActiveSteps: () => AccountOnboardingStep[];
  getActiveStepElement: () => {
    getProgress: () => { activeIndex: number; totalSubSteps: number };
  } | null;
  getSavedStepIndex: () => number;
  navigateToStep: (step: AccountOnboardingStep) => void;
  setOnSubStepProgress: (cb: (() => void) | undefined) => void;
}

export interface OnboardingPortalElement extends Omit<BaseComponentElement, 'setClasses'> {
  setClasses: (classes: OnboardingPortalClasses) => void;
  setOnStepChange: (cb: (event: { step: AccountOnboardingStep }) => void) => void;
  setCollectionOptions: (options?: OnboardingCollectionOptions | null) => void;
  setFullTermsOfServiceUrl: (url?: string | null) => void;
  setRecipientTermsOfServiceUrl: (url?: string | null) => void;
  setPrivacyPolicyUrl: (url?: string | null) => void;
  setOnBack: (cb: (() => void) | undefined) => void;
  setBackLabel: (label: string | undefined) => void;
  setLogoHtml: (html: string | undefined) => void;
}

export interface AccountConfig {
  region?: string;
  extension_length?: number;
  transcription_enabled?: boolean;
  timezone?: string;
  max_phone_numbers?: number;
  onboarding_progress?: {
    current_step?: AccountOnboardingStep;
    account?: string[];
    numbers?: string[];
    hardware?: string[];
  };
}

export interface Account {
  id: string;
  name?: string | null;
  email?: string | null;
  phone?: string | null;
  primary_contact_name?: string | null;
  config: AccountConfig;
  created_at: string;
  updated_at: string;
}

export interface UpdateAccountRequest {
  name?: string;
  email?: string;
  phone?: string;
  primary_contact_name?: string;
  config?: AccountConfig;
}

export interface OnboardingUser {
  id: string;
  name?: string | null;
  email?: string | null;
  created_at: string;
  updated_at: string;
}

export interface CreateUserRequest {
  name?: string;
  email?: string;
}

export interface CreateExtensionRequest {
  number: string;
  target: string;
}

export interface AddressSuggestion {
  place_id: string;
  title: string;
  formatted_address: string;
}

export interface ResolvedAddress {
  place_id: string;
  address_number: string;
  street: string;
  city: string;
  state: string;
  postal_code: string;
  country: string;
  latitude: number;
  longitude: number;
  timezone?: string;
}

export interface LocationAddressInput {
  address_number?: string;
  street: string;
  unit?: string;
  city: string;
  state: string;
  postal_code: string;
  country: string;
}

export interface OnboardingLocation {
  id: string;
  name: string;
  address: {
    place_id?: string;
    address_number?: string;
    street?: string;
    unit?: string;
    city: string;
    state: string;
    postal_code: string;
    country: string;
    latitude?: number;
    longitude?: number;
    formatted_address?: string;
  };
  primary_did_id?: string | null;
  e911_status?: 'none' | 'pending' | 'binding' | 'provisioned' | 'failed';
  status: string;
  created_at: string;
  updated_at: string;
}

export interface CreateLocationRequest {
  name: string;
  address: LocationAddressInput;
}

export interface UpdateLocationRequest {
  name?: string;
  address?: LocationAddressInput;
  primary_did_id?: string | null;
}

/**
 * Minimal endpoint type for onboarding device assignment.
 * Intentionally omits sip_username (not needed by the UI) and sip_password
 * (write-only in the API, never returned).
 */
export interface OnboardingEndpoint {
  id: string;
  user_id: string;
  name?: string;
  created_at: string;
  updated_at: string;
}

export interface CreateEndpointRequest {
  name?: string;
}

export interface E911ValidationResult {
  adjusted: boolean;
  address?: {
    house_number?: string;
    street_name?: string;
    street_suffix?: string;
    pre_directional?: string;
    post_directional?: string;
    address_line_2?: string;
    city?: string;
    state_code?: string;
    zip?: string;
    plus_four?: string;
    county?: string;
    country?: string;
  };
}
