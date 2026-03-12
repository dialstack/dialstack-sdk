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
import { BUILDING_SVG, PHONE_SVG, MONITOR_SVG } from '../account-onboarding/icons';
import type { AccountOnboardingComponent } from '../account-onboarding';
import type { Locale } from '../../locales';
import type { OnboardingProgressStore, StepName } from '../account-onboarding/progress-store';

// Ensure the inner wizard component is registered
import '../account-onboarding';

const STEP_ICONS: Record<string, string> = {
  account: BUILDING_SVG,
  numbers: PHONE_SVG,
  hardware: MONITOR_SVG,
};

const STEP_I18N_KEYS: Record<string, string> = {
  account: 'accountOnboarding.steps.account',
  numbers: 'accountOnboarding.steps.numbers',
  hardware: 'accountOnboarding.steps.hardware',
};

// Lucide: layout-grid
const DASHBOARD_SVG = `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect width="7" height="7" x="3" y="3" rx="1"/><rect width="7" height="7" x="14" y="3" rx="1"/><rect width="7" height="7" x="14" y="14" rx="1"/><rect width="7" height="7" x="3" y="14" rx="1"/></svg>`;
// Lucide: arrow-left
const BACK_SVG = `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m12 19-7-7 7-7"/><path d="M19 12H5"/></svg>`;
// Lucide: circle-help
const HELP_SVG = `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3"/><path d="M12 17h.01"/></svg>`;
// Lucide: check
const CHECK_SVG_WHITE = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><path d="M20 6 9 17l-5-5"/></svg>`;

const CIRCUMFERENCE = 2 * Math.PI * 16; // ~100.53

export class OnboardingPortalComponent extends BaseComponent {
  protected override classes: OnboardingPortalClasses = {};
  private currentStep: AccountOnboardingStep = 'account';
  private activeSteps: AccountOnboardingStep[] = [];
  private _progressStore: OnboardingProgressStore | null = null;
  private _storeUnsubscribe: (() => void) | null = null;

  // Inner wizard element
  private innerWizard: AccountOnboardingComponent | null = null;

  // Persistent DOM
  private styleEl: HTMLStyleElement | null = null;
  private sidebarEl: HTMLElement | null = null;
  private mainEl: HTMLDivElement | null = null;

  // Callbacks
  private _onExit?: () => void;
  private _onStepChange?: (event: { step: AccountOnboardingStep }) => void;
  private _onOverviewClick?: () => void;
  private _onBack?: () => void;
  private _backLabel: string | undefined;

  // Configurable content
  private _logoHtml: string | undefined;

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

    this.mainEl = document.createElement('div');
    this.mainEl.className = 'portal-main';
    layout.appendChild(this.mainEl);

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

    // Wire callbacks
    this.innerWizard.setOnExit(() => this._onExit?.());
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

      this.currentStep = event.step;
      this._onStepChange?.(event);
      this.renderSidebar();
    });

    this.innerWizard.setOnSubStepProgress(() => {
      this.acquireProgressStore();
      // When current step is complete and all others are too, go to wahoo
      if (this.currentStep !== 'final_complete' && this._progressStore) {
        const isCurrentDone = this._progressStore.isStepComplete(this.currentStep as StepName);
        if (isCurrentDone) {
          const allDone = this.activeSteps
            .filter((s) => s !== 'final_complete' && s !== this.currentStep)
            .every((s) => this._progressStore!.isStepComplete(s as StepName));
          if (allDone) {
            this.innerWizard!.navigateToStep('final_complete');
            return;
          }
        }
      }

      this.renderSidebar();
    });

    // Attach sidebar click handler
    this.sidebarEl.addEventListener('click', (e) => {
      const target = e.target as HTMLElement;
      const stepEl = target.closest<HTMLElement>('[data-step]');
      if (stepEl) {
        const step = stepEl.dataset.step as AccountOnboardingStep;
        this.innerWizard?.navigateToStep(step);
        return;
      }
      const actionEl = target.closest<HTMLElement>('[data-action]');
      if (actionEl?.dataset.action === 'overview') {
        this._onOverviewClick?.();
      } else if (actionEl?.dataset.action === 'back') {
        this._onBack?.();
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
   */
  private acquireProgressStore(): void {
    if (this._progressStore || !this.innerWizard) return;
    const store = this.innerWizard.getProgressStore();
    if (!store) return;
    this._progressStore = store;
    this._storeUnsubscribe = store.subscribe(() => this.renderSidebar());
    this.activeSteps = this.innerWizard.getActiveSteps();
  }

  // ============================================================================
  // Public Setters
  // ============================================================================

  override setClasses(classes: OnboardingPortalClasses): void {
    this.classes = { ...this.classes, ...classes };
    if (this.isInitialized) this.render();
  }

  setOnExit(cb: () => void): void {
    this._onExit = cb;
    this.innerWizard?.setOnExit(cb);
  }

  setOnStepChange(cb: (event: { step: AccountOnboardingStep }) => void): void {
    this._onStepChange = cb;
  }

  setOnOverviewClick(cb: (() => void) | undefined): void {
    this._onOverviewClick = cb;
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
    if (this.isInitialized) this.renderSidebar();
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
  // Render
  // ============================================================================

  protected render(): void {
    if (!this.shadowRoot || !this.styleEl) return;

    const styles = this.applyAppearanceStyles();
    this.styleEl.textContent = `${styles}\n${PORTAL_STYLES}`;

    if (this.sidebarEl) {
      this.sidebarEl.className = `portal-sidebar ${this.classes.sidebar ?? ''}`.trim();
    }
    if (this.mainEl) {
      this.mainEl.className = `portal-main ${this.classes.mainContent ?? ''}`.trim();
    }

    this.renderSidebar();
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
    // static constants defined in this module.
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
      logoDiv.textContent = 'DialStack';
    }
    this.sidebarEl.appendChild(logoDiv);

    // Dashboard link
    const dashLink = document.createElement('div');
    dashLink.className = 'portal-nav-link';
    dashLink.setAttribute('data-action', 'overview');
    dashLink.setAttribute('role', 'button');
    dashLink.setAttribute('tabindex', '0');
    dashLink.innerHTML = `<span class="portal-nav-icon">${DASHBOARD_SVG}</span>`;
    const dashLabel = document.createElement('span');
    dashLabel.textContent = this.t('onboardingPortal.dashboard');
    dashLink.appendChild(dashLabel);
    this.sidebarEl.appendChild(dashLink);

    // Steps label
    const stepsLabelDiv = document.createElement('div');
    stepsLabelDiv.className = 'portal-steps-label';
    stepsLabelDiv.textContent = this.t('onboardingPortal.onboardingFlows');
    this.sidebarEl.appendChild(stepsLabelDiv);

    for (const step of stepsWithoutComplete) {
      const isActive = step === this.currentStep;
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
    // BACK_SVG is a static constant defined in this module, not user input
    backLink.innerHTML = `<span class="portal-nav-icon">${BACK_SVG}</span>`;
    const backLabelEl = document.createElement('span');
    backLabelEl.textContent = this._backLabel ?? this.t('onboardingPortal.back');
    backLink.appendChild(backLabelEl);
    footer.appendChild(backLink);

    const helpLink = document.createElement('div');
    helpLink.className = 'portal-footer-link';
    helpLink.setAttribute('role', 'button');
    helpLink.setAttribute('tabindex', '0');
    helpLink.innerHTML = `<span class="portal-nav-icon">${HELP_SVG}</span>`;
    const helpLabel = document.createElement('span');
    helpLabel.textContent = this.t('onboardingPortal.helpSupport');
    helpLink.appendChild(helpLabel);
    footer.appendChild(helpLink);

    this.sidebarEl.appendChild(footer);
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
