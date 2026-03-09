/**
 * Interface that step helpers use to interact with the main onboarding component.
 * Keeps helpers decoupled from the concrete class while giving them access to
 * shared state, rendering, and i18n.
 */

import type { DialStackInstanceImpl, ComponentIcons } from '../../types';
import type {
  AccountOnboardingStep,
  AccountOnboardingClasses,
  AccountConfig,
  OnboardingUser,
} from '../../types';
import type { Extension } from '../../types/dial-plan';

export interface OnboardingHost {
  // Core references (readonly)
  readonly instance: DialStackInstanceImpl | null;
  readonly shadowRoot: ShadowRoot | null;
  readonly icons: Required<ComponentIcons>;
  readonly classes: AccountOnboardingClasses;

  // Shared state (read)
  readonly users: OnboardingUser[];
  readonly extensions: Extension[];
  readonly accountConfig: AccountConfig;

  // Methods
  t(key: string, params?: Record<string, string | number>): string;
  escapeHtml(str: string): string;
  render(): void;

  // Shared state (write)
  setUsers(users: OnboardingUser[]): void;
  setExtensions(extensions: Extension[]): void;
  navigateToStep(step: AccountOnboardingStep): void;
  getActiveSteps(): AccountOnboardingStep[];

  // Shared utilities
  getExtensionForUser(userId: string): Extension | undefined;
  getNextExtensionNumber(): string;

  // Step footer (used by hardware and numbers overview)
  renderStepFooter(): string;
}
