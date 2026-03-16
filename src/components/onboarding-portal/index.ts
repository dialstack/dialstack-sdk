/**
 * Onboarding Portal Web Component
 *
 * Full-page SPA layout with a persistent dark sidebar for high-level step
 * navigation. Wraps the existing AccountOnboardingComponent wizard and
 * intercepts its callbacks to keep the sidebar progress indicators in sync.
 */

import { BaseComponent } from '../base-component';
import type {
  AccountOnboardingStep,
  OnboardingPortalClasses,
  OnboardingCollectionOptions,
  AppearanceOptions,
  FormattingOptions,
  ComponentIcons,
  LayoutVariant,
} from '../../types';
import PORTAL_STYLES from './styles.css';
import SPLASH_STYLES from './splash-styles.css';
import OVERVIEW_STYLES from './overview-styles.css';
import { ONBOARDING_STEPS } from '../account-onboarding/constants';
import { mergePhoneNumbers } from '../account-onboarding/numbers';
import type { DIDItem, NumberOrder, PortOrder, PhoneNumberItem } from '../../types';
import {
  STEP_ICONS,
  STEP_I18N_KEYS,
  OVERVIEW_SVG,
  HELP_SVG,
  CHECK_SVG_WHITE,
  CIRCUMFERENCE,
} from './constants';
import { renderSplashScreen } from './splash-screen';
import { renderOverviewScreen } from './overview-screen';
import type { AccountOnboardingComponent } from '../account-onboarding';
import type { Locale } from '../../locales';
import type { OnboardingProgressStore, StepName } from '../account-onboarding/progress-store';

// Ensure the inner wizard component is registered
import '../account-onboarding';

export class OnboardingPortalComponent extends BaseComponent {
  protected override classes: OnboardingPortalClasses = {};
  private viewMode: 'splash' | 'overview' | 'wizard' = 'splash';
  private currentStep: AccountOnboardingStep = 'account';
  private activeSteps: AccountOnboardingStep[] = [];
  private _progressStore: OnboardingProgressStore | null = null;
  private _storeUnsubscribe: (() => void) | null = null;
  private _phoneNumbers: PhoneNumberItem[] = [];

  // Inner wizard element
  private innerWizard: AccountOnboardingComponent | null = null;

  // Persistent DOM
  private styleEl: HTMLStyleElement | null = null;
  private sidebarEl: HTMLElement | null = null;
  private mainEl: HTMLDivElement | null = null;
  private wizardHeaderEl: HTMLDivElement | null = null;
  private overviewEl: HTMLDivElement | null = null;

  // Callbacks
  private _onStepChange?: (event: { step: AccountOnboardingStep }) => void;
  private _onBack?: () => void;
  private _backLabel: string | undefined;

  // Configurable content
  private _logoHtml: string | undefined;
  private _platformName: string | undefined;
  private _isReviewNav = false;

  // Props to forward
  private _collectionOptions: OnboardingCollectionOptions | null = null;
  private _fullTermsOfServiceUrl: string | null = null;
  private _recipientTermsOfServiceUrl: string | null = null;
  private _privacyPolicyUrl: string | null = null;

  // ============================================================================
  // Lifecycle
  // ============================================================================

