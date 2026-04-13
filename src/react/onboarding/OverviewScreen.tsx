/**
 * Overview screen — progress dashboard shown between wizard steps.
 *
 * SAFETY NOTE: dangerouslySetInnerHTML is used only for static SVG constants
 * (STEP_ICONS, CHECK_SVG_WHITE, PHONE_SVG) from our own codebase — never user input.
 * Phone number strings and user data are rendered as plain React text nodes.
 */

import React from 'react';
import { parsePhoneNumberFromString } from 'libphonenumber-js';
import { useOnboarding } from './OnboardingContext';
import { useOnboardingProgress } from './useOnboardingProgress';
import { STEP_ICONS, STEP_DESC_KEYS, CHECK_SVG_WHITE } from './portal-constants';
import { PHONE_SVG } from './icons';
import type { StepName } from './progress-store';
import type { PhoneNumberItem } from '../../types';

export interface OverviewScreenProps {
  onGoToStep: (step: string) => void;
  phoneNumbers?: PhoneNumberItem[];
  documentationUrl?: string;
  onScheduleCall?: () => void;
}

const OverviewScreenBase: React.FC<OverviewScreenProps> = ({
  onGoToStep,
  phoneNumbers,
  documentationUrl,
  onScheduleCall,
}) => {
  const { locale, progressStore, activeSteps } = useOnboarding();
  // Subscribe to store changes so derived values re-compute on progress updates.
  useOnboardingProgress();

  const steps = activeSteps.filter((st): st is StepName => st !== 'final_complete');
  const pcts = steps.map((st) => progressStore.getStepProgressPercent(st));
  const aggregatePct = steps.length
    ? Math.round(pcts.reduce((a, b) => a + b, 0) / steps.length)
    : 0;
  const completedCount = steps.filter((st) => progressStore.isStepComplete(st)).length;

  const flowsText = locale.onboardingPortal.overview.flowsComplete
    .replace('{completed}', String(completedCount))
    .replace('{total}', String(steps.length));

  const stepsLocale = locale.accountOnboarding.steps as Record<string, string>;
  const descKeys = STEP_DESC_KEYS as Record<string, string>;
  const overviewLocale = locale.onboardingPortal.overview as Record<string, string>;

  return (
    <div className="overview-container">
      {/* Header */}
      <div className="overview-header">
        <h1>{locale.onboardingPortal.overview.title}</h1>
        <p>{locale.onboardingPortal.overview.subtitle}</p>
      </div>

      {/* Progress card */}
      <div className="overview-progress-card">
        <div className="overview-progress-info">
          <h3>{locale.onboardingPortal.overview.progressTitle}</h3>
          <div
            className="overview-progress-bar-track"
            role="progressbar"
            aria-valuenow={aggregatePct}
            aria-valuemin={0}
            aria-valuemax={100}
          >
            <div className="overview-progress-bar-fill" style={{ width: `${aggregatePct}%` }} />
          </div>
          <p className="overview-progress-subtitle">{flowsText}</p>
        </div>
        <div className="overview-progress-pct">{aggregatePct}%</div>
      </div>

      {/* Step cards */}
      <h2 className="overview-steps-title">{locale.onboardingPortal.overview.stepsTitle}</h2>
      <div className="overview-cards">
        {steps.map((step) => {
          const isComplete = progressStore.isStepComplete(step);
          const stepPct = progressStore.getStepProgressPercent(step);

          const iconClass = isComplete
            ? 'overview-card-icon overview-card-icon--complete'
            : 'overview-card-icon';

          const progressLabel = isComplete
            ? locale.onboardingPortal.overview.complete
            : locale.onboardingPortal.overview.progress;

          let btnClass: string;
          let btnText: string;
          if (isComplete) {
            btnClass = 'overview-card-btn overview-card-btn--review';
            btnText = locale.onboardingPortal.overview.review;
          } else if (stepPct > 0) {
            btnClass = 'overview-card-btn';
            btnText = `${locale.onboardingPortal.overview.continueSetup} →`;
          } else {
            btnClass = 'overview-card-btn';
            btnText = `${locale.onboardingPortal.overview.completeSetup} →`;
          }

          const descKey = descKeys[step] ?? '';
          // descKey is like 'onboardingPortal.overview.accountDesc' — navigate the locale object
          const descParts = descKey.replace('onboardingPortal.overview.', '');
          const desc = descParts ? (overviewLocale[descParts] ?? '') : '';

          return (
            <div key={step} className="overview-card">
              {/* SAFETY: isComplete ? CHECK_SVG_WHITE : STEP_ICONS[step] — both static constants */}
              {/* nosemgrep: javascript.react.dangerouslysetinnerhtml -- trusted server-generated branding content */}
              <div
                className={iconClass}
                dangerouslySetInnerHTML={{
                  __html: isComplete ? CHECK_SVG_WHITE : (STEP_ICONS[step] ?? ''),
                }}
              />
              <h4>{stepsLocale[step] ?? step}</h4>
              <p>{desc}</p>
              <div className="overview-card-progress">
                <span className="overview-card-progress-label">{progressLabel}</span>
                <span className="overview-card-progress-pct">{stepPct}%</span>
                <div
                  className="overview-card-progress-track"
                  role="progressbar"
                  aria-valuenow={stepPct}
                  aria-valuemin={0}
                  aria-valuemax={100}
                >
                  <div className="overview-card-progress-fill" style={{ width: `${stepPct}%` }} />
                </div>
              </div>
              <button className={btnClass} onClick={() => onGoToStep(step)}>
                {btnText}
              </button>
            </div>
          );
        })}
      </div>

      {/* Phone number status */}
      {phoneNumbers && phoneNumbers.length > 0 && (
        <PhoneStatus phoneNumbers={phoneNumbers} locale={locale} />
      )}

      {/* Help card */}
      {(documentationUrl || onScheduleCall) && (
        <div className="overview-help-card">
          <h3>{locale.onboardingPortal.overview.needHelp}</h3>
          <p>{locale.onboardingPortal.overview.needHelpSubtitle}</p>
          <div className="overview-help-buttons">
            {onScheduleCall && (
              <button className="overview-help-btn" onClick={onScheduleCall}>
                {locale.onboardingPortal.overview.scheduleCall}
              </button>
            )}
            {documentationUrl && (
              <a
                className="overview-help-btn"
                href={documentationUrl}
                target="_blank"
                rel="noopener noreferrer"
              >
                {locale.onboardingPortal.overview.viewDocs}
              </a>
            )}
          </div>
        </div>
      )}
    </div>
  );
};
export const OverviewScreen = React.memo(OverviewScreenBase);

