/**
 * Account onboarding step — manages the business-details and team-members sub-steps.
 *
 * SAFETY NOTE: dangerouslySetInnerHTML is used only for CHECK_SVG_WHITE, a static SVG
 * constant from our own icons.ts — never user input.
 */

import React, { useState, useCallback, useMemo } from 'react';
import { useOnboarding, findNextIncompleteStep } from '../../OnboardingContext';
import { OnboardingLayout } from '../../OnboardingLayout';
import { BuildingIcon } from '../../components/icons';
import { StepSidebar } from '../../components/StepSidebar';
import { StepCompleteScreen } from '../../components/StepCompleteScreen';
import { BusinessDetails } from './BusinessDetails';
import { TeamMembers } from './TeamMembers';

type AccountSubStep = 'business-details' | 'team-members' | 'complete';

export const AccountStep: React.FC = () => {
  const { locale, progressStore, activeSteps, account } = useOnboarding();
  const [subStep, setSubStep] = useState<AccountSubStep>('business-details');
  const [accountEmail, setAccountEmail] = useState(account?.email ?? '');

  // Back from first sub-step goes to previous step (if any).
  const accountIdx = activeSteps.indexOf('account');
  const handleBackToPrevStep = useMemo(() => {
    if (accountIdx <= 0) return undefined;
    const prevStep = activeSteps[accountIdx - 1]!;
    return () => progressStore.setCurrentStep(prevStep);
  }, [accountIdx, activeSteps, progressStore]);

  const handleBusinessDetailsAdvance = useCallback((email: string) => {
    setAccountEmail(email);
    setSubStep('team-members');
  }, []);

  const handleTeamMembersBack = useCallback(() => {
    setSubStep('business-details');
  }, []);

  const handleTeamMembersDone = useCallback(() => {
    setSubStep('complete');
  }, []);

  const handleCompleteDone = useCallback(() => {
    progressStore.setCurrentStep(findNextIncompleteStep(activeSteps, progressStore, 'account'));
  }, [activeSteps, progressStore]);

  const stepLabel = locale.accountOnboarding.steps.account;

  const sidebarSubSteps = useMemo(
    () => [
      {
        key: 'business-details',
        label: locale.accountOnboarding.sidebar.businessDetails,
        description: locale.accountOnboarding.sidebar.businessDetailsDesc,
      },
      {
        key: 'team-members',
        label: locale.accountOnboarding.sidebar.teamMembers,
        description: locale.accountOnboarding.sidebar.teamMembersDesc,
      },
    ],
    [locale]
  );

  const sidebar = useMemo(() => {
    const activeIdx =
      subStep === 'complete'
        ? sidebarSubSteps.length // all complete
        : sidebarSubSteps.findIndex((s) => s.key === subStep);

    return (
      <StepSidebar
        icon={<BuildingIcon />}
        title={stepLabel}
        items={sidebarSubSteps}
        activeIndex={activeIdx}
      />
    );
  }, [subStep, sidebarSubSteps, stepLabel]);

  return (
    <OnboardingLayout sidebar={sidebar}>
      {subStep === 'business-details' && (
        <BusinessDetails onAdvance={handleBusinessDetailsAdvance} onBack={handleBackToPrevStep} />
      )}
      {subStep === 'team-members' && (
        <TeamMembers
          accountEmail={accountEmail}
          onBack={handleTeamMembersBack}
          onDone={handleTeamMembersDone}
        />
      )}
      {subStep === 'complete' && (
        <StepCompleteScreen stepName={stepLabel} onDone={handleCompleteDone} />
      )}
    </OnboardingLayout>
  );
};