  protected initialize(): void {
    if (this.isInitialized) return;
    if (!this.shadowRoot) return;

    // Build persistent DOM
    this.styleEl = document.createElement('style');
    this.shadowRoot.appendChild(this.styleEl);

    const layout = document.createElement('div');
    layout.className = 'portal-layout';

    this.sidebarEl = document.createElement('aside');
    this.sidebarEl.className = 'portal-sidebar';
    layout.appendChild(this.sidebarEl);

    // Overview container — sibling of mainEl so it can take full width/height
    this.overviewEl = document.createElement('div');
    this.overviewEl.className = 'portal-overview';
    layout.appendChild(this.overviewEl);

    this.mainEl = document.createElement('div');
    this.mainEl.className = 'portal-main';
    layout.appendChild(this.mainEl);

    // "Save & Exit to Dashboard" header (shown in wizard mode)
    this.wizardHeaderEl = document.createElement('div');
    this.wizardHeaderEl.className = 'portal-wizard-header';
    this.wizardHeaderEl.setAttribute('role', 'button');
    this.wizardHeaderEl.setAttribute('tabindex', '0');
    this.wizardHeaderEl.textContent = `\u2190 ${this.t('onboardingPortal.saveAndExit')}`;
    this.wizardHeaderEl.addEventListener('click', () => {
      this.viewMode = 'overview';
      this.renderMainArea();
      this.renderSidebar();
    });
    this.mainEl.appendChild(this.wizardHeaderEl);

    this.shadowRoot.appendChild(layout);

    // Create inner wizard
    this.innerWizard = document.createElement(
      'dialstack-account-onboarding'
    ) as AccountOnboardingComponent;
    this.mainEl.appendChild(this.innerWizard);

    // Forward instance and configuration
    if (this.instance) this.innerWizard.setInstance(this.instance);
    this.innerWizard.setLocale(this.locale);
    this.innerWizard.setFormatting(this.formatting);
    this.innerWizard.setIcons(this.icons);
    this.innerWizard.setLayoutVariant(this.layoutVariant);
    if (this.appearance) {
      this.innerWizard.dispatchEvent(
        new CustomEvent('dialstack-appearance-update', {
          detail: { appearance: this.appearance },
        })
      );
    }

    // Forward white-labeling
    if (this._platformName) this.innerWizard.setPlatformName(this._platformName);

    // Forward stored props
    if (this._collectionOptions !== null) {
      this.innerWizard.setCollectionOptions(this._collectionOptions);
    }
    if (this._fullTermsOfServiceUrl !== null) {
      this.innerWizard.setFullTermsOfServiceUrl(this._fullTermsOfServiceUrl);
    }
    if (this._recipientTermsOfServiceUrl !== null) {
      this.innerWizard.setRecipientTermsOfServiceUrl(this._recipientTermsOfServiceUrl);
    }
    if (this._privacyPolicyUrl !== null) {
      this.innerWizard.setPrivacyPolicyUrl(this._privacyPolicyUrl);
    }

    // Wire callbacks — "Finish" on the wahoo screen goes to overview, not exit
    this.innerWizard.setOnExit(() => {
      this.viewMode = 'overview';
      this.renderMainArea();
      this.renderSidebar();
    });
    this.innerWizard.setOnStepChange((event) => {
      this.acquireProgressStore();
      // If the wizard tries to go to 'complete' but not all steps are done,
      // redirect to the first incomplete step instead.
      if (event.step === 'final_complete' && this._progressStore) {
        const stepsWithoutComplete = this.activeSteps.filter(
          (s): s is Exclude<AccountOnboardingStep, 'final_complete'> => s !== 'final_complete'
        );
        const firstIncomplete = stepsWithoutComplete.find(
          (s) => !this._progressStore!.isStepComplete(s as StepName)
        );
        if (firstIncomplete) {
          this.innerWizard!.navigateToStep(firstIncomplete);
          return;
        }
      }

      // If navigating to a non-complete step but all steps are done,
      // redirect to final_complete (e.g. clicking "Done" on the last step's success screen).
      // Skip when the portal explicitly navigated to review a completed step.
      if (event.step !== 'final_complete' && this._progressStore && !this._isReviewNav) {
        const allDone = this.activeSteps
          .filter((s) => s !== 'final_complete')
          .every((s) => this._progressStore!.isStepComplete(s as StepName));
        if (allDone) {
          this.innerWizard!.navigateToStep('final_complete');
          return;
        }
      }
      this._isReviewNav = false;

      this.currentStep = event.step;
      this._onStepChange?.(event);
      this.renderSidebar();
      if (this.viewMode === 'overview') this.renderMainArea();
    });

    this.innerWizard.setOnSubStepProgress(() => {
      this.acquireProgressStore();
      this.renderSidebar();
      if (this.viewMode === 'overview') this.renderMainArea();
    });

    // Keyboard accessibility: Enter/Space activates role="button" elements
    const activateOnKeydown = (e: KeyboardEvent) => {
      if (e.key === 'Enter' || e.key === ' ') {
        const target = e.target as HTMLElement;
        if (target.getAttribute('role') === 'button') {
          e.preventDefault();
          target.click();
        }
      }
    };

    // Attach sidebar click handler
    this.sidebarEl.addEventListener('keydown', activateOnKeydown);
    this.sidebarEl.addEventListener('click', (e) => {
      const target = e.target as HTMLElement;
      const stepEl = target.closest<HTMLElement>('[data-step]');
      if (stepEl) {
        const step = stepEl.dataset.step as AccountOnboardingStep;
        this.viewMode = 'wizard';
        if (stepEl.classList.contains('completed')) this._isReviewNav = true;
        this.innerWizard?.navigateToStep(step);
        this.renderMainArea();
        this.renderSidebar();
        return;
      }
      const actionEl = target.closest<HTMLElement>('[data-action]');
      if (actionEl?.dataset.action === 'overview') {
        this.viewMode = 'overview';
        this.renderMainArea();
        this.renderSidebar();
      } else if (actionEl?.dataset.action === 'back') {
        this._onBack?.();
      }
    });

    // Attach overview click handler (delegated)
    this.overviewEl.addEventListener('keydown', activateOnKeydown);
    this.overviewEl.addEventListener('click', (e) => {
      const actionEl = (e.target as HTMLElement).closest<HTMLElement>('[data-action]');
      if (!actionEl) return;
      const action = actionEl.dataset.action;
      if (action === 'go-to-step') {
        const step = actionEl.dataset.step as AccountOnboardingStep;
        this.viewMode = 'wizard';
        this._isReviewNav = true;
        this.innerWizard?.navigateToStep(step);
        this.renderMainArea();
        this.renderSidebar();
      } else if (action === 'start-onboarding') {
        this.viewMode = 'wizard';
        const firstStep = this.activeSteps.find((s) => s !== 'final_complete') ?? 'account';
        this.innerWizard?.navigateToStep(firstStep);
        this.renderMainArea();
        this.renderSidebar();
      }
    });

    this.isInitialized = true;
    this.render();
  }

