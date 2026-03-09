/**
 * Account Onboarding Web Component - Multi-step onboarding wizard
 *
 * This is the orchestrator component. Step-specific logic lives in helpers:
 * - AccountStepHelper (account-onboarding-account.ts)
 * - NumbersStepHelper (account-onboarding-numbers.ts)
 * - HardwareStepHelper (account-onboarding-hardware.ts)
 */

import { BaseComponent } from '../base-component';
import type {
  AccountOnboardingStep,
  AccountOnboardingClasses,
  AccountConfig,
  OnboardingCollectionOptions,
  OnboardingUser,
  ProvisionedDevice,
  DECTBase,
} from '../../types';
import type { Extension } from '../../types/dial-plan';
import { parsePhoneNumberFromString } from 'libphonenumber-js';
import { COMPONENT_STYLES } from './styles';
import { CHECK_SVG, ERROR_SVG, BUILDING_SVG, PHONE_SVG, MONITOR_SVG, LOCATION_SVG } from './icons';
import type { OnboardingHost } from './host';
import { AccountStepHelper } from './account';
import { NumbersStepHelper } from './numbers';
import { HardwareStepHelper } from './hardware';

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

  // Shared state
  private _users: OnboardingUser[] = [];
  private _extensions: Extension[] = [];
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

  // Step helpers (cast needed: BaseComponent marks instance/shadowRoot as protected,
  // but helpers access them via the OnboardingHost interface)
  private readonly host: OnboardingHost = this as unknown as OnboardingHost;
  private account = new AccountStepHelper(this.host);
  private numbers = new NumbersStepHelper(this.host);
  private hardware = new HardwareStepHelper(this.host);

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
    return String(next);
  }

  renderStepFooter(): string {
    const steps = this.getActiveSteps();
    const idx = steps.indexOf(this.currentStep);
    const hasPrev = idx > 0;
    const hasNext = idx < steps.length - 1;

    if (!hasPrev && hasNext) {
      return `
        <div class="footer-bar footer-bar-end">
          <button class="btn btn-primary" data-action="next">
            ${this.t('accountOnboarding.nav.next')} &rarr;
          </button>
        </div>`;
    }
    if (hasPrev && hasNext) {
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
    return '';
  }

  // ============================================================================
  // Lifecycle
  // ============================================================================

  override connectedCallback(): void {
    this._exitFired = false;
    super.connectedCallback();
  }

  protected initialize(): void {
    if (this.isInitialized) return;
    this.attachDelegatedClickHandler();
    this.render();
    this.isInitialized = true;
    this.loadOnboardingData();
  }

  protected override cleanup(): void {
    this.numbers.numStopOrderPoll();
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

      const [accountData, users, extensions, locations, devicesResult, dectBasesResult] =
        await Promise.all([
          this.instance.getAccount(),
          this.instance.listUsers(),
          this.instance.listExtensions(),
          this.instance.listLocations(),
          this.instance.listDevices().catch(() => [] as ProvisionedDevice[]),
          this.instance.listDECTBases().catch(() => [] as DECTBase[]),
        ]);

      // Populate shared state
      this._users = users ?? [];
      this._extensions = extensions ?? [];
      this._accountConfig = accountData.config ?? {};

      // Populate account helper
      this.account.accountEmail = accountData.email ?? '';
      this.account.accountName = accountData.name ?? '';
      const phoneRaw = accountData.phone ?? '';
      const phoneParsed = phoneRaw ? parsePhoneNumberFromString(phoneRaw, 'US') : null;
      this.account.accountPhone = phoneParsed ? phoneParsed.formatNational() : phoneRaw;
      this.account.accountPrimaryContact = accountData.primary_contact_name ?? '';
      this.account.accountTimezone = accountData.config?.timezone ?? '';
      this.account.resetNewUserExtension();

      // Populate hardware helper
      this.hardware.devices = devicesResult ?? [];
      this.hardware.dectBases = dectBasesResult ?? [];

      if (locations.length > 0) {
        const loc = locations[0]!;
        this.account.existingLocation = loc;
        this.account.locationName = loc.name;
        this.account.addressMode = 'confirmed';
        if (loc.address) {
          this.account.manualAddress = {
            addressNumber: loc.address.address_number ?? '',
            street: loc.address.street ?? '',
            city: loc.address.city ?? '',
            state: loc.address.state ?? '',
            postalCode: loc.address.postal_code ?? '',
          };
        }
      }

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
    if (this.currentStep === 'account') {
      this.account.accountSubStep = 'business-details';
    }
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

    // Lazy-load numbers data
    if (step === 'numbers' && !this.numbers.hasLoadedNumbers()) {
      this.numbers.loadNumbersData();
    }

    // Lazy-load hardware data
    if (step === 'hardware' && this.hardware.userEndpointMap.size === 0) {
      this.hardware.loadHardwareData();
    }
  }

  // ============================================================================
  // Render
  // ============================================================================

  // Note: All content rendered via innerHTML comes from internal i18n strings
  // (this.t()) and static SVG constants — no user-supplied data is interpolated
  // without escaping. User-supplied data (emails, names, addresses) is escaped
  // via this.escapeHtml(). The address dropdown uses safe DOM APIs (textContent,
  // createElement) instead of innerHTML.
  protected render(): void {
    if (!this.shadowRoot) return;

    const styles = this.applyAppearanceStyles();

    let content: string;
    if (this.isLoading) {
      content = this.renderLoadingState();
    } else if (this.loadError) {
      content = this.renderErrorState();
    } else if (this.currentStep === 'complete') {
      content = this.renderCompleteStep();
    } else {
      const renderStepContent = (step: AccountOnboardingStep): string => {
        switch (step) {
          case 'account':
            return this.account.renderAccountStep();
          case 'numbers':
            return this.numbers.renderNumbersStep();
          case 'hardware':
            return this.hardware.renderHardwareStep();
          default:
            return '';
        }
      };

      content = `
        <div class="step-layout">
          ${this.renderStepSidebar()}
          <div class="step-content">
            ${renderStepContent(this.currentStep)}
          </div>
        </div>`;
    }

    // Note: All content rendered via innerHTML comes from internal i18n strings
    // and static SVG constants — user-supplied data is escaped via escapeHtml().
    this.shadowRoot.innerHTML = `
      <style>
        ${styles}
        ${COMPONENT_STYLES}
      </style>
      <div class="container ${this.getClassNames()}" part="container"
           role="region" aria-label="${this.t('accountOnboarding.title')}">
        ${content}
      </div>
    `;

    if (!this.isLoading && !this.loadError) {
      if (this.currentStep === 'account') {
        this.account.attachInputListeners();
      } else if (this.currentStep === 'numbers') {
        this.numbers.attachInputListeners();
      } else if (this.currentStep === 'hardware') {
        this.hardware.attachInputListeners();
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

  private renderStepSidebar(): string {
    type SidebarSubStep = { key: string; label: string; description?: string };
    let title: string;
    let icon: string;
    let subSteps: SidebarSubStep[];
    let activeKey: string | null;

    switch (this.currentStep) {
      case 'account':
        title = this.t('accountOnboarding.steps.account');
        icon = BUILDING_SVG;
        subSteps = [
          {
            key: 'business-details',
            label: this.t('accountOnboarding.sidebar.businessDetails'),
            description: this.t('accountOnboarding.sidebar.businessDetailsDesc'),
          },
          {
            key: 'team-members',
            label: this.t('accountOnboarding.sidebar.teamMembers'),
            description: this.t('accountOnboarding.sidebar.teamMembersDesc'),
          },
        ];
        activeKey = this.account.accountSubStep;
        break;
      case 'numbers':
        title = this.t('accountOnboarding.steps.numbers');
        icon = PHONE_SVG;
        subSteps = [
          {
            key: 'options',
            label: this.t('accountOnboarding.sidebar.numberOptions'),
            description: this.t('accountOnboarding.sidebar.numberOptionsDesc'),
          },
          {
            key: 'setup',
            label: this.t('accountOnboarding.sidebar.numberSetup'),
            description: this.t('accountOnboarding.sidebar.numberSetupDesc'),
          },
          {
            key: 'verification',
            label: this.t('accountOnboarding.sidebar.verification'),
            description: this.t('accountOnboarding.sidebar.verificationDesc'),
          },
        ];
        activeKey = this.numbers.getSidebarActiveKey();
        break;
      case 'hardware':
        title = this.t('accountOnboarding.steps.hardware');
        icon = MONITOR_SVG;
        subSteps = [
          {
            key: 'device-assignment',
            label: this.t('accountOnboarding.sidebar.deviceAssignment'),
            description: this.t('accountOnboarding.sidebar.deviceAssignmentDesc'),
          },
          {
            key: 'final-completion',
            label: this.t('accountOnboarding.sidebar.finalCompletion'),
            description: this.t('accountOnboarding.sidebar.finalCompletionDesc'),
          },
        ];
        activeKey = 'device-assignment';
        break;
      default:
        return '';
    }

    const activeIdx =
      activeKey != null ? subSteps.findIndex((s) => s.key === activeKey) : subSteps.length;
    const timelineItems = subSteps
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

    // Shipping address section for hardware step
    let sidebarExtra = '';
    if (this.currentStep === 'hardware' && this.account.existingLocation?.address) {
      const addr = this.account.existingLocation.address;
      const streetLine = [addr.address_number, addr.street].filter(Boolean).join(' ');
      const regionPart = [addr.state, addr.postal_code].filter(Boolean).join(' ');
      const cityLine = [addr.city, regionPart].filter(Boolean).join(', ');
      sidebarExtra = `
        <div class="sidebar-section">
          <div class="sidebar-section-header">
            <div class="sidebar-section-icon">${LOCATION_SVG}</div>
            <span class="sidebar-section-title">${this.t('accountOnboarding.hardware.shippingAddress')}</span>
          </div>
          <div class="sidebar-section-text">
            ${streetLine ? `${this.escapeHtml(streetLine)}<br>` : ''}
            ${this.account.locationName ? `${this.escapeHtml(this.account.locationName)}<br>` : ''}
            ${cityLine ? this.escapeHtml(cityLine) : ''}
          </div>
        </div>`;
    }

    return `
      <aside class="step-sidebar" aria-label="${title}">
        <div class="step-sidebar-header">
          <div class="step-sidebar-icon">${icon}</div>
          <span class="step-sidebar-title">${title}</span>
        </div>
        <div class="step-timeline">
          ${timelineItems}
        </div>
        ${sidebarExtra}
      </aside>
    `;
  }

  private renderCompleteStep(): string {
    // Generate confetti pieces with varied positions, colors, delays
    const confettiColors = [
      '#e91e63',
      '#9c27b0',
      '#2196f3',
      '#4caf50',
      '#ff9800',
      '#ffeb3b',
      '#00bcd4',
      '#ff5722',
    ];
    const confettiPieces = Array.from({ length: 40 }, (_, i) => {
      const color = confettiColors[i % confettiColors.length];
      const left = Math.round((i * 2.5 + Math.random() * 2) % 100);
      const delay = (Math.random() * 2).toFixed(1);
      const rotation = Math.round(Math.random() * 360);
      const size = 8 + Math.round(Math.random() * 8);
      return `<div class="confetti-piece" style="left:${left}%;top:${Math.round(Math.random() * 30)}%;background:${color};animation-delay:${delay}s;width:${size}px;height:${size}px;transform:rotate(${rotation}deg)"></div>`;
    }).join('');

    return `
      <div class="${this.classes.stepComplete || ''}" part="step-complete">
        <div class="confetti-container">
          ${confettiPieces}
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

      const action = actionEl.dataset.action!;

      // Delegate to step helpers first
      if (this.account.handleAction(action, actionEl)) return;
      if (this.numbers.handleAction(action, actionEl)) return;
      if (this.hardware.handleAction(action, actionEl)) return;

      // Shared actions
      switch (action) {
        case 'next': {
          if (this.currentStep === 'account') {
            this.account.handleNext();
          } else {
            const steps = this.getActiveSteps();
            const idx = steps.indexOf(this.currentStep);
            const nextStep = steps[idx + 1];
            if (nextStep) {
              this.navigateToStep(nextStep);
            }
          }
          break;
        }
        case 'back': {
          if (this.currentStep === 'account') {
            if (!this.account.handleBack()) {
              const steps = this.getActiveSteps();
              const idx = steps.indexOf(this.currentStep);
              const prevStep = steps[idx - 1];
              if (prevStep) {
                this.navigateToStep(prevStep);
              }
            }
          } else {
            const steps = this.getActiveSteps();
            const idx = steps.indexOf(this.currentStep);
            const prevStep = steps[idx - 1];
            if (prevStep) {
              this.navigateToStep(prevStep);
            }
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
