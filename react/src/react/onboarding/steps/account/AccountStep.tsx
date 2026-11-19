/**
 * Business details onboarding step. Its id stays `account` for compatibility
 * with existing `collectionOptions`.
 */

import React, { useState, useCallback, useMemo } from 'react';
import { useOnboarding, findNextIncompleteStep } from '../../OnboardingContext';
import { OnboardingLayout } from '../../OnboardingLayout';
import { BuildingIcon } from '../../components/icons';
import { StepSidebar } from '../../components/StepSidebar';
import { StepCompleteScreen } from '../../components/StepCompleteScreen';
import { BusinessDetails } from './BusinessDetails';
import { usePrevStepHandler } from '../usePrevStepHandler';

export const AccountStep: React.FC = () => {
  const { locale, progressStore, activeSteps } = useOnboarding();
  const [complete, setComplete] = useState(false);
  const handleBackToPrevStep = usePrevStepHandler('account');

  const handleAdvance = useCallback(() => setComplete(true), []);

  const handleCompleteDone = useCallback(() => {
    progressStore.setCurrentStep(findNextIncompleteStep(activeSteps, progressStore, 'account'));
  }, [activeSteps, progressStore]);

  const stepLabel = locale.accountOnboarding.steps.account;

  const sidebar = useMemo(
    () => (
      <StepSidebar
        icon={<BuildingIcon />}
        title={stepLabel}
        items={[
          {
            key: 'business-details',
            label: locale.accountOnboarding.sidebar.businessDetails,
            description: locale.accountOnboarding.sidebar.businessDetailsDesc,
          },
        ]}
        activeIndex={complete ? 1 : 0}
      />
    ),
    [complete, locale, stepLabel]
  );

  return (
    <OnboardingLayout sidebar={sidebar}>
      {complete ? (
        <StepCompleteScreen stepName={stepLabel} onDone={handleCompleteDone} />
      ) : (
        <BusinessDetails onAdvance={handleAdvance} onBack={handleBackToPrevStep} />
      )}
    </OnboardingLayout>
  );
};