  protected override cleanup(): void {
    this._storeUnsubscribe?.();
    this._storeUnsubscribe = null;
    this._progressStore = null;
    if (this.innerWizard) {
      this.innerWizard.remove();
      this.innerWizard = null;
    }
  }

  // ============================================================================
  // Store Acquisition
  // ============================================================================

  /**
   * Lazily acquire the progress store from the wizard (created after data loads).
   * Called from both onStepChange and onSubStepProgress callbacks to ensure the
   * portal picks up the store on the first event, whichever fires first.
   *
   * After acquiring, if still on the splash screen and any progress exists,
   * auto-transition to the overview (splash is a one-time gate).
   */
  private acquireProgressStore(): void {
    if (this._progressStore || !this.innerWizard) return;
    const store = this.innerWizard.getProgressStore();
    if (!store) return;
    this._progressStore = store;
    this._storeUnsubscribe = store.subscribe(() => {
      this.renderSidebar();
      if (this.viewMode === 'overview') this.renderMainArea();
    });
    this.activeSteps = this.innerWizard.getActiveSteps();

    // Auto-transition past splash if any progress exists
    if (this.viewMode === 'splash') {
      const hasProgress = ONBOARDING_STEPS.some(
        (s) => store.getStepProgressPercent(s) > 0 || store.isStepComplete(s)
      );
      if (hasProgress) {
        this.viewMode = 'overview';
        this.renderMainArea();
        this.renderSidebar();
      }
    }

    // Fetch phone numbers for the overview status card
    this.fetchPhoneNumbers();
  }

  private async fetchPhoneNumbers(): Promise<void> {
    if (!this.instance) return;
    // Only fetch if the numbers step is active
    if (!this.activeSteps.includes('numbers')) return;

    try {
      const [dids, orders, ports] = await Promise.all([
        this.instance.fetchAllPages<DIDItem>((opts) => this.instance!.listPhoneNumbers(opts)),
        this.instance.fetchAllPages<NumberOrder>((opts) => this.instance!.listNumberOrders(opts)),
        this.instance.fetchAllPages<PortOrder>((opts) => this.instance!.listPortOrders(opts)),
      ]);
      this._phoneNumbers = mergePhoneNumbers(dids, orders, ports);
      if (this.viewMode === 'overview') this.renderMainArea();
    } catch {
      // Non-critical — overview still works without phone numbers
    }
  }

  // ============================================================================
  // Public Setters
  // ============================================================================

  override setClasses(classes: OnboardingPortalClasses): void {
    this.classes = { ...this.classes, ...classes };
    if (this.isInitialized) this.render();
  }

