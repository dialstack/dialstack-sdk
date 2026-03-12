/**
 * Account Onboarding Web Component - Multi-step onboarding wizard
 *
 * Thin orchestrator that embeds standalone step components as child custom
 * elements. Manages step visibility, navigation, and loading/error/complete
 * screens. Step-specific rendering is fully owned by each step element.
 */

import { BaseComponent } from '../base-component';
import type {
  AccountOnboardingStep,
  AccountOnboardingClasses,
  AccountConfig,
  OnboardingCollectionOptions,
  AppearanceOptions,
  FormattingOptions,
  ComponentIcons,
  LayoutVariant,
} from '../../types';
import COMPONENT_STYLES from './styles.css';
import { create as createConfetti } from 'canvas-confetti';
import { ERROR_SVG } from './icons';
import type { OnboardingStepBase } from './step-base';
import type { Locale } from '../../locales';

// Side-effect imports: register step custom elements
import './step-account';
import './step-numbers';
import './step-hardware';

const STEP_TAG_NAMES: Record<string, string> = {
  account: 'dialstack-onboarding-account',
  numbers: 'dialstack-onboarding-numbers',
  hardware: 'dialstack-onboarding-hardware',
};

export class AccountOnboardingComponent extends BaseComponent {
  private static readonly ALL_STEPS: AccountOnboardingStep[] = [
    'account',
    'numbers',
    'hardware',
    'complete',
  ];

  private currentStep: AccountOnboardingStep = 'account';
  private savedStepIndex = 0;
  private isLoading = true;
  private loadError: string | null = null;
  private _accountConfig: AccountConfig = {};

  // Collection options and URL props
  private collectionOptions: OnboardingCollectionOptions | null = null;
  private _exitFired = false;
  private fullTermsOfServiceUrl: string | null = null;
  private recipientTermsOfServiceUrl: string | null = null;
  private privacyPolicyUrl: string | null = null;

  // Override classes type
  protected override classes: AccountOnboardingClasses = {};

  // Callbacks
  private _onExit?: () => void;
  private _onStepChange?: (event: { step: AccountOnboardingStep }) => void;

  // Step element cache
  private stepElements = new Map<string, OnboardingStepBase>();

  // Confetti animation
  private confettiInstance: ReturnType<typeof createConfetti> | null = null;

  // Persistent DOM nodes (created once in initialize)
  private styleEl: HTMLStyleElement | null = null;
  private htmlContainer: HTMLDivElement | null = null;
  private stepsContainer: HTMLDivElement | null = null;

  // ============================================================================
  // Lifecycle
  // ============================================================================

  override connectedCallback(): void {
    this._exitFired = false;
    super.connectedCallback();
  }

  protected initialize(): void {
    if (this.isInitialized) return;

    if (!this.shadowRoot) return;

    // Build persistent DOM structure
    this.styleEl = document.createElement('style');
    this.shadowRoot.appendChild(this.styleEl);

    this.htmlContainer = document.createElement('div');
    this.htmlContainer.setAttribute('part', 'container');
    this.htmlContainer.setAttribute('role', 'region');
    this.shadowRoot.appendChild(this.htmlContainer);

    this.stepsContainer = document.createElement('div');
    this.stepsContainer.style.display = 'none';
    this.shadowRoot.appendChild(this.stepsContainer);

    this.attachDelegatedClickHandler();
    this.render();
    this.isInitialized = true;
    this.loadOnboardingData();
  }

  protected override cleanup(): void {
    this.stopConfetti();
    for (const el of this.stepElements.values()) {
      el.destroy();
    }
    this.stepElements.clear();

    if (!this._exitFired) {
      this._exitFired = true;
      this._onExit?.();
    }
  }

  // ============================================================================
  // Data Loading
  // ============================================================================

  private async loadOnboardingData(): Promise<void> {
    this.isLoading = true;
    this.loadError = null;
    this._onLoaderStart?.({ elementTagName: 'dialstack-account-onboarding' });
    this.render();

    try {
      if (!this.instance) throw new Error('Not initialized');

      const accountData = await this.instance.getAccount();
      this._accountConfig = accountData.config ?? {};

      this.isLoading = false;

      // Restore saved onboarding step from account config
      const activeSteps = this.getActiveSteps();
      const savedStep = accountData.config?.onboarding_step;
      if (savedStep && savedStep !== 'complete' && activeSteps.includes(savedStep)) {
        const idx = activeSteps.indexOf(savedStep);
        this.savedStepIndex = idx;
        this.navigateToStep(savedStep);
      }

      // Jump to a specific step if configured
      const initial = this.collectionOptions?.initialStep;
      if (initial && activeSteps.includes(initial)) {
        this.navigateToStep(initial);
      }

      this.render();
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : String(err);
      this.loadError = errorMessage;
      this.isLoading = false;
      this._onLoadError?.({
        error: errorMessage,
        elementTagName: 'dialstack-account-onboarding',
      });
      this.render();
    }
  }

