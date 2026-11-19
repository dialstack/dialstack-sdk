import { BUILDING_SVG, USER_SVG, PHONE_SVG, HEADSET_SVG } from './icons';
import { defaultLocale, type Locale } from '@dialstack/sdk-js';
import type { StepName } from './constants';

export const STEP_ICONS: Record<StepName, string> = {
  account: BUILDING_SVG,
  users: USER_SVG,
  numbers: PHONE_SVG,
  hardware: HEADSET_SVG,
};

export const STEP_I18N_KEYS: Record<string, string> = {
  account: 'accountOnboarding.steps.account',
  users: 'accountOnboarding.steps.users',
  numbers: 'accountOnboarding.steps.numbers',
  hardware: 'accountOnboarding.steps.hardware',
};

export const STEP_DESC_KEYS: Record<string, string> = {
  account: 'onboardingPortal.overview.accountDesc',
  users: 'onboardingPortal.overview.usersDesc',
  numbers: 'onboardingPortal.overview.numbersDesc',
  hardware: 'onboardingPortal.overview.hardwareDesc',
};

// Figma: asymmetric dashboard grid (layout-dashboard)
export const OVERVIEW_SVG = `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect width="7" height="9" x="3" y="3" rx="1"/><rect width="7" height="5" x="14" y="3" rx="1"/><rect width="7" height="9" x="14" y="12" rx="1"/><rect width="7" height="5" x="3" y="16" rx="1"/></svg>`;
// Lucide: circle-help
export const HELP_SVG = `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3"/><path d="M12 17h.01"/></svg>`;
// Lucide: check
export const CHECK_SVG_WHITE = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><path d="M20 6 9 17l-5-5"/></svg>`;
// Arrow right (splash button)
export const ARROW_RIGHT_SVG = `<svg viewBox="0 0 33 33" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M6.875 16.5H26.125" stroke="white" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/><path d="M16.5 6.875L26.125 16.5L16.5 26.125" stroke="white" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></svg>`;

export const CIRCUMFERENCE = 2 * Math.PI * 16; // ~100.53

// Keys added after a release are optional in Locale, so a custom locale
// written earlier may lack them: fall back to English, never to the raw id.
export function stepLabel(locale: Locale, step: string): string {
  const label = (steps: Locale['accountOnboarding']['steps']) =>
    (steps as Record<string, string | undefined>)[step];
  return (
    label(locale.accountOnboarding.steps) ?? label(defaultLocale.accountOnboarding.steps) ?? step
  );
}

export function stepDescription(locale: Locale, step: string): string {
  const key = STEP_DESC_KEYS[step as StepName]?.replace('onboardingPortal.overview.', '');
  if (!key) return '';
  const desc = (overview: Locale['onboardingPortal']['overview']) =>
    (overview as Record<string, string | undefined>)[key];
  return (
    desc(locale.onboardingPortal.overview) ?? desc(defaultLocale.onboardingPortal.overview) ?? ''
  );
}