  setOnStepChange(cb: (event: { step: AccountOnboardingStep }) => void): void {
    this._onStepChange = cb;
  }

  setOnBack(cb: (() => void) | undefined): void {
    this._onBack = cb;
  }

  setBackLabel(label: string | undefined): void {
    this._backLabel = label;
    if (this.isInitialized) this.renderSidebar();
  }

  setLogoHtml(html: string | undefined): void {
    this._logoHtml = html;
    if (this.viewMode === 'splash' && this.overviewEl) this.overviewEl.textContent = '';
    if (this.isInitialized) {
      this.renderSidebar();
      if (this.viewMode === 'splash') this.renderMainArea();
    }
  }

  setPlatformName(name: string | undefined): void {
    this._platformName = name;
    this.innerWizard?.setPlatformName(name);
    if (this.viewMode === 'splash' && this.overviewEl) this.overviewEl.textContent = '';
    if (this.isInitialized) this.render();
  }

  setCollectionOptions(options?: OnboardingCollectionOptions | null): void {
    this._collectionOptions = options ?? null;
    this.innerWizard?.setCollectionOptions(options);
  }

  setFullTermsOfServiceUrl(url?: string | null): void {
    this._fullTermsOfServiceUrl = url ?? null;
    this.innerWizard?.setFullTermsOfServiceUrl(url);
  }

  setRecipientTermsOfServiceUrl(url?: string | null): void {
    this._recipientTermsOfServiceUrl = url ?? null;
    this.innerWizard?.setRecipientTermsOfServiceUrl(url);
  }

  setPrivacyPolicyUrl(url?: string | null): void {
    this._privacyPolicyUrl = url ?? null;
    this.innerWizard?.setPrivacyPolicyUrl(url);
  }

  // Prop forwarding

  override setLocale(locale: Locale): void {
    super.setLocale(locale);
    this.innerWizard?.setLocale(locale);
  }

  override setFormatting(formatting: FormattingOptions): void {
    super.setFormatting(formatting);
    this.innerWizard?.setFormatting(formatting);
  }

  override setIcons(icons: ComponentIcons): void {
    super.setIcons(icons);
    this.innerWizard?.setIcons(icons);
  }

  override setLayoutVariant(variant: LayoutVariant): void {
    super.setLayoutVariant(variant);
    this.innerWizard?.setLayoutVariant(variant);
  }

  protected override onAppearanceUpdate(appearance: AppearanceOptions): void {
    super.onAppearanceUpdate(appearance);
    if (this.innerWizard) {
      this.innerWizard.dispatchEvent(
        new CustomEvent('dialstack-appearance-update', {
          detail: { appearance },
        })
      );
    }
  }

  // ============================================================================
  // Helpers
  // ============================================================================

  /** Translate with platformName always injected. */
  private tp(key: string, params?: Record<string, string | number>): string {
    return this.t(key, { platformName: this._platformName ?? 'DialStack', ...params });
  }

  /** Validate that a string looks like a safe CSS color value. */
  private isValidCssColor(value: string): boolean {
    return !/[{};]/.test(value);
  }

  /** Generate portal-specific CSS variables with auto-derived defaults. */
  private getPortalCssVars(): string {
    const raw = this.appearance?.variables?.colorPrimary;
    const colorPrimary = raw && this.isValidCssColor(raw) ? raw : undefined;

    // Use the brand color directly for portal chrome.
    // Sidebar and splash use the primary color itself (not mixed/desaturated).
    // Falls back to original DialStack values when no primary is set.
    const sidebarBg = colorPrimary ?? '#1c1247';
    const sidebarActive = colorPrimary
      ? `color-mix(in srgb, ${colorPrimary}, white 20%)`
      : '#4c3c8e';
    const splashBg = colorPrimary ? `color-mix(in srgb, ${colorPrimary}, black 15%)` : '#2d2065';
    const splashShape = colorPrimary ? `color-mix(in srgb, ${colorPrimary}, white 30%)` : '#8A7ACE';
    const splashShelf = colorPrimary ? `color-mix(in srgb, ${colorPrimary}, white 70%)` : '#d1c6ff';

    return `
      :host {
        --ds-portal-sidebar-bg: ${sidebarBg};
        --ds-portal-sidebar-active: ${sidebarActive};
        --ds-portal-splash-bg: ${splashBg};
        --ds-portal-splash-shape: ${splashShape};
        --ds-portal-splash-shelf: ${splashShelf};
      }`;
  }

