/**
 * Standalone Numbers onboarding step component.
 * Self-loads data and renders the numbers step with sidebar.
 * Internal only — not exported from the public SDK API.
 */

import type { AccountOnboardingStep } from '../../types';
import { PHONE_SVG } from './icons';
import { NumbersStepHelper } from './numbers';
import NUMBERS_STEP_STYLES from './numbers-styles.css';
import { OnboardingStepBase } from './step-base';
import type { SidebarConfig } from './step-base';

export class OnboardingNumbersStep extends OnboardingStepBase {
  private numbers = new NumbersStepHelper(this.host);

  get stepName(): AccountOnboardingStep {
    return 'numbers';
  }

  protected async loadData(): Promise<void> {
    if (!this.instance) throw new Error('Not initialized');

    const [accountData, users, extensions] = await Promise.all([
      this.instance.getAccount(),
      this.instance.listUsers(),
      this.instance.listExtensions(),
    ]);

    this._users = users ?? [];
    this._extensions = extensions ?? [];
    this._accountConfig = accountData.config ?? {};
    this._accountPhone = accountData.phone ?? '';

    // Lazy-load numbers data (DIDs, orders, port orders)
    await this.numbers.loadNumbersData();
  }

  protected renderStepContent(): string {
    return this.numbers.renderNumbersStep();
  }

  protected attachStepInputListeners(): void {
    this.numbers.attachInputListeners();
  }

  protected handleStepAction(action: string, actionEl: HTMLElement): boolean {
    return this.numbers.handleAction(action, actionEl);
  }

  override navigateToStep(_step: AccountOnboardingStep): void {
    this.isComplete = true;
    this.cleanupStep();
    this.render(); // Shows complete state with E911 "running" spinner
    this.numbers
      .tryAutoProvisionE911()
      .then(() => {
        if (!this.isDestroyed() && this.isConnected) this.render();
      })
      .catch(() => {
        /* already handled inside tryAutoProvisionE911 */
      });
  }

  protected override renderCompleteState(): string {
    return this.numbers.renderNumbersCompleteState();
  }

  protected handleNext(): void {
    this.navigateToStep('complete');
  }

  protected handleBack(): boolean {
    return false;
  }

  protected getSidebarConfig(): SidebarConfig {
    return {
      title: this.t('accountOnboarding.steps.numbers'),
      icon: PHONE_SVG,
      subSteps: [
        {
          key: 'options',
          label: this.t('accountOnboarding.sidebar.numberOptions'),
          description: this.t('accountOnboarding.sidebar.numberOptionsDesc'),
        },
        {
          key: 'primary-did',
          label: this.t('accountOnboarding.sidebar.primaryNumber'),
          description: this.t('accountOnboarding.sidebar.primaryNumberDesc'),
        },
        {
          key: 'caller-id',
          label: this.t('accountOnboarding.sidebar.callerId'),
          description: this.t('accountOnboarding.sidebar.callerIdDesc'),
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
      ],
      activeKey: this.numbers.getSidebarActiveKey(),
    };
  }

  protected getStepStyles(): string {
    return NUMBERS_STEP_STYLES;
  }

  protected override cleanupStep(): void {
    this.numbers.numStopOrderPoll();
  }
}

// Register the custom element (internal only)
if (typeof window !== 'undefined' && !customElements.get('dialstack-onboarding-numbers')) {
  customElements.define('dialstack-onboarding-numbers', OnboardingNumbersStep);
}
