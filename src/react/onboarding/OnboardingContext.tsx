/**
 * React context providing shared state for the onboarding UI.
 *
 * Responsibilities:
 * - Hold references to the DialStack instance, progress store, and config
 * - Derive activeSteps from collectionOptions (include/exclude against the
 *   three navigable steps: account, numbers, hardware)
 *
 * This file does NOT fetch data (see useOnboardingData) and does NOT subscribe
 * to progressStore changes (see useOnboardingProgress).
 *
 * Note: currentStep is intentionally NOT on this context. Reading it here would
 * be a stale read — progressStore uses pub/sub and React has no visibility into
 * its mutations. Use useOnboardingProgress (useSyncExternalStore) for reactive reads.
 * Consumers that need to navigate can call progressStore.setCurrentStep() directly.
 */

import React, { createContext, useContext, useMemo } from 'react';
import type { ReactNode } from 'react';
import type { DialStackInstance } from '../../types';
import type { Locale } from '../../locales';
import type { FormattingOptions } from '../../types/components';
import type { ComponentIcons } from '../../types/appearance';
import type {
  AccountOnboardingStep,
  AccountConfig,
  Account,
  OnboardingCollectionOptions,
  OnboardingUser,
  OnboardingLocation,
} from '../../types/account-onboarding';
import type { Extension } from '../../types/dial-plan';
import type { OnboardingProgressStore } from './progress-store';
import { useDialstackComponents } from '@dialstack/sdk/react';

/** The three steps a user navigates through (final_complete is not a nav target). */
const NAVIGABLE_STEPS: AccountOnboardingStep[] = ['account', 'numbers', 'hardware'];

export interface OnboardingContextValue {
  /** SDK instance from the parent DialstackComponentsProvider. */
  dialstack: DialStackInstance;
  /** Owns step navigation and substep completion state. */
  progressStore: OnboardingProgressStore;
  /** Shared account config loaded by useOnboardingData and passed in as a prop. */
  accountConfig: AccountConfig | null;
  /** Steps visible to the user after applying collectionOptions include/exclude. */
  activeSteps: AccountOnboardingStep[];
  locale: Locale;
  formatting: FormattingOptions | undefined;
  icons: ComponentIcons | undefined;
  collectionOptions: OnboardingCollectionOptions | undefined;
  /** Pre-fetched account data shared across steps. */
  account: Account | null;
  /** Pre-fetched users shared across steps. */
  users: OnboardingUser[];
  /** Pre-fetched extensions shared across steps. */
  extensions: Extension[];
  /** Pre-fetched locations shared across steps. */
  locations: OnboardingLocation[];
  /** Reload shared data after mutations (e.g., after adding a user). */
  reloadSharedData: () => Promise<void>;
  /** Platform name for locale string interpolation (e.g. "Acme Voice"). */
  platformName: string;
}

export interface OnboardingProviderProps {
  progressStore: OnboardingProgressStore;
  accountConfig: AccountConfig | null;
  account: Account | null;
  users: OnboardingUser[];
  extensions: Extension[];
  locations: OnboardingLocation[];
  reloadSharedData: () => Promise<void>;
  locale: Locale;
  formatting?: FormattingOptions;
  icons?: ComponentIcons;
  collectionOptions?: OnboardingCollectionOptions;
  platformName?: string;
  children: ReactNode;
}

const OnboardingContext = createContext<OnboardingContextValue | null>(null);

/**
 * Computes the list of steps visible to the user.
 *
 * - `include` scopes to only those steps (plus any non-navigable steps like
 *   final_complete that are always shown).
 * - `exclude` removes steps from the resulting list.
 * - When both are set, include is applied first, then exclude removes from that result.
 */
function computeActiveSteps(
  options: OnboardingCollectionOptions | undefined
): AccountOnboardingStep[] {
  let steps = [...NAVIGABLE_STEPS];

  if (options?.steps?.include) {
    const includeSet = new Set(options.steps.include);
    steps = steps.filter((s) => includeSet.has(s));
  }

  if (options?.steps?.exclude) {
    const excludeSet = new Set(options.steps.exclude);
    steps = steps.filter((s) => !excludeSet.has(s));
  }

  return steps;
}

export const OnboardingProvider: React.FC<OnboardingProviderProps> = ({
  progressStore,
  accountConfig,
  account,
  users,
  extensions,
  locations,
  reloadSharedData,
  locale,
  formatting,
  icons,
  collectionOptions,
  platformName,
  children,
}) => {
  const { dialstack } = useDialstackComponents();

  const activeSteps = useMemo(() => computeActiveSteps(collectionOptions), [collectionOptions]);

  const resolvedPlatformName = platformName ?? 'DialStack';

  const value: OnboardingContextValue = useMemo(
    () => ({
      dialstack,
      progressStore,
      accountConfig,
      activeSteps,
      locale,
      formatting,
      icons,
      collectionOptions,
      account,
      users,
      extensions,
      locations,
      reloadSharedData,
      platformName: resolvedPlatformName,
    }),
    [
      dialstack,
      progressStore,
      accountConfig,
      activeSteps,
      locale,
      formatting,
      icons,
      collectionOptions,
      account,
      users,
      extensions,
      locations,
      reloadSharedData,
      resolvedPlatformName,
    ]
  );

  return <OnboardingContext.Provider value={value}>{children}</OnboardingContext.Provider>;
};

/**
 * Find the next incomplete step after `currentStep`, wrapping around if needed.
 * Returns 'final_complete' if all steps are done.
 */
export function findNextIncompleteStep(
  activeSteps: AccountOnboardingStep[],
  progressStore: OnboardingProgressStore,
  currentStep: AccountOnboardingStep
): AccountOnboardingStep {
  const navigable = activeSteps.filter((s) => s !== 'final_complete');
  const idx = navigable.indexOf(currentStep as (typeof navigable)[number]);
  // Search after current step first, then wrap around
  const after = navigable.slice(idx + 1);
  const before = navigable.slice(0, idx);
  const next = [...after, ...before].find(
    (s) => !progressStore.isStepComplete(s as 'account' | 'numbers' | 'hardware')
  );
  return next ?? 'final_complete';
}

/**
 * Access the onboarding context.
 *
 * @throws {Error} If used outside of OnboardingProvider.
 */
export const useOnboarding = (): OnboardingContextValue => {
  const context = useContext(OnboardingContext);
  if (!context) {
    throw new Error(
      'Could not find OnboardingContext; You need to wrap your component in an <OnboardingProvider>.'
    );
  }
  return context;
};
