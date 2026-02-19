/**
 * React wrapper for AccountOnboarding Web Component
 */

import React from 'react';
import { useDialstackComponents } from './DialstackComponentsProvider';
import { useCreateComponent } from './useCreateComponent';
import { useUpdateWithSetter } from './useUpdateWithSetter';
import type {
  LoaderStart,
  LoadError,
  FormattingOptions,
  ComponentIcons,
  LayoutVariant,
  AccountOnboardingClasses,
  AccountOnboardingStep,
  OnboardingCollectionOptions,
} from '../types';
import type { Locale } from '../locales';

export interface AccountOnboardingProps {
  /**
   * Optional CSS class name
   */
  className?: string;

  /**
   * Optional inline styles
   */
  style?: React.CSSProperties;

  /**
   * Locale for UI strings
   */
  locale?: Locale;

  /**
   * Formatting options for phone numbers
   */
  formatting?: FormattingOptions;

  /**
   * Custom icons (partial override of defaults)
   */
  icons?: ComponentIcons;

  /**
   * Layout variant (compact, comfortable, default)
   */
  layoutVariant?: LayoutVariant;

  /**
   * Custom CSS classes for styling integration
   */
  classes?: AccountOnboardingClasses;

  /**
   * Callback when component starts loading
   */
  onLoaderStart?: (event: LoaderStart) => void;

  /**
   * Callback when there's an error loading data
   */
  onLoadError?: (event: LoadError) => void;

  /**
   * Callback when user completes or exits the onboarding flow
   */
  onExit?: () => void;

  /**
   * Callback when the user navigates to a different step
   */
  onStepChange?: (event: { step: AccountOnboardingStep }) => void;

  /**
   * Collection options to include/exclude specific onboarding steps
   */
  collectionOptions?: OnboardingCollectionOptions;

  /**
   * URL for the full Terms of Service, rendered on the complete step
   */
  fullTermsOfServiceUrl?: string;

  /**
   * URL for the Recipient Terms of Service, rendered on the complete step
   */
  recipientTermsOfServiceUrl?: string;

  /**
   * URL for the Privacy Policy, rendered on the complete step
   */
  privacyPolicyUrl?: string;
}

/**
 * AccountOnboarding component provides a multi-step onboarding wizard
 *
 * Steps: Account Setup → Telephone Numbers → Hardware → Complete
 *
 * Must be used within a DialstackComponentsProvider.
 *
 * @example
 * ```tsx
 * <DialstackComponentsProvider dialstack={dialstack}>
 *   <AccountOnboarding
 *     onExit={() => console.log('Onboarding finished')}
 *     onStepChange={(e) => console.log('Step:', e.step)}
 *   />
 * </DialstackComponentsProvider>
 * ```
 */
export const AccountOnboarding: React.FC<AccountOnboardingProps> = ({
  className,
  style,
  locale,
  formatting,
  icons,
  layoutVariant,
  classes,
  onLoaderStart,
  onLoadError,
  onExit,
  onStepChange,
  collectionOptions,
  fullTermsOfServiceUrl,
  recipientTermsOfServiceUrl,
  privacyPolicyUrl,
}) => {
  const { dialstack } = useDialstackComponents();
  const { containerRef, componentInstance } = useCreateComponent(dialstack, 'account-onboarding');

  // Sync configuration props
  useUpdateWithSetter(componentInstance, locale, (c, v) => c.setLocale(v));
  useUpdateWithSetter(componentInstance, formatting, (c, v) => c.setFormatting(v));
  useUpdateWithSetter(componentInstance, icons, (c, v) => c.setIcons(v));
  useUpdateWithSetter(componentInstance, layoutVariant, (c, v) => c.setLayoutVariant(v));
  useUpdateWithSetter(componentInstance, classes, (c, v) => c.setClasses(v));

  // Sync collection and URL props
  useUpdateWithSetter(componentInstance, collectionOptions, (c, v) => c.setCollectionOptions(v));
  useUpdateWithSetter(componentInstance, fullTermsOfServiceUrl, (c, v) =>
    c.setFullTermsOfServiceUrl(v)
  );
  useUpdateWithSetter(componentInstance, recipientTermsOfServiceUrl, (c, v) =>
    c.setRecipientTermsOfServiceUrl(v)
  );
  useUpdateWithSetter(componentInstance, privacyPolicyUrl, (c, v) => c.setPrivacyPolicyUrl(v));

  // Sync callbacks
  useUpdateWithSetter(componentInstance, onLoaderStart, (c, v) => c.setOnLoaderStart(v));
  useUpdateWithSetter(componentInstance, onLoadError, (c, v) => c.setOnLoadError(v));
  useUpdateWithSetter(componentInstance, onExit, (c, v) => c.setOnExit(v));
  useUpdateWithSetter(componentInstance, onStepChange, (c, v) => c.setOnStepChange(v));

  return <div ref={containerRef} className={className} style={style} />;
};
