/**
 * Account step helper — owns all state and logic for business details, address, and team members.
 */

import type { AddressSuggestion, ResolvedAddress, OnboardingLocation } from '../../types';
import { AsYouType, parsePhoneNumberFromString } from 'libphonenumber-js';
import { debounce } from '../../utils/debounce';
import { US_STATES } from '../../constants/us-states';
import { US_TIMEZONES } from '../../constants/us-timezones';
import { CHECK_CIRCLE_SVG, TRASH_SVG } from './icons';
import type { OnboardingHost } from './host';

export type AccountSubStep = 'business-details' | 'team-members';

export class AccountStepHelper {
  accountSubStep: AccountSubStep = 'business-details';

  // Account state
  accountEmail = '';
  accountName = '';
  accountPhone = '';
  accountPrimaryContact = '';
  accountTimezone = '';

  // Location state
  locationName = '';
  addressMode: 'search' | 'confirmed' | 'edit' = 'search';
  private addressQuery = '';
  private addressSuggestions: AddressSuggestion[] = [];
  private resolvedAddress: ResolvedAddress | null = null;
  private isLoadingSuggestions = false;
  private addressDropdownOpen = false;
  private highlightedSuggestionIndex = -1;
  private addressSearchVersion = 0;
  existingLocation: OnboardingLocation | null = null;
  editingLocationId: string | null = null;
  manualAddress = {
    addressNumber: '',
    street: '',
    city: '',
    state: '',
    postalCode: '',
  };
  private locationValidationErrors: Record<string, string> = {};

  // User editing state
  private newUserName = '';
  private newUserEmail = '';
  private newUserExtension = '';
  private isAddingUser = false;
  private userError: string | null = null;

  // Save state
  private isSavingAccount = false;
  private accountSaveError: string | null = null;
  private accountValidationErrors: Record<string, string> = {};

  // Debounced address search
  private debouncedSuggestAddresses = debounce((query: string) => {
    this.fetchAddressSuggestions(query);
  }, 300);

  constructor(private host: OnboardingHost) {}

  /** Set the initial extension number after data load. */
  resetNewUserExtension(): void {
    this.newUserExtension = this.host.getNextExtensionNumber();
  }

  // ============================================================================
  // Address Helpers
  // ============================================================================

  private async fetchAddressSuggestions(query: string): Promise<void> {
    if (!this.host.instance || query.length < 3) {
      ++this.addressSearchVersion;
      this.addressSuggestions = [];
      this.addressDropdownOpen = false;
      this.renderAddressDropdown();
      return;
    }

    const version = ++this.addressSearchVersion;
    this.isLoadingSuggestions = true;
    this.renderAddressDropdown();

    try {
      const results = await this.host.instance.suggestAddresses(query, 'US');
      if (version !== this.addressSearchVersion) return;
      this.addressSuggestions = results;
      this.addressDropdownOpen = true;
      this.highlightedSuggestionIndex = -1;
    } catch {
      if (version !== this.addressSearchVersion) return;
      this.addressSuggestions = [];
      this.addressDropdownOpen = false;
    } finally {
      if (version === this.addressSearchVersion) {
        this.isLoadingSuggestions = false;
        this.renderAddressDropdown();
      }
    }
  }

  private renderAddressDropdown(): void {
    if (!this.host.shadowRoot) return;
    const dropdown = this.host.shadowRoot.querySelector('.address-dropdown') as HTMLElement | null;
    if (!dropdown) return;

    if (this.isLoadingSuggestions) {
      dropdown.textContent = '';
      const msg = document.createElement('div');
      msg.className = 'address-no-results';
      msg.textContent = this.host.t('accountOnboarding.account.location.searching');
      dropdown.appendChild(msg);
      dropdown.style.display = 'block';
      return;
    }

    if (!this.addressDropdownOpen) {
      dropdown.style.display = 'none';
      return;
    }

    if (this.addressSuggestions.length === 0) {
      if (this.addressQuery.length >= 3 && !this.isLoadingSuggestions) {
        dropdown.textContent = '';
        const msg = document.createElement('div');
        msg.className = 'address-no-results';
        msg.textContent = this.host.t('accountOnboarding.account.location.noResults');
        dropdown.appendChild(msg);
        dropdown.style.display = 'block';
      } else {
        dropdown.style.display = 'none';
      }
      return;
    }

    dropdown.textContent = '';
    this.addressSuggestions.forEach((s, i) => {
      const item = document.createElement('div');
      item.className =
        'address-suggestion' + (i === this.highlightedSuggestionIndex ? ' highlighted' : '');
      item.dataset.action = 'select-suggestion';
      item.dataset.placeId = s.place_id;
      item.dataset.index = String(i);

      const title = document.createElement('div');
      title.className = 'address-suggestion-title';
      title.textContent = s.title;
      item.appendChild(title);

      const detail = document.createElement('div');
      detail.className = 'address-suggestion-detail';
      detail.textContent = s.formatted_address;
      item.appendChild(detail);

      dropdown.appendChild(item);
    });
    dropdown.style.display = 'block';
  }

