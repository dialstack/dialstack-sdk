/**
 * Account onboarding types for DialStack SDK
 */

import type { BaseComponentClasses } from './appearance';

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

export interface E911NotificationConfig {
  emails?: string[];
}

export interface AccountConfig {
  region?: string;
  extension_length?: number;
  transcription_enabled?: boolean;
  timezone?: string;
  max_phone_numbers?: number;
  e911_notification?: E911NotificationConfig;
  /**
   * Account-level override for whether the managed AI agent is offered when
   * creating a voice app. Tri-state: null/undefined inherits the platform
   * default, `true` shows it, `false` hides it.
   */
  default_agent_visible?: boolean | null;
}

export interface Account {
  id: string;
  name?: string | null;
  email?: string | null;
  phone?: string | null;
  primary_contact_name?: string | null;
  config: AccountConfig;
  /** True when the account has completed every onboarding step. */
  onboarding_complete: boolean;
  hold_music_clip?: string | null;
  /** @deprecated Use `hold_music_clip`. Retained for backwards compatibility. */
  hold_music_clip_id?: string | null;
  main_location?: string | null;
  /** @deprecated Use `main_location`. Retained for backwards compatibility. */
  main_location_id?: string | null;
  created_at: string;
  updated_at: string;
}

export interface UpdateAccountRequest {
  name?: string;
  email?: string;
  phone?: string;
  primary_contact_name?: string;
  config?: AccountConfig;
  hold_music_clip?: string | null;
  /** @deprecated Use `hold_music_clip`. Retained for backwards compatibility. */
  hold_music_clip_id?: string | null;
  main_location?: string;
  /** @deprecated Use `main_location`. Retained for backwards compatibility. */
  main_location_id?: string;
}

/**
 * Per-account pricing the customer is agreeing to alongside the subscription
 * agreement. Rates are in cents per month; `null` means the rate is not yet set.
 */
export interface AccountPricing {
  per_user_rate: number | null;
  per_did_rate: number | null;
  per_voiceai_location_rate: number | null;
}

/**
 * A recorded acceptance of the subscription agreement for an account. Present
 * only when it satisfies the current agreement version — a superseded
 * acceptance comes back as `null`, the same as never having accepted.
 */
export interface TosAcceptance {
  accepted_at: string;
  ip?: string;
  user_agent?: string;
  /** Snapshot of the pricing as it stood when the agreement was accepted. */
  pricing: AccountPricing;
}

/**
 * The current subscription agreement plus this account's acceptance state.
 * Returned by `account.tos.retrieve()`; `pricing` is only present when
 * requested via `expand: ['pricing']`.
 */
export interface Tos {
  /** The current agreement version. */
  version: string;
  /** Canonical URL of the full agreement. */
  url: string;
  /** The short affirmation to tick (the checkbox label, including the 911/E911 acknowledgement). */
  content: string;
  /**
   * Full agreement text (HTML) to render as the agreement body. Optional: an
   * older API during a mixed-version deploy may omit it, so consumers must
   * handle its absence (the acceptance gate fails closed when it is missing).
   */
  body?: string;
  /** The latest acceptance for this account, or `null` if never accepted. */
  acceptance: TosAcceptance | null;
  /** Present only when expanded; `null` when the account's pricing is incomplete. */
  pricing?: AccountPricing | null;
}

export interface OnboardingUser {
  id: string;
  name?: string | null;
  email?: string | null;
  /**
   * The user's account-level role. The API emits `'account_admin'` for the
   * account admin and `''` for a regular member; a literal union so a typo in
   * the comparison fails typecheck.
   */
  account_role?: 'account_admin' | '' | null;
  extensions?: { data?: Array<{ number?: string }> };
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

export interface LocationConfig {
  e911_notification?: E911NotificationConfig;
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
  /** ID of the primary phone number assigned to this location. */
  primary_did?: string | null;
  /** @deprecated Use `primary_did`. Retained for backwards compatibility. */
  primary_did_id?: string | null;
  e911_status?: 'none' | 'pending' | 'binding' | 'provisioned' | 'failed';
  /** @deprecated The operational-status field was retired; always "active". */
  status: string;
  config?: LocationConfig;
  created_at: string;
  updated_at: string;
}

export interface CreateLocationRequest {
  name: string;
  address: LocationAddressInput;
  /** ID of the primary phone number for this location. */
  primary_did?: string;
  /** @deprecated Use `primary_did`. Retained for backwards compatibility. */
  primary_did_id?: string;
}

export interface UpdateLocationRequest {
  name?: string;
  address?: LocationAddressInput;
  /** ID of the primary phone number for this location. */
  primary_did?: string | null;
  /** @deprecated Use `primary_did`. Retained for backwards compatibility. */
  primary_did_id?: string | null;
  config?: LocationConfig;
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
