import { STEP_ICONS, STEP_I18N_KEYS, STEP_DESC_KEYS, CHECK_SVG_WHITE } from './constants';
import { ONBOARDING_STEPS } from '../account-onboarding/constants';
import { PHONE_SVG } from '../account-onboarding/icons';
import { parsePhoneNumberFromString } from 'libphonenumber-js';
import type { OnboardingProgressStore, StepName } from '../account-onboarding/progress-store';
import type { PhoneNumberItem } from '../../types';

function renderOverviewHeader(t: (key: string) => string): string {
  return `<div class="overview-header">
    <h1>${t('onboardingPortal.overview.title')}</h1>
    <p>${t('onboardingPortal.overview.subtitle')}</p>
  </div>`;
}

function renderProgressCard(
  t: (key: string) => string,
  progressStore: OnboardingProgressStore | null,
  steps: readonly StepName[]
): string {
  const stepPercentages = steps.map((s) => progressStore?.getStepProgressPercent(s) ?? 0);
  const aggregatePct = Math.round(stepPercentages.reduce((a, b) => a + b, 0) / steps.length);
  const completedCount = steps.filter((s) => progressStore?.isStepComplete(s) ?? false).length;

  const flowsText = t('onboardingPortal.overview.flowsComplete')
    .replace('{completed}', String(completedCount))
    .replace('{total}', String(steps.length));

  return `<div class="overview-progress-card">
    <div class="overview-progress-info">
      <h3>${t('onboardingPortal.overview.progressTitle')}</h3>
      <div class="overview-progress-bar-track" role="progressbar" aria-valuenow="${aggregatePct}" aria-valuemin="0" aria-valuemax="100">
        <div class="overview-progress-bar-fill" style="width: ${aggregatePct}%"></div>
      </div>
      <p class="overview-progress-subtitle">${flowsText}</p>
    </div>
    <div class="overview-progress-pct">${aggregatePct}%</div>
  </div>`;
}

function renderStepCards(
  t: (key: string) => string,
  progressStore: OnboardingProgressStore | null,
  steps: readonly StepName[]
): string {
  const cards = steps
    .map((step) => {
      const isComplete = progressStore?.isStepComplete(step) ?? false;
      const stepPct = progressStore?.getStepProgressPercent(step as StepName) ?? 0;

      const iconClass = isComplete
        ? 'overview-card-icon overview-card-icon--complete'
        : 'overview-card-icon';
      // SAFETY: CHECK_SVG_WHITE and STEP_ICONS values are static SVG constants
      const iconSvg = isComplete ? CHECK_SVG_WHITE : (STEP_ICONS[step] ?? '');

      const progressLabel = isComplete
        ? t('onboardingPortal.overview.complete')
        : t('onboardingPortal.overview.progress');

      let btnClass: string;
      let btnText: string;
      if (isComplete) {
        btnClass = 'overview-card-btn overview-card-btn--review';
        btnText = t('onboardingPortal.overview.review');
      } else if (stepPct > 0) {
        btnClass = 'overview-card-btn';
        btnText = `${t('onboardingPortal.overview.continueSetup')} \u2192`;
      } else {
        btnClass = 'overview-card-btn';
        btnText = `${t('onboardingPortal.overview.completeSetup')} \u2192`;
      }

      return `<div class="overview-card">
      <div class="${iconClass}">${iconSvg}</div>
      <h4>${t(STEP_I18N_KEYS[step] ?? step)}</h4>
      <p>${t(STEP_DESC_KEYS[step] ?? '')}</p>
      <div class="overview-card-progress">
        <span class="overview-card-progress-label">${progressLabel}</span>
        <span class="overview-card-progress-pct">${stepPct}%</span>
        <div class="overview-card-progress-track" role="progressbar" aria-valuenow="${stepPct}" aria-valuemin="0" aria-valuemax="100">
          <div class="overview-card-progress-fill" style="width: ${stepPct}%"></div>
        </div>
      </div>
      <button class="${btnClass}" data-action="go-to-step" data-step="${step}">${btnText}</button>
    </div>`;
    })
    .join('\n    ');

  return `<h2 class="overview-steps-title">${t('onboardingPortal.overview.stepsTitle')}</h2>
  <div class="overview-cards">
    ${cards}
  </div>`;
}

