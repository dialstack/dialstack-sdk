/**
 * Numbers step helper — owns all state and logic for the number ordering + porting flows.
 */

import type {
  AvailablePhoneNumber,
  NumberOrder,
  PortOrder,
  PortEligibilityResult,
  CreatePortOrderRequest,
  SearchType,
  DIDItem,
  PhoneNumberItem,
  PhoneNumberStatus,
  E911ValidationResult,
  OnboardingLocation,
} from '../../types';
import { AsYouType, parsePhoneNumberFromString } from 'libphonenumber-js';
import { US_STATES } from '../../constants/us-states';
import { SUCCESS_SVG, ERROR_SVG, PORT_SVG, PLUS_CIRCLE_SVG, CHECK_CIRCLE_SVG } from './icons';
import { ApiError } from '../../core/instance';
import type { OnboardingHost } from './host';

export type NumSubStep =
  | 'overview'
  | 'primary-did'
  | 'caller-id'
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

export class NumbersStepHelper {
  // Sub-step
  numSubStep: NumSubStep = 'overview';

  // Phone numbers list
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

  // Primary DID selection state
  activeDIDs: DIDItem[] = [];
  selectedPrimaryDIDId: string | null = null;
  primaryDIDAutoMatched = false;
  private isLoadingDIDs = false;
  private hasAttemptedDIDLoad = false;

  // E911 state
  e911FlowState: 'idle' | 'running' | 'simple' | 'complex' | 'failed' = 'idle';
  private e911ValidationResult: E911ValidationResult | null = null;
  private e911ProvisionedLocation: OnboardingLocation | null = null;
  private e911PrimaryDid: DIDItem | null = null;
  private e911Generation = 0;

  // Caller ID state
  private callerIdInputs = new Map<string, string>();
  private callerIdStatuses = new Map<string, 'idle' | 'submitting' | 'submitted' | 'error'>();
  private callerIdErrors = new Map<string, string>();
  private callerIdBulkAttempted = false;

  constructor(private host: OnboardingHost) {}

  // ============================================================================
  // Data Loading
  // ============================================================================

  async loadNumbersData(): Promise<void> {
    if (!this.host.instance) return;
    this.numIsLoadingNumbers = true;
    this.numLoadError = null;
    this.host.render();

    try {
      const [dids, orders, ports] = await Promise.all([
        this.host.instance.fetchAllPages<DIDItem>((opts) =>
          this.host.instance!.listPhoneNumbers(opts)
        ),
        this.host.instance.fetchAllPages<NumberOrder>((opts) =>
          this.host.instance!.listNumberOrders(opts)
        ),
        this.host.instance.fetchAllPages<PortOrder>((opts) =>
          this.host.instance!.listPortOrders(opts)
        ),
      ]);

      this.numPhoneNumbers = this.numMergePhoneNumbers(dids, orders, ports);
      this.numIsLoadingNumbers = false;
      this.host.render();
    } catch (err) {
      this.numLoadError = err instanceof Error ? err.message : String(err);
      this.numIsLoadingNumbers = false;
      this.host.render();
    }
  }

  /** Whether numbers data has been loaded at least once. */
  hasLoadedNumbers(): boolean {
    return this.numPhoneNumbers.length > 0 || this.numIsLoadingNumbers;
  }

