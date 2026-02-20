/**
 * Account onboarding types for DialStack SDK
 */

import type { BaseComponentClasses } from './appearance';
import type { BaseComponentElement } from './components';

export type AccountOnboardingStep = 'account' | 'numbers' | 'hardware' | 'complete';

/**
 * Options to control which onboarding steps are presented.
 *
 * - `include` scopes collection to only the listed steps.
 * - `exclude` hides the listed steps.
 * - When both are set, `include` is applied first, then `exclude` removes from that result.
 * - The `complete` step is always shown regardless of these options.
 */
export interface OnboardingCollectionOptions {
  steps?: {
    /** Show only these steps (the `complete` step is always included). */
    include?: AccountOnboardingStep[];
    /** Hide these steps, preventing the user from seeing them. */
    exclude?: AccountOnboardingStep[];
  };
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
}