  // ============================================================================
  // Step Element Management
  // ============================================================================

  private getOrCreateStep(step: AccountOnboardingStep): OnboardingStepBase {
    let el = this.stepElements.get(step);
    if (el) return el;

    const tagName = STEP_TAG_NAMES[step];
    if (!tagName) throw new Error(`Unknown step: ${step}`);

    el = document.createElement(tagName) as OnboardingStepBase;

    // Forward instance and configuration
    if (this.instance) el.setInstance(this.instance);
    el.setLayoutVariant(this.layoutVariant);
    el.setLocale(this.locale);
    el.setFormatting(this.formatting);
    el.setIcons(this.icons);
    if (this.appearance) {
      el.dispatchEvent(
        new CustomEvent('dialstack-appearance-update', {
          detail: { appearance: this.appearance },
        })
      );
    }

    // Configure navigation callbacks
    this.configureStepNavigation(step, el);

    // Append to steps container (hidden by default)
    el.style.display = 'none';
    this.stepsContainer?.appendChild(el);
    this.stepElements.set(step, el);

    return el;
  }

  private configureStepNavigation(step: AccountOnboardingStep, el: OnboardingStepBase): void {
    const activeSteps = this.getActiveSteps();
    const idx = activeSteps.indexOf(step);
    const hasPrev = idx > 0;

    el.setShowBack(hasPrev);

    el.setOnComplete(() => {
      const steps = this.getActiveSteps();
      const currentIdx = steps.indexOf(step);
      const nextStep = steps[currentIdx + 1];
      if (nextStep) {
        this.navigateToStep(nextStep);
      }
    });

    el.setOnBack(() => {
      const steps = this.getActiveSteps();
      const currentIdx = steps.indexOf(step);
      const prevStep = steps[currentIdx - 1];
      if (prevStep) {
        this.navigateToStep(prevStep);
      }
    });
  }

  private reconfigureNavigation(): void {
    for (const [step, el] of this.stepElements) {
      this.configureStepNavigation(step as AccountOnboardingStep, el);
    }
  }

  // ============================================================================
  // Public Setters
  // ============================================================================

  override setClasses(classes: AccountOnboardingClasses): void {
    this.classes = { ...this.classes, ...classes };
    if (this.isInitialized) {
      this.render();
    }
  }

  setOnExit(cb: () => void): void {
    this._onExit = cb;
  }

  setOnStepChange(cb: (event: { step: AccountOnboardingStep }) => void): void {
    this._onStepChange = cb;
  }

  setCollectionOptions(options?: OnboardingCollectionOptions | null): void {
    this.collectionOptions = options ?? null;
    const activeSteps = this.getActiveSteps();
    if (!activeSteps.includes(this.currentStep)) {
      this.currentStep = activeSteps[0] ?? 'complete';
    }
    this.reconfigureNavigation();
    const initial = this.collectionOptions?.initialStep;
    if (initial && !this.isLoading && !this.loadError && activeSteps.includes(initial)) {
      this.navigateToStep(initial);
    }
    if (this.isInitialized) {
      this.render();
    }
  }

  setFullTermsOfServiceUrl(url?: string | null): void {
    this.fullTermsOfServiceUrl = this.sanitizeUrl(url);
    if (this.isInitialized) {
      this.render();
    }
  }

  setRecipientTermsOfServiceUrl(url?: string | null): void {
    this.recipientTermsOfServiceUrl = this.sanitizeUrl(url);
    if (this.isInitialized) {
      this.render();
    }
  }

  setPrivacyPolicyUrl(url?: string | null): void {
    this.privacyPolicyUrl = this.sanitizeUrl(url);
    if (this.isInitialized) {
      this.render();
    }
  }

  // Prop forwarding to step elements

  override setLayoutVariant(variant: LayoutVariant): void {
    super.setLayoutVariant(variant);
    for (const el of this.stepElements.values()) {
      el.setLayoutVariant(variant);
    }
  }

  override setLocale(locale: Locale): void {
    super.setLocale(locale);
    for (const el of this.stepElements.values()) {
      el.setLocale(locale);
    }
  }

  override setFormatting(formatting: FormattingOptions): void {
    super.setFormatting(formatting);
    for (const el of this.stepElements.values()) {
      el.setFormatting(formatting);
    }
  }

