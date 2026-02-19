/**
 * Account Onboarding Web Component - Multi-step onboarding wizard
 */

import { BaseComponent } from './base-component';
import type {
  AccountOnboardingStep,
  AccountOnboardingClasses,
  OnboardingCollectionOptions,
} from '../types';

const CHECK_SVG = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" style="width:12px;height:12px"><polyline points="20 6 9 17 4 12"/></svg>`;
const CHEVRON_SVG = `<svg viewBox="0 0 24 24" fill="currentColor" width="12" height="12"><path d="M10 6L8.59 7.41 13.17 12l-4.58 4.59L10 18l6-6z"/></svg>`;
const SUCCESS_SVG = `<svg viewBox="0 0 52 52" fill="none" xmlns="http://www.w3.org/2000/svg"><circle cx="26" cy="26" r="25" stroke="currentColor" stroke-width="2"/><polyline points="16 27 23 34 36 20" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"/></svg>`;
const ERROR_SVG = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/></svg>`;

const COMPONENT_STYLES = `
  :host {
    display: block;
  }

  .container {
    background: var(--ds-color-background);
    color: var(--ds-color-text);
    font-size: var(--ds-font-size-base);
    line-height: var(--ds-line-height);
    overflow: hidden;
  }

  /* ── Breadcrumb Step Progress ── */
  .step-breadcrumb {
    display: flex;
    align-items: center;
    gap: var(--ds-spacing-xs);
    padding: var(--ds-layout-spacing-lg) var(--ds-layout-spacing-lg) var(--ds-layout-spacing-md);
  }

  .step-item {
    display: flex;
    align-items: center;
    gap: var(--ds-spacing-xs);
    font-size: var(--ds-font-size-small);
    font-weight: var(--ds-font-weight-medium);
    color: var(--ds-color-text-secondary);
    opacity: 0.5;
    transition: opacity var(--ds-transition-duration), color var(--ds-transition-duration);
  }

  .step-item.active {
    color: var(--ds-color-primary);
    opacity: 1;
  }

  .step-item.completed {
    color: var(--ds-color-success);
    opacity: 0.8;
    cursor: pointer;
  }

  .step-item.completed:hover {
    opacity: 1;
  }

  .step-separator {
    display: flex;
    align-items: center;
    color: var(--ds-color-border);
  }

  .step-separator svg {
    width: 14px;
    height: 14px;
  }

  .step-number {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 20px;
    height: 20px;
    border-radius: var(--ds-border-radius-round);
    font-size: 11px;
    font-weight: var(--ds-font-weight-bold);
    flex-shrink: 0;
  }

  .step-item.active .step-number {
    background: var(--ds-color-primary);
    color: #fff;
  }

  .step-item.completed .step-number {
    background: var(--ds-color-success);
    color: #fff;
  }

  .step-item:not(.active):not(.completed) .step-number {
    background: var(--ds-color-border);
    color: var(--ds-color-text-secondary);
  }

  /* ── Section Title ── */
  .section-title {
    font-size: var(--ds-font-size-xlarge);
    font-weight: var(--ds-font-weight-bold);
    color: var(--ds-color-text);
    margin: 0 0 var(--ds-layout-spacing-xs) 0;
  }

  .section-subtitle {
    font-size: var(--ds-font-size-base);
    color: var(--ds-color-text-secondary);
    margin: 0 0 var(--ds-layout-spacing-lg) 0;
  }

  /* ── Card ── */
  .card {
    padding: var(--ds-layout-spacing-lg);
  }

  /* ── Placeholder ── */
  .placeholder {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    padding: var(--ds-layout-spacing-lg) 0;
    text-align: center;
    min-height: 200px;
  }

  .placeholder-icon {
    width: 48px;
    height: 48px;
    border-radius: var(--ds-border-radius-round);
    background: var(--ds-color-surface-subtle);
    display: flex;
    align-items: center;
    justify-content: center;
    margin-bottom: var(--ds-layout-spacing-md);
    color: var(--ds-color-text-secondary);
    font-size: 24px;
  }

  .placeholder-text {
    font-size: var(--ds-font-size-small);
    color: var(--ds-color-text-secondary);
    max-width: 360px;
  }

  /* ── Complete Step ── */
  .complete-icon {
    width: 64px;
    height: 64px;
    color: var(--ds-color-success);
    margin-bottom: var(--ds-layout-spacing-md);
  }

  /* ── Footer Bar ── */
  .footer-bar {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: var(--ds-layout-spacing-md) var(--ds-layout-spacing-lg);
    border-top: 1px solid var(--ds-color-border);
  }

  .footer-bar-end {
    justify-content: flex-end;
  }

  /* ── Buttons ── */
  .btn {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    gap: var(--ds-spacing-xs);
    padding: var(--ds-layout-spacing-sm) var(--ds-layout-spacing-lg);
    font-size: var(--ds-font-size-base);
    font-family: var(--ds-font-family);
    font-weight: var(--ds-font-weight-medium);
    border-radius: var(--ds-border-radius);
    border: none;
    cursor: pointer;
    transition: opacity var(--ds-transition-duration), transform 0.1s;
    line-height: var(--ds-line-height);
  }

  .btn:active {
    transform: scale(0.98);
  }

  .btn:disabled {
    opacity: 0.5;
    cursor: not-allowed;
    transform: none;
  }

  .btn-primary {
    background: var(--ds-color-primary);
    color: #fff;
  }

  .btn-primary:hover:not(:disabled) {
    opacity: 0.9;
  }

  .btn-secondary {
    background: var(--ds-color-surface-subtle);
    color: var(--ds-color-text);
    border: 1px solid var(--ds-color-border);
  }

  .btn-secondary:hover:not(:disabled) {
    background: var(--ds-color-border-subtle);
  }

  /* ── Center State (loading, error) ── */
  .center-state {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    padding: var(--ds-layout-spacing-lg) 0;
    text-align: center;
    min-height: 200px;
  }

  .center-icon {
    width: 48px;
    height: 48px;
    margin-bottom: var(--ds-layout-spacing-md);
  }

  .center-icon.error {
    color: var(--ds-color-danger);
  }

  .center-icon svg {
    width: 100%;
    height: 100%;
  }

  .center-title {
    font-size: var(--ds-font-size-xlarge);
    font-weight: var(--ds-font-weight-bold);
    color: var(--ds-color-text);
    margin-bottom: var(--ds-layout-spacing-xs);
  }

  .center-description {
    font-size: var(--ds-font-size-base);
    color: var(--ds-color-text-secondary);
    margin-bottom: var(--ds-layout-spacing-lg);
    max-width: 360px;
  }

  .center-btn {
    margin-top: var(--ds-layout-spacing-sm);
  }

  /* ── Spinner ── */
  .spinner {
    display: inline-block;
    width: var(--ds-spinner-size);
    height: var(--ds-spinner-size);
    animation: spin 1s linear infinite;
    color: var(--ds-color-primary);
    margin-bottom: var(--ds-layout-spacing-md);
  }

  .spinner svg {
    width: 100%;
    height: 100%;
  }

  @keyframes spin {
    to { transform: rotate(360deg); }
  }

  /* ── Legal Links ── */
  .legal-links {
    font-size: var(--ds-font-size-small);
    color: var(--ds-color-text-secondary);
    margin-top: var(--ds-layout-spacing-md);
    max-width: 360px;
  }

  .legal-links a {
    color: var(--ds-color-primary);
    text-decoration: none;
  }

  .legal-links a:hover {
    text-decoration: underline;
  }
