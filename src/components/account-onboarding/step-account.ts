/**
 * Standalone Account onboarding step component.
 * Self-loads data and renders the account step with sidebar.
 * Internal only — not exported from the public SDK API.
 */

import type { AccountOnboardingStep } from '../../types';
import { parsePhoneNumberFromString } from 'libphonenumber-js';
import { BUILDING_SVG } from './icons';
import { AccountStepHelper } from './account';
import ACCOUNT_STEP_STYLES from './account-styles.css';
import { OnboardingStepBase } from './step-base';
import type { SidebarConfig } from './step-base';

export class OnboardingAccountStep extends OnboardingStepBase {
  private account = new AccountStepHelper(this.host);

  get stepName(): AccountOnboardingStep {
    return 'account';
  }

  protected async loadData(): Promise<void> {
    if (!this.instance) throw new Error('Not initialized');

    const [accountData, users, extensions, locations] = await Promise.all([
      this.instance.getAccount(),
      this.instance.listUsers(),
      this.instance.listExtensions(),
      this.instance.listLocations(),
    ]);

    // Populate shared state
    this._users = users ?? [];
    this._extensions = extensions ?? [];
    this._accountConfig = accountData.config ?? {};

    // Populate helper fields
    this.account.accountEmail = accountData.email ?? '';
    this.account.accountName = accountData.name ?? '';
    const phoneRaw = accountData.phone ?? '';
    const phoneParsed = phoneRaw ? parsePhoneNumberFromString(phoneRaw, 'US') : null;
    this.account.accountPhone = phoneParsed ? phoneParsed.formatNational() : phoneRaw;
    this.account.accountPrimaryContact = accountData.primary_contact_name ?? '';
    this.account.accountTimezone = accountData.config?.timezone ?? '';
    this.account.resetNewUserExtension();

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
  }

  protected renderStepContent(): string {
    return this.account.renderAccountStep();
  }

  protected attachStepInputListeners(): void {
    this.account.attachInputListeners();
  }

  protected handleStepAction(action: string, actionEl: HTMLElement): boolean {
    return this.account.handleAction(action, actionEl);
  }

  protected handleNext(): void {
    this.account.handleNext();
  }

  protected handleBack(): boolean {
    return this.account.handleBack();
  }

  protected getSidebarConfig(): SidebarConfig {
    return {
      title: this.t('accountOnboarding.steps.account'),
      icon: BUILDING_SVG,
      subSteps: [
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
      ],
      activeKey: this.account.accountSubStep,
    };
  }

  protected getStepStyles(): string {
    return ACCOUNT_STEP_STYLES;
  }
}

// Register the custom element (internal only)
if (typeof window !== 'undefined' && !customElements.get('dialstack-onboarding-account')) {
  customElements.define('dialstack-onboarding-account', OnboardingAccountStep);
}