  private async handleSelectSuggestion(placeId: string): Promise<void> {
    if (!this.host.instance) return;

    this.addressDropdownOpen = false;
    this.host.render();

    try {
      this.resolvedAddress = await this.host.instance.getPlaceDetails(placeId);
      this.addressMode = 'confirmed';
      this.manualAddress = {
        addressNumber: this.resolvedAddress.address_number,
        street: this.resolvedAddress.street,
        city: this.resolvedAddress.city,
        state: this.resolvedAddress.state,
        postalCode: this.resolvedAddress.postal_code,
      };
      if (this.resolvedAddress.timezone) {
        this.accountTimezone = this.resolvedAddress.timezone;
      }
    } catch {
      // Stay in search mode on error
    } finally {
      this.host.render();
    }
  }

  private getConfirmedAddressLines(): { line1: string; line2: string } {
    if (this.resolvedAddress) {
      const streetLine = [this.resolvedAddress.address_number, this.resolvedAddress.street]
        .filter(Boolean)
        .join(' ');
      const regionPart = [this.resolvedAddress.state, this.resolvedAddress.postal_code]
        .filter(Boolean)
        .join(' ');
      return {
        line1: streetLine,
        line2: [this.resolvedAddress.city, regionPart].filter(Boolean).join(', '),
      };
    }

    if (this.existingLocation?.address) {
      const addr = this.existingLocation.address;
      if (addr.formatted_address) {
        const parts = addr.formatted_address.split(',');
        return {
          line1: parts[0]?.trim() ?? '',
          line2: parts.slice(1).join(',').trim(),
        };
      }
      const streetLine = [addr.address_number, addr.street].filter(Boolean).join(' ');
      const regionPart = [addr.state, addr.postal_code].filter(Boolean).join(' ');
      return {
        line1: streetLine,
        line2: [addr.city, regionPart].filter(Boolean).join(', '),
      };
    }

    return { line1: '', line2: '' };
  }

  private hasValidAddress(): boolean {
    if (this.existingLocation) return true;
    if (this.resolvedAddress) return true;
    if (this.addressMode === 'edit') {
      return !!(
        this.manualAddress.street.trim() &&
        this.manualAddress.city.trim() &&
        this.manualAddress.state.trim() &&
        this.manualAddress.postalCode.trim()
      );
    }
    return false;
  }

  private advancePastAccount(): void {
    this.userError = null;

    if (this.host.users.length === 0) {
      this.userError = this.host.t('accountOnboarding.account.users.atLeastOne');
      this.host.render();
      return;
    }

    const steps = this.host.getActiveSteps();
    const idx = steps.indexOf('account');
    const nextStep = steps[idx + 1];
    if (nextStep) {
      this.host.navigateToStep(nextStep);
    }
  }

