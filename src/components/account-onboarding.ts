/**
 * Account Onboarding Web Component - Multi-step onboarding wizard
 */

import { BaseComponent } from './base-component';
import type {
  AccountOnboardingStep,
  AccountOnboardingClasses,
  AccountConfig,
  OnboardingCollectionOptions,
  OnboardingUser,
  AddressSuggestion,
  ResolvedAddress,
  OnboardingLocation,
  OnboardingEndpoint,
  ProvisionedDevice,
  DECTBase,
  DECTHandset,
  AvailablePhoneNumber,
  NumberOrder,
  PortOrder,
  PortEligibilityResult,
  CreatePortOrderRequest,
  SearchType,
  DIDItem,
  PhoneNumberItem,
  PhoneNumberStatus,
} from '../types';
import type { Extension } from '../types/dial-plan';
import { AsYouType, parsePhoneNumberFromString } from 'libphonenumber-js';
import { debounce } from '../utils/debounce';
import { normalizeMac } from '../utils/mac';
import { US_STATES } from '../constants/us-states';
import { US_TIMEZONES } from '../constants/us-timezones';
import {
  COMPONENT_STYLES,
  CHECK_SVG,
  SUCCESS_SVG,
  ERROR_SVG,
  CHECK_CIRCLE_SVG,
  BUILDING_SVG,
  PHONE_SVG,
  MONITOR_SVG,
} from './account-onboarding.styles';

type AccountSubStep = 'business-details' | 'team-members';

type NumSubStep =
  | 'overview'
  | 'order-search'
  | 'order-results'
  | 'order-confirm'
  | 'order-status'
  | 'port-numbers'
  | 'port-eligibility'
  | 'port-subscriber'
  | 'port-foc-date'
  | 'port-documents'
  | 'port-review'
  | 'port-submitted';

export class AccountOnboardingComponent extends BaseComponent {
  private static readonly ALL_STEPS: AccountOnboardingStep[] = [
    'account',
    'numbers',
    'hardware',
    'complete',
  ];

  private currentStep: AccountOnboardingStep = 'account';
  private accountSubStep: AccountSubStep = 'business-details';
  private savedStepIndex = 0;
  private isLoading = true;
  private loadError: string | null = null;

  // Account state
  private accountEmail = '';
  private accountName = '';
  private accountPhone = '';
  private accountPrimaryContact = '';
  private accountTimezone = '';
  private accountConfig: AccountConfig = {};

  // Location state
  private locationName = '';
  private addressMode: 'search' | 'confirmed' | 'edit' = 'search';
  private addressQuery = '';
  private addressSuggestions: AddressSuggestion[] = [];
  private resolvedAddress: ResolvedAddress | null = null;
  private isLoadingSuggestions = false;
  private addressDropdownOpen = false;
  private highlightedSuggestionIndex = -1;
  private addressSearchVersion = 0;
  private existingLocation: OnboardingLocation | null = null;
  private editingLocationId: string | null = null;
  private manualAddress = {
    addressNumber: '',
    street: '',
    city: '',
    state: '',
    postalCode: '',
  };
  private locationValidationErrors: Record<string, string> = {};

  // User state
  private users: OnboardingUser[] = [];
  private extensions: Extension[] = [];
  private newUserName = '';
  private newUserEmail = '';
  private newUserExtension = '';
  private isAddingUser = false;
  private userError: string | null = null;

  // Hardware state
  private devices: ProvisionedDevice[] = [];
  private dectBases: DECTBase[] = [];
  private dectHandsets: Map<string, DECTHandset[]> = new Map();
  private userEndpointMap: Map<string, OnboardingEndpoint[]> = new Map();
  // Inline editing state (only one form open at a time)
  private hwEditingRowKey: string | null = null; // 'new' | 'new-handset:{baseId}' | null
  private hwEditMac = '';
  private hwEditIsDectBase = false;
  private hwEditIpei = '';
  private hwEditUserId = '';
  private hwEditSaving = false;
  private hwEditError: string | null = null;
  private hwActionError: string | null = null;

  // Numbers step state
  private numSubStep: NumSubStep = 'overview';
  private numPhoneNumbers: PhoneNumberItem[] = [];
  private numIsLoadingNumbers = false;
  private numLoadError: string | null = null;
  // Order flow
  private numOrderSearchType: SearchType = 'area_code';
  private numOrderSearchValue = '';
  private numOrderSearchCity = '';
  private numOrderSearchState = '';
  private numOrderQuantity = 5;
  private numOrderIsSearching = false;
  private numOrderAvailableNumbers: AvailablePhoneNumber[] = [];
  private numOrderSelectedNumbers: Set<string> = new Set();
  private numOrderCurrentOrder: NumberOrder | null = null;
  private numOrderIsPlacing = false;
  private numOrderError: string | null = null;
  private numOrderPollTimer: ReturnType<typeof setTimeout> | null = null;
  private numOrderPollCount = 0;
  // Port flow
  private numPortPhoneInputs: string[] = [''];
  private numPortEligibilityResult: PortEligibilityResult | null = null;
  private numPortIsCheckingEligibility = false;
  private numPortEligibilityError: string | null = null;
  // Port subscriber
  private numPortSubscriberBtn = '';
  private numPortSubscriberBusinessName = '';
  private numPortSubscriberApproverName = '';
  private numPortSubscriberAccountNumber = '';
  private numPortSubscriberPin = '';
  private numPortSubscriberHouseNumber = '';
  private numPortSubscriberStreetName = '';
  private numPortSubscriberLine2 = '';
  private numPortSubscriberCity = '';
  private numPortSubscriberState = '';
  private numPortSubscriberZip = '';
  private numPortSubscriberErrors: Record<string, string> = {};
  // Port FOC
  private numPortFocDate = '';
  private numPortFocTime = '';
  private numPortFocErrors: Record<string, string> = {};
  // Port documents
  private numPortCsrFile: File | null = null;
  private numPortBillCopyFile: File | null = null;
  private numPortDocUploadError: string | null = null;
  // Port review
  private numPortSignature = '';
  private numPortCurrentOrder: PortOrder | null = null;
  private numPortIsSubmitting = false;
  private numPortSubmitError: string | null = null;

  // Save state
  private isSavingAccount = false;
  private accountSaveError: string | null = null;
  private accountValidationErrors: Record<string, string> = {};

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

  // Debounced address search
  private debouncedSuggestAddresses = debounce((query: string) => {
    this.fetchAddressSuggestions(query);
  }, 300);

