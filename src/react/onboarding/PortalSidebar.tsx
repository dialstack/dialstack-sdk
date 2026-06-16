/**
 * Portal sidebar — dark left nav with progress rings and step navigation.
 *
 * Static icons are rendered as React components (./portal-icons). The only
 * HTML-injection site is ConsumerLogo below, which mounts logoHtml supplied by
 * the SDK consumer (the integrating developer) — never end-user input.
 */

import React, { useEffect, useMemo, useRef } from 'react';
import { useOnboarding } from './OnboardingContext';
import { useOnboardingProgress } from './useOnboardingProgress';
import { CIRCUMFERENCE } from './portal-constants';
import { CheckIconWhite, HelpIcon, OverviewIcon, STEP_ICON_COMPONENTS } from './portal-icons';
import type { StepName } from './progress-store';
import type { StepEntryMode } from './OnboardingContext';

// Mounts SDK-consumer-supplied logo markup. logoHtml comes from the integrating
// developer (e.g. admin's buildLogoHtml — platform name is HTML-escaped, logo
// URL is URI-encoded), never from an end user. Uses Range.createContextualFragment
// rather than innerHTML so script tags are inert per the HTML spec.
const ConsumerLogo: React.FC<{ html: string }> = ({ html }) => {
  const ref = useRef<HTMLSpanElement | null>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const frag = document.createRange().createContextualFragment(html);
    el.replaceChildren(frag);
  }, [html]);
  return <span ref={ref} />;
};

export interface PortalSidebarProps {
  viewMode: 'splash' | 'overview' | 'wizard';
  onSelectStep: (step: string, mode?: StepEntryMode) => void;
  onOverview: () => void;
  onBack?: () => void;
  backLabel?: string;
  logoHtml?: string;
  platformName?: string;
  onHelpSupport?: () => void;
}

const PortalSidebarBase: React.FC<PortalSidebarProps> = ({
  viewMode,
  onSelectStep,
  onOverview,
  onBack,
  backLabel,
  logoHtml,
  platformName,
  onHelpSupport,
}) => {
  const { locale, progressStore, activeSteps } = useOnboarding();
  const { currentStep } = useOnboardingProgress();

  const stepsWithoutComplete = useMemo(
    () => activeSteps.filter((s) => s !== 'final_complete'),
    [activeSteps]
  );
  const isOverviewActive = viewMode === 'overview';

  return (
    <aside className="portal-sidebar">
      {/* Logo — logoHtml is set by SDK consumer (developer), not end-user */}
      <div className="portal-logo">
        {logoHtml ? (
          <ConsumerLogo html={logoHtml} />
        ) : (
          <span style={{ fontSize: 20, fontWeight: 700 }}>{platformName ?? 'DialStack'}</span>
        )}
      </div>

      {/* Overview nav link */}
      <div
        className={`portal-nav-link${isOverviewActive ? ' active' : ''}`}
        role="button"
        tabIndex={0}
        onClick={onOverview}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') onOverview();
        }}
      >
        <span className="portal-nav-icon">
          <OverviewIcon />
        </span>
        <span>{locale.onboardingPortal.overview.label}</span>
      </div>

      {/* Steps label */}
      <div className="portal-steps-label">{locale.onboardingPortal.onboardingFlows}</div>

      {/* Step items */}
      {stepsWithoutComplete.map((step) => {
        const isActive = viewMode === 'wizard' && step === currentStep;
        const isComplete = progressStore.isStepComplete(step as StepName);
        const itemClass = [
          'portal-step-item',
          isActive ? 'active' : '',
          isComplete ? 'completed' : '',
        ]
          .filter(Boolean)
          .join(' ');

        const stepsLocale = locale.accountOnboarding.steps as Record<string, string>;
        const stepLabel = stepsLocale[step] ?? step;
        const entryMode: StepEntryMode = isComplete ? 'review' : 'continue';

        return (
          <div
            key={step}
            className={itemClass}
            role="button"
            tabIndex={0}
            onClick={() => onSelectStep(step, entryMode)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === ' ') onSelectStep(step, entryMode);
            }}
          >
            <span className="portal-step-icon">
              {(() => {
                const Icon = STEP_ICON_COMPONENTS[step];
                return Icon ? <Icon /> : null;
              })()}
            </span>
            <span className="portal-step-name">{stepLabel}</span>
            <span className="portal-step-indicator">
              {isComplete ? (
                <div className="check-circle">
                  <CheckIconWhite />
                </div>
              ) : (
                <ProgressRing pct={progressStore.getStepProgressPercent(step as StepName)} />
              )}
            </span>
          </div>
        );
      })}

      {/* Footer */}
      <div className="portal-sidebar-footer">
        {onBack && (
          <div
            className="portal-footer-link"
            role="button"
            tabIndex={0}
            onClick={onBack}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === ' ') onBack();
            }}
          >
            <span className="portal-nav-icon">←</span>
            <span>{backLabel ?? locale.onboardingPortal.back}</span>
          </div>
        )}
        {onHelpSupport && (
          <div
            className="portal-footer-link"
            role="button"
            tabIndex={0}
            onClick={onHelpSupport}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === ' ') onHelpSupport();
            }}
          >
            <span className="portal-nav-icon">
              <HelpIcon />
            </span>
            <span>{locale.onboardingPortal.helpSupport}</span>
          </div>
        )}
      </div>
    </aside>
  );
};
export const PortalSidebar = React.memo(PortalSidebarBase);

function ProgressRing({ pct }: { pct: number }) {
  const offset = CIRCUMFERENCE * (1 - pct / 100);
  return (
    <svg viewBox="0 0 36 36" className="progress-ring">
      <circle cx="18" cy="18" r="16" fill="none" stroke="rgba(255,255,255,0.2)" strokeWidth="3" />
      <circle
        cx="18"
        cy="18"
        r="16"
        fill="none"
        stroke="#fff"
        strokeWidth="3"
        strokeDasharray={CIRCUMFERENCE}
        strokeDashoffset={offset}
        strokeLinecap="round"
        transform="rotate(-90 18 18)"
      />
      <text
        x="18"
        y="18"
        textAnchor="middle"
        dominantBaseline="central"
        fill="#fff"
        fontSize="9"
        fontWeight="bold"
      >
        {pct}%
      </text>
    </svg>
  );
}