  private async saveAndAdvanceToTeamMembers(): Promise<void> {
    if (this.isSavingAccount) return;
    this.accountValidationErrors = {};
    this.locationValidationErrors = {};
    this.accountSaveError = null;

    let hasErrors = false;

    if (!this.accountName.trim()) {
      this.accountValidationErrors.name = this.host.t(
        'accountOnboarding.account.details.companyNameRequired'
      );
      hasErrors = true;
    }

    if (!this.accountEmail.trim()) {
      this.accountValidationErrors.email = this.host.t(
        'accountOnboarding.account.details.emailRequired'
      );
      hasErrors = true;
    }

    if (!this.accountPhone.trim()) {
      this.accountValidationErrors.phone = this.host.t(
        'accountOnboarding.account.details.phoneRequired'
      );
      hasErrors = true;
    } else {
      const parsed = parsePhoneNumberFromString(this.accountPhone, 'US');
      if (!parsed?.isValid()) {
        this.accountValidationErrors.phone = this.host.t(
          'accountOnboarding.account.details.phoneInvalid'
        );
        hasErrors = true;
      }
    }

    if (!this.accountPrimaryContact.trim()) {
      this.accountValidationErrors.primaryContact = this.host.t(
        'accountOnboarding.account.details.primaryContactRequired'
      );
      hasErrors = true;
    }

    if (!this.locationName.trim()) {
      this.locationValidationErrors.name = this.host.t(
        'accountOnboarding.account.location.nameRequired'
      );
      hasErrors = true;
    }

    if (!this.hasValidAddress()) {
      this.locationValidationErrors.address = this.host.t(
        'accountOnboarding.account.location.addressRequired'
      );
      hasErrors = true;
    }

    if (!this.accountTimezone) {
      this.locationValidationErrors.timezone = this.host.t(
        'accountOnboarding.account.details.timezoneRequired'
      );
      hasErrors = true;
    }

    if (hasErrors) {
      this.host.render();
      return;
    }

    this.isSavingAccount = true;
    this.host.render();

    try {
      if (!this.host.instance) throw new Error('Not initialized');

      const { extension_length: _, ...configWithoutExtLength } = this.host.accountConfig;
      const updatedConfig = {
        ...configWithoutExtLength,
        ...(this.accountTimezone ? { timezone: this.accountTimezone } : {}),
      };
      await this.host.instance.updateAccount({
        email: this.accountEmail.trim(),
        name: this.accountName.trim(),
        phone: parsePhoneNumberFromString(this.accountPhone, 'US')!.number,
        primary_contact_name: this.accountPrimaryContact.trim(),
        config: updatedConfig,
      });

      // Create or update location
      if (!this.existingLocation) {
        const address = this.resolvedAddress
          ? {
              address_number: this.resolvedAddress.address_number,
              street: this.resolvedAddress.street,
              city: this.resolvedAddress.city,
              state: this.resolvedAddress.state,
              postal_code: this.resolvedAddress.postal_code,
              country: this.resolvedAddress.country,
            }
          : {
              address_number: this.manualAddress.addressNumber.trim() || undefined,
              street: this.manualAddress.street.trim(),
              city: this.manualAddress.city.trim(),
              state: this.manualAddress.state.trim(),
              postal_code: this.manualAddress.postalCode.trim(),
              country: 'US',
            };

        const locationPayload = {
          name: this.locationName.trim(),
          address,
        };

        if (this.editingLocationId) {
          this.existingLocation = await this.host.instance.updateLocation(
            this.editingLocationId,
            locationPayload
          );
        } else {
          this.existingLocation = await this.host.instance.createLocation(locationPayload);
        }
        this.editingLocationId = null;
      } else if (
        this.existingLocation.name !== this.locationName.trim() ||
        (this.existingLocation.address?.street ?? '') !== this.manualAddress.street.trim() ||
        (this.existingLocation.address?.city ?? '') !== this.manualAddress.city.trim() ||
        (this.existingLocation.address?.state ?? '') !== this.manualAddress.state.trim() ||
        (this.existingLocation.address?.postal_code ?? '') !== this.manualAddress.postalCode.trim()
      ) {
        this.existingLocation = await this.host.instance.updateLocation(this.existingLocation.id, {
          name: this.locationName.trim(),
          address: {
            address_number: this.manualAddress.addressNumber.trim() || undefined,
            street: this.manualAddress.street.trim(),
            city: this.manualAddress.city.trim(),
            state: this.manualAddress.state.trim(),
            postal_code: this.manualAddress.postalCode.trim(),
            country: 'US',
          },
        });
      }

      this.isSavingAccount = false;
      this.accountSubStep = 'team-members';
      this.host.render();
    } catch (err) {
      this.isSavingAccount = false;
      this.accountSaveError =
        err instanceof Error ? err.message : this.host.t('accountOnboarding.account.saveError');
      this.host.render();
    }
  }