  override connectedCallback(): void {
    // Reset per mount so each onboarding session can emit onExit exactly once.
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

  private async loadOnboardingData(): Promise<void> {
    this.isLoading = true;
    this.loadError = null;
    this._onLoaderStart?.({ elementTagName: 'dialstack-account-onboarding' });
    this.render();

    try {
      if (!this.instance) throw new Error('Not initialized');

      // Core data is required; hardware data is optional (lazy-loaded on hardware step)
      const [account, users, extensions, locations, devicesResult, dectBasesResult] =
        await Promise.all([
          this.instance.getAccount(),
          this.instance.listUsers(),
          this.instance.listExtensions(),
          this.instance.listLocations(),
          this.instance.listDevices().catch(() => [] as ProvisionedDevice[]),
          this.instance.listDECTBases().catch(() => [] as DECTBase[]),
        ]);

      this.accountEmail = account.email ?? '';
      this.accountName = account.name ?? '';
      const phoneRaw = account.phone ?? '';
      const phoneParsed = phoneRaw ? parsePhoneNumberFromString(phoneRaw, 'US') : null;
      this.accountPhone = phoneParsed ? phoneParsed.formatNational() : phoneRaw;
      this.accountPrimaryContact = account.primary_contact_name ?? '';
      this.accountTimezone = account.config?.timezone ?? '';
      this.accountConfig = account.config ?? {};
      this.users = users ?? [];
      this.extensions = extensions ?? [];
      this.newUserExtension = this.getNextExtensionNumber();
      this.devices = devicesResult ?? [];
      this.dectBases = dectBasesResult ?? [];

      // Endpoints and handsets are lazy-loaded when the hardware step is shown
      // to avoid O(users + bases) API calls on initial load.

      if (locations.length > 0) {
        const loc = locations[0]!;
        this.existingLocation = loc;
        this.locationName = loc.name;
        this.addressMode = 'confirmed';
        if (loc.address) {
          this.manualAddress = {
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
      const savedStep = account.config?.onboarding_step;
      if (savedStep && savedStep !== 'complete' && activeSteps.includes(savedStep)) {
        const idx = activeSteps.indexOf(savedStep);
        this.savedStepIndex = idx;
        this.navigateToStep(savedStep);
      }

      // Jump to a specific step if configured (takes priority as an explicit override)
      const initial = this.collectionOptions?.initialStep;
      if (initial && activeSteps.includes(initial)) {
        this.navigateToStep(initial);
      }

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

  setCollectionOptions(options?: OnboardingCollectionOptions | null): void {
    this.collectionOptions = options ?? null;
    // Reset to first active step if current step is now excluded
    const activeSteps = this.getActiveSteps();
    if (!activeSteps.includes(this.currentStep)) {
      this.currentStep = activeSteps[0] ?? 'complete';
    }
    // Jump to initialStep if data is already loaded (React effects run after mount)
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
    this.numStopOrderPoll();
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
    if (this.currentStep === 'account') {
      this.accountSubStep = 'business-details';
    }
    this.currentStep = step;
    this._onStepChange?.({ step });
    this.render();

    // Persist progress (fire-and-forget) only when advancing beyond high-water mark
    const activeSteps = this.getActiveSteps();
    const stepIdx = activeSteps.indexOf(step);
    if (stepIdx > this.savedStepIndex && this.instance) {
      this.savedStepIndex = stepIdx;
      this.instance
        .updateAccount({ config: { ...this.accountConfig, onboarding_step: step } })
        .catch((err) => console.warn('Failed to persist onboarding step:', err));
    }

    // Lazy-load numbers data when the step is first shown
    if (step === 'numbers' && this.numPhoneNumbers.length === 0 && !this.numIsLoadingNumbers) {
      this.loadNumbersData();
    }

    // Lazy-load hardware data when the step is first shown
    if (step === 'hardware' && this.userEndpointMap.size === 0) {
      this.loadHardwareData();
    }
  }

  /**
   * Lazy-load per-user endpoints and per-base DECT handsets.
   * Called once when the hardware step is first navigated to, avoiding
   * O(users + bases) API calls during initial data load.
   */
  private async loadHardwareData(): Promise<void> {
    if (!this.instance) return;

    try {
      const endpointMap = new Map<string, OnboardingEndpoint[]>();
      const handsetMap = new Map<string, DECTHandset[]>();
      await Promise.all([
        ...this.users.map(async (u) => {
          const eps = await this.instance!.listEndpoints(u.id);
          endpointMap.set(u.id, eps);
        }),
        ...this.dectBases.map(async (b) => {
          const hs = await this.instance!.listDECTHandsets(b.id);
          handsetMap.set(b.id, hs);
        }),
      ]);
      this.userEndpointMap = endpointMap;
      this.dectHandsets = handsetMap;
      // Hydrate device lines (the list endpoint doesn't include them)
      await this.hydrateDeviceLines();
      this.render();
    } catch (err) {
      console.warn('[dialstack] Failed to load hardware data:', err);
    }
  }

  /**
   * Fetch lines for each device and attach them to this.devices.
   * The /v1/devices list endpoint does not include lines, so we load
   * them separately to power the assignment display.
   */
  private async hydrateDeviceLines(): Promise<void> {
    if (!this.instance || this.devices.length === 0) return;

    await Promise.all(
      this.devices.map(async (dev) => {
        dev.lines = await this.instance!.listDeviceLines(dev.id);
      })
    );
  }

  // ============================================================================
  // Account Step Helpers
  // ============================================================================

  private getExtensionForUser(userId: string): Extension | undefined {
    return this.extensions.find((ext) => ext.target === userId);
  }

  private getNextExtensionNumber(): string {
    const configuredLength = this.accountConfig.extension_length;
    const length =
      typeof configuredLength === 'number' &&
      Number.isInteger(configuredLength) &&
      configuredLength > 0
        ? configuredLength
        : 4;
    const base = Math.pow(10, length - 1) + 1;
    const max = Math.pow(10, length) - 1;
    const existing = new Set(this.extensions.map((ext) => ext.number));
    let next = base;
    while (existing.has(String(next)) && next <= max) {
      next += 1;
    }
    return String(next);
  }

  // ============================================================================
  // Address / Location Helpers
  // ============================================================================

  private async fetchAddressSuggestions(query: string): Promise<void> {
    if (!this.instance || query.length < 3) {
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
      const results = await this.instance.suggestAddresses(query, 'US');
      if (version !== this.addressSearchVersion) return; // stale response
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
    if (!this.shadowRoot) return;
    const dropdown = this.shadowRoot.querySelector('.address-dropdown') as HTMLElement | null;
    if (!dropdown) return;

    if (this.isLoadingSuggestions) {
      dropdown.textContent = '';
      const msg = document.createElement('div');
      msg.className = 'address-no-results';
      msg.textContent = this.t('accountOnboarding.account.location.searching');
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
        msg.textContent = this.t('accountOnboarding.account.location.noResults');
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
    if (!this.instance) return;

    this.addressDropdownOpen = false;
    this.render();

    try {
      this.resolvedAddress = await this.instance.getPlaceDetails(placeId);
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
      this.render();
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

    if (this.users.length === 0) {
      this.userError = this.t('accountOnboarding.account.users.atLeastOne');
      this.render();
      return;
    }

    const steps = this.getActiveSteps();
    const idx = steps.indexOf('account');
    const nextStep = steps[idx + 1];
    if (nextStep) {
      this.navigateToStep(nextStep);
    }
  }

  private async saveAndAdvanceToTeamMembers(): Promise<void> {
    if (this.isSavingAccount) return;
    this.accountValidationErrors = {};
    this.locationValidationErrors = {};
    this.accountSaveError = null;

    let hasErrors = false;

    if (!this.accountName.trim()) {
      this.accountValidationErrors.name = this.t(
        'accountOnboarding.account.details.companyNameRequired'
      );
      hasErrors = true;
    }

    if (!this.accountEmail.trim()) {
      this.accountValidationErrors.email = this.t(
        'accountOnboarding.account.details.emailRequired'
      );
      hasErrors = true;
    }

    if (!this.accountPhone.trim()) {
      this.accountValidationErrors.phone = this.t(
        'accountOnboarding.account.details.phoneRequired'
      );
      hasErrors = true;
    } else {
      const parsed = parsePhoneNumberFromString(this.accountPhone, 'US');
      if (!parsed?.isValid()) {
        this.accountValidationErrors.phone = this.t(
          'accountOnboarding.account.details.phoneInvalid'
        );
        hasErrors = true;
      }
    }

    if (!this.accountPrimaryContact.trim()) {
      this.accountValidationErrors.primaryContact = this.t(
        'accountOnboarding.account.details.primaryContactRequired'
      );
      hasErrors = true;
    }

    if (!this.locationName.trim()) {
      this.locationValidationErrors.name = this.t(
        'accountOnboarding.account.location.nameRequired'
      );
      hasErrors = true;
    }

    if (!this.hasValidAddress()) {
      this.locationValidationErrors.address = this.t(
        'accountOnboarding.account.location.addressRequired'
      );
      hasErrors = true;
    }

    if (!this.accountTimezone) {
      this.locationValidationErrors.timezone = this.t(
        'accountOnboarding.account.details.timezoneRequired'
      );
      hasErrors = true;
    }

    if (hasErrors) {
      this.render();
      return;
    }

    this.isSavingAccount = true;
    this.render();

    try {
      if (!this.instance) throw new Error('Not initialized');

      const { extension_length: _, ...configWithoutExtLength } = this.accountConfig;
      const updatedConfig = {
        ...configWithoutExtLength,
        ...(this.accountTimezone ? { timezone: this.accountTimezone } : {}),
      };
      await this.instance.updateAccount({
        email: this.accountEmail.trim(),
        name: this.accountName.trim(),
        phone: parsePhoneNumberFromString(this.accountPhone, 'US')!.number,
        primary_contact_name: this.accountPrimaryContact.trim(),
        config: updatedConfig,
      });
      this.accountConfig = { ...this.accountConfig, ...updatedConfig };

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
          this.existingLocation = await this.instance.updateLocation(
            this.editingLocationId,
            locationPayload
          );
        } else {
          this.existingLocation = await this.instance.createLocation(locationPayload);
        }
        this.editingLocationId = null;
      } else if (this.existingLocation.name !== this.locationName.trim()) {
        this.existingLocation = await this.instance.updateLocation(this.existingLocation.id, {
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
      this.render();
    } catch (err) {
      this.isSavingAccount = false;
      this.accountSaveError =
        err instanceof Error ? err.message : this.t('accountOnboarding.account.saveError');
      this.render();
    }
  }

  private async handleAddUser(): Promise<void> {
    if (this.isAddingUser) return;
    this.userError = null;

    if (!this.newUserName.trim()) {
      this.userError = this.t('accountOnboarding.account.users.nameRequired');
      this.render();
      return;
    }

    this.isAddingUser = true;
    this.render();

    try {
      if (!this.instance) throw new Error('Not initialized');

      const user = await this.instance.createUser({
        name: this.newUserName.trim(),
        email: this.newUserEmail.trim() || undefined,
      });

      const extNumber = this.newUserExtension.trim() || this.getNextExtensionNumber();
      try {
        await this.instance.createExtension({
          number: extNumber,
          target: user.id,
        });
      } catch (extErr) {
        // Rollback: delete the user if extension creation fails
        await this.instance.deleteUser(user.id).catch(() => {});
        throw extErr;
      }

      // Refresh lists
      const [users, extensions] = await Promise.all([
        this.instance.listUsers(),
        this.instance.listExtensions(),
      ]);
      this.users = users;
      this.extensions = extensions;

      this.newUserName = '';
      this.newUserEmail = '';
      this.newUserExtension = this.getNextExtensionNumber();
      this.isAddingUser = false;
      this.render();
    } catch (err) {
      this.isAddingUser = false;
      const message = err instanceof Error ? err.message : String(err);
      if (message.includes('already exists')) {
        this.userError = this.t('accountOnboarding.account.users.duplicateEmail');
      } else {
        this.userError = message;
      }
      this.render();
    }
  }

  private async handleRemoveUser(userId: string): Promise<void> {
    try {
      if (!this.instance) throw new Error('Not initialized');

      await this.instance.deleteUser(userId);

      const [users, extensions] = await Promise.all([
        this.instance.listUsers(),
        this.instance.listExtensions(),
      ]);
      this.users = users;
      this.extensions = extensions;
      this.newUserExtension = this.getNextExtensionNumber();
      this.render();
    } catch (err) {
      this.userError = err instanceof Error ? err.message : String(err);
      this.render();
    }
  }

  private attachInputListeners(): void {
    if (!this.shadowRoot) return;

    const bindInput = (id: string, setter: (val: string) => void): void => {
      const el = this.shadowRoot?.querySelector<HTMLInputElement | HTMLSelectElement>(`#${id}`);
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
    const phoneEl = this.shadowRoot?.querySelector<HTMLInputElement>('#account-phone');
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
    const addressInput = this.shadowRoot.querySelector<HTMLInputElement>('#address-search');
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
        // Delay to allow click events on dropdown items to fire first
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
  // Numbers Step — Data
  // ============================================================================

  private async loadNumbersData(): Promise<void> {
    if (!this.instance) return;
    this.numIsLoadingNumbers = true;
    this.numLoadError = null;
    this.render();

    try {
      const [dids, orders, ports] = await Promise.all([
        this.instance.fetchAllPages<DIDItem>((opts) => this.instance!.listPhoneNumbers(opts)),
        this.instance.fetchAllPages<NumberOrder>((opts) => this.instance!.listNumberOrders(opts)),
        this.instance.fetchAllPages<PortOrder>((opts) => this.instance!.listPortOrders(opts)),
      ]);

      this.numPhoneNumbers = this.numMergePhoneNumbers(dids, orders, ports);
      this.numIsLoadingNumbers = false;
      this.render();
    } catch (err) {
      this.numLoadError = err instanceof Error ? err.message : String(err);
      this.numIsLoadingNumbers = false;
      this.render();
    }
  }

  private numMergePhoneNumbers(
    dids: DIDItem[],
    orders: NumberOrder[],
    ports: PortOrder[]
  ): PhoneNumberItem[] {
    const map = new Map<string, PhoneNumberItem>();

    const activePortNumbers = new Set<string>();
    for (const port of ports) {
      if (port.status !== 'complete' && port.status !== 'cancelled') {
        for (const num of port.details.phone_numbers) {
          activePortNumbers.add(num);
        }
      }
    }

    for (const did of dids) {
      if (did.status === 'inactive' && activePortNumbers.has(did.phone_number)) continue;
      map.set(did.phone_number, {
        phone_number: did.phone_number,
        status: did.status as PhoneNumberStatus,
        number_class: did.number_class,
        expires_at: did.expires_at,
        outbound_enabled: did.outbound_enabled,
        caller_id_name: did.caller_id_name,
        routing_target: did.routing_target,
        source: 'did',
        created_at: did.created_at,
        updated_at: did.updated_at,
      });
    }

    for (const order of orders) {
      if (order.status !== 'pending' && order.status !== 'partial') continue;
      for (const num of order.phone_numbers) {
        if (order.completed_numbers.includes(num)) continue;
        if (map.has(num)) continue;
        const isFailed = order.failed_numbers.includes(num);
        map.set(num, {
          phone_number: num,
          status: isFailed ? 'order_failed' : 'ordering',
          outbound_enabled: null,
          source: 'number_order',
          created_at: order.created_at,
          updated_at: order.updated_at,
          order_id: order.id,
        });
      }
    }

    for (const port of ports) {
      if (port.status === 'complete' || port.status === 'cancelled') continue;
      const portStatusMap: Record<string, PhoneNumberStatus> = {
        draft: 'porting_draft',
        approved: 'porting_approved',
        submitted: 'porting_submitted',
        exception: 'porting_exception',
        foc: 'porting_foc',
      };
      const portStatus = portStatusMap[port.status] || 'porting_draft';
      for (const num of port.details.phone_numbers) {
        if (map.has(num)) continue;
        map.set(num, {
          phone_number: num,
          status: portStatus,
          outbound_enabled: null,
          carrier: port.details.losing_carrier?.name,
          transfer_date: port.details.actual_foc_date || port.details.requested_foc_date,
          source: 'port_order',
          created_at: port.created_at,
          updated_at: port.updated_at,
          port_order_id: port.id,
        });
      }
    }

    return Array.from(map.values()).sort((a, b) => a.phone_number.localeCompare(b.phone_number));
  }

  // ============================================================================
  // Numbers Step — Order Flow
  // ============================================================================

  private async numSearchNumbers(): Promise<void> {
    if (!this.instance) return;
    this.numOrderIsSearching = true;
    this.numOrderError = null;
    this.numOrderAvailableNumbers = [];
    this.numOrderSelectedNumbers.clear();
    this.render();

    try {
      const opts: Record<string, string | number> = { quantity: this.numOrderQuantity };
      switch (this.numOrderSearchType) {
        case 'area_code':
          opts.areaCode = this.numOrderSearchValue;
          break;
        case 'city_state':
          opts.city = this.numOrderSearchCity;
          opts.state = this.numOrderSearchState;
          break;
        case 'zip':
          opts.zip = this.numOrderSearchValue;
          break;
      }

      const results = await this.instance.searchAvailableNumbers(opts as never);
      this.numOrderAvailableNumbers = results;
      this.numOrderIsSearching = false;
      this.numSubStep = 'order-results';
      this.render();
    } catch (err) {
      this.numOrderError = err instanceof Error ? err.message : String(err);
      this.numOrderIsSearching = false;
      this.render();
    }
  }

  private async numPlaceOrder(): Promise<void> {
    if (!this.instance || this.numOrderSelectedNumbers.size === 0 || this.numOrderIsPlacing) return;
    this.numOrderIsPlacing = true;
    this.numOrderError = null;
    this.render();

    try {
      const order = await this.instance.createPhoneNumberOrder(
        Array.from(this.numOrderSelectedNumbers)
      );
      this.numOrderCurrentOrder = order;
      this.numSubStep = 'order-status';
      this.numOrderPollCount = 0;
      this.render();
      this.numStartOrderPoll(order.id);
    } catch (err) {
      this.numOrderError = err instanceof Error ? err.message : String(err);
      this.render();
    } finally {
      this.numOrderIsPlacing = false;
    }
  }

  private numStartOrderPoll(orderId: string): void {
    this.numStopOrderPoll();
    this.numOrderPollTimer = setTimeout(async () => {
      if (!this.instance) return;
      try {
        const order = await this.instance.getPhoneNumberOrder(orderId);
        this.numOrderCurrentOrder = order;
        this.numOrderPollCount++;
        this.render();
        if (order.status === 'pending' && this.numOrderPollCount < 5) {
          this.numStartOrderPoll(orderId);
        }
      } catch {
        // Silently stop polling on error
      }
    }, 2000);
  }

  private numStopOrderPoll(): void {
    if (this.numOrderPollTimer) {
      clearTimeout(this.numOrderPollTimer);
      this.numOrderPollTimer = null;
    }
  }

  private numResetOrderFlow(): void {
    this.numOrderSearchType = 'area_code';
    this.numOrderSearchValue = '';
    this.numOrderSearchCity = '';
    this.numOrderSearchState = '';
    this.numOrderQuantity = 5;
    this.numOrderIsSearching = false;
    this.numOrderIsPlacing = false;
    this.numOrderAvailableNumbers = [];
    this.numOrderSelectedNumbers.clear();
    this.numOrderCurrentOrder = null;
    this.numOrderError = null;
    this.numStopOrderPoll();
    this.numOrderPollCount = 0;
  }

  // ============================================================================
  // Numbers Step — Port Flow
  // ============================================================================

  private async numCheckPortEligibility(): Promise<void> {
    if (!this.instance) return;

    // Validate all phone inputs
    const validNumbers: string[] = [];
    for (const input of this.numPortPhoneInputs) {
      const trimmed = input.trim();
      if (!trimmed) continue;
      const parsed = parsePhoneNumberFromString(trimmed, 'US');
      if (!parsed || !parsed.isValid()) {
        this.numPortEligibilityError = this.t('accountOnboarding.numbers.validation.phoneInvalid');
        this.render();
        return;
      }
      validNumbers.push(parsed.format('E.164'));
    }

    if (validNumbers.length === 0) {
      this.numPortEligibilityError = this.t('accountOnboarding.numbers.validation.phoneRequired');
      this.render();
      return;
    }

    this.numPortIsCheckingEligibility = true;
    this.numPortEligibilityError = null;
    this.render();

    try {
      const result = await this.instance.checkPortEligibility(validNumbers);
      this.numPortEligibilityResult = result;
      this.numPortIsCheckingEligibility = false;
      this.numSubStep = 'port-eligibility';
      this.render();
    } catch (err) {
      this.numPortEligibilityError = err instanceof Error ? err.message : String(err);
      this.numPortIsCheckingEligibility = false;
      this.render();
    }
  }

  private numValidateSubscriber(): boolean {
    const errors: Record<string, string> = {};
    const t = (key: string): string => this.t(key);

    if (!this.numPortSubscriberBtn.trim()) {
      errors.btn = t('accountOnboarding.numbers.validation.btnRequired');
    } else {
      const parsed = parsePhoneNumberFromString(this.numPortSubscriberBtn, 'US');
      if (!parsed || !parsed.isValid()) {
        errors.btn = t('accountOnboarding.numbers.validation.btnInvalid');
      }
    }
    if (!this.numPortSubscriberBusinessName.trim()) {
      errors.businessName = t('accountOnboarding.numbers.validation.businessNameRequired');
    }
    if (!this.numPortSubscriberApproverName.trim()) {
      errors.approverName = t('accountOnboarding.numbers.validation.approverNameRequired');
    }
    if (!this.numPortSubscriberHouseNumber.trim()) {
      errors.houseNumber = t('accountOnboarding.numbers.validation.houseNumberRequired');
    }
    if (!this.numPortSubscriberStreetName.trim()) {
      errors.streetName = t('accountOnboarding.numbers.validation.streetNameRequired');
    }
    if (!this.numPortSubscriberCity.trim()) {
      errors.city = t('accountOnboarding.numbers.validation.cityRequired');
    }
    if (!this.numPortSubscriberState.trim()) {
      errors.state = t('accountOnboarding.numbers.validation.stateRequired');
    }
    if (!this.numPortSubscriberZip.trim()) {
      errors.zip = t('accountOnboarding.numbers.validation.zipRequired');
    }

    this.numPortSubscriberErrors = errors;
    return Object.keys(errors).length === 0;
  }

  private numValidateFocDate(): boolean {
    const errors: Record<string, string> = {};
    const t = (key: string): string => this.t(key);

    if (!this.numPortFocDate) {
      errors.date = t('accountOnboarding.numbers.validation.focDateRequired');
    } else {
      const focDate = new Date(this.numPortFocDate + 'T00:00:00');
      const today = new Date();
      today.setHours(0, 0, 0, 0);

      // Count business days
      let bizDays = 0;
      const check = new Date(today);
      while (bizDays < 5) {
        check.setDate(check.getDate() + 1);
        const day = check.getDay();
        if (day !== 0 && day !== 6) bizDays++;
      }
      if (focDate < check) {
        errors.date = t('accountOnboarding.numbers.validation.focDateTooSoon');
      }

      const maxDate = new Date(today);
      maxDate.setDate(maxDate.getDate() + 30);
      if (focDate > maxDate) {
        errors.date = t('accountOnboarding.numbers.validation.focDateTooFar');
      }
    }

    if (!this.numPortFocTime) {
      errors.time = t('accountOnboarding.numbers.validation.focTimeRequired');
    }

    this.numPortFocErrors = errors;
    return Object.keys(errors).length === 0;
  }

  private async numCreateAndSubmitPort(): Promise<void> {
    if (!this.instance || !this.numPortEligibilityResult) return;

    this.numPortIsSubmitting = true;
    this.numPortSubmitError = null;
    this.render();

    try {
      const portableNumbers = this.numPortEligibilityResult.portable_numbers.map(
        (n) => n.phone_number
      );

      const btnParsed = parsePhoneNumberFromString(this.numPortSubscriberBtn, 'US');

      const request: CreatePortOrderRequest = {
        phone_numbers: portableNumbers,
        subscriber: {
          btn: btnParsed?.format('E.164') || this.numPortSubscriberBtn,
          business_name: this.numPortSubscriberBusinessName.trim(),
          approver_name: this.numPortSubscriberApproverName.trim(),
          account_number: this.numPortSubscriberAccountNumber.trim() || undefined,
          pin: this.numPortSubscriberPin.trim() || undefined,
          address: {
            house_number: this.numPortSubscriberHouseNumber.trim(),
            street_name: this.numPortSubscriberStreetName.trim(),
            line2: this.numPortSubscriberLine2.trim() || undefined,
            city: this.numPortSubscriberCity.trim(),
            state: this.numPortSubscriberState.trim(),
            zip: this.numPortSubscriberZip.trim(),
          },
        },
        requested_foc_date: this.numPortFocDate,
        requested_foc_time: this.numPortFocTime || undefined,
      };

      // 1. Create draft port order
      const order = await this.instance.createPortOrder(request);

      // 2. Upload documents if provided
      if (this.numPortBillCopyFile) {
        await this.instance.uploadBillCopy(order.id, this.numPortBillCopyFile);
      }
      if (this.numPortCsrFile) {
        await this.instance.uploadCSR(order.id, this.numPortCsrFile);
      }

      // 3. Approve with signature
      await this.instance.approvePortOrder(order.id, {
        signature: this.numPortSignature.trim(),
        ip: '0.0.0.0', // Client IP — server overrides with real IP
      });

      // 4. Submit
      const submitted = await this.instance.submitPortOrder(order.id);

      this.numPortCurrentOrder = submitted;
      this.numPortIsSubmitting = false;
      this.numSubStep = 'port-submitted';
      this.render();
    } catch (err) {
      this.numPortSubmitError = err instanceof Error ? err.message : String(err);
      this.numPortIsSubmitting = false;
      this.render();
    }
  }

  private numResetPortFlow(): void {
    this.numPortPhoneInputs = [''];
    this.numPortEligibilityResult = null;
    this.numPortIsCheckingEligibility = false;
    this.numPortEligibilityError = null;
    this.numPortSubscriberBtn = '';
    this.numPortSubscriberBusinessName = '';
    this.numPortSubscriberApproverName = '';
    this.numPortSubscriberAccountNumber = '';
    this.numPortSubscriberPin = '';
    this.numPortSubscriberHouseNumber = '';
    this.numPortSubscriberStreetName = '';
    this.numPortSubscriberLine2 = '';
    this.numPortSubscriberCity = '';
    this.numPortSubscriberState = '';
    this.numPortSubscriberZip = '';
    this.numPortSubscriberErrors = {};
    this.numPortFocDate = '';
    this.numPortFocTime = '';
    this.numPortFocErrors = {};
    this.numPortCsrFile = null;
    this.numPortBillCopyFile = null;
    this.numPortDocUploadError = null;
    this.numPortSignature = '';
    this.numPortCurrentOrder = null;
    this.numPortIsSubmitting = false;
    this.numPortSubmitError = null;
  }

  private numFormatPhone(e164: string): string {
    const parsed = parsePhoneNumberFromString(e164, 'US');
    return parsed ? parsed.formatNational() : e164;
  }

  private numGetStatusBadgeClass(status: PhoneNumberStatus): string {
    if (status === 'active') return 'num-status-active';
    if (status === 'ordering') return 'num-status-ordering';
    if (status === 'order_failed' || status === 'porting_exception') return 'num-status-error';
    if (status === 'inactive' || status === 'released') return 'num-status-inactive';
    return 'num-status-porting';
  }

  // ============================================================================
  // Numbers Step — Sub-step Renderers
  // ============================================================================

  private renderNumOverview(): string {
    const t = (key: string): string => this.t(key);

    if (this.numIsLoadingNumbers) {
      return `
        <div class="placeholder">
          <div class="spinner"></div>
        </div>`;
    }

    if (this.numLoadError) {
      return `
        <div class="inline-alert error">${this.escapeHtml(this.numLoadError)}</div>
        <button class="btn btn-secondary" style="margin-top:var(--ds-layout-spacing-sm)" data-action="num-retry-load">
          ${t('accountOnboarding.numbers.overview.retry')}
        </button>`;
    }

    let tableHtml: string;
    if (this.numPhoneNumbers.length > 0) {
      const rows = this.numPhoneNumbers
        .map((item) => {
          const statusKey = `accountOnboarding.numbers.status.${item.status}`;
          const sourceKey = `accountOnboarding.numbers.source.${item.source}`;
          const badgeClass = this.numGetStatusBadgeClass(item.status);
          return `
          <tr>
            <td>${this.numFormatPhone(item.phone_number)}</td>
            <td><span class="num-status-badge ${badgeClass}">${t(statusKey)}</span></td>
            <td>${t(sourceKey)}</td>
          </tr>`;
        })
        .join('');

      tableHtml = `
        <table class="num-overview-list">
          <thead>
            <tr>
              <th>${t('accountOnboarding.numbers.overview.phoneNumber')}</th>
              <th>${t('accountOnboarding.numbers.overview.status')}</th>
              <th>${t('accountOnboarding.numbers.overview.source')}</th>
            </tr>
          </thead>
          <tbody>${rows}</tbody>
        </table>`;
    } else {
      tableHtml = `
        <p class="section-description" style="text-align:center;padding:var(--ds-layout-spacing-md) 0">
          ${t('accountOnboarding.numbers.overview.empty')}
        </p>`;
    }

    return `
      ${tableHtml}
      <div class="num-action-cards">
        <div class="num-action-card" data-action="num-start-order" tabindex="0" role="button">
          <div class="num-action-card-title">${t('accountOnboarding.numbers.overview.requestNew')}</div>
          <div class="num-action-card-desc">${t('accountOnboarding.numbers.overview.requestNewDesc')}</div>
        </div>
        <div class="num-action-card" data-action="num-start-port" tabindex="0" role="button">
          <div class="num-action-card-title">${t('accountOnboarding.numbers.overview.portExisting')}</div>
          <div class="num-action-card-desc">${t('accountOnboarding.numbers.overview.portExistingDesc')}</div>
        </div>
      </div>`;
  }

  private renderNumOrderSearch(): string {
    const t = (key: string): string => this.t(key);

    const tabs = (['area_code', 'city_state', 'zip'] as const)
      .map((type) => {
        const labelMap: Record<SearchType, string> = {
          area_code: t('accountOnboarding.numbers.order.searchByAreaCode'),
          city_state: t('accountOnboarding.numbers.order.searchByCityState'),
          zip: t('accountOnboarding.numbers.order.searchByZip'),
        };
        return `<button class="num-search-type-tab${this.numOrderSearchType === type ? ' active' : ''}"
          data-action="num-set-search-type" data-search-type="${type}">${labelMap[type]}</button>`;
      })
      .join('');

    let fieldsHtml = '';
    switch (this.numOrderSearchType) {
      case 'area_code':
        fieldsHtml = `
          <div class="form-group">
            <label class="form-label">${t('accountOnboarding.numbers.order.areaCodeLabel')}</label>
            <input class="form-input" type="text" id="num-area-code" maxlength="3"
              value="${this.escapeHtml(this.numOrderSearchValue)}"
              placeholder="${t('accountOnboarding.numbers.order.areaCodePlaceholder')}" />
          </div>`;
        break;
      case 'city_state':
        fieldsHtml = `
          <div class="form-group">
            <label class="form-label">${t('accountOnboarding.numbers.order.cityLabel')}</label>
            <input class="form-input" type="text" id="num-search-city"
              value="${this.escapeHtml(this.numOrderSearchCity)}"
              placeholder="${t('accountOnboarding.numbers.order.cityPlaceholder')}" />
          </div>
          <div class="form-group">
            <label class="form-label">${t('accountOnboarding.numbers.order.stateLabel')}</label>
            <select class="form-select" id="num-search-state">
              <option value="">${t('accountOnboarding.numbers.order.statePlaceholder')}</option>
              ${US_STATES.map(
                ([code, name]) =>
                  `<option value="${this.escapeHtml(code)}"${this.numOrderSearchState === code ? ' selected' : ''}>${this.escapeHtml(name)}</option>`
              ).join('')}
            </select>
          </div>`;
        break;
      case 'zip':
        fieldsHtml = `
          <div class="form-group">
            <label class="form-label">${t('accountOnboarding.numbers.order.zipLabel')}</label>
            <input class="form-input" type="text" id="num-zip-code" maxlength="5"
              value="${this.escapeHtml(this.numOrderSearchValue)}"
              placeholder="${t('accountOnboarding.numbers.order.zipPlaceholder')}" />
          </div>`;
        break;
    }

    return `
      <h3 class="section-heading">${t('accountOnboarding.numbers.order.searchTitle')}</h3>
      <p class="section-description">${t('accountOnboarding.numbers.order.searchSubtitle')}</p>
      <div class="num-search-type-tabs">${tabs}</div>
      ${fieldsHtml}
      <div class="form-group">
        <label class="form-label">${t('accountOnboarding.numbers.order.quantityLabel')}</label>
        <input class="form-input" type="number" id="num-quantity" min="1" max="50"
          value="${this.numOrderQuantity}" />
      </div>
      ${this.numOrderError ? `<div class="inline-alert error">${this.escapeHtml(this.numOrderError)}</div>` : ''}
      <div class="num-sub-footer">
        <button class="btn btn-secondary" data-action="num-back-to-overview">
          ${t('accountOnboarding.numbers.nav.cancel')}
        </button>
        <button class="btn btn-primary" data-action="num-search"${this.numOrderIsSearching ? ' disabled' : ''}>
          ${this.numOrderIsSearching ? t('accountOnboarding.numbers.order.searching') : t('accountOnboarding.numbers.order.search')}
        </button>
      </div>`;
  }

  private renderNumOrderResults(): string {
    const t = (key: string): string => this.t(key);

    if (this.numOrderAvailableNumbers.length === 0) {
      return `
        <h3 class="section-heading">${t('accountOnboarding.numbers.order.resultsTitle')}</h3>
        <p class="section-description">${t('accountOnboarding.numbers.order.noResults')}</p>
        <div class="num-sub-footer">
          <button class="btn btn-secondary" data-action="num-back-to-search">
            ${t('accountOnboarding.numbers.nav.back')}
          </button>
        </div>`;
    }

    const rows = this.numOrderAvailableNumbers
      .map((num) => {
        const isSelected = this.numOrderSelectedNumbers.has(num.phone_number);
        return `
        <tr>
          <td><input type="checkbox" data-action="num-toggle-number" data-phone="${this.escapeHtml(num.phone_number)}"${isSelected ? ' checked' : ''} /></td>
          <td>${this.numFormatPhone(num.phone_number)}</td>
          <td>${this.escapeHtml(num.city)}</td>
          <td>${this.escapeHtml(num.state)}</td>
          <td>${this.escapeHtml(num.rate_center)}</td>
        </tr>`;
      })
      .join('');

    const allSelected = this.numOrderSelectedNumbers.size === this.numOrderAvailableNumbers.length;

    return `
      <h3 class="section-heading">${t('accountOnboarding.numbers.order.resultsTitle')}</h3>
      <p class="section-description">${t('accountOnboarding.numbers.order.resultsSubtitle')}</p>
      <div style="margin-bottom:var(--ds-spacing-sm)">
        <button class="btn-link" data-action="num-select-all">
          ${allSelected ? t('accountOnboarding.numbers.order.deselectAll') : t('accountOnboarding.numbers.order.selectAll')}
        </button>
        <span style="font-size:var(--ds-font-size-small);color:var(--ds-color-text-secondary);margin-left:var(--ds-spacing-sm)">
          ${this.numOrderSelectedNumbers.size} ${t('accountOnboarding.numbers.order.selected')}
        </span>
      </div>
      <table class="num-results-table">
        <thead>
          <tr>
            <th style="width:40px"></th>
            <th>${t('accountOnboarding.numbers.overview.phoneNumber')}</th>
            <th>${t('accountOnboarding.numbers.order.city')}</th>
            <th>${t('accountOnboarding.numbers.order.state')}</th>
            <th>${t('accountOnboarding.numbers.order.rateCenter')}</th>
          </tr>
        </thead>
        <tbody>${rows}</tbody>
      </table>
      <div class="num-sub-footer">
        <button class="btn btn-secondary" data-action="num-back-to-search">
          ${t('accountOnboarding.numbers.nav.back')}
        </button>
        <button class="btn btn-primary" data-action="num-confirm-order"${this.numOrderSelectedNumbers.size === 0 ? ' disabled' : ''}>
          ${t('accountOnboarding.numbers.nav.next')}
        </button>
      </div>`;
  }

  private renderNumOrderConfirm(): string {
    const t = (key: string): string => this.t(key);

    const items = Array.from(this.numOrderSelectedNumbers)
      .map((num) => `<div class="num-confirm-item">${this.numFormatPhone(num)}</div>`)
      .join('');

    return `
      <h3 class="section-heading">${t('accountOnboarding.numbers.order.confirmTitle')}</h3>
      <p class="section-description">${t('accountOnboarding.numbers.order.confirmSubtitle')}</p>
      <div class="num-confirm-list">${items}</div>
      ${this.numOrderError ? `<div class="inline-alert error">${this.escapeHtml(this.numOrderError)}</div>` : ''}
      <div class="num-sub-footer">
        <button class="btn btn-secondary" data-action="num-back-to-results">
          ${t('accountOnboarding.numbers.nav.back')}
        </button>
        <button class="btn btn-primary" data-action="num-place-order"${this.numOrderIsPlacing ? ' disabled' : ''}>
          ${this.numOrderIsPlacing ? t('accountOnboarding.numbers.order.placing') : t('accountOnboarding.numbers.order.placeOrder')}
        </button>
      </div>`;
  }

  private renderNumOrderStatus(): string {
    const t = (key: string): string => this.t(key);
    const order = this.numOrderCurrentOrder;
    if (!order) return '';

    let icon = '';
    let message = '';
    const pollExhausted = order.status === 'pending' && this.numOrderPollCount >= 5;
    switch (order.status) {
      case 'pending':
        if (pollExhausted) {
          icon = `<div class="num-order-status-icon pending">${SUCCESS_SVG}</div>`;
          message = t('accountOnboarding.numbers.order.statusStalled');
        } else {
          icon = `<div class="num-order-status-icon pending"><div class="spinner"></div></div>`;
          message = t('accountOnboarding.numbers.order.statusPending');
        }
        break;
      case 'complete':
        icon = `<div class="num-order-status-icon success">${SUCCESS_SVG}</div>`;
        message = t('accountOnboarding.numbers.order.statusComplete');
        break;
      case 'failed':
        icon = `<div class="num-order-status-icon error">${ERROR_SVG}</div>`;
        message = t('accountOnboarding.numbers.order.statusFailed');
        break;
      case 'partial':
        icon = `<div class="num-order-status-icon success">${SUCCESS_SVG}</div>`;
        message = t('accountOnboarding.numbers.order.statusPartial');
        break;
    }

    const showDone = order.status !== 'pending' || pollExhausted;

    return `
      <h3 class="section-heading">${t('accountOnboarding.numbers.order.statusTitle')}</h3>
      <div class="placeholder" style="min-height:120px">
        ${icon}
        <p class="placeholder-text">${message}</p>
      </div>
      ${
        showDone
          ? `
        <div class="num-sub-footer num-sub-footer-end">
          <button class="btn btn-primary" data-action="num-order-done">
            ${t('accountOnboarding.numbers.order.done')}
          </button>
        </div>`
          : ''
      }`;
  }

  private renderNumPortNumbers(): string {
    const t = (key: string): string => this.t(key);

    const inputs = this.numPortPhoneInputs
      .map((val, i) => {
        return `
        <div class="num-phone-input-row">
          <input class="form-input" type="tel" id="num-port-phone-${i}"
            value="${this.escapeHtml(val)}"
            placeholder="${t('accountOnboarding.numbers.port.phonePlaceholder')}" />
          ${
            this.numPortPhoneInputs.length > 1
              ? `
            <button class="btn-danger-ghost" data-action="num-remove-port-phone" data-index="${i}">
              ${t('accountOnboarding.numbers.port.removeNumber')}
            </button>`
              : ''
          }
        </div>`;
      })
      .join('');

    return `
      <h3 class="section-heading">${t('accountOnboarding.numbers.port.numbersTitle')}</h3>
      <p class="section-description">${t('accountOnboarding.numbers.port.numbersSubtitle')}</p>
      ${inputs}
      <button class="btn-link" data-action="num-add-port-phone" style="margin-bottom:var(--ds-layout-spacing-md)">
        ${t('accountOnboarding.numbers.port.addAnother')}
      </button>
      ${this.numPortEligibilityError ? `<div class="inline-alert error">${this.escapeHtml(this.numPortEligibilityError)}</div>` : ''}
      <div class="num-sub-footer">
        <button class="btn btn-secondary" data-action="num-back-to-overview">
          ${t('accountOnboarding.numbers.nav.cancel')}
        </button>
        <button class="btn btn-primary" data-action="num-check-eligibility"${this.numPortIsCheckingEligibility ? ' disabled' : ''}>
          ${this.numPortIsCheckingEligibility ? t('accountOnboarding.numbers.port.checking') : t('accountOnboarding.numbers.port.checkEligibility')}
        </button>
      </div>`;
  }

  private renderNumPortEligibility(): string {
    const t = (key: string): string => this.t(key);
    const result = this.numPortEligibilityResult;
    if (!result) return '';

    const portableRows = result.portable_numbers
      .map(
        (n) => `
        <tr>
          <td>${this.numFormatPhone(n.phone_number)}</td>
          <td><span class="num-status-badge num-status-active">${t('accountOnboarding.numbers.port.portable')}</span></td>
          <td>${this.escapeHtml(n.losing_carrier_name || '—')}</td>
          <td>${n.is_wireless ? t('accountOnboarding.numbers.port.wirelessYes') : t('accountOnboarding.numbers.port.wirelessNo')}</td>
        </tr>`
      )
      .join('');

    const nonPortableRows = result.non_portable_numbers
      .map(
        (n) => `
        <tr>
          <td>${this.numFormatPhone(n.phone_number)}</td>
          <td><span class="num-status-badge num-status-error">${t('accountOnboarding.numbers.port.notPortable')}</span></td>
          <td>—</td>
          <td>—</td>
        </tr>`
      )
      .join('');

    const hasPortable = result.portable_numbers.length > 0;

    return `
      <h3 class="section-heading">${t('accountOnboarding.numbers.port.eligibilityTitle')}</h3>
      <p class="section-description">${t('accountOnboarding.numbers.port.eligibilitySubtitle')}</p>
      <table class="num-eligibility-table">
        <thead>
          <tr>
            <th>${t('accountOnboarding.numbers.overview.phoneNumber')}</th>
            <th>${t('accountOnboarding.numbers.overview.status')}</th>
            <th>${t('accountOnboarding.numbers.port.carrier')}</th>
            <th>${t('accountOnboarding.numbers.port.wireless')}</th>
          </tr>
        </thead>
        <tbody>${portableRows}${nonPortableRows}</tbody>
      </table>
      ${!hasPortable ? `<div class="inline-alert error">${t('accountOnboarding.numbers.port.noPortable')}</div>` : ''}
      <div class="num-sub-footer">
        <button class="btn btn-secondary" data-action="num-back-to-port-numbers">
          ${t('accountOnboarding.numbers.nav.back')}
        </button>
        ${
          hasPortable
            ? `
          <button class="btn btn-primary" data-action="num-to-subscriber">
            ${t('accountOnboarding.numbers.port.continueWithPortable')}
          </button>`
            : ''
        }
      </div>`;
  }

  private renderNumPortSubscriber(): string {
    const t = (key: string): string => this.t(key);
    const e = this.numPortSubscriberErrors;

    const stateOptions = US_STATES.map(
      ([code, name]) =>
        `<option value="${this.escapeHtml(code)}"${this.numPortSubscriberState === code ? ' selected' : ''}>${this.escapeHtml(name)}</option>`
    ).join('');

    return `
      <h3 class="section-heading">${t('accountOnboarding.numbers.port.subscriberTitle')}</h3>
      <p class="section-description">${t('accountOnboarding.numbers.port.subscriberSubtitle')}</p>
      <div class="num-port-subscriber-form">
        <div class="form-group">
          <label class="form-label">${t('accountOnboarding.numbers.port.btnLabel')}</label>
          <input class="form-input${e.btn ? ' error' : ''}" type="tel" id="num-port-btn"
            value="${this.escapeHtml(this.numPortSubscriberBtn)}"
            placeholder="${t('accountOnboarding.numbers.port.btnPlaceholder')}" />
          ${e.btn ? `<div class="form-error">${this.escapeHtml(e.btn)}</div>` : ''}
        </div>
        <div class="form-group">
          <label class="form-label">${t('accountOnboarding.numbers.port.businessNameLabel')}</label>
          <input class="form-input${e.businessName ? ' error' : ''}" type="text" id="num-port-business-name"
            value="${this.escapeHtml(this.numPortSubscriberBusinessName)}"
            placeholder="${t('accountOnboarding.numbers.port.businessNamePlaceholder')}" />
          ${e.businessName ? `<div class="form-error">${this.escapeHtml(e.businessName)}</div>` : ''}
        </div>
        <div class="form-group">
          <label class="form-label">${t('accountOnboarding.numbers.port.approverNameLabel')}</label>
          <input class="form-input${e.approverName ? ' error' : ''}" type="text" id="num-port-approver-name"
            value="${this.escapeHtml(this.numPortSubscriberApproverName)}"
            placeholder="${t('accountOnboarding.numbers.port.approverNamePlaceholder')}" />
          ${e.approverName ? `<div class="form-error">${this.escapeHtml(e.approverName)}</div>` : ''}
        </div>
        <div class="form-group">
          <label class="form-label">${t('accountOnboarding.numbers.port.accountNumberLabel')}</label>
          <input class="form-input" type="text" id="num-port-account-number"
            value="${this.escapeHtml(this.numPortSubscriberAccountNumber)}"
            placeholder="${t('accountOnboarding.numbers.port.accountNumberPlaceholder')}" />
        </div>
        <div class="form-group">
          <label class="form-label">${t('accountOnboarding.numbers.port.pinLabel')}</label>
          <input class="form-input" type="text" id="num-port-pin"
            value="${this.escapeHtml(this.numPortSubscriberPin)}"
            placeholder="${t('accountOnboarding.numbers.port.pinPlaceholder')}" />
        </div>
        <hr class="section-divider" />
        <h4 class="section-heading" style="font-size:var(--ds-font-size-base)">${t('accountOnboarding.numbers.port.addressHeading')}</h4>
        <div class="num-port-address-grid">
          <div class="form-group">
            <label class="form-label">${t('accountOnboarding.numbers.port.houseNumberLabel')}</label>
            <input class="form-input${e.houseNumber ? ' error' : ''}" type="text" id="num-port-house-number"
              value="${this.escapeHtml(this.numPortSubscriberHouseNumber)}"
              placeholder="${t('accountOnboarding.numbers.port.houseNumberPlaceholder')}" />
            ${e.houseNumber ? `<div class="form-error">${this.escapeHtml(e.houseNumber)}</div>` : ''}
          </div>
          <div class="form-group">
            <label class="form-label">${t('accountOnboarding.numbers.port.streetNameLabel')}</label>
            <input class="form-input${e.streetName ? ' error' : ''}" type="text" id="num-port-street-name"
              value="${this.escapeHtml(this.numPortSubscriberStreetName)}"
              placeholder="${t('accountOnboarding.numbers.port.streetNamePlaceholder')}" />
            ${e.streetName ? `<div class="form-error">${this.escapeHtml(e.streetName)}</div>` : ''}
          </div>
        </div>
        <div class="form-group">
          <label class="form-label">${t('accountOnboarding.numbers.port.line2Label')}</label>
          <input class="form-input" type="text" id="num-port-line2"
            value="${this.escapeHtml(this.numPortSubscriberLine2)}"
            placeholder="${t('accountOnboarding.numbers.port.line2Placeholder')}" />
        </div>
        <div class="num-port-address-row-2">
          <div class="form-group">
            <label class="form-label">${t('accountOnboarding.numbers.port.cityLabel')}</label>
            <input class="form-input${e.city ? ' error' : ''}" type="text" id="num-port-city"
              value="${this.escapeHtml(this.numPortSubscriberCity)}"
              placeholder="${t('accountOnboarding.numbers.port.cityPlaceholder')}" />
            ${e.city ? `<div class="form-error">${this.escapeHtml(e.city)}</div>` : ''}
          </div>
          <div class="form-group">
            <label class="form-label">${t('accountOnboarding.numbers.port.stateLabel')}</label>
            <select class="form-select${e.state ? ' error' : ''}" id="num-port-state">
              <option value="">${t('accountOnboarding.numbers.port.statePlaceholder')}</option>
              ${stateOptions}
            </select>
            ${e.state ? `<div class="form-error">${this.escapeHtml(e.state)}</div>` : ''}
          </div>
          <div class="form-group">
            <label class="form-label">${t('accountOnboarding.numbers.port.zipLabel')}</label>
            <input class="form-input${e.zip ? ' error' : ''}" type="text" id="num-port-zip" maxlength="5"
              value="${this.escapeHtml(this.numPortSubscriberZip)}"
              placeholder="${t('accountOnboarding.numbers.port.zipPlaceholder')}" />
            ${e.zip ? `<div class="form-error">${this.escapeHtml(e.zip)}</div>` : ''}
          </div>
        </div>
      </div>
      <div class="num-sub-footer">
        <button class="btn btn-secondary" data-action="num-back-to-eligibility">
          ${t('accountOnboarding.numbers.nav.back')}
        </button>
        <button class="btn btn-primary" data-action="num-to-foc-date">
          ${t('accountOnboarding.numbers.nav.next')}
        </button>
      </div>`;
  }

  private renderNumPortFocDate(): string {
    const t = (key: string): string => this.t(key);
    const e = this.numPortFocErrors;

    // Calculate min date (5 business days)
    const today = new Date();
    let bizDays = 0;
    const minDate = new Date(today);
    while (bizDays < 5) {
      minDate.setDate(minDate.getDate() + 1);
      const day = minDate.getDay();
      if (day !== 0 && day !== 6) bizDays++;
    }
    const minStr = `${minDate.getFullYear()}-${String(minDate.getMonth() + 1).padStart(2, '0')}-${String(minDate.getDate()).padStart(2, '0')}`;

    const maxDate = new Date(today);
    maxDate.setDate(maxDate.getDate() + 30);
    const maxStr = `${maxDate.getFullYear()}-${String(maxDate.getMonth() + 1).padStart(2, '0')}-${String(maxDate.getDate()).padStart(2, '0')}`;

    // Time options: 8AM-8PM ET in 30-min increments
    const timeOptions: string[] = [];
    for (let h = 8; h <= 20; h++) {
      for (const m of ['00', '30']) {
        if (h === 20 && m === '30') continue;
        const hStr = h.toString().padStart(2, '0');
        const ampm = h >= 12 ? 'PM' : 'AM';
        const h12 = h > 12 ? h - 12 : h === 0 ? 12 : h;
        timeOptions.push(
          `<option value="${hStr}:${m}"${this.numPortFocTime === `${hStr}:${m}` ? ' selected' : ''}>${h12}:${m} ${ampm} ET</option>`
        );
      }
    }

    return `
      <h3 class="section-heading">${t('accountOnboarding.numbers.port.focTitle')}</h3>
      <p class="section-description">${t('accountOnboarding.numbers.port.focSubtitle')}</p>
      <div class="form-group">
        <label class="form-label">${t('accountOnboarding.numbers.port.focDateLabel')}</label>
        <input class="form-input${e.date ? ' error' : ''}" type="date" id="num-port-foc-date"
          value="${this.escapeHtml(this.numPortFocDate)}" min="${minStr}" max="${maxStr}" />
        ${e.date ? `<div class="form-error">${this.escapeHtml(e.date)}</div>` : ''}
      </div>
      <div class="form-group">
        <label class="form-label">${t('accountOnboarding.numbers.port.focTimeLabel')}</label>
        <select class="form-select${e.time ? ' error' : ''}" id="num-port-foc-time">
          <option value="">${t('accountOnboarding.numbers.port.focTimePlaceholder')}</option>
          ${timeOptions.join('')}
        </select>
        ${e.time ? `<div class="form-error">${this.escapeHtml(e.time)}</div>` : ''}
      </div>
      <div class="num-sub-footer">
        <button class="btn btn-secondary" data-action="num-back-to-subscriber">
          ${t('accountOnboarding.numbers.nav.back')}
        </button>
        <button class="btn btn-primary" data-action="num-to-documents">
          ${t('accountOnboarding.numbers.nav.next')}
        </button>
      </div>`;
  }

  private renderNumPortDocuments(): string {
    const t = (key: string): string => this.t(key);

    const billFileName = this.numPortBillCopyFile
      ? `${t('accountOnboarding.numbers.port.fileSelected')} ${this.escapeHtml(this.numPortBillCopyFile.name)}`
      : t('accountOnboarding.numbers.port.noFileSelected');

    const csrFileName = this.numPortCsrFile
      ? `${t('accountOnboarding.numbers.port.fileSelected')} ${this.escapeHtml(this.numPortCsrFile.name)}`
      : t('accountOnboarding.numbers.port.noFileSelected');

    return `
      <h3 class="section-heading">${t('accountOnboarding.numbers.port.documentsTitle')}</h3>
      <p class="section-description">${t('accountOnboarding.numbers.port.documentsSubtitle')}</p>

      <div class="num-doc-upload">
        <div class="num-doc-upload-header">
          <span class="num-doc-upload-label">${t('accountOnboarding.numbers.port.billCopyLabel')}</span>
          <span class="num-doc-upload-badge required">${t('accountOnboarding.numbers.port.billCopyRequired')}</span>
        </div>
        <p class="num-doc-upload-desc">${t('accountOnboarding.numbers.port.billCopyDesc')}</p>
        <div class="num-doc-upload-file">
          <button class="btn btn-secondary" style="padding:var(--ds-spacing-xs) var(--ds-layout-spacing-sm);font-size:var(--ds-font-size-small)"
            data-action="num-upload-bill">
            ${t('accountOnboarding.numbers.port.uploadFile')}
          </button>
          <span class="file-name">${billFileName}</span>
        </div>
        <input type="file" id="num-bill-copy-input" style="display:none" accept=".pdf,.png,.jpg,.jpeg" />
      </div>

      <div class="num-doc-upload">
        <div class="num-doc-upload-header">
          <span class="num-doc-upload-label">${t('accountOnboarding.numbers.port.csrLabel')}</span>
          <span class="num-doc-upload-badge optional">${t('accountOnboarding.numbers.port.csrOptional')}</span>
        </div>
        <p class="num-doc-upload-desc">${t('accountOnboarding.numbers.port.csrDesc')}</p>
        <div class="num-doc-upload-file">
          <button class="btn btn-secondary" style="padding:var(--ds-spacing-xs) var(--ds-layout-spacing-sm);font-size:var(--ds-font-size-small)"
            data-action="num-upload-csr">
            ${t('accountOnboarding.numbers.port.uploadFile')}
          </button>
          <span class="file-name">${csrFileName}</span>
        </div>
        <input type="file" id="num-csr-input" style="display:none" accept=".pdf,.png,.jpg,.jpeg" />
      </div>

      ${this.numPortDocUploadError ? `<div class="inline-alert error">${this.escapeHtml(this.numPortDocUploadError)}</div>` : ''}
      <div class="num-sub-footer">
        <button class="btn btn-secondary" data-action="num-back-to-foc-date">
          ${t('accountOnboarding.numbers.nav.back')}
        </button>
        <button class="btn btn-primary" data-action="num-to-review">
          ${t('accountOnboarding.numbers.nav.next')}
        </button>
      </div>`;
  }

  private renderNumPortReview(): string {
    const t = (key: string): string => this.t(key);
    const result = this.numPortEligibilityResult;
    if (!result) return '';

    const numbersList = result.portable_numbers
      .map((n) => this.numFormatPhone(n.phone_number))
      .join(', ');

    return `
      <h3 class="section-heading">${t('accountOnboarding.numbers.port.reviewTitle')}</h3>
      <p class="section-description">${t('accountOnboarding.numbers.port.reviewSubtitle')}</p>

      <div class="num-review-section">
        <h4>${t('accountOnboarding.numbers.port.numbersSection')}</h4>
        <div class="num-review-row">
          <span class="num-review-label">${t('accountOnboarding.numbers.overview.phoneNumber')}</span>
          <span class="num-review-value">${this.escapeHtml(numbersList)}</span>
        </div>
      </div>

      <div class="num-review-section">
        <h4>${t('accountOnboarding.numbers.port.subscriberSection')}</h4>
        <div class="num-review-row">
          <span class="num-review-label">${t('accountOnboarding.numbers.port.btnLabel')}</span>
          <span class="num-review-value">${this.escapeHtml(this.numPortSubscriberBtn)}</span>
        </div>
        <div class="num-review-row">
          <span class="num-review-label">${t('accountOnboarding.numbers.port.businessNameLabel')}</span>
          <span class="num-review-value">${this.escapeHtml(this.numPortSubscriberBusinessName)}</span>
        </div>
        <div class="num-review-row">
          <span class="num-review-label">${t('accountOnboarding.numbers.port.approverNameLabel')}</span>
          <span class="num-review-value">${this.escapeHtml(this.numPortSubscriberApproverName)}</span>
        </div>
      </div>

      <div class="num-review-section">
        <h4>${t('accountOnboarding.numbers.port.focSection')}</h4>
        <div class="num-review-row">
          <span class="num-review-label">${t('accountOnboarding.numbers.port.focDateLabel')}</span>
          <span class="num-review-value">${this.escapeHtml(this.numPortFocDate)}</span>
        </div>
        ${
          this.numPortFocTime
            ? `
          <div class="num-review-row">
            <span class="num-review-label">${t('accountOnboarding.numbers.port.focTimeLabel')}</span>
            <span class="num-review-value">${this.escapeHtml(this.numPortFocTime)}</span>
          </div>`
            : ''
        }
      </div>

      <div class="num-review-section">
        <h4>${t('accountOnboarding.numbers.port.documentsSection')}</h4>
        <div class="num-review-row">
          <span class="num-review-label">${t('accountOnboarding.numbers.port.billCopyLabel')}</span>
          <span class="num-review-value">${this.numPortBillCopyFile ? this.escapeHtml(this.numPortBillCopyFile.name) : '—'}</span>
        </div>
        <div class="num-review-row">
          <span class="num-review-label">${t('accountOnboarding.numbers.port.csrLabel')}</span>
          <span class="num-review-value">${this.numPortCsrFile ? this.escapeHtml(this.numPortCsrFile.name) : '—'}</span>
        </div>
      </div>

      <hr class="section-divider" />
      <div class="form-group">
        <label class="form-label">${t('accountOnboarding.numbers.port.signatureLabel')}</label>
        <input class="form-input" type="text" id="num-port-signature"
          value="${this.escapeHtml(this.numPortSignature)}"
          placeholder="${t('accountOnboarding.numbers.port.signaturePlaceholder')}" />
        <div class="form-help">${t('accountOnboarding.numbers.port.signatureHelp')}</div>
      </div>

      ${this.numPortSubmitError ? `<div class="inline-alert error">${this.escapeHtml(this.numPortSubmitError)}</div>` : ''}
      <div class="num-sub-footer">
        <button class="btn btn-secondary" data-action="num-back-to-documents">
          ${t('accountOnboarding.numbers.nav.back')}
        </button>
        <button class="btn btn-primary" data-action="num-submit-port"${this.numPortIsSubmitting ? ' disabled' : ''}>
          ${this.numPortIsSubmitting ? t('accountOnboarding.numbers.port.submitting') : t('accountOnboarding.numbers.port.approve')}
        </button>
      </div>`;
  }

  private renderNumPortSubmitted(): string {
    const t = (key: string): string => this.t(key);
    const order = this.numPortCurrentOrder;

    return `
      <h3 class="section-heading">${t('accountOnboarding.numbers.port.submittedTitle')}</h3>
      <div class="placeholder" style="min-height:120px">
        <div class="num-order-status-icon success">${SUCCESS_SVG}</div>
        <p class="placeholder-text">${t('accountOnboarding.numbers.port.submittedSubtitle')}</p>
      </div>
      ${
        order
          ? `
        <div class="num-review-row">
          <span class="num-review-label">${t('accountOnboarding.numbers.port.submittedStatus')}</span>
          <span class="num-review-value"><span class="num-status-badge num-status-porting">${this.escapeHtml(order.status)}</span></span>
        </div>`
          : ''
      }
      <div class="num-sub-footer num-sub-footer-end">
        <button class="btn btn-primary" data-action="num-port-done">
          ${t('accountOnboarding.numbers.port.backToOverview')}
        </button>
      </div>`;
  }

  // ============================================================================
  // Numbers Step — Input Listeners
  // ============================================================================

  private attachNumInputListeners(): void {
    if (!this.shadowRoot) return;

    // Order search fields
    const areaCodeInput = this.shadowRoot.querySelector<HTMLInputElement>('#num-area-code');
    if (areaCodeInput) {
      areaCodeInput.addEventListener('input', () => {
        this.numOrderSearchValue = areaCodeInput.value;
      });
    }

    const searchCityInput = this.shadowRoot.querySelector<HTMLInputElement>('#num-search-city');
    if (searchCityInput) {
      searchCityInput.addEventListener('input', () => {
        this.numOrderSearchCity = searchCityInput.value;
      });
    }

    const searchStateSelect = this.shadowRoot.querySelector<HTMLSelectElement>('#num-search-state');
    if (searchStateSelect) {
      searchStateSelect.addEventListener('change', () => {
        this.numOrderSearchState = searchStateSelect.value;
      });
    }

    const zipInput = this.shadowRoot.querySelector<HTMLInputElement>('#num-zip-code');
    if (zipInput) {
      zipInput.addEventListener('input', () => {
        this.numOrderSearchValue = zipInput.value;
      });
    }

    const quantityInput = this.shadowRoot.querySelector<HTMLInputElement>('#num-quantity');
    if (quantityInput) {
      quantityInput.addEventListener('input', () => {
        this.numOrderQuantity = parseInt(quantityInput.value, 10) || 5;
      });
    }

    // Port phone inputs
    for (let i = 0; i < this.numPortPhoneInputs.length; i++) {
      const phoneInput = this.shadowRoot.querySelector<HTMLInputElement>(`#num-port-phone-${i}`);
      if (phoneInput) {
        phoneInput.addEventListener('input', () => {
          const formatter = new AsYouType('US');
          this.numPortPhoneInputs[i] = formatter.input(phoneInput.value);
          phoneInput.value = this.numPortPhoneInputs[i]!;
        });
      }
    }

    // Port subscriber fields (except BTN which has special formatting)
    const bindInput = (id: string, setter: (val: string) => void): void => {
      const el = this.shadowRoot!.querySelector<HTMLInputElement>(`#${id}`);
      if (el) el.addEventListener('input', () => setter(el.value));
    };
    bindInput('num-port-business-name', (v) => {
      this.numPortSubscriberBusinessName = v;
    });
    bindInput('num-port-approver-name', (v) => {
      this.numPortSubscriberApproverName = v;
    });
    bindInput('num-port-account-number', (v) => {
      this.numPortSubscriberAccountNumber = v;
    });
    bindInput('num-port-pin', (v) => {
      this.numPortSubscriberPin = v;
    });
    bindInput('num-port-house-number', (v) => {
      this.numPortSubscriberHouseNumber = v;
    });
    bindInput('num-port-street-name', (v) => {
      this.numPortSubscriberStreetName = v;
    });
    bindInput('num-port-line2', (v) => {
      this.numPortSubscriberLine2 = v;
    });
    bindInput('num-port-city', (v) => {
      this.numPortSubscriberCity = v;
    });
    bindInput('num-port-zip', (v) => {
      this.numPortSubscriberZip = v;
    });

    // BTN formatting
    const btnInput = this.shadowRoot.querySelector<HTMLInputElement>('#num-port-btn');
    if (btnInput) {
      btnInput.addEventListener('input', () => {
        const formatter = new AsYouType('US');
        this.numPortSubscriberBtn = formatter.input(btnInput.value);
        btnInput.value = this.numPortSubscriberBtn;
      });
    }

    const portStateSelect = this.shadowRoot.querySelector<HTMLSelectElement>('#num-port-state');
    if (portStateSelect) {
      portStateSelect.addEventListener('change', () => {
        this.numPortSubscriberState = portStateSelect.value;
      });
    }

    // FOC date/time
    const focDateInput = this.shadowRoot.querySelector<HTMLInputElement>('#num-port-foc-date');
    if (focDateInput) {
      focDateInput.addEventListener('input', () => {
        this.numPortFocDate = focDateInput.value;
      });
    }

    const focTimeSelect = this.shadowRoot.querySelector<HTMLSelectElement>('#num-port-foc-time');
    if (focTimeSelect) {
      focTimeSelect.addEventListener('change', () => {
        this.numPortFocTime = focTimeSelect.value;
      });
    }

    // File inputs
    const billInput = this.shadowRoot.querySelector<HTMLInputElement>('#num-bill-copy-input');
    if (billInput) {
      billInput.addEventListener('change', () => {
        this.numPortBillCopyFile = billInput.files?.[0] ?? null;
        this.render();
      });
    }

    const csrInput = this.shadowRoot.querySelector<HTMLInputElement>('#num-csr-input');
    if (csrInput) {
      csrInput.addEventListener('change', () => {
        this.numPortCsrFile = csrInput.files?.[0] ?? null;
        this.render();
      });
    }

    // Signature
    const sigInput = this.shadowRoot.querySelector<HTMLInputElement>('#num-port-signature');
    if (sigInput) {
      sigInput.addEventListener('input', () => {
        this.numPortSignature = sigInput.value;
      });
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
            return this.renderAccountStep();
          case 'numbers':
            return this.renderNumbersStep();
          case 'hardware':
            return this.renderHardwareStep();
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
        this.attachInputListeners();
      } else if (this.currentStep === 'numbers') {
        this.attachNumInputListeners();
      } else if (this.currentStep === 'hardware') {
        this.attachHardwareInputListeners();
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
    let activeKey: string;

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
        activeKey = this.accountSubStep;
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
        // Map numSubStep to display sub-step
        if (this.numSubStep === 'overview') {
          activeKey = 'options';
        } else if (['port-submitted', 'order-status'].includes(this.numSubStep)) {
          activeKey = 'verification';
        } else {
          activeKey = 'setup';
        }
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
        ];
        activeKey = 'device-assignment';
        break;
      default:
        return '';
    }

    const activeIdx = subSteps.findIndex((s) => s.key === activeKey);
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

    return `
      <aside class="step-sidebar" aria-label="${title}">
        <div class="step-sidebar-header">
          <div class="step-sidebar-icon">${icon}</div>
          <span class="step-sidebar-title">${title}</span>
        </div>
        <div class="step-timeline">
          ${timelineItems}
        </div>
      </aside>
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

  private renderAccountStep(): string {
    switch (this.accountSubStep) {
      case 'business-details':
        return this.renderAccountBusinessDetails();
      case 'team-members':
        return this.renderAccountTeamMembers();
    }
  }

  private renderAccountBusinessDetails(): string {
    const t = (key: string): string => this.t(key);
    const nameErr = this.accountValidationErrors.name;
    const emailErr = this.accountValidationErrors.email;
    const phoneErr = this.accountValidationErrors.phone;
    const primaryContactErr = this.accountValidationErrors.primaryContact;

    const saveErrorHtml = this.accountSaveError
      ? `<div class="inline-alert error">${this.escapeHtml(this.accountSaveError)}</div>`
      : '';

    return `
      <div class="card ${this.classes.stepAccount || ''}" part="step-account">
        <h2 class="section-title">${t('accountOnboarding.account.title')}</h2>
        <p class="section-subtitle">${t('accountOnboarding.account.subtitle')}</p>

        <div class="form-row">
          <div class="form-group">
            <label class="form-label" for="account-name">${t('accountOnboarding.account.details.companyNameLabel')}</label>
            <input class="form-input${nameErr ? ' error' : ''}" type="text" id="account-name"
              value="${this.escapeHtml(this.accountName)}"
              placeholder="${t('accountOnboarding.account.details.companyNamePlaceholder')}" />
            ${nameErr ? `<div class="form-error">${this.escapeHtml(nameErr)}</div>` : ''}
          </div>
          <div class="form-group">
            <label class="form-label" for="account-primary-contact">${t('accountOnboarding.account.details.primaryContactLabel')}</label>
            <input class="form-input${primaryContactErr ? ' error' : ''}" type="text" id="account-primary-contact"
              value="${this.escapeHtml(this.accountPrimaryContact)}"
              placeholder="${t('accountOnboarding.account.details.primaryContactPlaceholder')}" />
            ${primaryContactErr ? `<div class="form-error">${this.escapeHtml(primaryContactErr)}</div>` : ''}
          </div>
        </div>

        <div class="form-row">
          <div class="form-group">
            <label class="form-label" for="account-email">${t('accountOnboarding.account.details.emailLabel')}</label>
            <input class="form-input${emailErr ? ' error' : ''}" type="email" id="account-email"
              value="${this.escapeHtml(this.accountEmail)}"
              placeholder="${t('accountOnboarding.account.details.emailPlaceholder')}" />
            ${emailErr ? `<div class="form-error">${this.escapeHtml(emailErr)}</div>` : ''}
          </div>
          <div class="form-group">
            <label class="form-label" for="account-phone">${t('accountOnboarding.account.details.phoneLabel')}</label>
            <input class="form-input${phoneErr ? ' error' : ''}" type="tel" id="account-phone"
              value="${this.escapeHtml(this.accountPhone)}"
              placeholder="${t('accountOnboarding.account.details.phonePlaceholder')}" />
            ${phoneErr ? `<div class="form-error">${this.escapeHtml(phoneErr)}</div>` : ''}
          </div>
        </div>

        <hr class="section-divider" />

        <p class="section-description">${t('accountOnboarding.account.location.description')}</p>

        ${this.renderLocationSection()}

        ${saveErrorHtml}
      </div>
      ${this.renderAccountStepFooter()}
    `;
  }

  private renderAccountTeamMembers(): string {
    const t = (key: string): string => this.t(key);

    const userTableHtml =
      this.users.length === 0
        ? `<div class="no-users">${t('accountOnboarding.account.users.noUsers')}</div>`
        : `<table class="user-table">
            <thead>
              <tr>
                <th>${t('accountOnboarding.account.users.nameLabel')}</th>
                <th>${t('accountOnboarding.account.users.emailLabel')}</th>
                <th>${t('accountOnboarding.account.users.extensionLabel')}</th>
                <th></th>
              </tr>
            </thead>
            <tbody>${this.users
              .map((u) => {
                const ext = this.getExtensionForUser(u.id);
                const extDisplay = ext ? this.escapeHtml(ext.number) : '—';
                return `
                <tr>
                  <td class="user-table-name">${this.escapeHtml(u.name ?? '')}</td>
                  <td>${this.escapeHtml(u.email ?? '')}</td>
                  <td>${extDisplay}</td>
                  <td>
                    <button class="btn-danger-ghost" data-action="remove-user" data-user-id="${this.escapeHtml(u.id)}">
                      ${t('accountOnboarding.account.users.removeUser')}
                    </button>
                  </td>
                </tr>`;
              })
              .join('')}</tbody>
          </table>`;

    const userErrorHtml = this.userError
      ? `<div class="inline-alert error">${this.escapeHtml(this.userError)}</div>`
      : '';

    const saveErrorHtml = this.accountSaveError
      ? `<div class="inline-alert error">${this.escapeHtml(this.accountSaveError)}</div>`
      : '';

    return `
      <div class="card ${this.classes.stepAccount || ''}" part="step-account">
        <h2 class="section-title">${t('accountOnboarding.account.users.heading')}</h2>
        <p class="section-subtitle">${t('accountOnboarding.account.users.description')}</p>

        ${userTableHtml}

        <div class="add-user-form">
          <div class="form-group">
            <label class="form-label" for="new-user-name">${t('accountOnboarding.account.users.nameLabel')}</label>
            <input class="form-input" type="text" id="new-user-name"
              value="${this.escapeHtml(this.newUserName)}"
              placeholder="${t('accountOnboarding.account.users.namePlaceholder')}" />
          </div>
          <div class="form-group">
            <label class="form-label" for="new-user-email">${t('accountOnboarding.account.users.emailLabel')}</label>
            <input class="form-input" type="email" id="new-user-email"
              value="${this.escapeHtml(this.newUserEmail)}"
              placeholder="${t('accountOnboarding.account.users.emailPlaceholder')}" />
          </div>
          <div class="form-group">
            <label class="form-label" for="new-user-extension">${t('accountOnboarding.account.users.extensionLabel')}</label>
            <input class="form-input" type="text" id="new-user-extension"
              value="${this.escapeHtml(this.newUserExtension)}"
              placeholder="${t('accountOnboarding.account.users.extensionPlaceholder')}" />
          </div>
          <button class="btn btn-secondary btn-add" data-action="add-user"${this.isAddingUser ? ' disabled' : ''}>
            ${this.isAddingUser ? t('accountOnboarding.account.saving') : t('accountOnboarding.account.users.addUser')}
          </button>
        </div>

        ${userErrorHtml}
        ${saveErrorHtml}
      </div>
      ${this.renderAccountStepFooter()}
    `;
  }

  private renderLocationSection(): string {
    const t = (key: string): string => this.t(key);
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
          <div class="timezone-readonly">${this.escapeHtml(tzLabel)}</div>
        </div>`;
          })()
        : `
        <div class="form-group">
          <label class="form-label" for="account-timezone">${t('accountOnboarding.account.details.timezoneLabel')}</label>
          <select class="form-select${timezoneErr ? ' error' : ''}" id="account-timezone">
            ${!this.accountTimezone ? `<option value="" selected>${t('accountOnboarding.account.details.timezonePlaceholder')}</option>` : ''}
            ${US_TIMEZONES.map(
              ([value, label]) =>
                `<option value="${this.escapeHtml(value)}"${this.accountTimezone === value ? ' selected' : ''}>${this.escapeHtml(label)}</option>`
            ).join('')}
          </select>
          ${timezoneErr ? `<div class="form-error">${this.escapeHtml(timezoneErr)}</div>` : ''}
        </div>`;

    return `
      <h3 class="section-heading">${t('accountOnboarding.account.location.heading')}</h3>
      <p class="section-description">${t('accountOnboarding.account.location.description')}</p>

      <div class="form-group">
        <label class="form-label" for="location-name">${t('accountOnboarding.account.location.nameLabel')}</label>
        <input class="form-input${nameErr ? ' error' : ''}" type="text" id="location-name"
          value="${this.escapeHtml(this.locationName)}"
          placeholder="${t('accountOnboarding.account.location.namePlaceholder')}" />
        ${nameErr ? `<div class="form-error">${this.escapeHtml(nameErr)}</div>` : ''}
      </div>

      <div class="form-group">
        <label class="form-label">${t('accountOnboarding.account.location.addressLabel')}</label>
        ${addressHtml}
        ${addressErr ? `<div class="form-error">${this.escapeHtml(addressErr)}</div>` : ''}
      </div>

      ${timezoneHtml}
    `;
  }

  private renderAddressSearch(): string {
    const t = (key: string): string => this.t(key);
    return `
      <div class="address-autocomplete">
        <input class="form-input" type="text" id="address-search"
          value="${this.escapeHtml(this.addressQuery)}"
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
    const t = (key: string): string => this.t(key);
    const { line1, line2 } = this.getConfirmedAddressLines();

    return `
      <div class="address-confirmed">
        <div class="address-confirmed-icon">${CHECK_CIRCLE_SVG}</div>
        <div class="address-confirmed-text">
          ${line1 ? `<div class="address-confirmed-line">${this.escapeHtml(line1)}</div>` : ''}
          ${line2 ? `<div class="address-confirmed-line">${this.escapeHtml(line2)}</div>` : ''}
        </div>
        <button class="btn btn-secondary" style="padding:var(--ds-spacing-xs) var(--ds-layout-spacing-sm);font-size:var(--ds-font-size-small)" data-action="edit-address">
          ${t('accountOnboarding.account.location.edit')}
        </button>
      </div>
    `;
  }

  private renderAddressManualFields(): string {
    const t = (key: string): string => this.t(key);

    const stateOptions = US_STATES.map(
      ([code, name]) =>
        `<option value="${this.escapeHtml(code)}"${this.manualAddress.state === code ? ' selected' : ''}>${this.escapeHtml(name)}</option>`
    ).join('');

    return `
      <div class="address-manual-fields">
        <div class="form-group">
          <label class="form-label" for="manual-house-number">${t('accountOnboarding.account.location.houseNumberLabel')}</label>
          <input class="form-input" type="text" id="manual-house-number"
            value="${this.escapeHtml(this.manualAddress.addressNumber)}"
            placeholder="${t('accountOnboarding.account.location.houseNumberPlaceholder')}" />
        </div>
        <div class="form-group">
          <label class="form-label" for="manual-street">${t('accountOnboarding.account.location.streetLabel')}</label>
          <input class="form-input" type="text" id="manual-street"
            value="${this.escapeHtml(this.manualAddress.street)}"
            placeholder="${t('accountOnboarding.account.location.streetPlaceholder')}" />
        </div>
      </div>
      <div class="address-manual-row-2">
        <div class="form-group">
          <label class="form-label" for="manual-city">${t('accountOnboarding.account.location.cityLabel')}</label>
          <input class="form-input" type="text" id="manual-city"
            value="${this.escapeHtml(this.manualAddress.city)}"
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
            value="${this.escapeHtml(this.manualAddress.postalCode)}"
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
      ? this.t('accountOnboarding.account.saving')
      : `${this.t('accountOnboarding.nav.next')} &rarr;`;

    if (hasBack) {
      return `
        <div class="footer-bar">
          <button class="btn btn-ghost" data-action="back">
            &larr; ${this.t('accountOnboarding.nav.back')}
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

  private renderNumbersStep(): string {
    let subContent = '';
    switch (this.numSubStep) {
      case 'overview':
        subContent = this.renderNumOverview();
        break;
      case 'order-search':
        subContent = this.renderNumOrderSearch();
        break;
      case 'order-results':
        subContent = this.renderNumOrderResults();
        break;
      case 'order-confirm':
        subContent = this.renderNumOrderConfirm();
        break;
      case 'order-status':
        subContent = this.renderNumOrderStatus();
        break;
      case 'port-numbers':
        subContent = this.renderNumPortNumbers();
        break;
      case 'port-eligibility':
        subContent = this.renderNumPortEligibility();
        break;
      case 'port-subscriber':
        subContent = this.renderNumPortSubscriber();
        break;
      case 'port-foc-date':
        subContent = this.renderNumPortFocDate();
        break;
      case 'port-documents':
        subContent = this.renderNumPortDocuments();
        break;
      case 'port-review':
        subContent = this.renderNumPortReview();
        break;
      case 'port-submitted':
        subContent = this.renderNumPortSubmitted();
        break;
    }

    return `
      <div class="card ${this.classes.stepNumbers || ''}" part="step-numbers">
        <h2 class="section-title">${this.t('accountOnboarding.numbers.title')}</h2>
        <p class="section-subtitle">${this.t('accountOnboarding.numbers.subtitle')}</p>
        ${subContent}
      </div>
      ${this.numSubStep === 'overview' ? this.renderStepFooter() : ''}
    `;
  }

  private renderHardwareStep(): string {
    const t = (key: string): string => this.t(key);

    if (this.users.length === 0) {
      return `
        <div class="card ${this.classes.stepHardware || ''}" part="step-hardware">
          <h2 class="section-title">${t('accountOnboarding.hardware.title')}</h2>
          <p class="section-subtitle">${t('accountOnboarding.hardware.noUsers')}</p>
        </div>
        ${this.renderStepFooter()}
      `;
    }

    // Build a reverse map: endpointId → userId
    const endpointToUser = new Map<string, string>();
    for (const [userId, eps] of this.userEndpointMap.entries()) {
      for (const ep of eps) {
        endpointToUser.set(ep.id, userId);
      }
    }

    const getUserName = (userId: string): string => {
      const u = this.users.find((u) => u.id === userId);
      return u?.name ?? u?.email ?? userId;
    };

    // ── Desk phone rows ──
    const deskPhoneRows = this.devices
      .map((dev) => {
        const lines = dev.lines ?? [];
        const assignedLine = lines.find((l) => l.endpoint_id && endpointToUser.has(l.endpoint_id));
        const userId = assignedLine ? endpointToUser.get(assignedLine.endpoint_id!)! : null;
        const vendor = dev.vendor ? dev.vendor.charAt(0).toUpperCase() + dev.vendor.slice(1) : '';
        const vendorLabel = `${vendor}${dev.model ? ' ' + dev.model : ''}`;
        return `
        <div class="hw-device-row">
          <div class="hw-device-row__info">
            <span class="hw-device-badge">${this.escapeHtml(vendorLabel)}</span>
            <span class="hw-device-mac">${this.escapeHtml(dev.mac_address)}</span>
            ${userId ? `<span class="hw-device-user">&rarr; ${this.escapeHtml(getUserName(userId))}</span>` : ''}
          </div>
          <div class="hw-device-row__actions">
            <button class="btn-danger-ghost" data-action="remove-device" data-device-id="${this.escapeHtml(dev.id)}" data-device-type="deskphone" data-user-id="${this.escapeHtml(userId ?? '')}" data-base-id="">${t('accountOnboarding.hardware.removeDevice')}</button>
          </div>
        </div>`;
      })
      .join('');

    // ── DECT base groups ──
    const dectGroupRows = this.dectBases
      .map((base) => {
        const handsets = this.dectHandsets.get(base.id) ?? [];
        const count = handsets.length;
        const countLabel = `${count} ${count === 1 ? t('accountOnboarding.hardware.handset') : t('accountOnboarding.hardware.handsets')}`;

        const handsetRows = handsets
          .map((hs) => {
            const exts = hs.extensions ?? [];
            const ext = exts.find((e) => endpointToUser.has(e.endpoint_id));
            const hsUserId = ext ? endpointToUser.get(ext.endpoint_id)! : null;
            return `
            <div class="hw-device-row hw-device-row--handset">
              <div class="hw-device-row__info">
                <span class="hw-device-mac">${this.escapeHtml(hs.ipei)}</span>
                ${hsUserId ? `<span class="hw-device-user">&rarr; ${this.escapeHtml(getUserName(hsUserId))}</span>` : ''}
              </div>
              <div class="hw-device-row__actions">
                <button class="btn-danger-ghost" data-action="remove-device" data-device-id="${this.escapeHtml(hs.id)}" data-device-type="dect-handset" data-user-id="${this.escapeHtml(hsUserId ?? '')}" data-base-id="${this.escapeHtml(base.id)}">${t('accountOnboarding.hardware.removeDevice')}</button>
              </div>
            </div>`;
          })
          .join('');

        const inlineHandsetForm =
          this.hwEditingRowKey === `new-handset:${base.id}`
            ? this.renderInlineHandsetForm(base.id)
            : '';

        return `
        <div class="hw-dect-group">
          <div class="hw-device-row hw-device-row--base">
            <div class="hw-device-row__info">
              <span class="hw-device-mac">${this.escapeHtml(base.mac_address)}</span>
              <span class="hw-device-badge">${t('accountOnboarding.hardware.dectBase')} &mdash; ${countLabel}</span>
            </div>
            <div class="hw-device-row__actions">
              <button class="btn-link" data-action="hw-add-handset" data-base-id="${this.escapeHtml(base.id)}">${t('accountOnboarding.hardware.addHandsetButton')}</button>
              <button class="btn-danger-ghost" data-action="hw-remove-base" data-base-id="${this.escapeHtml(base.id)}">${t('accountOnboarding.hardware.removeDevice')}</button>
            </div>
          </div>
          ${handsetRows}
          ${inlineHandsetForm}
        </div>`;
      })
      .join('');

    // ── Add device row / inline form ──
    let addDeviceRow: string;
    if (this.hwEditingRowKey === 'new') {
      addDeviceRow = this.renderInlineNewDeviceForm();
    } else if (!this.hwEditingRowKey || this.hwEditingRowKey.startsWith('new-handset:')) {
      addDeviceRow = `
        <div class="hw-device-row hw-device-row--add">
          <button class="btn-link" data-action="hw-add-new">${t('accountOnboarding.hardware.addDeviceButton')}</button>
        </div>`;
    } else {
      addDeviceRow = '';
    }

    const actionErrorHtml = this.hwActionError
      ? `<div class="inline-alert error" style="margin-bottom:var(--ds-layout-spacing-sm)">${this.escapeHtml(this.hwActionError)}</div>`
      : '';

    return `
      <div class="card ${this.classes.stepHardware || ''}" part="step-hardware">
        <h2 class="section-title">${t('accountOnboarding.hardware.title')}</h2>
        <p class="section-subtitle">${t('accountOnboarding.hardware.subtitle')}</p>
        ${actionErrorHtml}
        <div class="hw-device-list">
          ${deskPhoneRows}
          ${dectGroupRows}
          ${addDeviceRow}
        </div>
      </div>
      ${this.renderStepFooter()}
    `;
  }

  private renderInlineNewDeviceForm(): string {
    const t = (key: string): string => this.t(key);
    const userOptionsHtml = this.users
      .map(
        (u) =>
          `<option value="${this.escapeHtml(u.id)}"${this.hwEditUserId === u.id ? ' selected' : ''}>${this.escapeHtml(u.name ?? u.email ?? u.id)}</option>`
      )
      .join('');

    const ipeiField = this.hwEditIsDectBase
      ? `<div class="form-group">
          <label class="form-label" for="hw-edit-ipei">${t('accountOnboarding.hardware.ipeiLabel')}</label>
          <input class="form-input" type="text" id="hw-edit-ipei"
            value="${this.escapeHtml(this.hwEditIpei)}"
            placeholder="${t('accountOnboarding.hardware.ipeiPlaceholder')}" />
        </div>`
      : '';

    const errorHtml = this.hwEditError
      ? `<div class="inline-alert error">${this.escapeHtml(this.hwEditError)}</div>`
      : '';

    return `
      <div class="hw-device-row hw-device-row--editing">
        <div class="hw-inline-form">
          <div class="form-group">
            <label class="form-label" for="hw-edit-mac">${t('accountOnboarding.hardware.macLabel')}</label>
            <input class="form-input" type="text" id="hw-edit-mac"
              value="${this.escapeHtml(this.hwEditMac)}"
              placeholder="${t('accountOnboarding.hardware.macPlaceholder')}" />
          </div>
          <div class="form-group">
            <label class="form-check-label">
              <input type="checkbox" id="hw-edit-dect-checkbox"
                ${this.hwEditIsDectBase ? 'checked' : ''} />
              ${t('accountOnboarding.hardware.isDectBase')}
            </label>
          </div>
          ${ipeiField}
          <div class="form-group">
            <label class="form-label" for="hw-edit-user">${t('accountOnboarding.hardware.userLabel')}</label>
            <select class="form-input" id="hw-edit-user">
              <option value="">${t('accountOnboarding.hardware.selectUser')}</option>
              ${userOptionsHtml}
            </select>
          </div>
          <button class="btn btn-secondary btn-sm" data-action="hw-save-row"${this.hwEditSaving ? ' disabled' : ''}>
            ${this.hwEditSaving ? t('accountOnboarding.hardware.saving') : t('accountOnboarding.hardware.save')}
          </button>
          <button class="btn btn-secondary btn-sm" data-action="hw-cancel-row"${this.hwEditSaving ? ' disabled' : ''}>
            ${t('accountOnboarding.hardware.cancel')}
          </button>
        </div>
        ${errorHtml}
      </div>`;
  }

  private renderInlineHandsetForm(baseId: string): string {
    const t = (key: string): string => this.t(key);
    const userOptionsHtml = this.users
      .map(
        (u) =>
          `<option value="${this.escapeHtml(u.id)}"${this.hwEditUserId === u.id ? ' selected' : ''}>${this.escapeHtml(u.name ?? u.email ?? u.id)}</option>`
      )
      .join('');

    const errorHtml = this.hwEditError
      ? `<div class="inline-alert error">${this.escapeHtml(this.hwEditError)}</div>`
      : '';

    return `
      <div class="hw-device-row hw-device-row--editing" data-base-id="${this.escapeHtml(baseId)}">
        <div class="hw-inline-form">
          <div class="form-group">
            <label class="form-label" for="hw-edit-ipei">${t('accountOnboarding.hardware.ipeiLabel')}</label>
            <input class="form-input" type="text" id="hw-edit-ipei"
              value="${this.escapeHtml(this.hwEditIpei)}"
              placeholder="${t('accountOnboarding.hardware.ipeiPlaceholder')}" />
          </div>
          <div class="form-group">
            <label class="form-label" for="hw-edit-user">${t('accountOnboarding.hardware.userLabel')}</label>
            <select class="form-input" id="hw-edit-user">
              <option value="">${t('accountOnboarding.hardware.selectUser')}</option>
              ${userOptionsHtml}
            </select>
          </div>
          <button class="btn btn-secondary btn-sm" data-action="hw-save-row"${this.hwEditSaving ? ' disabled' : ''}>
            ${this.hwEditSaving ? t('accountOnboarding.hardware.saving') : t('accountOnboarding.hardware.save')}
          </button>
          <button class="btn btn-secondary btn-sm" data-action="hw-cancel-row"${this.hwEditSaving ? ' disabled' : ''}>
            ${t('accountOnboarding.hardware.cancel')}
          </button>
        </div>
        ${errorHtml}
      </div>`;
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
  // Hardware Step Methods
  // ============================================================================

  private attachHardwareInputListeners(): void {
    if (!this.shadowRoot) return;

    const bindInput = (id: string, setter: (val: string) => void): void => {
      const el = this.shadowRoot?.querySelector<HTMLInputElement | HTMLSelectElement>(`#${id}`);
      if (el) {
        el.addEventListener('input', (e) => setter((e.target as HTMLInputElement).value));
        el.addEventListener('change', (e) => setter((e.target as HTMLSelectElement).value));
      }
    };

    bindInput('hw-edit-mac', (v) => {
      this.hwEditMac = v;
    });
    bindInput('hw-edit-ipei', (v) => {
      this.hwEditIpei = v;
    });
    bindInput('hw-edit-user', (v) => {
      this.hwEditUserId = v;
    });

    // DECT base checkbox — toggle triggers re-render to show/hide IPEI field
    const dectCheckbox = this.shadowRoot.querySelector<HTMLInputElement>('#hw-edit-dect-checkbox');
    if (dectCheckbox) {
      dectCheckbox.addEventListener('change', () => {
        this.hwEditIsDectBase = dectCheckbox.checked;
        this.render();
      });
    }

    // MAC input blur → auto-normalize
    const macInput = this.shadowRoot.querySelector<HTMLInputElement>('#hw-edit-mac');
    if (macInput) {
      macInput.addEventListener('blur', () => {
        const normalized = normalizeMac(macInput.value);
        if (normalized) {
          this.hwEditMac = normalized;
          macInput.value = normalized;
        }
      });
    }
  }

  /**
   * Inline save handler. Branches on hwEditingRowKey to decide whether to
   * create a new desk phone, a new DECT base + handset, or add a handset
   * to an existing base.
   */
  private async handleSaveHwRow(): Promise<void> {
    if (!this.instance || this.hwEditSaving) return;
    this.hwEditError = null;

    if (this.hwEditingRowKey === 'new') {
      // ── New device form ──
      const normalized = normalizeMac(this.hwEditMac);
      if (!normalized) {
        this.hwEditError = this.t('accountOnboarding.hardware.invalidMac');
        this.render();
        return;
      }

      if (!this.hwEditUserId) {
        this.hwEditError = this.t('accountOnboarding.hardware.selectUserRequired');
        this.render();
        return;
      }

      if (this.hwEditIsDectBase) {
        // Validate IPEI
        const ipeiRaw = this.hwEditIpei;
        if (normalizeMac(ipeiRaw)) {
          this.hwEditError = this.t('accountOnboarding.hardware.ipeiNotMac');
          this.render();
          return;
        }
        const ipeiHex = ipeiRaw.replace(/[^a-fA-F0-9]/g, '');
        if (!ipeiHex) {
          this.hwEditError = this.t('accountOnboarding.hardware.invalidIpei');
          this.render();
          return;
        }

        this.hwEditSaving = true;
        this.render();

        try {
          // 1. Create DECT base
          await this.instance.createDECTBase({ mac_address: normalized });
          this.dectBases = await this.instance.listDECTBases();
          const newBase = this.dectBases.find(
            (b) => b.mac_address.replace(/:/g, '') === normalized.replace(/:/g, '')
          );
          if (!newBase) throw new Error('Failed to find newly created DECT base');

          // 2. Register handset on the base
          await this.instance.createDECTHandset(newBase.id, { ipei: ipeiHex });
          const handsets = await this.instance.listDECTHandsets(newBase.id);
          this.dectHandsets.set(newBase.id, handsets);

          // 3. Assign handset to user
          const newHandset = handsets.find(
            (h) => h.ipei.replace(/[^a-fA-F0-9]/g, '').toLowerCase() === ipeiHex.toLowerCase()
          );
          if (newHandset) {
            const endpoint = await this.ensureEndpoint(this.hwEditUserId);
            await this.instance.createDECTExtension(newBase.id, newHandset.id, {
              endpoint_id: endpoint.id,
            });
            const refreshed = await this.instance.listDECTHandsets(newBase.id);
            this.dectHandsets.set(newBase.id, refreshed);
          }

          // Switch to handset form for this base (keep adding handsets)
          this.hwEditingRowKey = `new-handset:${newBase.id}`;
          this.hwEditIpei = '';
          this.hwEditUserId = '';
          this.hwEditMac = '';
          this.hwEditIsDectBase = false;
          this.hwEditError = null;
        } catch (err) {
          const msg = err instanceof Error ? err.message : String(err);
          if (msg.includes('409') || msg.toLowerCase().includes('already')) {
            this.hwEditError = this.t('accountOnboarding.hardware.duplicateMac');
          } else {
            this.hwEditError = msg;
          }
        } finally {
          this.hwEditSaving = false;
          this.render();
        }
      } else {
        // Desk phone flow
        this.hwEditSaving = true;
        this.render();

        try {
          await this.instance.createDevice({ mac_address: normalized });
          this.devices = await this.instance.listDevices();
          await this.hydrateDeviceLines();
          const newDev = this.devices.find(
            (d) => d.mac_address.replace(/:/g, '') === normalized.replace(/:/g, '')
          );

          if (!newDev) {
            this.hwEditError = this.t('accountOnboarding.hardware.deviceNotFound');
            this.hwEditSaving = false;
            this.render();
            return;
          }

          const endpoint = await this.ensureEndpoint(this.hwEditUserId);
          await this.instance.createDeviceLine(newDev.id, { endpoint_id: endpoint.id });
          this.devices = await this.instance.listDevices();
          await this.hydrateDeviceLines();

          // Close form
          this.hwEditingRowKey = null;
          this.hwEditMac = '';
          this.hwEditUserId = '';
          this.hwEditError = null;
        } catch (err) {
          const msg = err instanceof Error ? err.message : String(err);
          if (msg.includes('409') || msg.toLowerCase().includes('already')) {
            this.hwEditError = this.t('accountOnboarding.hardware.duplicateMac');
          } else {
            this.hwEditError = msg;
          }
        } finally {
          this.hwEditSaving = false;
          this.render();
        }
      }
    } else if (this.hwEditingRowKey?.startsWith('new-handset:')) {
      // ── Add handset to existing base ──
      const baseId = this.hwEditingRowKey.replace('new-handset:', '');

      const ipeiRaw = this.hwEditIpei;
      if (normalizeMac(ipeiRaw)) {
        this.hwEditError = this.t('accountOnboarding.hardware.ipeiNotMac');
        this.render();
        return;
      }
      const ipeiHex = ipeiRaw.replace(/[^a-fA-F0-9]/g, '');
      if (!ipeiHex) {
        this.hwEditError = this.t('accountOnboarding.hardware.invalidIpei');
        this.render();
        return;
      }

      if (!this.hwEditUserId) {
        this.hwEditError = this.t('accountOnboarding.hardware.selectUserRequired');
        this.render();
        return;
      }

      this.hwEditSaving = true;
      this.render();

      try {
        await this.instance.createDECTHandset(baseId, { ipei: ipeiHex });
        const handsets = await this.instance.listDECTHandsets(baseId);
        this.dectHandsets.set(baseId, handsets);

        const newHandset = handsets.find(
          (h) => h.ipei.replace(/[^a-fA-F0-9]/g, '').toLowerCase() === ipeiHex.toLowerCase()
        );
        if (newHandset) {
          const endpoint = await this.ensureEndpoint(this.hwEditUserId);
          await this.instance.createDECTExtension(baseId, newHandset.id, {
            endpoint_id: endpoint.id,
          });
          const refreshed = await this.instance.listDECTHandsets(baseId);
          this.dectHandsets.set(baseId, refreshed);
        }

        // Keep form open for more handsets — just clear IPEI + user
        this.hwEditIpei = '';
        this.hwEditUserId = '';
        this.hwEditError = null;
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        if (msg.includes('409') || msg.toLowerCase().includes('already')) {
          this.hwEditError = this.t('accountOnboarding.hardware.duplicateMac');
        } else {
          this.hwEditError = msg;
        }
      } finally {
        this.hwEditSaving = false;
        this.render();
      }
    }
  }

  private async ensureEndpoint(userId: string): Promise<OnboardingEndpoint> {
    if (!this.instance) throw new Error('Not initialized');

    const existing = this.userEndpointMap.get(userId) ?? [];
    if (existing.length > 0) return existing[0]!;

    const endpoint = await this.instance.createEndpoint(userId);
    const updated = [...existing, endpoint];
    this.userEndpointMap.set(userId, updated);
    return endpoint;
  }

  /** Remove a device (desk phone) or handset (DECT) entirely. */
  private async handleRemoveDectBase(baseId: string): Promise<void> {
    if (!this.instance) return;
    this.hwActionError = null;
    try {
      await this.instance.deleteDECTBase(baseId);
      this.dectBases = this.dectBases.filter((b) => b.id !== baseId);
      this.dectHandsets.delete(baseId);
      // Close inline form if it was editing this base
      if (this.hwEditingRowKey === `new-handset:${baseId}`) {
        this.hwEditingRowKey = null;
        this.hwEditIpei = '';
        this.hwEditUserId = '';
        this.hwEditError = null;
      }
      await this.loadHardwareData();
    } catch {
      this.hwActionError = this.t('accountOnboarding.hardware.removeBaseFailed');
      this.render();
    }
  }

  private async handleRemoveDevice(
    deviceId: string,
    deviceType: string,
    _userId: string,
    baseId: string
  ): Promise<void> {
    if (!this.instance) return;
    this.hwActionError = null;

    try {
      if (deviceType === 'deskphone') {
        await this.instance.deleteDevice(deviceId);
        this.devices = await this.instance.listDevices();
        await this.hydrateDeviceLines();
      } else {
        // DECT handset — delete the handset from its base
        await this.instance.deleteDECTHandset(baseId, deviceId);
        const refreshed = await this.instance.listDECTHandsets(baseId);
        this.dectHandsets.set(baseId, refreshed);
      }
    } catch (err) {
      this.hwActionError = err instanceof Error ? err.message : String(err);
    }
    this.render();
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
          if (this.currentStep === 'account') {
            if (this.accountSubStep === 'business-details') {
              this.saveAndAdvanceToTeamMembers();
            } else {
              this.advancePastAccount();
            }
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
        case 'add-user':
          this.handleAddUser();
          break;
        case 'remove-user': {
          const userId = actionEl.dataset.userId;
          if (userId) {
            this.handleRemoveUser(userId);
          }
          break;
        }
        case 'hw-add-new':
          this.hwEditingRowKey = 'new';
          this.hwEditMac = '';
          this.hwEditIsDectBase = false;
          this.hwEditIpei = '';
          this.hwEditUserId = '';
          this.hwEditError = null;
          this.render();
          break;
        case 'hw-add-handset': {
          const hsBaseId = actionEl.dataset.baseId ?? '';
          this.hwEditingRowKey = `new-handset:${hsBaseId}`;
          this.hwEditIpei = '';
          this.hwEditUserId = '';
          this.hwEditError = null;
          this.render();
          break;
        }
        case 'hw-save-row':
          this.handleSaveHwRow();
          break;
        case 'hw-cancel-row':
          this.hwEditingRowKey = null;
          this.hwEditMac = '';
          this.hwEditIsDectBase = false;
          this.hwEditIpei = '';
          this.hwEditUserId = '';
          this.hwEditError = null;
          this.render();
          break;
        case 'hw-remove-base': {
          const delBaseId = actionEl.dataset.baseId ?? '';
          if (delBaseId) {
            this.handleRemoveDectBase(delBaseId);
          }
          break;
        }
        case 'remove-device': {
          const deviceId = actionEl.dataset.deviceId;
          const deviceType = actionEl.dataset.deviceType ?? 'deskphone';
          const rmUserId = actionEl.dataset.userId ?? '';
          const rmBaseId = actionEl.dataset.baseId ?? '';
          if (deviceId) {
            this.handleRemoveDevice(deviceId, deviceType, rmUserId, rmBaseId);
          }
          break;
        }
        case 'back': {
          if (this.currentStep === 'account' && this.accountSubStep === 'team-members') {
            this.accountSubStep = 'business-details';
            this.render();
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
        case 'select-suggestion': {
          const placeId = actionEl.dataset.placeId;
          if (placeId) {
            this.handleSelectSuggestion(placeId);
          }
          break;
        }
        case 'edit-address':
          this.editingLocationId = this.existingLocation?.id ?? null;
          this.resolvedAddress = null;
          this.existingLocation = null;
          this.addressMode = 'edit';
          this.render();
          break;
        case 'enter-manually':
          this.addressMode = 'edit';
          this.render();
          break;
        case 'search-instead':
          this.addressMode = 'search';
          this.addressQuery = '';
          this.addressSuggestions = [];
          this.addressDropdownOpen = false;
          this.render();
          break;

        // ── Numbers Step Actions ──
        case 'num-retry-load':
          this.loadNumbersData();
          break;
        case 'num-start-order':
          this.numResetOrderFlow();
          this.numSubStep = 'order-search';
          this.render();
          break;
        case 'num-start-port':
          this.numResetPortFlow();
          this.numSubStep = 'port-numbers';
          this.render();
          break;
        case 'num-back-to-overview':
          this.numResetOrderFlow();
          this.numResetPortFlow();
          this.numSubStep = 'overview';
          this.loadNumbersData();
          break;
        case 'num-set-search-type': {
          const searchType = actionEl.dataset.searchType as SearchType;
          if (searchType) {
            this.numOrderSearchType = searchType;
            this.numOrderSearchValue = '';
            this.numOrderSearchCity = '';
            this.numOrderSearchState = '';
            this.render();
          }
          break;
        }
        case 'num-search':
          this.numSearchNumbers();
          break;
        case 'num-back-to-search':
          this.numSubStep = 'order-search';
          this.render();
          break;
        case 'num-toggle-number': {
          const phone = actionEl.dataset.phone;
          if (phone) {
            if (this.numOrderSelectedNumbers.has(phone)) {
              this.numOrderSelectedNumbers.delete(phone);
            } else {
              this.numOrderSelectedNumbers.add(phone);
            }
            this.render();
          }
          break;
        }
        case 'num-select-all':
          if (this.numOrderSelectedNumbers.size === this.numOrderAvailableNumbers.length) {
            this.numOrderSelectedNumbers.clear();
          } else {
            for (const num of this.numOrderAvailableNumbers) {
              this.numOrderSelectedNumbers.add(num.phone_number);
            }
          }
          this.render();
          break;
        case 'num-confirm-order':
          if (this.numOrderSelectedNumbers.size > 0) {
            this.numSubStep = 'order-confirm';
            this.render();
          }
          break;
        case 'num-back-to-results':
          this.numSubStep = 'order-results';
          this.render();
          break;
        case 'num-place-order':
          this.numPlaceOrder();
          break;
        case 'num-order-done':
          this.numResetOrderFlow();
          this.numSubStep = 'overview';
          this.loadNumbersData();
          break;
        case 'num-add-port-phone':
          this.numPortPhoneInputs.push('');
          this.render();
          break;
        case 'num-remove-port-phone': {
          const idx = parseInt(actionEl.dataset.index ?? '', 10);
          if (!isNaN(idx) && this.numPortPhoneInputs.length > 1) {
            this.numPortPhoneInputs.splice(idx, 1);
            this.render();
          }
          break;
        }
        case 'num-check-eligibility':
          this.numCheckPortEligibility();
          break;
        case 'num-back-to-port-numbers':
          this.numSubStep = 'port-numbers';
          this.render();
          break;
        case 'num-to-subscriber':
          this.numSubStep = 'port-subscriber';
          this.render();
          break;
        case 'num-back-to-eligibility':
          this.numSubStep = 'port-eligibility';
          this.render();
          break;
        case 'num-to-foc-date':
          if (this.numValidateSubscriber()) {
            this.numSubStep = 'port-foc-date';
            this.render();
          } else {
            this.render();
          }
          break;
        case 'num-back-to-subscriber':
          this.numSubStep = 'port-subscriber';
          this.render();
          break;
        case 'num-to-documents':
          if (this.numValidateFocDate()) {
            this.numSubStep = 'port-documents';
            this.render();
          } else {
            this.render();
          }
          break;
        case 'num-back-to-foc-date':
          this.numSubStep = 'port-foc-date';
          this.render();
          break;
        case 'num-upload-bill': {
          const billInput =
            this.shadowRoot?.querySelector<HTMLInputElement>('#num-bill-copy-input');
          billInput?.click();
          break;
        }
        case 'num-upload-csr': {
          const csrInput = this.shadowRoot?.querySelector<HTMLInputElement>('#num-csr-input');
          csrInput?.click();
          break;
        }
        case 'num-to-review':
          if (!this.numPortBillCopyFile) {
            this.numPortDocUploadError = this.t(
              'accountOnboarding.numbers.validation.billCopyRequired'
            );
            this.render();
          } else {
            this.numPortDocUploadError = null;
            this.numSubStep = 'port-review';
            this.render();
          }
          break;
        case 'num-back-to-documents':
          this.numSubStep = 'port-documents';
          this.render();
          break;
        case 'num-submit-port':
          if (!this.numPortSignature.trim()) {
            this.numPortSubmitError = this.t(
              'accountOnboarding.numbers.validation.signatureRequired'
            );
            this.render();
          } else {
            this.numCreateAndSubmitPort();
          }
          break;
        case 'num-port-done':
          this.numResetPortFlow();
          this.numSubStep = 'overview';
          this.loadNumbersData();
          break;
      }
    });
  }
}

// Register the custom element
if (typeof window !== 'undefined' && !customElements.get('dialstack-account-onboarding')) {
  customElements.define('dialstack-account-onboarding', AccountOnboardingComponent);
}