function renderPhoneStatus(
  t: (key: string) => string,
  escapeHtml: (str: string) => string,
  phoneNumbers?: PhoneNumberItem[]
): string {
  if (!phoneNumbers || phoneNumbers.length === 0) return '';

  const headerKeys = ['phoneStatusNumber', 'phoneStatusType', 'phoneStatusStatus'] as const;
  const headerSpans = headerKeys
    .map((key) => `<span>${t(`onboardingPortal.overview.${key}`)}</span>`)
    .join('');

  const rows = phoneNumbers
    .map((item) => {
      const parsed = parsePhoneNumberFromString(item.phone_number, 'US');
      const displayNumber = escapeHtml(parsed?.formatNational() ?? item.phone_number);

      const typeText =
        item.source === 'port_order'
          ? t('onboardingPortal.overview.phoneStatusTypePort')
          : t('onboardingPortal.overview.phoneStatusTypeNew');

      const isActive = item.status === 'active';
      const badgeModifier = isActive ? 'complete' : 'processing';
      const badgeClass = `overview-phone-status-badge overview-phone-status-badge--${escapeHtml(badgeModifier)}`;
      const badgeText = isActive
        ? t('onboardingPortal.overview.phoneStatusComplete')
        : t('onboardingPortal.overview.phoneStatusProcessing');

      return `<div class="overview-phone-status-row">
        <div class="overview-phone-status-phone">
          <!-- SAFETY: PHONE_SVG is a static constant defined in account-onboarding/icons.ts -->
          <div class="overview-phone-status-phone-icon">${PHONE_SVG}</div>
          <span class="overview-phone-status-phone-text">${displayNumber}</span>
        </div>
        <span class="overview-phone-status-type">${typeText}</span>
        <span class="${badgeClass}">${badgeText}</span>
      </div>`;
    })
    .join('\n      ');

  return `<div class="overview-phone-status">
    <h3 class="overview-phone-status-title">${t('onboardingPortal.overview.phoneStatusTitle')}</h3>
    <p class="overview-phone-status-subtitle">${t('onboardingPortal.overview.phoneStatusSubtitle')}</p>
    <div class="overview-phone-status-header">${headerSpans}</div>
    <div class="overview-phone-status-rows">
      ${rows}
    </div>
  </div>`;
}

function renderHelpCard(t: (key: string) => string): string {
  return `<div class="overview-help-card">
    <h3>${t('onboardingPortal.overview.needHelp')}</h3>
    <p>${t('onboardingPortal.overview.needHelpSubtitle')}</p>
    <div class="overview-help-buttons">
      <button class="overview-help-btn">${t('onboardingPortal.overview.scheduleCall')}</button>
      <button class="overview-help-btn">${t('onboardingPortal.overview.viewDocs')}</button>
    </div>
  </div>`;
}

export function renderOverviewScreen(
  container: HTMLElement,
  t: (key: string) => string,
  progressStore: OnboardingProgressStore | null,
  activeSteps?: StepName[],
  phoneNumbers?: PhoneNumberItem[],
  escapeHtml: (str: string) => string = (s) =>
    s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
): void {
  const steps = activeSteps?.length ? activeSteps : ONBOARDING_STEPS;

  // SAFETY: Static SVG constants (CHECK_SVG_WHITE, STEP_ICONS, PHONE_SVG) are safe to embed.
  // Translation strings from t() are internal i18n, safe for templates.
  // User data (phone numbers, item.source, item.status) is escaped via escapeHtml.
  const html = `<div class="overview-container">
  ${renderOverviewHeader(t)}
  ${renderProgressCard(t, progressStore, steps)}
  ${renderStepCards(t, progressStore, steps)}
  ${renderPhoneStatus(t, escapeHtml, phoneNumbers)}
  ${renderHelpCard(t)}
</div>`;

  container.textContent = '';
  const tmpl = document.createElement('template');
  tmpl.innerHTML = html;
  container.appendChild(tmpl.content);
}