  override setIcons(icons: ComponentIcons): void {
    super.setIcons(icons);
    for (const el of this.stepElements.values()) {
      el.setIcons(icons);
    }
  }

  protected override onAppearanceUpdate(appearance: AppearanceOptions): void {
    super.onAppearanceUpdate(appearance);
    for (const el of this.stepElements.values()) {
      el.dispatchEvent(
        new CustomEvent('dialstack-appearance-update', {
          detail: { appearance },
        })
      );
    }
  }

  private sanitizeUrl(url?: string | null): string | null {
    if (!url) return null;

    try {
      const parsed = new URL(url);
      if (parsed.protocol === 'http:' || parsed.protocol === 'https:') {
        return parsed.toString();
      }
    } catch {
      // invalid URL
    }
    return null;
  }

  // ============================================================================
  // Step Filtering
  // ============================================================================

  getActiveSteps(): AccountOnboardingStep[] {
    const opts = this.collectionOptions?.steps;
    let steps = AccountOnboardingComponent.ALL_STEPS.filter((s) => s !== 'complete');
    if (opts?.include) {
      steps = steps.filter((s) => opts.include!.includes(s));
    }
    if (opts?.exclude) {
      steps = steps.filter((s) => !opts.exclude!.includes(s));
    }
    return [...steps, 'complete'];
  }

  // ============================================================================
  // Navigation
  // ============================================================================

  navigateToStep(step: AccountOnboardingStep): void {
    if (step === this.currentStep) return;
    this.currentStep = step;
    this._onStepChange?.({ step });
    this.render();

    // Persist progress (fire-and-forget)
    const activeSteps = this.getActiveSteps();
    const stepIdx = activeSteps.indexOf(step);
    if (stepIdx > this.savedStepIndex && this.instance) {
      this.savedStepIndex = stepIdx;
      this.instance
        .updateAccount({ config: { ...this._accountConfig, onboarding_step: step } })
        .catch((err) => console.warn('Failed to persist onboarding step:', err));
    }
  }

  // ============================================================================
  // Render
  // ============================================================================

  // Note: All content rendered via innerHTML comes from internal i18n strings
  // (this.t()) and static SVG constants — no user-supplied data is interpolated
  // without escaping. User-supplied data is escaped via this.escapeHtml().
  protected render(): void {
    if (!this.shadowRoot || !this.styleEl || !this.htmlContainer || !this.stepsContainer) return;

    const styles = this.applyAppearanceStyles();
    this.styleEl.textContent = `${styles}\n${COMPONENT_STYLES}`;

    this.htmlContainer.className = `container ${this.getClassNames()}`;
    this.htmlContainer.setAttribute('aria-label', this.t('accountOnboarding.title'));

    const showStepElement = !this.isLoading && !this.loadError && this.currentStep !== 'complete';

    if (showStepElement) {
      this.stopConfetti();
      // Show steps container, hide html container
      this.htmlContainer.style.display = 'none';
      this.stepsContainer.style.display = '';

      // Toggle visibility of step elements
      const activeEl = this.getOrCreateStep(this.currentStep);
      for (const [step, el] of this.stepElements) {
        el.style.display = step === this.currentStep ? '' : 'none';
      }

      // Forward container class to active step element
      activeEl.setClasses(this.classes);
    } else {
      // Show html container, hide steps container
      this.htmlContainer.style.display = '';
      this.stepsContainer.style.display = 'none';

      let content: string;
      if (this.isLoading) {
        content = this.renderLoadingState();
      } else if (this.loadError) {
        content = this.renderErrorState();
      } else {
        content = this.renderCompleteStep();
      }

      // Safe: all content from internal i18n strings and static SVGs
      this.htmlContainer.innerHTML = content;

      // Kick off confetti animation on complete screen
      if (!this.isLoading && !this.loadError) {
        this.startConfettiAnimation();
      }
    }
  }

  private renderLoadingState(): string {
    return `
      <div class="card">
        <div class="center-state" role="status" aria-live="polite">
          <div class="spinner" aria-hidden="true">${this.icons.spinner}</div>
          <div class="center-title">${this.t('accountOnboarding.loading')}</div>
        </div>
      </div>
    `;
  }

  private renderErrorState(): string {
    return `
      <div class="card" part="error-state">
        <div class="center-state">
          <div class="center-icon error">${ERROR_SVG}</div>
          <div class="center-title">${this.t('accountOnboarding.error.title')}</div>
          <div class="center-description">${this.t('accountOnboarding.error.description')}</div>
          <div class="center-btn">
            <button class="btn btn-primary" data-action="retry">
              ${this.t('accountOnboarding.error.retry')}
            </button>
          </div>
        </div>
      </div>
    `;
  }

