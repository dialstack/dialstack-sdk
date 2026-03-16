import { STEP_ICONS, STEP_I18N_KEYS, STEP_DESC_KEYS, CHECK_SVG_WHITE } from './constants';
import { ONBOARDING_STEPS } from '../account-onboarding/constants';
import { PHONE_SVG } from '../account-onboarding/icons';
import { parsePhoneNumberFromString } from 'libphonenumber-js';
import type { OnboardingProgressStore, StepName } from '../account-onboarding/progress-store';
import type { PhoneNumberItem } from '../../types';

export function renderOverviewScreen(
  container: HTMLElement,
  t: (key: string) => string,
  progressStore: OnboardingProgressStore | null,
  activeSteps?: StepName[],
  phoneNumbers?: PhoneNumberItem[]
): void {
  const steps = activeSteps?.length ? activeSteps : ONBOARDING_STEPS;
  container.textContent = '';

  const wrapper = document.createElement('div');
  wrapper.className = 'overview-container';

  // Header
  const header = document.createElement('div');
  header.className = 'overview-header';
  const h1 = document.createElement('h1');
  h1.textContent = t('onboardingPortal.overview.title');
  header.appendChild(h1);
  const subtitle = document.createElement('p');
  subtitle.textContent = t('onboardingPortal.overview.subtitle');
  header.appendChild(subtitle);
  wrapper.appendChild(header);

  // Progress card
  const stepPercentages = steps.map((s) => progressStore?.getStepProgressPercent(s) ?? 0);
  const aggregatePct = Math.round(stepPercentages.reduce((a, b) => a + b, 0) / steps.length);
  const completedCount = steps.filter((s) => progressStore?.isStepComplete(s) ?? false).length;

  const progressCard = document.createElement('div');
  progressCard.className = 'overview-progress-card';

  const progressInfo = document.createElement('div');
  progressInfo.className = 'overview-progress-info';
  const progressTitle = document.createElement('h3');
  progressTitle.textContent = t('onboardingPortal.overview.progressTitle');
  progressInfo.appendChild(progressTitle);

  const track = document.createElement('div');
  track.className = 'overview-progress-bar-track';
  track.setAttribute('role', 'progressbar');
  track.setAttribute('aria-valuenow', String(aggregatePct));
  track.setAttribute('aria-valuemin', '0');
  track.setAttribute('aria-valuemax', '100');
  const fill = document.createElement('div');
  fill.className = 'overview-progress-bar-fill';
  fill.style.width = `${aggregatePct}%`;
  track.appendChild(fill);
  progressInfo.appendChild(track);

  const flowsText = document.createElement('p');
  flowsText.className = 'overview-progress-subtitle';
  flowsText.textContent = t('onboardingPortal.overview.flowsComplete')
    .replace('{completed}', String(completedCount))
    .replace('{total}', String(steps.length));
  progressInfo.appendChild(flowsText);
  progressCard.appendChild(progressInfo);

  const pctEl = document.createElement('div');
  pctEl.className = 'overview-progress-pct';
  pctEl.textContent = `${aggregatePct}%`;
  progressCard.appendChild(pctEl);
  wrapper.appendChild(progressCard);

  // Steps title
  const stepsTitle = document.createElement('h2');
  stepsTitle.className = 'overview-steps-title';
  stepsTitle.textContent = t('onboardingPortal.overview.stepsTitle');
  wrapper.appendChild(stepsTitle);

  // Step cards
  const cardsGrid = document.createElement('div');
  cardsGrid.className = 'overview-cards';

  for (const step of steps) {
    const isComplete = progressStore?.isStepComplete(step) ?? false;
    const card = document.createElement('div');
    card.className = 'overview-card';

    // Icon — replaced by green checkmark when complete
    const iconWrap = document.createElement('div');
    if (isComplete) {
      iconWrap.className = 'overview-card-icon overview-card-icon--complete';
      // SAFETY: CHECK_SVG_WHITE is a static constant from constants.ts
      iconWrap.innerHTML = CHECK_SVG_WHITE;
    } else {
      iconWrap.className = 'overview-card-icon';
      // SAFETY: STEP_ICONS values are static SVG constants from account-onboarding/icons.ts
      iconWrap.innerHTML = STEP_ICONS[step] ?? '';
    }
    card.appendChild(iconWrap);

    // Title
    const cardTitle = document.createElement('h4');
    cardTitle.textContent = t(STEP_I18N_KEYS[step] ?? step);
    card.appendChild(cardTitle);

    // Description
    const cardDesc = document.createElement('p');
    cardDesc.textContent = t(STEP_DESC_KEYS[step] ?? '');
    card.appendChild(cardDesc);

    // Per-step progress
    const cardProgress = document.createElement('div');
    cardProgress.className = 'overview-card-progress';
    const stepPct = progressStore?.getStepProgressPercent(step as StepName) ?? 0;

    const cardLabel = document.createElement('span');
    cardLabel.className = 'overview-card-progress-label';
    cardLabel.textContent = isComplete
      ? t('onboardingPortal.overview.complete')
      : t('onboardingPortal.overview.progress');
    cardProgress.appendChild(cardLabel);

    const cardPct = document.createElement('span');
    cardPct.className = 'overview-card-progress-pct';
    cardPct.textContent = `${stepPct}%`;
    cardProgress.appendChild(cardPct);

    const cardTrack = document.createElement('div');
    cardTrack.className = 'overview-card-progress-track';
    cardTrack.setAttribute('role', 'progressbar');
    cardTrack.setAttribute('aria-valuenow', String(stepPct));
    cardTrack.setAttribute('aria-valuemin', '0');
    cardTrack.setAttribute('aria-valuemax', '100');
    const cardFill = document.createElement('div');
    cardFill.className = 'overview-card-progress-fill';
    cardFill.style.width = `${stepPct}%`;
    cardTrack.appendChild(cardFill);
    cardProgress.appendChild(cardTrack);

    card.appendChild(cardProgress);

    // Button
    const btn = document.createElement('button');
    btn.setAttribute('data-action', 'go-to-step');
    btn.setAttribute('data-step', step);
    if (isComplete) {
      btn.className = 'overview-card-btn overview-card-btn--review';
      btn.textContent = t('onboardingPortal.overview.review');
    } else {
      btn.className = 'overview-card-btn';
      btn.textContent =
        stepPct > 0
          ? `${t('onboardingPortal.overview.continueSetup')} \u2192`
          : `${t('onboardingPortal.overview.completeSetup')} \u2192`;
    }
    card.appendChild(btn);

    cardsGrid.appendChild(card);
  }
  wrapper.appendChild(cardsGrid);

  // Phone number status card
  if (phoneNumbers && phoneNumbers.length > 0) {
    const phoneCard = document.createElement('div');
    phoneCard.className = 'overview-phone-status';

    const phoneTitle = document.createElement('h3');
    phoneTitle.className = 'overview-phone-status-title';
    phoneTitle.textContent = t('onboardingPortal.overview.phoneStatusTitle');
    phoneCard.appendChild(phoneTitle);

    const phoneSub = document.createElement('p');
    phoneSub.className = 'overview-phone-status-subtitle';
    phoneSub.textContent = t('onboardingPortal.overview.phoneStatusSubtitle');
    phoneCard.appendChild(phoneSub);

    // Column headers
    const colHeader = document.createElement('div');
    colHeader.className = 'overview-phone-status-header';
    for (const key of ['phoneStatusNumber', 'phoneStatusType', 'phoneStatusStatus'] as const) {
      const span = document.createElement('span');
      span.textContent = t(`onboardingPortal.overview.${key}`);
      colHeader.appendChild(span);
    }
    phoneCard.appendChild(colHeader);

    // Rows
    const rows = document.createElement('div');
    rows.className = 'overview-phone-status-rows';

    for (const item of phoneNumbers) {
      const row = document.createElement('div');
      row.className = 'overview-phone-status-row';

      // Phone number cell
      const phoneCell = document.createElement('div');
      phoneCell.className = 'overview-phone-status-phone';

      const iconCircle = document.createElement('div');
      iconCircle.className = 'overview-phone-status-phone-icon';
      // SAFETY: PHONE_SVG is a static constant defined in account-onboarding/icons.ts
      iconCircle.innerHTML = PHONE_SVG;
      phoneCell.appendChild(iconCircle);

      const phoneText = document.createElement('span');
      phoneText.className = 'overview-phone-status-phone-text';
      const parsed = parsePhoneNumberFromString(item.phone_number, 'US');
      phoneText.textContent = parsed?.formatNational() ?? item.phone_number;
      phoneCell.appendChild(phoneText);
      row.appendChild(phoneCell);

      // Type cell
      const typeCell = document.createElement('span');
      typeCell.className = 'overview-phone-status-type';
      typeCell.textContent =
        item.source === 'port_order'
          ? t('onboardingPortal.overview.phoneStatusTypePort')
          : t('onboardingPortal.overview.phoneStatusTypeNew');
      row.appendChild(typeCell);

      // Status badge
      const isComplete = item.status === 'active';
      const badge = document.createElement('span');
      badge.className = `overview-phone-status-badge overview-phone-status-badge--${isComplete ? 'complete' : 'processing'}`;
      badge.textContent = isComplete
        ? t('onboardingPortal.overview.phoneStatusComplete')
        : t('onboardingPortal.overview.phoneStatusProcessing');
      row.appendChild(badge);

      rows.appendChild(row);
    }

    phoneCard.appendChild(rows);
    wrapper.appendChild(phoneCard);
  }

  // Help card
  const helpCard = document.createElement('div');
  helpCard.className = 'overview-help-card';
  const helpTitle = document.createElement('h3');
  helpTitle.textContent = t('onboardingPortal.overview.needHelp');
  helpCard.appendChild(helpTitle);
  const helpSub = document.createElement('p');
  helpSub.textContent = t('onboardingPortal.overview.needHelpSubtitle');
  helpCard.appendChild(helpSub);

  const helpButtons = document.createElement('div');
  helpButtons.className = 'overview-help-buttons';
  const scheduleBtn = document.createElement('button');
  scheduleBtn.className = 'overview-help-btn';
  scheduleBtn.textContent = t('onboardingPortal.overview.scheduleCall');
  helpButtons.appendChild(scheduleBtn);
  const docsBtn = document.createElement('button');
  docsBtn.className = 'overview-help-btn';
  docsBtn.textContent = t('onboardingPortal.overview.viewDocs');
  helpButtons.appendChild(docsBtn);
  helpCard.appendChild(helpButtons);
  wrapper.appendChild(helpCard);

  container.appendChild(wrapper);
}