  private async handleAddUser(): Promise<void> {
    if (this.isAddingUser) return;
    this.userError = null;

    if (!this.newUserName.trim()) {
      this.userError = this.host.t('accountOnboarding.account.users.nameRequired');
      this.host.render();
      return;
    }

    if (!this.newUserEmail.trim() || !this.newUserEmail.includes('@')) {
      this.userError = this.host.t('accountOnboarding.account.users.emailRequired');
      this.host.render();
      return;
    }

    this.isAddingUser = true;
    this.host.render();

    try {
      if (!this.host.instance) throw new Error('Not initialized');

      const user = await this.host.instance.createUser({
        name: this.newUserName.trim(),
        email: this.newUserEmail.trim() || undefined,
      });

      const extNumber = this.newUserExtension.trim() || this.host.getNextExtensionNumber();
      try {
        await this.host.instance.createExtension({
          number: extNumber,
          target: user.id,
        });
      } catch (extErr) {
        await this.host.instance.deleteUser(user.id).catch(() => {});
        throw extErr;
      }

      // Refresh lists
      const [users, extensions] = await Promise.all([
        this.host.instance.listUsers(),
        this.host.instance.listExtensions(),
      ]);
      this.host.setUsers(users);
      this.host.setExtensions(extensions);

      this.newUserName = '';
      this.newUserEmail = '';
      this.newUserExtension = this.host.getNextExtensionNumber();
      this.isAddingUser = false;
      this.host.render();
    } catch (err) {
      this.isAddingUser = false;
      const message = err instanceof Error ? err.message : String(err);
      if (message.includes('already exists')) {
        this.userError = this.host.t('accountOnboarding.account.users.duplicateEmail');
      } else {
        this.userError = message;
      }
      this.host.render();
    }
  }

  private async handleRemoveUser(userId: string): Promise<void> {
    try {
      if (!this.host.instance) throw new Error('Not initialized');

      await this.host.instance.deleteUser(userId);
      const [users, extensions] = await Promise.all([
        this.host.instance.listUsers(),
        this.host.instance.listExtensions(),
      ]);
      this.host.setUsers(users);
      this.host.setExtensions(extensions);
      this.newUserExtension = this.host.getNextExtensionNumber();
      this.host.render();
    } catch (err) {
      this.userError = err instanceof Error ? err.message : String(err);
      this.host.render();
    }
  }

  private handleAddressKeydown(e: KeyboardEvent): void {
    if (!this.addressDropdownOpen || this.addressSuggestions.length === 0) return;

    switch (e.key) {
      case 'ArrowDown':
        e.preventDefault();
        this.highlightedSuggestionIndex = Math.min(
          this.highlightedSuggestionIndex + 1,
          this.addressSuggestions.length - 1
        );
        this.renderAddressDropdown();
        break;
      case 'ArrowUp':
        e.preventDefault();
        this.highlightedSuggestionIndex = Math.max(this.highlightedSuggestionIndex - 1, 0);
        this.renderAddressDropdown();
        break;
      case 'Enter':
        e.preventDefault();
        if (
          this.highlightedSuggestionIndex >= 0 &&
          this.highlightedSuggestionIndex < this.addressSuggestions.length
        ) {
          const suggestion = this.addressSuggestions[this.highlightedSuggestionIndex]!;
          this.handleSelectSuggestion(suggestion.place_id);
        }
        break;
      case 'Escape':
        e.preventDefault();
        this.addressDropdownOpen = false;
        this.renderAddressDropdown();
        break;
    }
  }

  // ============================================================================
  // Click Handler
  // ============================================================================

  handleAction(action: string, actionEl: HTMLElement): boolean {
    switch (action) {
      case 'add-user':
        this.handleAddUser();
        return true;
      case 'remove-user': {
        const userId = actionEl.dataset.userId;
        if (userId) {
          this.handleRemoveUser(userId);
        }
        return true;
      }
      case 'select-suggestion': {
        const placeId = actionEl.dataset.placeId;
        if (placeId) {
          this.handleSelectSuggestion(placeId);
        }
        return true;
      }
      case 'edit-address':
        this.editingLocationId = this.existingLocation?.id ?? null;
        this.resolvedAddress = null;
        this.existingLocation = null;
        this.addressMode = 'edit';
        this.host.render();
        return true;
      case 'enter-manually':
        this.addressMode = 'edit';
        this.host.render();
        return true;
      case 'search-instead':
        this.addressMode = 'search';
        this.addressQuery = '';
        this.addressSuggestions = [];
        this.addressDropdownOpen = false;
        this.host.render();
        return true;
      default:
        return false;
    }
  }

  /** Handle the 'next' action specifically for the account step. Returns true if handled. */
  handleNext(): boolean {
    if (this.accountSubStep === 'business-details') {
      this.saveAndAdvanceToTeamMembers();
      return true;
    }
    this.advancePastAccount();
    return true;
  }

  /** Handle the 'back' action specifically for the account step. Returns true if handled. */
  handleBack(): boolean {
    if (this.accountSubStep === 'team-members') {
      this.accountSubStep = 'business-details';
      this.host.render();
      return true;
    }
    return false;
  }