  // ============================================================================
  // Render
  // ============================================================================

  protected render(): void {
    if (!this.shadowRoot || !this.styleEl) return;

    const styles = this.applyAppearanceStyles();
    const portalVars = this.getPortalCssVars();
    this.styleEl.textContent = `${styles}\n${portalVars}\n${PORTAL_STYLES}\n${SPLASH_STYLES}\n${OVERVIEW_STYLES}`;

    if (this.sidebarEl) {
      this.sidebarEl.className = `portal-sidebar ${this.classes.sidebar ?? ''}`.trim();
    }
    if (this.mainEl) {
      this.mainEl.className = `portal-main ${this.classes.mainContent ?? ''}`.trim();
    }

    this.renderSidebar();
    this.renderMainArea();
  }

  private renderSidebar(): void {
    if (!this.sidebarEl) return;

    // Get fresh state from wizard
    if (this.innerWizard) {
      this.activeSteps = this.innerWizard.getActiveSteps();
      this.currentStep = this.innerWizard.getCurrentStep();
    }

    const stepsWithoutComplete = this.activeSteps.filter((s) => s !== 'final_complete');

    // Build sidebar using DOM methods to avoid innerHTML XSS concerns.
    // All text content comes from internal i18n strings; SVG icons are
    // static constants defined in constants.ts.
    this.sidebarEl.textContent = '';

    // Logo
    const logoDiv = document.createElement('div');
    logoDiv.className = 'portal-logo';
    if (this._logoHtml) {
      // logoHtml is set by the SDK consumer (developer), not end-user input
      logoDiv.innerHTML = this._logoHtml;
    } else {
      logoDiv.style.fontSize = '20px';
      logoDiv.style.fontWeight = '700';
      logoDiv.textContent = this._platformName ?? 'DialStack';
    }
    this.sidebarEl.appendChild(logoDiv);

    // Overview link — active only when viewMode is 'overview' (not during splash)
    const overviewLink = document.createElement('div');
    const isOverviewActive = this.viewMode === 'overview';
    overviewLink.className = `portal-nav-link${isOverviewActive ? ' active' : ''}`;
    overviewLink.setAttribute('data-action', 'overview');
    overviewLink.setAttribute('role', 'button');
    overviewLink.setAttribute('tabindex', '0');
    // SAFETY: OVERVIEW_SVG is a static constant defined in constants.ts
    overviewLink.innerHTML = `<span class="portal-nav-icon">${OVERVIEW_SVG}</span>`;
    const overviewLabel = document.createElement('span');
    overviewLabel.textContent =
      this.viewMode === 'wizard'
        ? this.t('onboardingPortal.dashboard')
        : this.t('onboardingPortal.overview.label');
    overviewLink.appendChild(overviewLabel);
    this.sidebarEl.appendChild(overviewLink);

    // Steps label
    const stepsLabelDiv = document.createElement('div');
    stepsLabelDiv.className = 'portal-steps-label';
    stepsLabelDiv.textContent = this.t('onboardingPortal.onboardingFlows');
    this.sidebarEl.appendChild(stepsLabelDiv);

    for (const step of stepsWithoutComplete) {
      const isActive = this.viewMode === 'wizard' && step === this.currentStep;
      const isCompleted = this._progressStore?.isStepComplete(step as StepName) ?? false;

      const item = document.createElement('div');
      item.className = 'portal-step-item';
      if (isActive) item.classList.add('active');
      if (isCompleted) item.classList.add('completed');
      item.setAttribute('data-step', step);
      item.setAttribute('role', 'button');
      item.setAttribute('tabindex', '0');

      // Icon (static SVG constant)
      const iconSpan = document.createElement('span');
      iconSpan.className = 'portal-step-icon';
      // SAFETY: STEP_ICONS values are static SVG constants from account-onboarding/icons.ts
      iconSpan.innerHTML = STEP_ICONS[step] ?? '';
      item.appendChild(iconSpan);

      // Label (i18n string, safe text)
      const nameSpan = document.createElement('span');
      nameSpan.className = 'portal-step-name';
      nameSpan.textContent = this.t(STEP_I18N_KEYS[step] ?? step);
      item.appendChild(nameSpan);

      // Indicator
      const indicatorSpan = document.createElement('span');
      indicatorSpan.className = 'portal-step-indicator';
      const indicatorHtml = this.renderStepIndicator(step, isCompleted);
      if (indicatorHtml) {
        // Static SVG content only
        indicatorSpan.innerHTML = indicatorHtml;
      }
      item.appendChild(indicatorSpan);

      this.sidebarEl.appendChild(item);
    }

    // Footer
    const footer = document.createElement('div');
    footer.className = 'portal-sidebar-footer';

    const backLink = document.createElement('div');
    backLink.className = 'portal-footer-link';
    backLink.setAttribute('data-action', 'back');
    backLink.setAttribute('role', 'button');
    backLink.setAttribute('tabindex', '0');
    const backArrow = document.createElement('span');
    backArrow.className = 'portal-nav-icon';
    backArrow.textContent = '\u2190';
    backLink.appendChild(backArrow);
    const backLabelEl = document.createElement('span');
    backLabelEl.textContent = this._backLabel ?? this.t('onboardingPortal.back');
    backLink.appendChild(backLabelEl);
    footer.appendChild(backLink);

    const helpLink = document.createElement('div');
    helpLink.className = 'portal-footer-link';
    helpLink.setAttribute('role', 'button');
    helpLink.setAttribute('tabindex', '0');
    // SAFETY: HELP_SVG is a static constant defined in constants.ts
    helpLink.innerHTML = `<span class="portal-nav-icon">${HELP_SVG}</span>`;
    const helpLabel = document.createElement('span');
    helpLabel.textContent = this.t('onboardingPortal.helpSupport');
    helpLink.appendChild(helpLabel);
    footer.appendChild(helpLink);

    this.sidebarEl.appendChild(footer);
  }

