/**
 * Portal sidebar — dark left nav with progress rings and step navigation.
 *
 * SAFETY NOTE: dangerouslySetInnerHTML is used only for:
 * - Static SVG string constants from our own constants.ts / icons.ts (STEP_ICONS,
 *   OVERVIEW_SVG, HELP_SVG, CHECK_SVG_WHITE) — never user input.
 * - logoHtml set by the SDK consumer (developer), not end-user input.
 * This mirrors the same pattern in the vanilla JS sidebar-renderer.ts.
 */

import React, { useMemo } from 'react';
import { useOnboarding } from './OnboardingContext';
import { useOnboardingProgress } from './useOnboardingProgress';
import {
  STEP_ICONS,
  OVERVIEW_SVG,
  HELP_SVG,
  CHECK_SVG_WHITE,
  CIRCUMFERENCE,
} from './portal-constants';
import type { StepName } from './progress-store';

export interface PortalSidebarProps {
  viewMode: 'splash' | 'overview' | 'wizard';
  onSelectStep: (step: string) => void;
  onOverview: () => void;
  onBack?: () => void;
  backLabel?: string;
  logoHtml?: string;
  platformName?: string;
}

const PortalSidebarBase: React.FC<PortalSidebarProps> = ({
  viewMode,
  onSelectStep,
  onOverview,
  onBack,
  backLabel,
  logoHtml,
  platformName,
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
          // SAFETY: logoHtml is set by the SDK consumer (developer), not end-user input
          <span dangerouslySetInnerHTML={{ __html: logoHtml }} />
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
        {/* SAFETY: OVERVIEW_SVG is a static constant from constants.ts */}
        <span className="portal-nav-icon" dangerouslySetInnerHTML={{ __html: OVERVIEW_SVG }} />
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

        return (
          <div
            key={step}
            className={itemClass}
            role="button"
            tabIndex={0}
            onClick={() => onSelectStep(step)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === ' ') onSelectStep(step);
            }}
          >
            {/* SAFETY: STEP_ICONS values are static SVG constants from icons.ts */}
            <span
              className="portal-step-icon"
              dangerouslySetInnerHTML={{ __html: STEP_ICONS[step] ?? '' }}
            />
            <span className="portal-step-name">{stepLabel}</span>
            <span className="portal-step-indicator">
              {isComplete ? (
                // SAFETY: CHECK_SVG_WHITE is a static constant from constants.ts
                <div
                  className="check-circle"
                  dangerouslySetInnerHTML={{ __html: CHECK_SVG_WHITE }}
                />
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
        <div className="portal-footer-link">
          {/* SAFETY: HELP_SVG is a static constant from constants.ts */}
          <span className="portal-nav-icon" dangerouslySetInnerHTML={{ __html: HELP_SVG }} />
          <span>{locale.onboardingPortal.helpSupport}</span>
        </div>
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