  // ============================================================================
  // Input Listeners
  // ============================================================================

  attachInputListeners(): void {
    if (!this.host.shadowRoot) return;

    const bindInput = (id: string, setter: (val: string) => void): void => {
      const el = this.host.shadowRoot?.querySelector<HTMLInputElement | HTMLSelectElement>(
        `#${id}`
      );
      if (el) {
        el.addEventListener('input', (e) => setter((e.target as HTMLInputElement).value));
        el.addEventListener('change', (e) => setter((e.target as HTMLSelectElement).value));
      }
    };

    bindInput('account-name', (v) => {
      this.accountName = v;
    });
    bindInput('account-email', (v) => {
      this.accountEmail = v;
    });
    // Phone input with as-you-type formatting and blur normalization
    const phoneEl = this.host.shadowRoot?.querySelector<HTMLInputElement>('#account-phone');
    if (phoneEl) {
      phoneEl.addEventListener('input', () => {
        const digits = phoneEl.value.replace(/\D/g, '');
        const formatted = digits ? new AsYouType('US').input(digits) : '';
        this.accountPhone = formatted;
        phoneEl.value = formatted;
      });
      phoneEl.addEventListener('blur', () => {
        const parsed = parsePhoneNumberFromString(phoneEl.value, 'US');
        if (parsed?.isValid()) {
          const national = parsed.formatNational();
          this.accountPhone = national;
          phoneEl.value = national;
        }
      });
    }
    bindInput('account-primary-contact', (v) => {
      this.accountPrimaryContact = v;
    });
    bindInput('location-name', (v) => {
      this.locationName = v;
    });
    bindInput('account-timezone', (v) => {
      this.accountTimezone = v;
    });
    bindInput('new-user-name', (v) => {
      this.newUserName = v;
    });
    bindInput('new-user-email', (v) => {
      this.newUserEmail = v;
    });
    bindInput('new-user-extension', (v) => {
      this.newUserExtension = v;
    });

    // Address search input
    const addressInput = this.host.shadowRoot.querySelector<HTMLInputElement>('#address-search');
    if (addressInput) {
      addressInput.addEventListener('input', (e) => {
        this.addressQuery = (e.target as HTMLInputElement).value;
        this.debouncedSuggestAddresses(this.addressQuery);
      });
      addressInput.addEventListener('focus', () => {
        if (this.addressQuery.length >= 3) {
          this.addressDropdownOpen = true;
          this.renderAddressDropdown();
        }
      });
      addressInput.addEventListener('blur', () => {
        setTimeout(() => {
          this.addressDropdownOpen = false;
          this.renderAddressDropdown();
        }, 200);
      });
      addressInput.addEventListener('keydown', (e) => {
        this.handleAddressKeydown(e);
      });
    }

    // Manual address fields
    bindInput('manual-house-number', (v) => {
      this.manualAddress.addressNumber = v;
    });
    bindInput('manual-street', (v) => {
      this.manualAddress.street = v;
    });
    bindInput('manual-city', (v) => {
      this.manualAddress.city = v;
    });
    bindInput('manual-state', (v) => {
      this.manualAddress.state = v;
    });
    bindInput('manual-postal-code', (v) => {
      this.manualAddress.postalCode = v;
    });
  }

  // ============================================================================
  // Renderers
  // ============================================================================

  renderAccountStep(): string {
    switch (this.accountSubStep) {
      case 'business-details':
        return this.renderAccountBusinessDetails();
      case 'team-members':
        return this.renderAccountTeamMembers();
    }
  }