`;

export class AccountOnboardingComponent extends BaseComponent {
  private static readonly ALL_STEPS: AccountOnboardingStep[] = [
    'account',
    'numbers',
    'hardware',
    'complete',
  ];

  private currentStep: AccountOnboardingStep = 'account';
  private isLoading = true;
  private loadError: string | null = null;

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

  protected initialize(): void {
    if (this.isInitialized) return;
    this.attachDelegatedClickHandler();
    this.render();
    this.isInitialized = true;
    this.loadOnboardingData();
  }

  private async loadOnboardingData(): Promise<void> {
    this.isLoading = true;
    this.loadError = null;
    this._onLoaderStart?.({ elementTagName: 'dialstack-account-onboarding' });
    this.render();

    try {
      // Placeholder for future API call (e.g. this.instance.getOnboardingState())
      await Promise.resolve();
      this.isLoading = false;
      this.render();
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : String(err);
      this.loadError = errorMessage;
      this.isLoading = false;
      this._onLoadError?.({ error: errorMessage, elementTagName: 'dialstack-account-onboarding' });
      this.render();
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

  setCollectionOptions(options: OnboardingCollectionOptions): void {
    this.collectionOptions = options;
    // Reset to first active step if current step is now excluded
    const activeSteps = this.getActiveSteps();
    if (!activeSteps.includes(this.currentStep)) {
      this.currentStep = activeSteps[0] ?? 'complete';
    }
    if (this.isInitialized) {
      this.render();
    }
  }

  setFullTermsOfServiceUrl(url: string): void {
    this.fullTermsOfServiceUrl = this.sanitizeUrl(url);
    if (this.isInitialized) {
      this.render();
    }
  }

  setRecipientTermsOfServiceUrl(url: string): void {
    this.recipientTermsOfServiceUrl = this.sanitizeUrl(url);
    if (this.isInitialized) {
      this.render();
    }
  }

  setPrivacyPolicyUrl(url: string): void {
    this.privacyPolicyUrl = this.sanitizeUrl(url);
    if (this.isInitialized) {
      this.render();
    }
  }

  private sanitizeUrl(url: string): string | null {
    try {
      const parsed = new URL(url);
      if (parsed.protocol === 'http:' || parsed.protocol === 'https:') {
        return url;
      }
    } catch {
      // invalid URL
    }
    return null;
  }

  // ============================================================================
  // Step Filtering
  // ============================================================================

  private getActiveSteps(): AccountOnboardingStep[] {
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
  // Abandonment Detection
  // ============================================================================

  protected override cleanup(): void {
    if (!this._exitFired) {
      this._exitFired = true;
      this._onExit?.();
    }
  }

  // ============================================================================
  // Navigation
  // ============================================================================

  private navigateToStep(step: AccountOnboardingStep): void {
    if (step === this.currentStep) return;
    this.currentStep = step;
    this._onStepChange?.({ step });
    this.render();
  }

  // ============================================================================
  // Render
  // ============================================================================

  // Note: All content rendered via innerHTML comes from internal i18n strings
  // (this.t()) and static SVG constants — no user-supplied data is interpolated
  // without escaping. This follows the same pattern as PhoneNumberOrderingComponent.
  protected render(): void {
    if (!this.shadowRoot) return;

    const styles = this.applyAppearanceStyles();

    let content: string;
    if (this.isLoading) {
      content = this.renderLoadingState();
    } else if (this.loadError) {
      content = this.renderErrorState();
    } else {
      switch (this.currentStep) {
        case 'account':
          content = this.renderAccountStep();
          break;
        case 'numbers':
          content = this.renderNumbersStep();
          break;
        case 'hardware':
          content = this.renderHardwareStep();
          break;
        case 'complete':
          content = this.renderCompleteStep();
          break;
        default:
          content = '';
          break;
      }
    }

    this.shadowRoot.innerHTML = `
      <style>
        ${styles}
        ${COMPONENT_STYLES}
      </style>
      <div class="container ${this.getClassNames()}" part="container"
           role="region" aria-label="${this.t('accountOnboarding.title')}">
        ${this.isLoading || this.loadError ? '' : this.renderStepBreadcrumb()}
        ${content}
      </div>
    `;
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

  private renderStepBreadcrumb(): string {
    const activeSteps = this.getActiveSteps();
    const stepLabels: Record<AccountOnboardingStep, string> = {
      account: this.t('accountOnboarding.steps.account'),
      numbers: this.t('accountOnboarding.steps.numbers'),
      hardware: this.t('accountOnboarding.steps.hardware'),
      complete: this.t('accountOnboarding.steps.complete'),
    };
    const stepDefs = activeSteps.map((key) => ({ key, label: stepLabels[key] }));

    const currentIdx = activeSteps.indexOf(this.currentStep);

    return `
      <nav class="step-breadcrumb" aria-label="${this.t('accountOnboarding.breadcrumbAriaLabel')}">
        ${stepDefs
          .map((s, i) => {
            const cls = i < currentIdx ? 'completed' : i === currentIdx ? 'active' : '';
            const numberContent = i < currentIdx ? CHECK_SVG : `${i + 1}`;
            const ariaCurrent = i === currentIdx ? ' aria-current="step"' : '';
            const clickAttr =
              i < currentIdx
                ? ` data-action="go-to-step" data-step="${s.key}" role="button" tabindex="0"`
                : '';
            const item = `
              <span class="step-item ${cls}"${ariaCurrent}${clickAttr}>
                <span class="step-number">${numberContent}</span>
                ${s.label}
              </span>`;
            const sep =
              i < stepDefs.length - 1 ? `<span class="step-separator">${CHEVRON_SVG}</span>` : '';
            return item + sep;
          })
          .join('')}
      </nav>
    `;
  }

  private renderStepFooter(): string {
    const steps = this.getActiveSteps();
    const idx = steps.indexOf(this.currentStep);
    const hasPrev = idx > 0;
    const hasNext = idx < steps.length - 1;

    if (!hasPrev && hasNext) {
      return `
        <div class="footer-bar footer-bar-end">
          <button class="btn btn-primary" data-action="next">
            ${this.t('accountOnboarding.nav.next')}
          </button>
        </div>`;
    }
    if (hasPrev && hasNext) {
      return `
        <div class="footer-bar">
          <button class="btn btn-secondary" data-action="back">
            ${this.t('accountOnboarding.nav.back')}
          </button>
          <button class="btn btn-primary" data-action="next">
            ${this.t('accountOnboarding.nav.next')}
          </button>
        </div>`;
    }
    return '';
  }

  private renderAccountStep(): string {
    const steps = this.getActiveSteps();
    const stepNum = steps.indexOf('account') + 1;
    return `
      <div class="card ${this.classes.stepAccount || ''}" part="step-account">
        <h2 class="section-title">${this.t('accountOnboarding.account.title')}</h2>
        <p class="section-subtitle">${this.t('accountOnboarding.account.subtitle')}</p>
        <div class="placeholder">
          <div class="placeholder-icon">${stepNum}</div>
          <p class="placeholder-text">${this.t('accountOnboarding.account.placeholder')}</p>
        </div>
      </div>
      ${this.renderStepFooter()}
    `;
  }

  private renderNumbersStep(): string {
    const steps = this.getActiveSteps();
    const stepNum = steps.indexOf('numbers') + 1;
    return `
      <div class="card ${this.classes.stepNumbers || ''}" part="step-numbers">
        <h2 class="section-title">${this.t('accountOnboarding.numbers.title')}</h2>
        <p class="section-subtitle">${this.t('accountOnboarding.numbers.subtitle')}</p>
        <div class="placeholder">
          <div class="placeholder-icon">${stepNum}</div>
          <p class="placeholder-text">${this.t('accountOnboarding.numbers.placeholder')}</p>
        </div>
      </div>
      ${this.renderStepFooter()}
    `;
  }

  private renderHardwareStep(): string {
    const steps = this.getActiveSteps();
    const stepNum = steps.indexOf('hardware') + 1;
    return `
      <div class="card ${this.classes.stepHardware || ''}" part="step-hardware">
        <h2 class="section-title">${this.t('accountOnboarding.hardware.title')}</h2>
        <p class="section-subtitle">${this.t('accountOnboarding.hardware.subtitle')}</p>
        <div class="placeholder">
          <div class="placeholder-icon">${stepNum}</div>
          <p class="placeholder-text">${this.t('accountOnboarding.hardware.placeholder')}</p>
        </div>
      </div>
      ${this.renderStepFooter()}
    `;
  }

  private renderCompleteStep(): string {
    return `
      <div class="card ${this.classes.stepComplete || ''}" part="step-complete">
        <div class="placeholder">
          <div class="complete-icon">${SUCCESS_SVG}</div>
          <h2 class="section-title">${this.t('accountOnboarding.complete.title')}</h2>
          <p class="section-subtitle">${this.t('accountOnboarding.complete.subtitle')}</p>
          <p class="placeholder-text">${this.t('accountOnboarding.complete.placeholder')}</p>
          ${this.renderLegalLinks()}
        </div>
      </div>
      <div class="footer-bar footer-bar-end">
        <button class="btn btn-primary" data-action="exit">
          ${this.t('accountOnboarding.nav.exit')}
        </button>
      </div>
    `;
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

    this.shadowRoot.addEventListener('keydown', (ev) => {
      const e = ev as KeyboardEvent;
      if (e.key === 'Enter' || e.key === ' ') {
        const target = e.target as HTMLElement;
        const actionEl = target.closest<HTMLElement>('[data-action]');
        if (actionEl) {
          e.preventDefault();
          actionEl.click();
        }
      }
    });

    this.shadowRoot.addEventListener('click', (e) => {
      const target = e.target as HTMLElement;
      const actionEl = target.closest<HTMLElement>('[data-action]');
      if (!actionEl) return;

      const action = actionEl.dataset.action;

      switch (action) {
        case 'next': {
          const steps = this.getActiveSteps();
          const idx = steps.indexOf(this.currentStep);
          const nextStep = steps[idx + 1];
          if (nextStep) {
            this.navigateToStep(nextStep);
          }
          break;
        }
        case 'back': {
          const steps = this.getActiveSteps();
          const idx = steps.indexOf(this.currentStep);
          const prevStep = steps[idx - 1];
          if (prevStep) {
            this.navigateToStep(prevStep);
          }
          break;
        }
        case 'go-to-step': {
          const steps = this.getActiveSteps();
          const step = actionEl.dataset.step as AccountOnboardingStep;
          if (step && steps.includes(step)) {
            this.navigateToStep(step);
          }
          break;
        }
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
