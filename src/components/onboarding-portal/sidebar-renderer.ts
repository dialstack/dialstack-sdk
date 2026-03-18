import { STEP_ICONS, STEP_I18N_KEYS, OVERVIEW_SVG, HELP_SVG } from './constants';
import type { AccountOnboardingStep } from '../../types';
import type { OnboardingProgressStore, StepName } from '../account-onboarding/progress-store';

export interface SidebarProps {
  viewMode: 'splash' | 'overview' | 'wizard';
  activeSteps: AccountOnboardingStep[];
  currentStep: AccountOnboardingStep;
  progressStore: OnboardingProgressStore | null;
  logoHtml?: string;
  platformName?: string;
  backLabel?: string;
  t: (key: string) => string;
  renderStepIndicator: (step: AccountOnboardingStep, isCompleted: boolean) => string;
}

export function renderSidebar(container: HTMLElement, props: SidebarProps): void {
  const {
    viewMode,
    activeSteps,
    currentStep,
    progressStore,
    logoHtml,
    platformName,
    backLabel,
    t,
    renderStepIndicator,
  } = props;

  const stepsWithoutComplete = activeSteps.filter((s) => s !== 'final_complete');

  const isOverviewActive = viewMode === 'overview';
  const overviewLabelText = t('onboardingPortal.overview.label');

  // Logo: if logoHtml exists, use it (set by SDK consumer/developer);
  // otherwise show platformName text with inline styles.
  const logoContent = logoHtml
    ? logoHtml
    : `<span style="font-size:20px;font-weight:700">${escapeHtml(platformName ?? 'DialStack')}</span>`;

  const stepItems = stepsWithoutComplete
    .map((step) => {
      const isActive = viewMode === 'wizard' && step === currentStep;
      const isCompleted = progressStore?.isStepComplete(step as StepName) ?? false;

      const classes = ['portal-step-item', isActive ? 'active' : '', isCompleted ? 'completed' : '']
        .filter(Boolean)
        .join(' ');

      const indicator = renderStepIndicator(step, isCompleted);

      return `<div class="${classes}" data-step="${step}" role="button" tabindex="0">
        <span class="portal-step-icon">${STEP_ICONS[step] ?? ''}</span>
        <span class="portal-step-name">${escapeHtml(t(STEP_I18N_KEYS[step] ?? step))}</span>
        <span class="portal-step-indicator">${indicator}</span>
      </div>`;
    })
    .join('');

  // All innerHTML content is either:
  // - Static SVG constants from constants.ts (OVERVIEW_SVG, HELP_SVG, STEP_ICONS)
  // - Static SVG from renderStepIndicator (progress rings / check marks)
  // - Text escaped via escapeHtml()
  // - logoHtml which is set by SDK consumer (developer), not end-user input
  const html = `
    <div class="portal-logo">${logoContent}</div>
    <div class="portal-nav-link${isOverviewActive ? ' active' : ''}" data-action="overview" role="button" tabindex="0">
      <span class="portal-nav-icon">${OVERVIEW_SVG}</span>
      <span>${escapeHtml(overviewLabelText)}</span>
    </div>
    <div class="portal-steps-label">${escapeHtml(t('onboardingPortal.onboardingFlows'))}</div>
    ${stepItems}
    <div class="portal-sidebar-footer">
      <div class="portal-footer-link" data-action="back" role="button" tabindex="0">
        <span class="portal-nav-icon">\u2190</span>
        <span>${escapeHtml(backLabel ?? t('onboardingPortal.back'))}</span>
      </div>
      <div class="portal-footer-link" role="button" tabindex="0">
        <span class="portal-nav-icon">${HELP_SVG}</span>
        <span>${escapeHtml(t('onboardingPortal.helpSupport'))}</span>
      </div>
    </div>`;

  const template = document.createElement('template');
  template.innerHTML = html; // SAFETY: see comment above — all dynamic text is escaped
  container.textContent = '';
  container.appendChild(template.content);
}

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}