  private renderAccountBusinessDetails(): string {
    const t = (key: string): string => this.host.t(key);
    const nameErr = this.accountValidationErrors.name;
    const emailErr = this.accountValidationErrors.email;
    const phoneErr = this.accountValidationErrors.phone;
    const primaryContactErr = this.accountValidationErrors.primaryContact;

    const saveErrorHtml = this.accountSaveError
      ? `<div class="inline-alert error">${this.host.escapeHtml(this.accountSaveError)}</div>`
      : '';

    return `
      <div class="card ${this.host.classes.stepAccount || ''}" part="step-account">
        <h2 class="section-title">${t('accountOnboarding.account.title')}</h2>
        <p class="section-subtitle">${t('accountOnboarding.account.subtitle')}</p>

        <div class="form-row">
          <div class="form-group">
            <label class="form-label" for="account-name">${t('accountOnboarding.account.details.companyNameLabel')}</label>
            <input class="form-input${nameErr ? ' error' : ''}" type="text" id="account-name"
              value="${this.host.escapeHtml(this.accountName)}"
              placeholder="${t('accountOnboarding.account.details.companyNamePlaceholder')}" />
            ${nameErr ? `<div class="form-error">${this.host.escapeHtml(nameErr)}</div>` : ''}
          </div>
          <div class="form-group">
            <label class="form-label" for="account-primary-contact">${t('accountOnboarding.account.details.primaryContactLabel')}</label>
            <input class="form-input${primaryContactErr ? ' error' : ''}" type="text" id="account-primary-contact"
              value="${this.host.escapeHtml(this.accountPrimaryContact)}"
              placeholder="${t('accountOnboarding.account.details.primaryContactPlaceholder')}" />
            ${primaryContactErr ? `<div class="form-error">${this.host.escapeHtml(primaryContactErr)}</div>` : ''}
          </div>
        </div>

        <div class="form-row">
          <div class="form-group">
            <label class="form-label" for="account-email">${t('accountOnboarding.account.details.emailLabel')}</label>
            <input class="form-input${emailErr ? ' error' : ''}" type="email" id="account-email"
              value="${this.host.escapeHtml(this.accountEmail)}"
              placeholder="${t('accountOnboarding.account.details.emailPlaceholder')}" />
            ${emailErr ? `<div class="form-error">${this.host.escapeHtml(emailErr)}</div>` : ''}
          </div>
          <div class="form-group">
            <label class="form-label" for="account-phone">${t('accountOnboarding.account.details.phoneLabel')}</label>
            <input class="form-input${phoneErr ? ' error' : ''}" type="tel" id="account-phone"
              value="${this.host.escapeHtml(this.accountPhone)}"
              placeholder="${t('accountOnboarding.account.details.phonePlaceholder')}" />
            ${phoneErr ? `<div class="form-error">${this.host.escapeHtml(phoneErr)}</div>` : ''}
          </div>
        </div>

        <div class="e911-separator">*${t('accountOnboarding.account.location.e911Note')}*</div>

        ${this.renderLocationSection()}

        ${saveErrorHtml}
      </div>
      ${this.renderAccountStepFooter()}
    `;
  }

  private renderAccountTeamMembers(): string {
    const t = (key: string): string => this.host.t(key);

    const userTableHtml =
      this.host.users.length === 0
        ? `<div class="no-users">${t('accountOnboarding.account.users.noUsers')}</div>`
        : `<table class="user-table">
            <thead>
              <tr>
                <th>${t('accountOnboarding.account.users.nameLabel')}</th>
                <th>${t('accountOnboarding.account.users.emailLabel')}</th>
                <th>${t('accountOnboarding.account.users.extensionLabel')}</th>
                <th>${t('accountOnboarding.account.users.roleLabel')}</th>
                <th></th>
              </tr>
            </thead>
            <tbody>${this.host.users
              .map((u) => {
                const ext = this.host.getExtensionForUser(u.id);
                const extDisplay = ext ? this.host.escapeHtml(ext.number) : '—';
                return `
                <tr>
                  <td class="user-table-name">${this.host.escapeHtml(u.name ?? '')}</td>
                  <td>${this.host.escapeHtml(u.email ?? '')}</td>
                  <td>${extDisplay}</td>
                  <td class="user-table-role">${t('accountOnboarding.account.users.roleAdmin')}</td>
                  <td>
                    <button class="btn-icon-danger" data-action="remove-user" data-user-id="${this.host.escapeHtml(u.id)}" title="${t('accountOnboarding.account.users.removeUser')}">
                      ${TRASH_SVG}
                    </button>
                  </td>
                </tr>`;
              })
              .join('')}</tbody>
          </table>`;

    const userErrorHtml = this.userError
      ? `<div class="inline-alert error">${this.host.escapeHtml(this.userError)}</div>`
      : '';

    const saveErrorHtml = this.accountSaveError
      ? `<div class="inline-alert error">${this.host.escapeHtml(this.accountSaveError)}</div>`
      : '';

    return `
      <div class="card ${this.host.classes.stepAccount || ''}" part="step-account">
        <h2 class="section-title">${t('accountOnboarding.account.users.heading')}</h2>
        <p class="section-subtitle">${t('accountOnboarding.account.users.description')}</p>

        <div class="add-user-form">
          <div class="form-group">
            <label class="form-label" for="new-user-name">${t('accountOnboarding.account.users.nameLabel')}</label>
            <input class="form-input" type="text" id="new-user-name"
              value="${this.host.escapeHtml(this.newUserName)}"
              placeholder="${t('accountOnboarding.account.users.namePlaceholder')}" />
          </div>
          <div class="form-group">
            <label class="form-label" for="new-user-email">${t('accountOnboarding.account.users.emailLabel')}</label>
            <input class="form-input" type="email" id="new-user-email"
              value="${this.host.escapeHtml(this.newUserEmail)}"
              placeholder="${t('accountOnboarding.account.users.emailPlaceholder')}" />
          </div>
          <div class="form-group">
            <label class="form-label" for="new-user-extension">${t('accountOnboarding.account.users.extensionLabel')}</label>
            <input class="form-input" type="text" id="new-user-extension"
              value="${this.host.escapeHtml(this.newUserExtension)}"
              placeholder="${t('accountOnboarding.account.users.extensionPlaceholder')}" />
          </div>
          <button class="btn btn-secondary btn-add" data-action="add-user"${this.isAddingUser ? ' disabled' : ''}>
            ${this.isAddingUser ? t('accountOnboarding.account.saving') : t('accountOnboarding.account.users.addUser')}
          </button>
        </div>

        ${userTableHtml}

        ${userErrorHtml}
        ${saveErrorHtml}
      </div>
      ${this.renderAccountStepFooter()}
    `;
  }

