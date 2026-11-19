/**
 * Users onboarding step — adds the account's users and their extensions.
 */

import React, { useState, useCallback, useMemo } from 'react';
import { useOnboarding, findNextIncompleteStep } from '../../OnboardingContext';
import { OnboardingLayout } from '../../OnboardingLayout';
import { UserIcon } from '../../components/icons';
import { StepSidebar } from '../../components/StepSidebar';
import { StepCompleteScreen } from '../../components/StepCompleteScreen';
import { TeamMembers } from './TeamMembers';
import { usePrevStepHandler } from '../usePrevStepHandler';
import { stepLabel } from '../../portal-constants';

export const UsersStep: React.FC = () => {
  const { locale, progressStore, activeSteps } = useOnboarding();
  const [complete, setComplete] = useState(false);
  const handleBackToPrevStep = usePrevStepHandler('users');

  const handleDone = useCallback(() => setComplete(true), []);

  const handleCompleteDone = useCallback(() => {
    progressStore.setCurrentStep(findNextIncompleteStep(activeSteps, progressStore, 'users'));
  }, [activeSteps, progressStore]);

  const label = stepLabel(locale, 'users');

  const sidebar = useMemo(
    () => (
      <StepSidebar
        icon={<UserIcon />}
        title={label}
        items={[
          {
            key: 'team-members',
            label: locale.accountOnboarding.sidebar.teamMembers,
            description: locale.accountOnboarding.sidebar.teamMembersDesc,
          },
        ]}
        activeIndex={complete ? 1 : 0}
      />
    ),
    [complete, locale, label]
  );

  return (
    <OnboardingLayout sidebar={sidebar}>
      {complete ? (
        <StepCompleteScreen stepName={label} onDone={handleCompleteDone} />
      ) : (
        <TeamMembers onBack={handleBackToPrevStep} onDone={handleDone} />
      )}
    </OnboardingLayout>
  );
};