  private renderMainArea(): void {
    if (!this.overviewEl || !this.mainEl) return;
    if (this.viewMode === 'splash') {
      this.mainEl.style.display = 'none';
      this.overviewEl.style.display = '';
      // Splash is static; skip re-render if already mounted
      if (!this.overviewEl.firstChild) {
        renderSplashScreen(this.overviewEl, (key) => this.tp(key), {
          logoHtml: this._logoHtml,
        });
      }
    } else if (this.viewMode === 'overview') {
      this.mainEl.style.display = 'none';
      this.overviewEl.style.display = '';
      const stepsToShow = this.activeSteps.filter((s): s is StepName => s !== 'final_complete');
      renderOverviewScreen(
        this.overviewEl,
        (key) => this.t(key),
        this._progressStore,
        stepsToShow,
        this._phoneNumbers
      );
    } else {
      this.overviewEl.style.display = 'none';
      this.mainEl.style.display = '';
    }
    // Show wizard header only in wizard mode
    if (this.wizardHeaderEl) {
      this.wizardHeaderEl.style.display = this.viewMode === 'wizard' ? '' : 'none';
    }
  }

  private renderStepIndicator(step: AccountOnboardingStep, isCompleted: boolean): string {
    if (isCompleted) {
      return `<div class="check-circle">${CHECK_SVG_WHITE}</div>`;
    }

    const pct = this._progressStore?.getStepProgressPercent(step as StepName) ?? 0;
    return this.renderProgressRing(pct);
  }

  private renderProgressRing(pct: number): string {
    const offset = CIRCUMFERENCE * (1 - pct / 100);
    return `
      <svg viewBox="0 0 36 36" class="progress-ring">
        <circle cx="18" cy="18" r="16" fill="none" stroke="rgba(255,255,255,0.2)" stroke-width="3"/>
        <circle cx="18" cy="18" r="16" fill="none" stroke="#fff" stroke-width="3"
          stroke-dasharray="${CIRCUMFERENCE}" stroke-dashoffset="${offset}"
          stroke-linecap="round" transform="rotate(-90 18 18)"/>
        <text x="18" y="18" text-anchor="middle" dominant-baseline="central"
          fill="#fff" font-size="9" font-weight="bold">${pct}%</text>
      </svg>`;
  }
}

// Register the custom element
if (typeof window !== 'undefined' && !customElements.get('dialstack-onboarding-portal')) {
  customElements.define('dialstack-onboarding-portal', OnboardingPortalComponent);
}