  /**
   * Load active DIDs for the numbers step and auto-match against account phone.
   */
  async loadActiveDIDs(): Promise<void> {
    if (!this.host.instance) return;

    this.hasAttemptedDIDLoad = true;
    this.isLoadingDIDs = true;
    this.host.render();

    try {
      this.activeDIDs = await this.host.instance.fetchAllPages<DIDItem>((opts) =>
        this.host.instance!.listPhoneNumbers({ ...opts, status: 'active' })
      );

      // Try to match account phone to an active DID
      const parsed = parsePhoneNumberFromString(this.host.accountPhone, 'US');
      const e164Phone = parsed?.number;
      const matchedDID = e164Phone
        ? this.activeDIDs.find((d) => d.phone_number === e164Phone)
        : undefined;

      if (matchedDID) {
        this.selectedPrimaryDIDId = matchedDID.id;
        this.primaryDIDAutoMatched = true;
      } else if (this.activeDIDs.length === 1) {
        // Convenience: auto-select the only available DID
        this.selectedPrimaryDIDId = this.activeDIDs[0]!.id;
        this.primaryDIDAutoMatched = false;
      }
    } catch (err) {
      console.warn('[dialstack] Failed to load active DIDs:', err);
    } finally {
      this.isLoadingDIDs = false;
      this.host.render();
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
  // Order Flow
  // ============================================================================

  private async numSearchNumbers(): Promise<void> {
    if (!this.host.instance) return;
    this.numOrderIsSearching = true;
    this.numOrderError = null;
    this.numOrderAvailableNumbers = [];
    this.numOrderSelectedNumbers.clear();
    this.host.render();

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

      const results = await this.host.instance.searchAvailableNumbers(opts as never);
      this.numOrderAvailableNumbers = results;
      this.numOrderIsSearching = false;
      this.numSubStep = 'order-results';
      this.host.render();
    } catch (err) {
      this.numOrderError = err instanceof Error ? err.message : String(err);
      this.numOrderIsSearching = false;
      this.host.render();
    }
  }

  private async numPlaceOrder(): Promise<void> {
    if (!this.host.instance || this.numOrderSelectedNumbers.size === 0 || this.numOrderIsPlacing)
      return;
    this.numOrderIsPlacing = true;
    this.numOrderError = null;
    this.host.render();

    try {
      const order = await this.host.instance.createPhoneNumberOrder(
        Array.from(this.numOrderSelectedNumbers)
      );
      this.numOrderCurrentOrder = order;
      this.numSubStep = 'order-status';
      this.numOrderPollCount = 0;
      this.host.render();
      this.numStartOrderPoll(order.id);
    } catch (err) {
      this.numOrderError = err instanceof Error ? err.message : String(err);
      this.host.render();
    } finally {
      this.numOrderIsPlacing = false;
    }
  }

  private numStartOrderPoll(orderId: string): void {
    this.numStopOrderPoll();
    this.numOrderPollTimer = setTimeout(async () => {
      if (!this.host.instance) return;
      try {
        const order = await this.host.instance.getPhoneNumberOrder(orderId);
        this.numOrderCurrentOrder = order;
        this.numOrderPollCount++;
        this.host.render();
        if (order.status === 'pending' && this.numOrderPollCount < 5) {
          this.numStartOrderPoll(orderId);
        }
      } catch (err) {
        console.warn('[dialstack] Order poll failed:', err);
      }
    }, 2000);
  }

  numStopOrderPoll(): void {
    if (this.numOrderPollTimer) {
      clearTimeout(this.numOrderPollTimer);
      this.numOrderPollTimer = null;
    }
    this.cancelE911();
  }

  /** Cancel any in-flight E911 provisioning via generation mismatch. */
  private cancelE911(): void {
    this.e911Generation++;
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
  // Port Flow
  // ============================================================================

  private async numCheckPortEligibility(): Promise<void> {
    if (!this.host.instance) return;

    const validNumbers: string[] = [];
    for (const input of this.numPortPhoneInputs) {
      const trimmed = input.trim();
      if (!trimmed) continue;
      const parsed = parsePhoneNumberFromString(trimmed, 'US');
      if (!parsed || !parsed.isValid()) {
        this.numPortEligibilityError = this.host.t(
          'accountOnboarding.numbers.validation.phoneInvalid'
        );
        this.host.render();
        return;
      }
      validNumbers.push(parsed.format('E.164'));
    }

    if (validNumbers.length === 0) {
      this.numPortEligibilityError = this.host.t(
        'accountOnboarding.numbers.validation.phoneRequired'
      );
      this.host.render();
      return;
    }

    this.numPortIsCheckingEligibility = true;
    this.numPortEligibilityError = null;
    this.host.render();

    try {
      const result = await this.host.instance.checkPortEligibility(validNumbers);
      this.numPortEligibilityResult = result;
      this.numPortIsCheckingEligibility = false;
      this.numSubStep = 'port-eligibility';
      this.host.render();
    } catch (err) {
      this.numPortEligibilityError = err instanceof Error ? err.message : String(err);
      this.numPortIsCheckingEligibility = false;
      this.host.render();
    }
  }

  private numValidateSubscriber(): boolean {
    const errors: Record<string, string> = {};
    const t = (key: string): string => this.host.t(key);

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
    const t = (key: string): string => this.host.t(key);

    if (!this.numPortFocDate) {
      errors.date = t('accountOnboarding.numbers.validation.focDateRequired');
    } else {
      const focDate = new Date(this.numPortFocDate + 'T00:00:00');
      const today = new Date();
      today.setHours(0, 0, 0, 0);

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
    if (!this.host.instance || !this.numPortEligibilityResult) return;

    this.numPortIsSubmitting = true;
    this.numPortSubmitError = null;
    this.host.render();

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

      const order = await this.host.instance.createPortOrder(request);

      if (this.numPortBillCopyFile) {
        await this.host.instance.uploadBillCopy(order.id, this.numPortBillCopyFile);
      }
      if (this.numPortCsrFile) {
        await this.host.instance.uploadCSR(order.id, this.numPortCsrFile);
      }

      await this.host.instance.approvePortOrder(order.id, {
        signature: this.numPortSignature.trim(),
        ip: '0.0.0.0',
      });

      const submitted = await this.host.instance.submitPortOrder(order.id);

      this.numPortCurrentOrder = submitted;
      this.numPortIsSubmitting = false;
      this.numSubStep = 'port-submitted';
      this.host.render();
    } catch (err) {
      this.numPortSubmitError = err instanceof Error ? err.message : String(err);
      this.numPortIsSubmitting = false;
      this.host.render();
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
  // Sidebar Sub-Step Mapping
  // ============================================================================

  getSidebarActiveKey(): string | null {
    if (this.numSubStep === 'overview') return 'options';
    if (this.numSubStep === 'primary-did') return 'primary-did';
    if (this.numSubStep === 'caller-id') return 'caller-id';
    if (this.numSubStep === 'port-submitted') return null;
    if (this.numSubStep === 'order-status') {
      const done =
        this.numOrderCurrentOrder &&
        (this.numOrderCurrentOrder.status !== 'pending' || this.numOrderPollCount >= 5);
      return done ? null : 'verification';
    }
    return 'setup';
  }

  // ============================================================================
  // Click Handler
  // ============================================================================

  handleAction(action: string, actionEl: HTMLElement): boolean {
    switch (action) {
      // Sub-step navigation: overview → primary-did → caller-id → (next main step)
      case 'next':
        if (this.host.currentStep === 'numbers' && this.numSubStep === 'overview') {
          this.numSubStep = 'primary-did';
          // Only load DIDs on first visit; preserve user selection on back/forth
          if (!this.hasAttemptedDIDLoad && !this.isLoadingDIDs) {
            this.loadActiveDIDs();
          } else {
            this.host.render();
          }
          return true;
        }
        if (this.host.currentStep === 'numbers' && this.numSubStep === 'primary-did') {
          // Skip caller-id if no active DIDs
          if (this.activeDIDs.length === 0) return false;
          // Initialize on first visit or reconcile if new DIDs appeared
          const allDIDsCovered = this.activeDIDs.every((d) => this.callerIdInputs.has(d.id));
          if (!allDIDsCovered) {
            this.initCallerIdInputs();
          }
          this.numSubStep = 'caller-id';
          this.host.render();
          return true;
        }
        if (this.host.currentStep === 'numbers' && this.numSubStep === 'caller-id') {
          if (this.allCallerIdsSubmitted()) return false; // all done — advance
          // If any are currently submitting, block silently (in progress)
          const anySubmitting = this.activeDIDs.some(
            (did) => this.callerIdStatuses.get(did.id) === 'submitting'
          );
          if (anySubmitting) return true;
          // Otherwise trigger bulk submission
          this.submitAllFromNext();
          return true;
        }
        return false;
      case 'back':
        if (this.host.currentStep === 'numbers' && this.numSubStep === 'caller-id') {
          this.callerIdBulkAttempted = false;
          this.numSubStep = 'primary-did';
          this.host.render();
          return true;
        }
        if (this.host.currentStep === 'numbers' && this.numSubStep === 'primary-did') {
          this.numSubStep = 'overview';
          this.host.render();
          return true;
        }
        return false;
      case 'num-retry-load':
        this.loadNumbersData();
        return true;
      case 'num-start-order':
        this.numResetOrderFlow();
        this.numSubStep = 'order-search';
        this.host.render();
        return true;
      case 'num-start-port':
        this.numResetPortFlow();
        this.numSubStep = 'port-numbers';
        this.host.render();
        return true;
      case 'num-back-to-overview':
        this.numResetOrderFlow();
        this.numResetPortFlow();
        this.numSubStep = 'overview';
        this.loadNumbersData();
        return true;
      case 'num-set-search-type': {
        const searchType = actionEl.dataset.searchType as SearchType;
        if (searchType) {
          this.numOrderSearchType = searchType;
          this.numOrderSearchValue = '';
          this.numOrderSearchCity = '';
          this.numOrderSearchState = '';
          this.host.render();
        }
        return true;
      }
      case 'num-search':
        this.numSearchNumbers();
        return true;
      case 'num-back-to-search':
        this.numSubStep = 'order-search';
        this.host.render();
        return true;
      case 'num-toggle-number': {
        const phone = actionEl.dataset.phone;
        if (phone) {
          if (this.numOrderSelectedNumbers.has(phone)) {
            this.numOrderSelectedNumbers.delete(phone);
          } else {
            this.numOrderSelectedNumbers.add(phone);
          }
          this.host.render();
        }
        return true;
      }
      case 'num-select-all':
        if (this.numOrderSelectedNumbers.size === this.numOrderAvailableNumbers.length) {
          this.numOrderSelectedNumbers.clear();
        } else {
          for (const num of this.numOrderAvailableNumbers) {
            this.numOrderSelectedNumbers.add(num.phone_number);
          }
        }
        this.host.render();
        return true;
      case 'num-confirm-order':
        if (this.numOrderSelectedNumbers.size > 0) {
          this.numSubStep = 'order-confirm';
          this.host.render();
        }
        return true;
      case 'num-back-to-results':
        this.numSubStep = 'order-results';
        this.host.render();
        return true;
      case 'num-place-order':
        this.numPlaceOrder();
        return true;
      case 'num-order-done': {
        this.numResetOrderFlow();
        const steps = this.host.getActiveSteps();
        const nextStep = steps[steps.indexOf('numbers') + 1];
        if (nextStep) {
          this.host.navigateToStep(nextStep);
        } else {
          this.numSubStep = 'overview';
          this.loadNumbersData();
        }
        return true;
      }
      case 'num-add-port-phone':
        this.numPortPhoneInputs.push('');
        this.host.render();
        return true;
      case 'num-remove-port-phone': {
        const idx = parseInt(actionEl.dataset.index ?? '', 10);
        if (!isNaN(idx) && this.numPortPhoneInputs.length > 1) {
          this.numPortPhoneInputs.splice(idx, 1);
          this.host.render();
        }
        return true;
      }
      case 'num-check-eligibility':
        this.numCheckPortEligibility();
        return true;
      case 'num-back-to-port-numbers':
        this.numSubStep = 'port-numbers';
        this.host.render();
        return true;
      case 'num-to-subscriber':
        this.numSubStep = 'port-subscriber';
        this.host.render();
        return true;
      case 'num-back-to-eligibility':
        this.numSubStep = 'port-eligibility';
        this.host.render();
        return true;
      case 'num-to-foc-date':
        if (this.numValidateSubscriber()) {
          this.numSubStep = 'port-foc-date';
          this.host.render();
        } else {
          this.host.render();
        }
        return true;
      case 'num-back-to-subscriber':
        this.numSubStep = 'port-subscriber';
        this.host.render();
        return true;
      case 'num-to-documents':
        if (this.numValidateFocDate()) {
          this.numSubStep = 'port-documents';
          this.host.render();
        } else {
          this.host.render();
        }
        return true;
      case 'num-back-to-foc-date':
        this.numSubStep = 'port-foc-date';
        this.host.render();
        return true;
      case 'num-upload-bill': {
        const billInput =
          this.host.shadowRoot?.querySelector<HTMLInputElement>('#num-bill-copy-input');
        billInput?.click();
        return true;
      }
      case 'num-upload-csr': {
        const csrInput = this.host.shadowRoot?.querySelector<HTMLInputElement>('#num-csr-input');
        csrInput?.click();
        return true;
      }
      case 'num-to-review':
        if (!this.numPortBillCopyFile) {
          this.numPortDocUploadError = this.host.t(
            'accountOnboarding.numbers.validation.billCopyRequired'
          );
          this.host.render();
        } else {
          this.numPortDocUploadError = null;
          this.numSubStep = 'port-review';
          this.host.render();
        }
        return true;
      case 'num-back-to-documents':
        this.numSubStep = 'port-documents';
        this.host.render();
        return true;
      case 'num-submit-port':
        if (!this.numPortSignature.trim()) {
          this.numPortSubmitError = this.host.t(
            'accountOnboarding.numbers.validation.signatureRequired'
          );
          this.host.render();
        } else {
          this.numCreateAndSubmitPort();
        }
        return true;
      case 'num-port-done':
        this.numResetPortFlow();
        this.numSubStep = 'overview';
        this.loadNumbersData();
        return true;
      case 'num-cid-skip': {
        const steps = this.host.getActiveSteps();
        const nextStep = steps[steps.indexOf('numbers') + 1];
        if (nextStep) {
          this.host.navigateToStep(nextStep);
        }
        return true;
      }
      default:
        return false;
    }
  }

  // ============================================================================
  // Input Listeners
  // ============================================================================

  attachInputListeners(): void {
    if (!this.host.shadowRoot) return;

    // Order search fields
    const areaCodeInput = this.host.shadowRoot.querySelector<HTMLInputElement>('#num-area-code');
    if (areaCodeInput) {
      areaCodeInput.addEventListener('input', () => {
        this.numOrderSearchValue = areaCodeInput.value;
      });
    }

    const searchCityInput =
      this.host.shadowRoot.querySelector<HTMLInputElement>('#num-search-city');
    if (searchCityInput) {
      searchCityInput.addEventListener('input', () => {
        this.numOrderSearchCity = searchCityInput.value;
      });
    }

    const searchStateSelect =
      this.host.shadowRoot.querySelector<HTMLSelectElement>('#num-search-state');
    if (searchStateSelect) {
      searchStateSelect.addEventListener('change', () => {
        this.numOrderSearchState = searchStateSelect.value;
      });
    }

    const zipInput = this.host.shadowRoot.querySelector<HTMLInputElement>('#num-zip-code');
    if (zipInput) {
      zipInput.addEventListener('input', () => {
        this.numOrderSearchValue = zipInput.value;
      });
    }

    const quantityInput = this.host.shadowRoot.querySelector<HTMLInputElement>('#num-quantity');
    if (quantityInput) {
      quantityInput.addEventListener('input', () => {
        this.numOrderQuantity = parseInt(quantityInput.value, 10) || 5;
      });
    }

    // Port phone inputs
    for (let i = 0; i < this.numPortPhoneInputs.length; i++) {
      const phoneInput = this.host.shadowRoot.querySelector<HTMLInputElement>(
        `#num-port-phone-${i}`
      );
      if (phoneInput) {
        phoneInput.addEventListener('input', () => {
          const formatter = new AsYouType('US');
          this.numPortPhoneInputs[i] = formatter.input(phoneInput.value);
          phoneInput.value = this.numPortPhoneInputs[i]!;
        });
      }
    }

    // Port subscriber fields
    const bindInput = (id: string, setter: (val: string) => void): void => {
      const el = this.host.shadowRoot!.querySelector<HTMLInputElement>(`#${id}`);
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
    const btnInput = this.host.shadowRoot.querySelector<HTMLInputElement>('#num-port-btn');
    if (btnInput) {
      btnInput.addEventListener('input', () => {
        const formatter = new AsYouType('US');
        this.numPortSubscriberBtn = formatter.input(btnInput.value);
        btnInput.value = this.numPortSubscriberBtn;
      });
    }

    const portStateSelect =
      this.host.shadowRoot.querySelector<HTMLSelectElement>('#num-port-state');
    if (portStateSelect) {
      portStateSelect.addEventListener('change', () => {
        this.numPortSubscriberState = portStateSelect.value;
      });
    }

    // FOC date/time
    const focDateInput = this.host.shadowRoot.querySelector<HTMLInputElement>('#num-port-foc-date');
    if (focDateInput) {
      focDateInput.addEventListener('input', () => {
        this.numPortFocDate = focDateInput.value;
      });
    }

    const focTimeSelect =
      this.host.shadowRoot.querySelector<HTMLSelectElement>('#num-port-foc-time');
    if (focTimeSelect) {
      focTimeSelect.addEventListener('change', () => {
        this.numPortFocTime = focTimeSelect.value;
      });
    }

    // File inputs
    const billInput = this.host.shadowRoot.querySelector<HTMLInputElement>('#num-bill-copy-input');
    if (billInput) {
      billInput.addEventListener('change', () => {
        this.numPortBillCopyFile = billInput.files?.[0] ?? null;
        this.host.render();
      });
    }

    const csrInput = this.host.shadowRoot.querySelector<HTMLInputElement>('#num-csr-input');
    if (csrInput) {
      csrInput.addEventListener('change', () => {
        this.numPortCsrFile = csrInput.files?.[0] ?? null;
        this.host.render();
      });
    }

    // Signature
    const sigInput = this.host.shadowRoot.querySelector<HTMLInputElement>('#num-port-signature');
    if (sigInput) {
      sigInput.addEventListener('input', () => {
        this.numPortSignature = sigInput.value;
      });
    }

    // Primary DID radio buttons
    const radios = this.host.shadowRoot.querySelectorAll<HTMLInputElement>(
      'input[name="primary-did"]'
    );
    for (const radio of radios) {
      radio.addEventListener('change', () => {
        this.selectedPrimaryDIDId = radio.value;
        this.primaryDIDAutoMatched = false;
        this.host.render();
      });
    }

    // Caller ID inputs
    if (this.numSubStep === 'caller-id') {
      const cidInputs = this.host.shadowRoot.querySelectorAll<HTMLInputElement>('[data-cid-input]');
      for (const input of cidInputs) {
        const didId = input.dataset.cidInput;
        if (!didId) continue;
        input.addEventListener('input', () => {
          this.callerIdInputs.set(didId, input.value);
          this.callerIdErrors.delete(didId);
          // Reset status on edit so Next will re-submit; full re-render
          // keeps DOM in sync without fragile manual querySelector cleanup
          const currentStatus = this.callerIdStatuses.get(didId);
          if (currentStatus === 'submitted' || currentStatus === 'error') {
            this.callerIdStatuses.set(didId, 'idle');
            this.host.render();
            return;
          }
          // Update char counter
          const counter = this.host.shadowRoot?.querySelector(`[data-cid-counter="${didId}"]`);
          if (counter) {
            counter.textContent = this.host.t('accountOnboarding.numbers.callerId.charCount', {
              count: input.value.length,
            });
          }
        });
      }
    }
  }

  // ============================================================================
  // Renderers
  // ============================================================================

  renderNumbersStep(): string {
    let subContent = '';
    switch (this.numSubStep) {
      case 'overview':
        subContent = this.renderNumOverview();
        break;
      case 'primary-did':
        subContent = this.renderPrimaryDIDSection();
        break;
      case 'caller-id':
        subContent = this.renderCallerIdSection();
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

    const showOuterHeader =
      this.numSubStep === 'overview' ||
      this.numSubStep === 'primary-did' ||
      this.numSubStep === 'caller-id';
    return `
      <div class="card ${this.host.classes.stepNumbers || ''}" part="step-numbers">
        ${
          showOuterHeader
            ? `<h2 class="section-title">${this.host.t('accountOnboarding.numbers.title')}</h2>
        <p class="section-subtitle">${this.host.t('accountOnboarding.numbers.subtitle')}</p>`
            : ''
        }
        ${subContent}
      </div>
      ${showOuterHeader ? this.renderNumbersFooter() : ''}
    `;
  }

  /**
   * Footer for the numbers step — swaps Next for Skip after a failed bulk caller-id attempt.
   */
  private renderNumbersFooter(): string {
    if (
      this.numSubStep === 'caller-id' &&
      this.callerIdBulkAttempted &&
      this.activeDIDs.some((did) => this.callerIdStatuses.get(did.id) === 'error')
    ) {
      return `
        <div class="footer-bar">
          <button class="btn btn-ghost" data-action="back">
            &larr; ${this.host.t('accountOnboarding.nav.back')}
          </button>
          <button class="btn btn-warning" data-action="num-cid-skip">
            ${this.host.t('accountOnboarding.numbers.callerId.skipCallerId')} &rarr;
          </button>
        </div>`;
    }
    return this.host.renderStepFooter();
  }

  private renderPrimaryDIDSection(): string {
    const t = (key: string): string => this.host.t(key);

    let primaryDIDHtml: string;

    if (this.isLoadingDIDs) {
      primaryDIDHtml = `
        <div class="center-state" role="status" aria-live="polite">
          <div class="spinner"><svg viewBox="0 0 50 50"><circle cx="25" cy="25" r="20" fill="none" stroke="currentColor" stroke-width="4" stroke-dasharray="80 60"/></svg></div>
          <p>${t('accountOnboarding.numbers.primaryNumber.loading')}</p>
        </div>`;
    } else if (this.activeDIDs.length === 0) {
      primaryDIDHtml = `<div class="inline-alert info">${t('accountOnboarding.numbers.primaryNumber.noDIDs')}</div>`;
    } else {
      // Sort matched DID to top of the list
      const sortedDIDs = this.primaryDIDAutoMatched
        ? [...this.activeDIDs].sort((a, b) => {
            if (a.id === this.selectedPrimaryDIDId) return -1;
            if (b.id === this.selectedPrimaryDIDId) return 1;
            return 0;
          })
        : this.activeDIDs;

      const radioOptions = sortedDIDs
        .map((did) => {
          const isSelected = this.selectedPrimaryDIDId === did.id;
          const formatted =
            parsePhoneNumberFromString(did.phone_number, 'US')?.formatNational() ??
            did.phone_number;
          const isAutoMatched = this.primaryDIDAutoMatched && did.id === this.selectedPrimaryDIDId;
          const badges = [
            isAutoMatched
              ? `<span class="primary-did-badge auto-matched">${t('accountOnboarding.numbers.primaryNumber.autoMatchedBadge')}</span>`
              : '',
            did.number_class === 'temporary'
              ? `<span class="primary-did-badge">${t('accountOnboarding.numbers.primaryNumber.temporary')}</span>`
              : '',
          ]
            .filter(Boolean)
            .join('');
          return `
            <label class="primary-did-option${isSelected ? ' selected' : ''}">
              <input type="radio" name="primary-did" value="${this.host.escapeHtml(did.id)}"${isSelected ? ' checked' : ''} />
              <span>${this.host.escapeHtml(formatted)}</span>
              ${badges}
            </label>`;
        })
        .join('');

      primaryDIDHtml = `<div class="primary-did-group">${radioOptions}</div>`;
    }

    return `
      <div class="primary-did-section">
        <h3 class="section-heading">${t('accountOnboarding.numbers.primaryNumber.heading')}</h3>
        <p class="section-description">${t('accountOnboarding.numbers.primaryNumber.description')}</p>
        ${primaryDIDHtml}
      </div>`;
  }

  // ============================================================================
  // Caller ID
  // ============================================================================

  private initCallerIdInputs(): void {
    this.callerIdInputs.clear();
    this.callerIdStatuses.clear();
    this.callerIdErrors.clear();
    this.callerIdBulkAttempted = false;
    for (const did of this.activeDIDs) {
      const existing = did.caller_id_name ?? '';
      this.callerIdInputs.set(did.id, existing);
      this.callerIdStatuses.set(did.id, existing ? 'submitted' : 'idle');
    }
  }

  private validateCallerIdName(name: string): string | null {
    if (!name.trim()) return this.host.t('accountOnboarding.numbers.callerId.validation.required');
    if (name.length > 15)
      return this.host.t('accountOnboarding.numbers.callerId.validation.tooLong');
    if (!/^[A-Za-z0-9 -]+$/.test(name))
      return this.host.t('accountOnboarding.numbers.callerId.validation.invalidChars');
    return null;
  }

  /**
   * Core caller ID submission — validates, calls API, updates status maps.
   * Does NOT call this.host.render() so callers can batch renders.
   */
  private async submitCallerIdNoRender(didId: string): Promise<void> {
    const name = this.callerIdInputs.get(didId) ?? '';
    const error = this.validateCallerIdName(name);
    if (error) {
      this.callerIdErrors.set(didId, error);
      this.callerIdStatuses.set(didId, 'error');
      return;
    }

    this.callerIdStatuses.set(didId, 'submitting');
    this.callerIdErrors.delete(didId);

    try {
      const trimmed = name.trim();
      await this.host.instance!.updateCallerID(didId, trimmed);
      this.callerIdStatuses.set(didId, 'submitted');
      // Persist back so re-init from activeDIDs won't revert
      const did = this.activeDIDs.find((d) => d.id === didId);
      if (did) did.caller_id_name = trimmed;
    } catch (err) {
      // 409 from Bandwidth LIDB (number already has CNAM or update in progress)
      if (err instanceof ApiError && err.status === 409) {
        this.callerIdErrors.set(
          didId,
          this.host.t('accountOnboarding.numbers.callerId.error.conflict')
        );
      } else {
        this.callerIdErrors.set(
          didId,
          this.host.t('accountOnboarding.numbers.callerId.error.submitFailed')
        );
      }
      this.callerIdStatuses.set(didId, 'error');
    }
  }

  /**
   * Triggered when Next is pressed on caller-id sub-step.
   * Validates all, submits in parallel, auto-advances on full success.
   */
  private async submitAllFromNext(): Promise<void> {
    const pending = this.activeDIDs.filter(
      (did) => this.callerIdStatuses.get(did.id) !== 'submitted'
    );

    // Validate all first — if any fail, show errors without API calls
    let hasValidationError = false;
    for (const did of pending) {
      const name = this.callerIdInputs.get(did.id) ?? '';
      const error = this.validateCallerIdName(name);
      if (error) {
        this.callerIdErrors.set(did.id, error);
        this.callerIdStatuses.set(did.id, 'error');
        hasValidationError = true;
      }
    }
    if (hasValidationError) {
      this.callerIdBulkAttempted = true;
      this.host.render();
      return;
    }

    // Set all pending to submitting and render once (shows spinners)
    for (const did of pending) {
      this.callerIdStatuses.set(did.id, 'submitting');
      this.callerIdErrors.delete(did.id);
    }
    this.host.render();

    // Fire all in parallel
    await Promise.all(pending.map((did) => this.submitCallerIdNoRender(did.id)));
    this.callerIdBulkAttempted = true;
    this.host.render();

    // Guard: only auto-advance if user is still on caller-id (they may have clicked Back)
    if (
      this.host.currentStep === 'numbers' &&
      this.numSubStep === 'caller-id' &&
      this.allCallerIdsSubmitted()
    ) {
      const steps = this.host.getActiveSteps();
      const nextStep = steps[steps.indexOf('numbers') + 1];
      if (nextStep) {
        this.host.navigateToStep(nextStep);
      }
    }
  }

  private allCallerIdsSubmitted(): boolean {
    return this.activeDIDs.every((did) => this.callerIdStatuses.get(did.id) === 'submitted');
  }

  private renderCallerIdSection(): string {
    const t = (key: string, params?: Record<string, string | number>): string =>
      this.host.t(key, params);

    if (this.activeDIDs.length === 0) {
      return `<div class="inline-alert info">${t('accountOnboarding.numbers.callerId.noDIDs')}</div>`;
    }

    const cards = this.activeDIDs
      .map((did) => {
        const inputVal = this.callerIdInputs.get(did.id) ?? '';
        const status = this.callerIdStatuses.get(did.id) ?? 'idle';
        const error = this.callerIdErrors.get(did.id);
        const formatted =
          parsePhoneNumberFromString(did.phone_number, 'US')?.formatNational() ?? did.phone_number;
        const isSubmitting = status === 'submitting';
        const isSubmitted = status === 'submitted';

        let statusHtml = '';
        if (isSubmitting) {
          statusHtml = `<span class="num-cid-status-submitting"><span class="spinner"></span> ${t('accountOnboarding.numbers.callerId.submitting')}</span>`;
        } else if (isSubmitted) {
          statusHtml = `<span class="num-cid-status-submitted">${SUCCESS_SVG} ${t('accountOnboarding.numbers.callerId.submitted')}</span>`;
        } else if (status === 'error' && error) {
          statusHtml = `<span class="num-cid-status-error">${this.host.escapeHtml(error)}</span>`;
        }

        return `
          <div class="num-cid-card">
            <div class="num-cid-card-header">
              <span class="num-cid-phone">${this.host.escapeHtml(formatted)}</span>
            </div>
            <div class="num-cid-input-wrapper">
              <label class="form-label">${t('accountOnboarding.numbers.callerId.inputLabel')}</label>
              <div class="num-cid-input-row">
                <input
                  type="text"
                  class="form-input num-cid-input"
                  data-cid-input="${this.host.escapeHtml(did.id)}"
                  value="${this.host.escapeHtml(inputVal)}"
                  placeholder="${t('accountOnboarding.numbers.callerId.inputPlaceholder')}"
                  maxlength="15"
                  ${isSubmitting ? 'disabled' : ''}
                />
                <span class="num-cid-char-count" data-cid-counter="${this.host.escapeHtml(did.id)}">${t('accountOnboarding.numbers.callerId.charCount', { count: inputVal.length })}</span>
              </div>
              <p class="form-help">${t('accountOnboarding.numbers.callerId.inputHelp')}</p>
            </div>
            <div class="num-cid-card-footer">
              ${statusHtml}
            </div>
          </div>`;
      })
      .join('');

    return `
      <div class="num-cid-section">
        <h3 class="section-heading">${t('accountOnboarding.numbers.callerId.title')}</h3>
        <p class="section-description">${t('accountOnboarding.numbers.callerId.subtitle')}</p>
        ${cards}
      </div>`;
  }

  private renderNumOverview(): string {
    const t = (key: string): string => this.host.t(key);

    if (this.numIsLoadingNumbers) {
      return `
        <div class="placeholder">
          <div class="spinner"></div>
        </div>`;
    }

    if (this.numLoadError) {
      return `
        <div class="inline-alert error">${this.host.escapeHtml(this.numLoadError)}</div>
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
        <div class="num-action-card" data-action="num-start-port" tabindex="0" role="button">
          <div class="num-action-card-icon">${PORT_SVG}</div>
          <div class="num-action-card-body">
            <div class="num-action-card-title">${t('accountOnboarding.numbers.overview.portExisting')}</div>
            <div class="num-action-card-desc">${t('accountOnboarding.numbers.overview.portExistingDesc')}</div>
          </div>
        </div>
        <div class="num-action-card" data-action="num-start-order" tabindex="0" role="button">
          <div class="num-action-card-icon">${PLUS_CIRCLE_SVG}</div>
          <div class="num-action-card-body">
            <div class="num-action-card-title">${t('accountOnboarding.numbers.overview.requestNew')}</div>
            <div class="num-action-card-desc">${t('accountOnboarding.numbers.overview.requestNewDesc')}</div>
          </div>
        </div>
      </div>`;
  }

  private renderNumOrderSearch(): string {
    const t = (key: string): string => this.host.t(key);

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
              value="${this.host.escapeHtml(this.numOrderSearchValue)}"
              placeholder="${t('accountOnboarding.numbers.order.areaCodePlaceholder')}" />
          </div>`;
        break;
      case 'city_state':
        fieldsHtml = `
          <div class="form-group">
            <label class="form-label">${t('accountOnboarding.numbers.order.cityLabel')}</label>
            <input class="form-input" type="text" id="num-search-city"
              value="${this.host.escapeHtml(this.numOrderSearchCity)}"
              placeholder="${t('accountOnboarding.numbers.order.cityPlaceholder')}" />
          </div>
          <div class="form-group">
            <label class="form-label">${t('accountOnboarding.numbers.order.stateLabel')}</label>
            <select class="form-select" id="num-search-state">
              <option value="">${t('accountOnboarding.numbers.order.statePlaceholder')}</option>
              ${US_STATES.map(
                ([code, name]) =>
                  `<option value="${this.host.escapeHtml(code)}"${this.numOrderSearchState === code ? ' selected' : ''}>${this.host.escapeHtml(name)}</option>`
              ).join('')}
            </select>
          </div>`;
        break;
      case 'zip':
        fieldsHtml = `
          <div class="form-group">
            <label class="form-label">${t('accountOnboarding.numbers.order.zipLabel')}</label>
            <input class="form-input" type="text" id="num-zip-code" maxlength="5"
              value="${this.host.escapeHtml(this.numOrderSearchValue)}"
              placeholder="${t('accountOnboarding.numbers.order.zipPlaceholder')}" />
          </div>`;
        break;
    }

    return `
      <h2 class="section-title">${t('accountOnboarding.numbers.order.searchTitle')}</h2>
      <p class="section-subtitle">${t('accountOnboarding.numbers.order.searchSubtitle')}</p>
      <div class="num-search-type-tabs">${tabs}</div>
      ${fieldsHtml}
      <div class="form-group">
        <label class="form-label">${t('accountOnboarding.numbers.order.quantityLabel')}</label>
        <input class="form-input" type="number" id="num-quantity" min="1" max="50"
          value="${this.numOrderQuantity}" />
      </div>
      ${this.numOrderError ? `<div class="inline-alert error">${this.host.escapeHtml(this.numOrderError)}</div>` : ''}
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
    const t = (key: string): string => this.host.t(key);

    if (this.numOrderAvailableNumbers.length === 0) {
      return `
        <h2 class="section-title">${t('accountOnboarding.numbers.order.resultsTitle')}</h2>
        <p class="section-subtitle">${t('accountOnboarding.numbers.order.noResults')}</p>
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
          <td><input type="checkbox" data-action="num-toggle-number" data-phone="${this.host.escapeHtml(num.phone_number)}"${isSelected ? ' checked' : ''} /></td>
          <td>${this.numFormatPhone(num.phone_number)}</td>
          <td>${this.host.escapeHtml(num.city)}</td>
          <td>${this.host.escapeHtml(num.state)}</td>
        </tr>`;
      })
      .join('');

    const allSelected = this.numOrderSelectedNumbers.size === this.numOrderAvailableNumbers.length;

    return `
      <h2 class="section-title">${t('accountOnboarding.numbers.order.resultsTitle')} <span class="num-count-badge">${this.numOrderAvailableNumbers.length}</span></h2>
      <table class="num-results-table">
        <thead>
          <tr>
            <th style="width:40px"><input type="checkbox" data-action="num-select-all"${allSelected ? ' checked' : ''} /></th>
            <th>${t('accountOnboarding.numbers.overview.phoneNumber')}</th>
            <th>${t('accountOnboarding.numbers.order.city')}</th>
            <th>${t('accountOnboarding.numbers.order.state')}</th>
          </tr>
        </thead>
        <tbody>${rows}</tbody>
      </table>
      ${this.numOrderSelectedNumbers.size > 0 ? `<div class="num-selected-count">${this.numOrderSelectedNumbers.size} ${t('accountOnboarding.numbers.order.selected')}</div>` : ''}
      <div class="num-sub-footer">
        <button class="btn btn-ghost" data-action="num-back-to-search">
          &larr; ${t('accountOnboarding.numbers.nav.back')}
        </button>
        <div class="num-sub-footer-buttons">
          <button class="btn btn-secondary" data-action="num-back-to-search">
            ${t('accountOnboarding.numbers.nav.backToSearch')}
          </button>
          <button class="btn btn-primary" data-action="num-confirm-order"${this.numOrderSelectedNumbers.size === 0 ? ' disabled' : ''}>
            ${t('accountOnboarding.numbers.nav.confirm')}
          </button>
        </div>
      </div>`;
  }

  private renderNumOrderConfirm(): string {
    const t = (key: string, params?: Record<string, string | number>): string =>
      this.host.t(key, params);

    const selectedNumbers = Array.from(this.numOrderSelectedNumbers);
    const confirmRows = selectedNumbers
      .map((num) => {
        const match = this.numOrderAvailableNumbers.find((n) => n.phone_number === num);
        return `
        <tr>
          <td>${this.numFormatPhone(num)}</td>
          <td>${match ? this.host.escapeHtml(match.city) : ''}</td>
          <td>${match ? this.host.escapeHtml(match.state) : ''}</td>
        </tr>`;
      })
      .join('');

    return `
      <h2 class="section-title">${t('accountOnboarding.numbers.order.confirmTitle')}</h2>
      <p class="section-subtitle">${t('accountOnboarding.numbers.order.confirmSubtitle', { count: this.numOrderSelectedNumbers.size })}</p>
      <table class="num-confirm-table">
        <thead>
          <tr>
            <th>${t('accountOnboarding.numbers.overview.phoneNumber')}</th>
            <th>${t('accountOnboarding.numbers.order.city')}</th>
            <th>${t('accountOnboarding.numbers.order.state')}</th>
          </tr>
        </thead>
        <tbody>${confirmRows}</tbody>
      </table>
      <div class="inline-alert info">${t('accountOnboarding.numbers.order.carrierNote')}</div>
      ${this.numOrderError ? `<div class="inline-alert error">${this.host.escapeHtml(this.numOrderError)}</div>` : ''}
      <div class="num-sub-footer">
        <button class="btn btn-ghost" data-action="num-back-to-results">
          &larr; ${t('accountOnboarding.numbers.nav.back')}
        </button>
        <button class="btn btn-primary" data-action="num-place-order"${this.numOrderIsPlacing ? ' disabled' : ''}>
          ${this.numOrderIsPlacing ? t('accountOnboarding.numbers.order.placing') : t('accountOnboarding.numbers.order.placeOrder')}
        </button>
      </div>`;
  }

  private renderNumOrderStatus(): string {
    const t = (key: string): string => this.host.t(key);
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
      <h2 class="section-title">${t('accountOnboarding.numbers.order.statusTitle')}</h2>
      <p class="section-subtitle">${message}</p>
      <div class="placeholder" style="min-height:80px">
        ${icon}
      </div>
      ${
        showDone
          ? `
        <div class="num-sub-footer">
          <button class="btn btn-secondary" data-action="num-start-order">
            ${t('accountOnboarding.numbers.order.orderMore')}
          </button>
          <button class="btn btn-primary" data-action="num-order-done">
            ${t('accountOnboarding.numbers.nav.next')} &rarr;
          </button>
        </div>`
          : ''
      }`;
  }

  private renderNumPortNumbers(): string {
    const t = (key: string): string => this.host.t(key);

    const inputs = this.numPortPhoneInputs
      .map((val, i) => {
        return `
        <div class="num-phone-input-row">
          <input class="form-input" type="tel" id="num-port-phone-${i}"
            value="${this.host.escapeHtml(val)}"
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
      <h2 class="section-title">${t('accountOnboarding.numbers.port.numbersTitle')}</h2>
      <p class="section-subtitle">${t('accountOnboarding.numbers.port.numbersSubtitle')}</p>
      ${inputs}
      <button class="btn-link" data-action="num-add-port-phone" style="margin-bottom:var(--ds-layout-spacing-md)">
        ${t('accountOnboarding.numbers.port.addAnother')}
      </button>
      ${this.numPortEligibilityError ? `<div class="inline-alert error">${this.host.escapeHtml(this.numPortEligibilityError)}</div>` : ''}
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
    const t = (key: string): string => this.host.t(key);
    const result = this.numPortEligibilityResult;
    if (!result) return '';

    const portableRows = result.portable_numbers
      .map(
        (n) => `
        <tr>
          <td>${this.numFormatPhone(n.phone_number)}</td>
          <td><span class="num-status-badge num-status-active">${t('accountOnboarding.numbers.port.portable')}</span></td>
          <td>${this.host.escapeHtml(n.losing_carrier_name || '—')}</td>
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
      <h2 class="section-title">${t('accountOnboarding.numbers.port.eligibilityTitle')}</h2>
      <p class="section-subtitle">${t('accountOnboarding.numbers.port.eligibilitySubtitle')}</p>
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
    const t = (key: string): string => this.host.t(key);
    const e = this.numPortSubscriberErrors;

    const stateOptions = US_STATES.map(
      ([code, name]) =>
        `<option value="${this.host.escapeHtml(code)}"${this.numPortSubscriberState === code ? ' selected' : ''}>${this.host.escapeHtml(name)}</option>`
    ).join('');

    return `
      <h2 class="section-title">${t('accountOnboarding.numbers.port.subscriberTitle')}</h2>
      <p class="section-subtitle">${t('accountOnboarding.numbers.port.subscriberSubtitle')}</p>
      <div class="num-port-subscriber-form">
        <div class="form-group">
          <label class="form-label">${t('accountOnboarding.numbers.port.btnLabel')}</label>
          <input class="form-input${e.btn ? ' error' : ''}" type="tel" id="num-port-btn"
            value="${this.host.escapeHtml(this.numPortSubscriberBtn)}"
            placeholder="${t('accountOnboarding.numbers.port.btnPlaceholder')}" />
          ${e.btn ? `<div class="form-error">${this.host.escapeHtml(e.btn)}</div>` : ''}
        </div>
        <div class="form-group">
          <label class="form-label">${t('accountOnboarding.numbers.port.businessNameLabel')}</label>
          <input class="form-input${e.businessName ? ' error' : ''}" type="text" id="num-port-business-name"
            value="${this.host.escapeHtml(this.numPortSubscriberBusinessName)}"
            placeholder="${t('accountOnboarding.numbers.port.businessNamePlaceholder')}" />
          ${e.businessName ? `<div class="form-error">${this.host.escapeHtml(e.businessName)}</div>` : ''}
        </div>
        <div class="form-group">
          <label class="form-label">${t('accountOnboarding.numbers.port.approverNameLabel')}</label>
          <input class="form-input${e.approverName ? ' error' : ''}" type="text" id="num-port-approver-name"
            value="${this.host.escapeHtml(this.numPortSubscriberApproverName)}"
            placeholder="${t('accountOnboarding.numbers.port.approverNamePlaceholder')}" />
          ${e.approverName ? `<div class="form-error">${this.host.escapeHtml(e.approverName)}</div>` : ''}
        </div>
        <div class="form-group">
          <label class="form-label">${t('accountOnboarding.numbers.port.accountNumberLabel')}</label>
          <input class="form-input" type="text" id="num-port-account-number"
            value="${this.host.escapeHtml(this.numPortSubscriberAccountNumber)}"
            placeholder="${t('accountOnboarding.numbers.port.accountNumberPlaceholder')}" />
        </div>
        <div class="form-group">
          <label class="form-label">${t('accountOnboarding.numbers.port.pinLabel')}</label>
          <input class="form-input" type="text" id="num-port-pin"
            value="${this.host.escapeHtml(this.numPortSubscriberPin)}"
            placeholder="${t('accountOnboarding.numbers.port.pinPlaceholder')}" />
        </div>
        <hr class="section-divider" />
        <h4 class="section-heading" style="font-size:var(--ds-font-size-base)">${t('accountOnboarding.numbers.port.addressHeading')}</h4>
        <div class="num-port-address-grid">
          <div class="form-group">
            <label class="form-label">${t('accountOnboarding.numbers.port.houseNumberLabel')}</label>
            <input class="form-input${e.houseNumber ? ' error' : ''}" type="text" id="num-port-house-number"
              value="${this.host.escapeHtml(this.numPortSubscriberHouseNumber)}"
              placeholder="${t('accountOnboarding.numbers.port.houseNumberPlaceholder')}" />
            ${e.houseNumber ? `<div class="form-error">${this.host.escapeHtml(e.houseNumber)}</div>` : ''}
          </div>
          <div class="form-group">
            <label class="form-label">${t('accountOnboarding.numbers.port.streetNameLabel')}</label>
            <input class="form-input${e.streetName ? ' error' : ''}" type="text" id="num-port-street-name"
              value="${this.host.escapeHtml(this.numPortSubscriberStreetName)}"
              placeholder="${t('accountOnboarding.numbers.port.streetNamePlaceholder')}" />
            ${e.streetName ? `<div class="form-error">${this.host.escapeHtml(e.streetName)}</div>` : ''}
          </div>
        </div>
        <div class="form-group">
          <label class="form-label">${t('accountOnboarding.numbers.port.line2Label')}</label>
          <input class="form-input" type="text" id="num-port-line2"
            value="${this.host.escapeHtml(this.numPortSubscriberLine2)}"
            placeholder="${t('accountOnboarding.numbers.port.line2Placeholder')}" />
        </div>
        <div class="num-port-address-row-2">
          <div class="form-group">
            <label class="form-label">${t('accountOnboarding.numbers.port.cityLabel')}</label>
            <input class="form-input${e.city ? ' error' : ''}" type="text" id="num-port-city"
              value="${this.host.escapeHtml(this.numPortSubscriberCity)}"
              placeholder="${t('accountOnboarding.numbers.port.cityPlaceholder')}" />
            ${e.city ? `<div class="form-error">${this.host.escapeHtml(e.city)}</div>` : ''}
          </div>
          <div class="form-group">
            <label class="form-label">${t('accountOnboarding.numbers.port.stateLabel')}</label>
            <select class="form-select${e.state ? ' error' : ''}" id="num-port-state">
              <option value="">${t('accountOnboarding.numbers.port.statePlaceholder')}</option>
              ${stateOptions}
            </select>
            ${e.state ? `<div class="form-error">${this.host.escapeHtml(e.state)}</div>` : ''}
          </div>
          <div class="form-group">
            <label class="form-label">${t('accountOnboarding.numbers.port.zipLabel')}</label>
            <input class="form-input${e.zip ? ' error' : ''}" type="text" id="num-port-zip" maxlength="5"
              value="${this.host.escapeHtml(this.numPortSubscriberZip)}"
              placeholder="${t('accountOnboarding.numbers.port.zipPlaceholder')}" />
            ${e.zip ? `<div class="form-error">${this.host.escapeHtml(e.zip)}</div>` : ''}
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
    const t = (key: string): string => this.host.t(key);
    const e = this.numPortFocErrors;

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
      <h2 class="section-title">${t('accountOnboarding.numbers.port.focTitle')}</h2>
      <p class="section-subtitle">${t('accountOnboarding.numbers.port.focSubtitle')}</p>
      <div class="form-group">
        <label class="form-label">${t('accountOnboarding.numbers.port.focDateLabel')}</label>
        <input class="form-input${e.date ? ' error' : ''}" type="date" id="num-port-foc-date"
          value="${this.host.escapeHtml(this.numPortFocDate)}" min="${minStr}" max="${maxStr}" />
        ${e.date ? `<div class="form-error">${this.host.escapeHtml(e.date)}</div>` : ''}
      </div>
      <div class="form-group">
        <label class="form-label">${t('accountOnboarding.numbers.port.focTimeLabel')}</label>
        <select class="form-select${e.time ? ' error' : ''}" id="num-port-foc-time">
          <option value="">${t('accountOnboarding.numbers.port.focTimePlaceholder')}</option>
          ${timeOptions.join('')}
        </select>
        ${e.time ? `<div class="form-error">${this.host.escapeHtml(e.time)}</div>` : ''}
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
    const t = (key: string): string => this.host.t(key);

    const billFileName = this.numPortBillCopyFile
      ? `${t('accountOnboarding.numbers.port.fileSelected')} ${this.host.escapeHtml(this.numPortBillCopyFile.name)}`
      : t('accountOnboarding.numbers.port.noFileSelected');

    const csrFileName = this.numPortCsrFile
      ? `${t('accountOnboarding.numbers.port.fileSelected')} ${this.host.escapeHtml(this.numPortCsrFile.name)}`
      : t('accountOnboarding.numbers.port.noFileSelected');

    return `
      <h2 class="section-title">${t('accountOnboarding.numbers.port.documentsTitle')}</h2>
      <p class="section-subtitle">${t('accountOnboarding.numbers.port.documentsSubtitle')}</p>

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

      ${this.numPortDocUploadError ? `<div class="inline-alert error">${this.host.escapeHtml(this.numPortDocUploadError)}</div>` : ''}
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
    const t = (key: string): string => this.host.t(key);
    const result = this.numPortEligibilityResult;
    if (!result) return '';

    const numbersList = result.portable_numbers
      .map((n) => this.numFormatPhone(n.phone_number))
      .join(', ');

    return `
      <h2 class="section-title">${t('accountOnboarding.numbers.port.reviewTitle')}</h2>
      <p class="section-subtitle">${t('accountOnboarding.numbers.port.reviewSubtitle')}</p>

      <div class="num-review-section">
        <h4>${t('accountOnboarding.numbers.port.numbersSection')}</h4>
        <div class="num-review-row">
          <span class="num-review-label">${t('accountOnboarding.numbers.overview.phoneNumber')}</span>
          <span class="num-review-value">${this.host.escapeHtml(numbersList)}</span>
        </div>
      </div>

      <div class="num-review-section">
        <h4>${t('accountOnboarding.numbers.port.subscriberSection')}</h4>
        <div class="num-review-row">
          <span class="num-review-label">${t('accountOnboarding.numbers.port.btnLabel')}</span>
          <span class="num-review-value">${this.host.escapeHtml(this.numPortSubscriberBtn)}</span>
        </div>
        <div class="num-review-row">
          <span class="num-review-label">${t('accountOnboarding.numbers.port.businessNameLabel')}</span>
          <span class="num-review-value">${this.host.escapeHtml(this.numPortSubscriberBusinessName)}</span>
        </div>
        <div class="num-review-row">
          <span class="num-review-label">${t('accountOnboarding.numbers.port.approverNameLabel')}</span>
          <span class="num-review-value">${this.host.escapeHtml(this.numPortSubscriberApproverName)}</span>
        </div>
      </div>

      <div class="num-review-section">
        <h4>${t('accountOnboarding.numbers.port.focSection')}</h4>
        <div class="num-review-row">
          <span class="num-review-label">${t('accountOnboarding.numbers.port.focDateLabel')}</span>
          <span class="num-review-value">${this.host.escapeHtml(this.numPortFocDate)}</span>
        </div>
        ${
          this.numPortFocTime
            ? `
          <div class="num-review-row">
            <span class="num-review-label">${t('accountOnboarding.numbers.port.focTimeLabel')}</span>
            <span class="num-review-value">${this.host.escapeHtml(this.numPortFocTime)}</span>
          </div>`
            : ''
        }
      </div>

      <div class="num-review-section">
        <h4>${t('accountOnboarding.numbers.port.documentsSection')}</h4>
        <div class="num-review-row">
          <span class="num-review-label">${t('accountOnboarding.numbers.port.billCopyLabel')}</span>
          <span class="num-review-value">${this.numPortBillCopyFile ? this.host.escapeHtml(this.numPortBillCopyFile.name) : '—'}</span>
        </div>
        <div class="num-review-row">
          <span class="num-review-label">${t('accountOnboarding.numbers.port.csrLabel')}</span>
          <span class="num-review-value">${this.numPortCsrFile ? this.host.escapeHtml(this.numPortCsrFile.name) : '—'}</span>
        </div>
      </div>

      <hr class="section-divider" />
      <div class="form-group">
        <label class="form-label">${t('accountOnboarding.numbers.port.signatureLabel')}</label>
        <input class="form-input" type="text" id="num-port-signature"
          value="${this.host.escapeHtml(this.numPortSignature)}"
          placeholder="${t('accountOnboarding.numbers.port.signaturePlaceholder')}" />
        <div class="form-help">${t('accountOnboarding.numbers.port.signatureHelp')}</div>
      </div>

      ${this.numPortSubmitError ? `<div class="inline-alert error">${this.host.escapeHtml(this.numPortSubmitError)}</div>` : ''}
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
    const t = (key: string): string => this.host.t(key);
    const order = this.numPortCurrentOrder;

    return `
      <h2 class="section-title">${t('accountOnboarding.numbers.port.submittedTitle')}</h2>
      <div class="placeholder" style="min-height:120px">
        <div class="num-order-status-icon success">${SUCCESS_SVG}</div>
        <p class="placeholder-text">${t('accountOnboarding.numbers.port.submittedSubtitle')}</p>
      </div>
      ${
        order
          ? `
        <div class="num-review-row">
          <span class="num-review-label">${t('accountOnboarding.numbers.port.submittedStatus')}</span>
          <span class="num-review-value"><span class="num-status-badge num-status-porting">${this.host.escapeHtml(order.status)}</span></span>
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
  // E911 Auto-Provisioning
  // ============================================================================

  /**
   * Attempt automatic E911 provisioning for the simple case:
   * exactly 1 location, at least 1 active DID, location has no primary DID.
   * Falls back to 'complex' state for all other cases.
   */
  async tryAutoProvisionE911(): Promise<void> {
    if (!this.host.instance || this.e911FlowState === 'running') return;

    // Increment generation — cleanupStep() also increments to cancel in-flight work
    const gen = ++this.e911Generation;
    this.e911FlowState = 'running';
    this.host.render();

    // Abort if the generation changed (cleanup/disconnect/destroy) or component detached
    const cancelled = () => this.e911Generation !== gen;

    try {
      // Fetch active DIDs fresh
      const activeDIDs = await this.host.instance.fetchAllPages<DIDItem>((opts) =>
        this.host.instance!.listPhoneNumbers({ ...opts, status: 'active' })
      );
      if (cancelled()) return;

      // No DIDs → nothing to do
      if (activeDIDs.length === 0) {
        this.e911FlowState = 'idle';
        this.host.render();
        return;
      }

      // Check simple case: exactly 1 location
      const locations = await this.host.instance!.listLocations();
      if (cancelled()) return;
      if (locations.length !== 1) {
        this.e911FlowState = 'complex';
        this.host.render();
        return;
      }

      const location = locations[0]!;
      if (location.primary_did_id) {
        this.e911PrimaryDid = activeDIDs.find((d) => d.id === location.primary_did_id) ?? null;

        // Already provisioned or in progress — show status directly
        if (
          location.e911_status === 'provisioned' ||
          location.e911_status === 'pending' ||
          location.e911_status === 'binding'
        ) {
          this.e911ProvisionedLocation = location;
          this.e911FlowState = 'simple';
          this.host.render();
          return;
        }

        // Failed or none — retry provisioning
        if (location.e911_status === 'none' || location.e911_status === 'failed') {
          try {
            const validationResult = await this.host.instance!.validateLocationE911(location.id);
            if (cancelled()) return;
            this.e911ValidationResult = validationResult;
            const provisionedLocation = await this.host.instance!.provisionLocationE911(
              location.id
            );
            if (cancelled()) return;
            this.e911ProvisionedLocation = provisionedLocation;
            this.e911FlowState = 'simple';
            this.host.render();
            return;
          } catch (retryErr) {
            console.warn('[dialstack] E911 retry provisioning failed:', retryErr);
          }
        }
        if (cancelled()) return;
        this.e911FlowState = 'complex';
        this.host.render();
        return;
      }

      // Use the DID pre-selected in the numbers step, or fall back to account phone matching
      let selectedDID: DIDItem | undefined;
      const selectedId = this.selectedPrimaryDIDId;
      if (selectedId) {
        selectedDID = activeDIDs.find((d) => d.id === selectedId);
      }
      if (!selectedDID) {
        const parsed = parsePhoneNumberFromString(this.host.accountPhone, 'US');
        const e164Phone = parsed?.number;
        selectedDID = e164Phone ? activeDIDs.find((d) => d.phone_number === e164Phone) : undefined;
      }

      if (!selectedDID) {
        this.e911FlowState = 'complex';
        this.host.render();
        return;
      }

      // Assign primary DID to location
      await this.host.instance!.updateLocation(location.id, { primary_did_id: selectedDID.id });
      if (cancelled()) return;

      // Validate E911 address
      const validationResult = await this.host.instance!.validateLocationE911(location.id);
      if (cancelled()) return;
      this.e911ValidationResult = validationResult;

      // Provision E911
      const provisionedLocation = await this.host.instance!.provisionLocationE911(location.id);
      if (cancelled()) return;
      this.e911ProvisionedLocation = provisionedLocation;
      this.e911PrimaryDid = selectedDID;
      this.e911FlowState = 'simple';
      this.host.render();
    } catch (err) {
      if (cancelled()) return;
      console.warn('[dialstack] E911 auto-provisioning failed, deferring to manual setup:', err);
      this.e911FlowState = 'complex';
      this.host.render();
    }
  }

  renderE911Panel(): string {
    const t = this.host.t.bind(this.host);

    if (this.e911FlowState === 'running') {
      return `<div class="e911-panel"><div class="e911-loading">${t('accountOnboarding.complete.e911.loading')}</div></div>`;
    }

    if (this.e911FlowState === 'simple') {
      const loc = this.e911ProvisionedLocation;
      const did = this.e911PrimaryDid;
      const lines: string[] = [];

      // Phone number assignment
      if (did && loc) {
        const phoneDisplay = did.phone_number ?? did.id;
        lines.push(
          `<div class="e911-detail">${this.host.escapeHtml(phoneDisplay)} ${t('accountOnboarding.complete.e911.primaryAssigned')} ${this.host.escapeHtml(loc.name)}</div>`
        );
      }

      // Address standardized
      if (this.e911ValidationResult?.adjusted) {
        lines.push(
          `<div class="e911-detail">${t('accountOnboarding.complete.e911.addressStandardized')}</div>`
        );
      }

      // E911 status
      const e911Status = this.e911ProvisionedLocation?.e911_status;
      if (e911Status === 'provisioned') {
        lines.push(
          `<div class="e911-detail">${CHECK_CIRCLE_SVG} ${t('accountOnboarding.complete.e911.verified')}</div>`
        );
      } else if (e911Status === 'pending' || e911Status === 'binding') {
        lines.push(
          `<div class="e911-detail">${t('accountOnboarding.complete.e911.processing')}</div>`
        );
      }

      return `<div class="e911-panel"><div class="inline-alert info">${lines.join('')}</div></div>`;
    }

    if (this.e911FlowState === 'complex' || this.e911FlowState === 'failed') {
      return `<div class="e911-panel"><div class="inline-alert warning">${t('accountOnboarding.complete.e911.deferred')}</div></div>`;
    }

    // idle — no panel
    return '';
  }

  renderNumbersCompleteState(): string {
    const t = this.host.t.bind(this.host);
    return `
      <div class="card" part="step-complete">
        <h2 class="section-title">${t('accountOnboarding.stepComplete.title')}</h2>
        <p class="section-subtitle">${t('accountOnboarding.stepComplete.subtitle')}</p>
        <div class="placeholder" style="min-height:80px">
          <div class="step-complete-icon">${SUCCESS_SVG}</div>
        </div>
        ${this.renderE911Panel()}
        <div class="footer-bar footer-bar-end">
          <button class="btn btn-primary" data-action="done">
            ${t('accountOnboarding.stepComplete.done')}
          </button>
        </div>
      </div>
    `;
  }
}
