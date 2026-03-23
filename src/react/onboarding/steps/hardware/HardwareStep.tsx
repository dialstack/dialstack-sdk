/**
 * Hardware onboarding step — layout wrapper with sidebar and device assignment content.
 */

import React, { useState, useCallback, useMemo } from 'react';
import type { OnboardingLocation } from '../../../../types';
import { useOnboarding, findNextIncompleteStep } from '../../OnboardingContext';
import { OnboardingLayout } from '../../OnboardingLayout';
import { HeadsetIcon, LocationIcon } from '../../components/icons';
import { StepSidebar } from '../../components/StepSidebar';
import { StepCompleteScreen } from '../../components/StepCompleteScreen';
import { DeviceAssignment } from './DeviceAssignment';
import hardwareStyles from '../../styles/hardware-styles.css';

// Stable array for ShadowContainer — step-specific CSS passed to OnboardingLayout.
const HARDWARE_EXTRA_STYLESHEETS = [hardwareStyles];

export const HardwareStep: React.FC = () => {
  const { locale, progressStore, activeSteps } = useOnboarding();
  const [location, setLocation] = useState<OnboardingLocation | null>(null);
  const [isComplete, setIsComplete] = useState(false);

  // Back from first sub-step goes to previous step (if any).
  const hardwareIdx = activeSteps.indexOf('hardware');
  const handleBackToPrevStep = useMemo(() => {
    if (hardwareIdx <= 0) return undefined;
    const prevStep = activeSteps[hardwareIdx - 1]!;
    return () => progressStore.setCurrentStep(prevStep);
  }, [hardwareIdx, activeSteps, progressStore]);

  const handleDone = useCallback(() => {
    progressStore.completeSubStep('hardware', 'device-assignment');
    progressStore.completeSubStep('hardware', 'final-completion');
    setIsComplete(true);
  }, [progressStore]);

  const handleCompleteDone = useCallback(() => {
    progressStore.setCurrentStep(findNextIncompleteStep(activeSteps, progressStore, 'hardware'));
  }, [activeSteps, progressStore]);

  const handleLocationLoaded = useCallback((loc: OnboardingLocation | null) => {
    setLocation(loc);
  }, []);

  const sidebarSubSteps = useMemo(
    () => [
      {
        key: 'device-assignment',
        label: locale.accountOnboarding.sidebar.deviceAssignment,
        description: locale.accountOnboarding.sidebar.deviceAssignmentDesc,
      },
      {
        key: 'final-completion',
        label: locale.accountOnboarding.sidebar.finalCompletion,
        description: locale.accountOnboarding.sidebar.finalCompletionDesc,
      },
    ],
    [locale]
  );

  const locationSection = useMemo(() => {
    if (!location?.address) return null;
    const addr = location.address;
    const streetLine = [addr.address_number, addr.street].filter(Boolean).join(' ');
    const regionPart = [addr.state, addr.postal_code].filter(Boolean).join(' ');
    const cityLine = [addr.city, regionPart].filter(Boolean).join(', ');

    return (
      <div className="sidebar-section">
        <div className="sidebar-section-header">
          <div className="sidebar-section-icon">
            <LocationIcon />
          </div>
          <span className="sidebar-section-title">
            {locale.accountOnboarding.hardware.shippingAddress}
          </span>
        </div>
        <div className="sidebar-section-text">
          {streetLine && (
            <>
              {streetLine}
              <br />
            </>
          )}
          {location.name && (
            <>
              {location.name}
              <br />
            </>
          )}
          {cityLine && cityLine}
        </div>
      </div>
    );
  }, [location, locale]);

  const stepLabel = locale.accountOnboarding.steps.hardware;

  const sidebar = useMemo(() => {
    const activeIdx = isComplete
      ? sidebarSubSteps.length // all complete
      : sidebarSubSteps.findIndex((s) => s.key === 'device-assignment');

    return (
      <StepSidebar
        icon={<HeadsetIcon />}
        title={stepLabel}
        items={sidebarSubSteps}
        activeIndex={activeIdx}
      >
        {locationSection}
      </StepSidebar>
    );
  }, [isComplete, sidebarSubSteps, locationSection, stepLabel]);

  if (isComplete) {
    return (
      <OnboardingLayout sidebar={sidebar} extraStylesheets={HARDWARE_EXTRA_STYLESHEETS}>
        <StepCompleteScreen stepName={stepLabel} onDone={handleCompleteDone} />
      </OnboardingLayout>
    );
  }

  return (
    <OnboardingLayout sidebar={sidebar} extraStylesheets={HARDWARE_EXTRA_STYLESHEETS}>
      <DeviceAssignment
        onDone={handleDone}
        onLocationLoaded={handleLocationLoaded}
        onBack={handleBackToPrevStep}
      />
    </OnboardingLayout>
  );
};
