/**
 * Abstract base for standalone onboarding step components.
 * Extends BaseComponent and implements OnboardingHost so existing step helpers
 * can be used unchanged.
 */

import { BaseComponent } from '../base-component';
import type {
  AccountOnboardingStep,
  AccountOnboardingClasses,
  AccountConfig,
  OnboardingUser,
} from '../../types';
import type { Extension } from '../../types/dial-plan';
import COMPONENT_STYLES from './styles.css';
import { CHECK_SVG, CHECK_SVG_WHITE, ERROR_SVG } from './icons';
import type { OnboardingHost } from './host';
import { SIDEBAR_GROUPS, type StepName, type SidebarGroup } from './constants';
import type { OnboardingProgressStore } from './progress-store';

export interface SidebarConfig {
  title: string;
  icon: string;
  subSteps: { key: string; label: string; description?: string }[];
  activeKey: string | null;
  /** Optional extra HTML appended after the timeline (e.g. shipping address). */
  extra?: string;
}

export abstract class OnboardingStepBase extends BaseComponent {
  // Shared state (OnboardingHost)
  protected _users: OnboardingUser[] = [];
  protected _extensions: Extension[] = [];
  protected _accountConfig: AccountConfig = {};
  protected _accountPhone = '';

  protected isLoading = true;
  protected loadError: string | null = null;
  protected isComplete = false;
  protected override classes: AccountOnboardingClasses = {};

  // Callbacks
  private _onComplete?: () => void;
  protected _onBack?: () => void;
  private _onRender?: () => void;
  private _onSubStepChange?: (substep: string) => void;

  // Pending substep restore (set before loadData, applied after)
  private _pendingSubStep?: string;

  // Progress store (shared with wizard and portal)
  protected _progressStore: OnboardingProgressStore | null = null;

  // Back button visibility (controlled by wizard when embedded)
  private _showBack = false;

  // Platform name for white-labeling
  private _platformName: string | undefined;

  // Host reference for passing to helpers (same pattern as orchestrator)
  protected readonly host: OnboardingHost = this as unknown as OnboardingHost;

  // ============================================================================
  // OnboardingHost interface
  // ============================================================================

  get users(): OnboardingUser[] {
    return this._users;
  }

  get extensions(): Extension[] {
    return this._extensions;
  }

  get accountConfig(): AccountConfig {
    return this._accountConfig;
  }

  get currentStep(): AccountOnboardingStep {
    return this.stepName;
  }

  get accountPhone(): string {
    return this._accountPhone;
  }

  setUsers(users: OnboardingUser[]): void {
    this._users = users;
  }

  setExtensions(extensions: Extension[]): void {
    this._extensions = extensions;
  }

  getExtensionForUser(userId: string): Extension | undefined {
    return this._extensions.find((ext) => ext.target === userId);
  }

  getNextExtensionNumber(): string {
    const configuredLength = this._accountConfig.extension_length;
    const length =
      typeof configuredLength === 'number' &&
      Number.isInteger(configuredLength) &&
      configuredLength > 0
        ? configuredLength
        : 4;
    const base = Math.pow(10, length - 1) + 1;
    const max = Math.pow(10, length) - 1;
    const existing = new Set(this._extensions.map((ext) => ext.number));
    let next = base;
    while (existing.has(String(next)) && next <= max) {
      next += 1;
    }
    return next <= max ? String(next) : String(base);
  }

  navigateToStep(_step: AccountOnboardingStep): void {
    this.isComplete = true;
    this.cleanupStep();
    this.notifySubStepChange('complete');
    this.render();
  }

  getActiveSteps(): AccountOnboardingStep[] {
    return [this.stepName, 'final_complete'];
  }

  notifySubStepChange(substep: string): void {
    this._onSubStepChange?.(substep);
  }

  removeSubSteps(substeps: string[]): void {
    this._progressStore?.removeSubSteps(this.stepName as StepName, substeps);
  }

  renderStepFooter(): string {
    if (this._showBack) {
      return `
        <div class="footer-bar">
          <button class="btn btn-ghost" data-action="back">
            &larr; ${this.t('accountOnboarding.nav.back')}
          </button>
          <button class="btn btn-primary" data-action="next">
            ${this.t('accountOnboarding.nav.next')} &rarr;
          </button>
        </div>`;
    }
    return `
      <div class="footer-bar footer-bar-end">
        <button class="btn btn-primary" data-action="next">
          ${this.t('accountOnboarding.nav.next')} &rarr;
        </button>
      </div>`;
  }

