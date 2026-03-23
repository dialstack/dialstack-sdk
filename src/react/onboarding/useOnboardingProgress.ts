import { useSyncExternalStore } from 'react';
import type { AccountOnboardingStep } from '../../types/account-onboarding';
import { ONBOARDING_STEPS } from './constants';
import { useOnboarding } from './OnboardingContext';

export interface OnboardingProgressSnapshot {
  currentStep: AccountOnboardingStep;
}

export function useOnboardingProgress(): OnboardingProgressSnapshot {
  const { progressStore } = useOnboarding();

  // Include progress percentages in the snapshot so that when completeSubStep
  // fires notify(), the snapshot changes and React re-renders subscribers
  // (e.g. PortalSidebar which reads getStepProgressPercent() directly).
  const snapshot = useSyncExternalStore(
    (listener) => progressStore.subscribe(listener),
    () =>
      progressStore.getCurrentStep() +
      '|' +
      ONBOARDING_STEPS.map((s) => progressStore.getStepProgressPercent(s)).join(','),
    () => progressStore.getCurrentStep()
  );

  const currentStep = snapshot.split('|')[0] as AccountOnboardingStep;
  return { currentStep };
}
