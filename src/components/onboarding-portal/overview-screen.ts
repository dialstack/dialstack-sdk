import { STEP_ICONS, STEP_I18N_KEYS, STEP_DESC_KEYS, CHECK_SVG_WHITE } from './constants';
import { ONBOARDING_STEPS } from '../account-onboarding/constants';
import type { OnboardingProgressStore, StepName } from '../account-onboarding/progress-store';

export function renderOverviewScreen(
  container: HTMLElement,
  t: (key: string) => string,
  progressStore: OnboardingProgressStore | null,
  activeSteps?: StepName[]
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
    cardLabel.textContent = isComplete ? t('onboardingPortal.overview.complete') : `${stepPct}%`;
    cardProgress.appendChild(cardLabel);

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
    btn.className = 'overview-card-btn';
    btn.setAttribute('data-action', 'go-to-step');
    btn.setAttribute('data-step', step);
    btn.textContent = `${t('onboardingPortal.overview.completeSetup')} \u2192`;
    card.appendChild(btn);

    cardsGrid.appendChild(card);
  }
  wrapper.appendChild(cardsGrid);

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