  // ============================================================================
  // Public setters
  // ============================================================================

  getProgress(): { activeIndex: number; totalSubSteps: number } {
    const config = this.getSidebarConfig();
    if (this.isComplete) {
      return { activeIndex: config.subSteps.length, totalSubSteps: config.subSteps.length };
    }
    const idx =
      config.activeKey != null
        ? config.subSteps.findIndex((s) => s.key === config.activeKey)
        : config.subSteps.length;
    return { activeIndex: idx < 0 ? 0 : idx, totalSubSteps: config.subSteps.length };
  }

  setOnSubStepChange(cb: ((substep: string) => void) | undefined): void {
    this._onSubStepChange = cb;
  }

  setProgressStore(store: OnboardingProgressStore): void {
    this._progressStore = store;
    // Register sidebar mapping so the store can derive progress
    store.registerSidebarMapping(this.stepName as StepName, this.getSidebarGroups());
  }

  setPendingSubStep(substep: string): void {
    this._pendingSubStep = substep;
  }

  setOnRender(cb: (() => void) | undefined): void {
    this._onRender = cb;
  }

  setOnComplete(cb: (() => void) | undefined): void {
    this._onComplete = cb;
  }

  setOnBack(cb: () => void): void {
    this._onBack = cb;
  }

  setShowBack(show: boolean): void {
    this._showBack = show;
    if (this.isInitialized) {
      this.render();
    }
  }

  setPlatformName(name: string | undefined): void {
    this._platformName = name;
    if (this.isInitialized) this.render();
  }

  protected override t(key: string, params?: Record<string, string | number>): string {
    const merged = { platformName: this._platformName ?? 'DialStack', ...params };
    return super.t(key, merged);
  }

  override setClasses(classes: AccountOnboardingClasses): void {
    this.classes = { ...this.classes, ...classes };
    if (this.isInitialized) {
      this.render();
    }
  }

  /**
   * Re-run loadData() and re-render without the initial loading spinner.
   * Used by the wizard to refresh stale data when navigating to a cached step.
   */
  async refreshData(): Promise<void> {
    if (!this.instance) return;
    await this.loadData();
    this.render();
  }

  // ============================================================================
  // Lifecycle
  // ============================================================================

  protected initialize(): void {
    if (this.isInitialized) return;
    this.attachDelegatedClickHandler();
    this.render();
    this.isInitialized = true;
    this.runLoadData();
  }

  protected override cleanup(): void {
    this.cleanupStep();
  }

  private async runLoadData(): Promise<void> {
    this.isLoading = true;
    this.loadError = null;
    this._onLoaderStart?.({ elementTagName: `dialstack-onboarding-${this.stepName}` });
    this.render();

    try {
      if (!this.instance) throw new Error('Not initialized');
      await this.loadData();
      if (this._pendingSubStep) {
        if (this._pendingSubStep === 'complete') {
          this.isComplete = true;
        } else {
          this.restoreSubStep(this._pendingSubStep);
        }
        this._pendingSubStep = undefined;
      }
      this.isLoading = false;
      this.render();
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : String(err);
      this.loadError = errorMessage;
      this.isLoading = false;
      this._onLoadError?.({
        error: errorMessage,
        elementTagName: `dialstack-onboarding-${this.stepName}`,
      });
      this.render();
    }
  }

  // ============================================================================
  // Render
  // ============================================================================