interface PhoneStatusProps {
  phoneNumbers: PhoneNumberItem[];
  locale: ReturnType<typeof useOnboarding>['locale'];
}

function PhoneStatus({ phoneNumbers, locale }: PhoneStatusProps) {
  return (
    <div className="overview-phone-status">
      <h3 className="overview-phone-status-title">
        {locale.onboardingPortal.overview.phoneStatusTitle}
      </h3>
      <p className="overview-phone-status-subtitle">
        {locale.onboardingPortal.overview.phoneStatusSubtitle}
      </p>
      <div className="overview-phone-status-header">
        <span>{locale.onboardingPortal.overview.phoneStatusNumber}</span>
        <span>{locale.onboardingPortal.overview.phoneStatusType}</span>
        <span>{locale.onboardingPortal.overview.phoneStatusStatus}</span>
      </div>
      <div className="overview-phone-status-rows">
        {phoneNumbers.map((item, i) => {
          const parsed = parsePhoneNumberFromString(item.phone_number, 'US');
          const displayNumber = parsed?.formatNational() ?? item.phone_number;

          const typeText =
            item.source === 'port_order'
              ? locale.onboardingPortal.overview.phoneStatusTypePort
              : locale.onboardingPortal.overview.phoneStatusTypeNew;

          const isActive = item.status === 'active';
          const badgeModifier = isActive ? 'complete' : 'processing';
          const badgeClass = `overview-phone-status-badge overview-phone-status-badge--${badgeModifier}`;
          const badgeText = isActive
            ? locale.onboardingPortal.overview.phoneStatusComplete
            : locale.onboardingPortal.overview.phoneStatusProcessing;

          return (
            <div key={i} className="overview-phone-status-row">
              <div className="overview-phone-status-phone">
                {/* SAFETY: PHONE_SVG is a static constant from icons.ts */}
                {/* nosemgrep: javascript.react.dangerouslysetinnerhtml -- trusted server-generated branding content */}
                <div
                  className="overview-phone-status-phone-icon"
                  dangerouslySetInnerHTML={{ __html: PHONE_SVG }}
                />
                <span className="overview-phone-status-phone-text">{displayNumber}</span>
                {item.number_class === 'temporary' && (
                  <span className="overview-phone-status-temporary-badge">
                    {locale.onboardingPortal.overview.phoneStatusTemporary}
                  </span>
                )}
              </div>
              <span className="overview-phone-status-type">{typeText}</span>
              <span className={badgeClass}>{badgeText}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