  private renderCompleteStep(): string {
    return `
      <div class="${this.classes.stepComplete || ''}" part="step-complete">
        <div class="confetti-container">
          <canvas class="confetti-canvas" aria-hidden="true"></canvas>
          <h1 class="complete-title">${this.t('accountOnboarding.complete.title')}</h1>
          <p class="complete-subtitle">${this.t('accountOnboarding.complete.subtitle')}</p>
          ${this.renderLegalLinks()}
          <div style="margin-top:var(--ds-layout-spacing-lg)">
            <button class="btn btn-primary" data-action="exit">
              ${this.t('accountOnboarding.nav.exit')}
            </button>
          </div>
        </div>
      </div>
    `;
  }

  private stopConfetti(): void {
    if (this.confettiInstance) {
      try {
        this.confettiInstance.reset();
      } catch {
        // Canvas may not support getContext in test environments
      }
      this.confettiInstance = null;
    }
  }

  private startConfettiAnimation(): void {
    this.stopConfetti();

    const canvas = this.htmlContainer?.querySelector<HTMLCanvasElement>('.confetti-canvas');
    if (!canvas) return;

    const container = canvas.parentElement;
    if (!container) return;
    canvas.width = container.clientWidth || 300;
    canvas.height = container.clientHeight || 150;

    const fire = createConfetti(canvas, { resize: true });
    this.confettiInstance = fire;

    const colors = [
      '#e91e63',
      '#9c27b0',
      '#2196f3',
      '#4caf50',
      '#ff9800',
      '#ffeb3b',
      '#00bcd4',
      '#ff5722',
    ];

    // Center cannon burst — two volleys for a fuller effect
    fire({
      particleCount: 80,
      spread: 70,
      origin: { x: 0.5, y: 0.6 },
      colors,
      startVelocity: 45,
      gravity: 1.2,
      ticks: 300,
      scalar: 1.1,
    });

    // Slight delay for a second volley with different spread
    setTimeout(() => {
      fire({
        particleCount: 50,
        spread: 100,
        origin: { x: 0.5, y: 0.6 },
        colors,
        startVelocity: 35,
        gravity: 1,
        ticks: 250,
        scalar: 0.9,
      });
    }, 150);
  }

  private renderLegalLinks(): string {
    const links: string[] = [];
    if (this.fullTermsOfServiceUrl) {
      links.push(
        `<a href="${this.escapeHtml(this.fullTermsOfServiceUrl)}" target="_blank" rel="noopener noreferrer">${this.t('accountOnboarding.legal.termsOfService')}</a>`
      );
    }
    if (this.recipientTermsOfServiceUrl) {
      links.push(
        `<a href="${this.escapeHtml(this.recipientTermsOfServiceUrl)}" target="_blank" rel="noopener noreferrer">${this.t('accountOnboarding.legal.recipientTerms')}</a>`
      );
    }
    if (this.privacyPolicyUrl) {
      links.push(
        `<a href="${this.escapeHtml(this.privacyPolicyUrl)}" target="_blank" rel="noopener noreferrer">${this.t('accountOnboarding.legal.privacyPolicy')}</a>`
      );
    }
    if (links.length === 0) return '';

    const and = this.t('accountOnboarding.legal.and');
    let joined: string;
    if (links.length === 1) {
      joined = links[0]!;
    } else if (links.length === 2) {
      joined = `${links[0]} ${and} ${links[1]}`;
    } else {
      joined = `${links.slice(0, -1).join(', ')}, ${and} ${links[links.length - 1]}`;
    }

    return `<p class="legal-links">${this.t('accountOnboarding.legal.prefix')} ${joined}</p>`;
  }

  // ============================================================================
  // Event Handling
  // ============================================================================

  private attachDelegatedClickHandler(): void {
    if (!this.shadowRoot) return;

    this.shadowRoot.addEventListener('click', (e) => {
      const target = e.target as HTMLElement;
      const actionEl = target.closest<HTMLElement>('[data-action]');
      if (!actionEl) return;

      const action = actionEl.dataset.action!;

      switch (action) {
        case 'exit':
          if (!this._exitFired) {
            this._exitFired = true;
            this._onExit?.();
          }
          break;
        case 'retry':
          this.loadOnboardingData();
          break;
      }
    });
  }
}

// Register the custom element
if (typeof window !== 'undefined' && !customElements.get('dialstack-account-onboarding')) {
  customElements.define('dialstack-account-onboarding', AccountOnboardingComponent);
}