  // Note: All content rendered via innerHTML comes from internal i18n strings
  // (this.t()) and static SVG constants — no user-supplied data is interpolated
  // without escaping. User-supplied data is escaped via this.escapeHtml().
  protected render(): void {
    if (!this.shadowRoot) return;

    const styles = this.applyAppearanceStyles();

    let content: string;
    if (this.isLoading) {
      content = this.renderLoadingState();
    } else if (this.loadError) {
      content = this.renderErrorState();
    } else {
      content = `
        <div class="step-layout">
          ${this.renderSidebar()}
          <div class="step-content">
            ${this.isComplete ? this.renderCompleteState() : this.renderStepContent()}
          </div>
        </div>`;
    }

    // Note: innerHTML is safe here — all content comes from internal i18n
    // strings and static SVG constants. User data is escaped via escapeHtml().
    this.shadowRoot.innerHTML = `
      <style>
        ${styles}
        ${COMPONENT_STYLES}
        ${this.getStepStyles()}
      </style>
      <div class="container ${this.getClassNames()}" part="container"
           role="region" aria-label="${this.t('accountOnboarding.title')}">
        ${content}
      </div>
    `;

    if (!this.isLoading && !this.loadError && !this.isComplete) {
      this.attachStepInputListeners();
    }

    this._onRender?.();
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

  protected renderCompleteState(): string {
    const stepLabel = this.t(`accountOnboarding.steps.${this.stepName}`);
    return `
      <div class="card" part="step-complete">
        <div class="placeholder" style="min-height:200px">
          <div class="complete-icon-circle">${CHECK_SVG_WHITE}</div>
          <h2 class="section-title">${this.t('accountOnboarding.stepComplete.title', { stepName: stepLabel })}</h2>
          <button class="btn btn-primary" data-action="done" style="margin-top:var(--ds-layout-spacing-lg)">
            ${this.t('accountOnboarding.stepComplete.done')}
          </button>
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

  protected renderSidebar(): string {
    const config = this.getSidebarConfig();
    // When complete, mark all sub-steps as finished
    const effectiveKey = this.isComplete ? null : config.activeKey;
    const activeIdx =
      effectiveKey != null
        ? config.subSteps.findIndex((s) => s.key === effectiveKey)
        : config.subSteps.length;

    const timelineItems = config.subSteps
      .map((s, i) => {
        const status = i < activeIdx ? 'completed' : i === activeIdx ? 'active' : '';
        const dotContent = i < activeIdx ? CHECK_SVG : '';
        return `
          <div class="step-timeline-item ${status}">
            <div class="step-timeline-dot">${dotContent}</div>
            <div class="step-timeline-text">
              <span class="step-timeline-label">${s.label}</span>
              ${s.description ? `<span class="step-timeline-desc">${s.description}</span>` : ''}
            </div>
          </div>`;
      })
      .join('');

    return `
      <aside class="step-sidebar" aria-label="${config.title}">
        <div class="step-sidebar-header">
          <div class="step-sidebar-icon">${config.icon}</div>
          <span class="step-sidebar-title">${config.title}</span>
        </div>
        <div class="step-timeline">
          ${timelineItems}
        </div>
        ${config.extra ?? ''}
      </aside>
    `;
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

      const action = actionEl.dataset.action!;

      // Delegate to step-specific handler first
      if (this.handleStepAction(action, actionEl)) return;

      // Shared actions
      switch (action) {
        case 'next':
          this.handleNext();
          break;
        case 'back':
          if (!this.handleBack()) {
            this._onBack?.();
          }
          break;
        case 'retry':
          this.runLoadData();
          break;
        case 'done':
          this._onComplete?.();
          break;
      }
    });
  }

  // ============================================================================
  // Abstract methods for subclasses
  // ============================================================================

  abstract get stepName(): AccountOnboardingStep;
  protected abstract loadData(): Promise<void>;
  protected abstract renderStepContent(): string;
  protected abstract attachStepInputListeners(): void;
  protected abstract handleStepAction(action: string, el: HTMLElement): boolean;
  protected abstract handleNext(): void;
  protected abstract handleBack(): boolean;
  protected abstract getSidebarConfig(): SidebarConfig;
  protected abstract getStepStyles(): string;
  /**
   * Return sidebar group mappings for this step.
   * Used by the progress store to derive completion percentages.
   */
  protected getSidebarGroups(): SidebarGroup[] {
    return SIDEBAR_GROUPS[this.stepName as StepName] ?? [];
  }

  /** Reset to content view for review (keeps progress store completion intact). */
  enterReviewMode(): void {
    if (!this.isComplete) return;
    this.isComplete = false;
    this.resetToFirstSubStep();
  }

  /** Override in subclasses to reset substep position to the beginning. */
  protected resetToFirstSubStep(): void {
    // Default: no-op (step has no substep navigation)
  }

  protected restoreSubStep(_substep: string): void {
    // Override in subclasses to restore substep position on reload
  }

  protected cleanupStep(): void {
    // Override in subclasses if needed
  }
}
