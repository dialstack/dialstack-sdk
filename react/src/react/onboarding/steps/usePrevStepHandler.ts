import { useMemo } from 'react';
import type { AccountOnboardingStep } from '@dialstack/sdk-js';
import { useOnboarding } from '../OnboardingContext';

/**
 * Back from a step's first screen goes to the previous visible step, or is
 * absent when this is the first one.
 */
export function usePrevStepHandler(step: AccountOnboardingStep): (() => void) | undefined {
  const { activeSteps, progressStore } = useOnboarding();
  const idx = activeSteps.indexOf(step);
  const prevStep = idx > 0 ? activeSteps[idx - 1] : undefined;
  return useMemo(
    () => (prevStep ? () => progressStore.setCurrentStep(prevStep) : undefined),
    [prevStep, progressStore]
  );
}