  private renderLocationSection(): string {
    const t = (key: string): string => this.host.t(key);
    const nameErr = this.locationValidationErrors.name;
    const addressErr = this.locationValidationErrors.address;
    const timezoneErr = this.locationValidationErrors.timezone;

    let addressHtml: string;
    switch (this.addressMode) {
      case 'search':
        addressHtml = this.renderAddressSearch();
        break;
      case 'confirmed':
        addressHtml = this.renderAddressConfirmed();
        break;
      case 'edit':
        addressHtml = this.renderAddressManualFields();
        break;
    }

    const timezoneHtml =
      this.addressMode === 'confirmed' && this.accountTimezone
        ? (() => {
            const tzLabel =
              US_TIMEZONES.find(([v]) => v === this.accountTimezone)?.[1] ?? this.accountTimezone;
            return `
        <div class="form-group">
          <label class="form-label">${t('accountOnboarding.account.details.timezoneLabel')}</label>
          <div class="timezone-readonly">${this.host.escapeHtml(tzLabel)}</div>
        </div>`;
          })()
        : `
        <div class="form-group">
          <label class="form-label" for="account-timezone">${t('accountOnboarding.account.details.timezoneLabel')}</label>
          <select class="form-select${timezoneErr ? ' error' : ''}" id="account-timezone">
            ${!this.accountTimezone ? `<option value="" selected>${t('accountOnboarding.account.details.timezonePlaceholder')}</option>` : ''}
            ${US_TIMEZONES.map(
              ([value, label]) =>
                `<option value="${this.host.escapeHtml(value)}"${this.accountTimezone === value ? ' selected' : ''}>${this.host.escapeHtml(label)}</option>`
            ).join('')}
          </select>
          ${timezoneErr ? `<div class="form-error">${this.host.escapeHtml(timezoneErr)}</div>` : ''}
        </div>`;

    return `
      <h3 class="section-heading">${t('accountOnboarding.account.location.heading')}</h3>
      <p class="section-description">${t('accountOnboarding.account.location.description')}</p>

      <div class="form-group">
        <label class="form-label" for="location-name">${t('accountOnboarding.account.location.nameLabel')}</label>
        <input class="form-input${nameErr ? ' error' : ''}" type="text" id="location-name"
          value="${this.host.escapeHtml(this.locationName)}"
          placeholder="${t('accountOnboarding.account.location.namePlaceholder')}" />
        ${nameErr ? `<div class="form-error">${this.host.escapeHtml(nameErr)}</div>` : ''}
      </div>

      <div class="form-group">
        <label class="form-label">${t('accountOnboarding.account.location.addressLabel')}</label>
        ${addressHtml}
        ${addressErr ? `<div class="form-error">${this.host.escapeHtml(addressErr)}</div>` : ''}
      </div>

      ${timezoneHtml}
    `;
  }

