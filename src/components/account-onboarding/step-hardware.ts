/**
 * Standalone Hardware onboarding step component.
 * Self-loads data and renders the hardware step with sidebar.
 * Internal only — not exported from the public SDK API.
 */

import type { AccountOnboardingStep, OnboardingLocation, Device, DECTBase } from '../../types';
import { MONITOR_SVG, LOCATION_SVG } from './icons';
import { HardwareStepHelper } from './hardware';
import HARDWARE_STEP_STYLES from './hardware-styles.css';
import { OnboardingStepBase } from './step-base';
import type { SidebarConfig } from './step-base';

export class OnboardingHardwareStep extends OnboardingStepBase {
  private hardware = new HardwareStepHelper(this.host);
  private location: OnboardingLocation | null = null;

  get stepName(): AccountOnboardingStep {
    return 'hardware';
  }

  protected async loadData(): Promise<void> {
    if (!this.instance) throw new Error('Not initialized');

    const [accountData, users, extensions, devicesResult, dectBasesResult, locations] =
      await Promise.all([
        this.instance.getAccount(),
        this.instance.listUsers(),
        this.instance.listExtensions(),
        this.instance.listDevices({ type: 'deskphone' }).catch(() => [] as Device[]),
        this.instance.listDECTBases().catch(() => [] as DECTBase[]),
        this.instance.listLocations(),
      ]);

    this._users = users ?? [];
    this._extensions = extensions ?? [];
    this._accountConfig = accountData.config ?? {};

    this.hardware.devices = devicesResult ?? [];
    this.hardware.dectBases = dectBasesResult ?? [];

    if (locations.length > 0) {
      this.location = locations[0]!;
    }

    // Hydrate endpoints, handsets, device lines
    await this.hardware.loadHardwareData();
  }

  protected renderStepContent(): string {
    return this.hardware.renderHardwareStep();
  }

  protected attachStepInputListeners(): void {
    this.hardware.attachInputListeners();
  }

  protected handleStepAction(action: string, actionEl: HTMLElement): boolean {
    return this.hardware.handleAction(action, actionEl);
  }

  protected handleNext(): void {
    this.navigateToStep('complete');
  }

  protected handleBack(): boolean {
    return false;
  }

  protected getSidebarConfig(): SidebarConfig {
    let extra = '';
    if (this.location?.address) {
      const addr = this.location.address;
      const streetLine = [addr.address_number, addr.street].filter(Boolean).join(' ');
      const regionPart = [addr.state, addr.postal_code].filter(Boolean).join(' ');
      const cityLine = [addr.city, regionPart].filter(Boolean).join(', ');
      extra = `
        <div class="sidebar-section">
          <div class="sidebar-section-header">
            <div class="sidebar-section-icon">${LOCATION_SVG}</div>
            <span class="sidebar-section-title">${this.t('accountOnboarding.hardware.shippingAddress')}</span>
          </div>
          <div class="sidebar-section-text">
            ${streetLine ? `${this.escapeHtml(streetLine)}<br>` : ''}
            ${this.location.name ? `${this.escapeHtml(this.location.name)}<br>` : ''}
            ${cityLine ? this.escapeHtml(cityLine) : ''}
          </div>
        </div>`;
    }

    return {
      title: this.t('accountOnboarding.steps.hardware'),
      icon: MONITOR_SVG,
      subSteps: [
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
      ],
      activeKey: 'device-assignment',
      extra,
    };
  }

  protected getStepStyles(): string {
    return HARDWARE_STEP_STYLES;
  }
}

// Register the custom element (internal only)
if (typeof window !== 'undefined' && !customElements.get('dialstack-onboarding-hardware')) {
  customElements.define('dialstack-onboarding-hardware', OnboardingHardwareStep);
}