  private renderAddressSearch(): string {
    const t = (key: string): string => this.host.t(key);
    return `
      <div class="address-autocomplete">
        <input class="form-input" type="text" id="address-search"
          value="${this.host.escapeHtml(this.addressQuery)}"
          placeholder="${t('accountOnboarding.account.location.searchPlaceholder')}"
          autocomplete="off" />
        <div class="address-dropdown" style="display:none"></div>
      </div>
      <button class="btn-link" type="button" data-action="enter-manually">
        ${t('accountOnboarding.account.location.enterManually')}
      </button>
    `;
  }

  private renderAddressConfirmed(): string {
    const t = (key: string): string => this.host.t(key);
    const { line1, line2 } = this.getConfirmedAddressLines();

    return `
      <div class="address-confirmed">
        <div class="address-confirmed-icon">${CHECK_CIRCLE_SVG}</div>
        <div class="address-confirmed-text">
          ${line1 ? `<div class="address-confirmed-line">${this.host.escapeHtml(line1)}</div>` : ''}
          ${line2 ? `<div class="address-confirmed-line">${this.host.escapeHtml(line2)}</div>` : ''}
        </div>
        <button class="btn btn-secondary" style="padding:var(--ds-spacing-xs) var(--ds-layout-spacing-sm);font-size:var(--ds-font-size-small)" data-action="edit-address">
          ${t('accountOnboarding.account.location.edit')}
        </button>
      </div>
    `;
  }

  private renderAddressManualFields(): string {
    const t = (key: string): string => this.host.t(key);

    const stateOptions = US_STATES.map(
      ([code, name]) =>
        `<option value="${this.host.escapeHtml(code)}"${this.manualAddress.state === code ? ' selected' : ''}>${this.host.escapeHtml(name)}</option>`
    ).join('');

    return `
      <div class="address-manual-fields">
        <div class="form-group">
          <label class="form-label" for="manual-house-number">${t('accountOnboarding.account.location.houseNumberLabel')}</label>
          <input class="form-input" type="text" id="manual-house-number"
            value="${this.host.escapeHtml(this.manualAddress.addressNumber)}"
            placeholder="${t('accountOnboarding.account.location.houseNumberPlaceholder')}" />
        </div>
        <div class="form-group">
          <label class="form-label" for="manual-street">${t('accountOnboarding.account.location.streetLabel')}</label>
          <input class="form-input" type="text" id="manual-street"
            value="${this.host.escapeHtml(this.manualAddress.street)}"
            placeholder="${t('accountOnboarding.account.location.streetPlaceholder')}" />
        </div>
      </div>
      <div class="address-manual-row-2">
        <div class="form-group">
          <label class="form-label" for="manual-city">${t('accountOnboarding.account.location.cityLabel')}</label>
          <input class="form-input" type="text" id="manual-city"
            value="${this.host.escapeHtml(this.manualAddress.city)}"
            placeholder="${t('accountOnboarding.account.location.cityPlaceholder')}" />
        </div>
        <div class="form-group">
          <label class="form-label" for="manual-state">${t('accountOnboarding.account.location.stateLabel')}</label>
          <select class="form-select" id="manual-state">
            <option value="">${t('accountOnboarding.account.location.statePlaceholder')}</option>
            ${stateOptions}
          </select>
        </div>
        <div class="form-group">
          <label class="form-label" for="manual-postal-code">${t('accountOnboarding.account.location.postalCodeLabel')}</label>
          <input class="form-input" type="text" id="manual-postal-code"
            value="${this.host.escapeHtml(this.manualAddress.postalCode)}"
            placeholder="${t('accountOnboarding.account.location.postalCodePlaceholder')}" />
        </div>
      </div>
      <button class="btn-link" type="button" data-action="search-instead">
        ${t('accountOnboarding.account.location.searchInstead')}
      </button>
    `;
  }

  private renderAccountStepFooter(): string {
    const hasBack = this.accountSubStep === 'team-members';
    const nextLabel = this.isSavingAccount
      ? this.host.t('accountOnboarding.account.saving')
      : `${this.host.t('accountOnboarding.nav.next')} &rarr;`;

    if (hasBack) {
      return `
        <div class="footer-bar">
          <button class="btn btn-ghost" data-action="back">
            &larr; ${this.host.t('accountOnboarding.nav.back')}
          </button>
          <button class="btn btn-primary" data-action="next"${this.isSavingAccount ? ' disabled' : ''}>
            ${nextLabel}
          </button>
        </div>`;
    }

    return `
      <div class="footer-bar footer-bar-end">
        <button class="btn btn-primary" data-action="next"${this.isSavingAccount ? ' disabled' : ''}>
          ${nextLabel}
        </button>
      </div>`;
  }
}
