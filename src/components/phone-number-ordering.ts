/**
 * Phone Number Ordering Web Component - Multi-step search and order flow
 */

import { parsePhoneNumber, type CountryCode, type PhoneNumber } from 'libphonenumber-js';
import { BaseComponent } from './base-component';
import { segmentedControlStyles, tableStyles } from './shared-styles';
import { ROUTING_TARGET_TYPE_ORDER } from '../types';
import type {
  AvailablePhoneNumber,
  DIDItem,
  NumberOrder,
  PhoneNumberOrderingClasses,
  RoutingTarget,
  SearchAvailableNumbersOptions,
  SearchType,
} from '../types';

type Step = 'search' | 'results' | 'confirm' | 'route' | 'ordering' | 'complete' | 'error';

const CHECK_SVG = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>`;
const SUCCESS_SVG = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>`;
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

  /* ── Step Progress Bar ── */
  .step-progress-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: var(--ds-layout-spacing-xl) var(--ds-layout-spacing-xl) 0;
    margin-bottom: var(--ds-spacing-md);
  }

  .step-progress-title {
    font-size: var(--ds-font-size-xlarge);
    font-weight: var(--ds-font-weight-medium);
    color: var(--ds-color-text);
  }

  .step-progress-counter {
    font-size: var(--ds-font-size-base);
    color: var(--ds-color-text-secondary);
  }

  .step-progress {
    height: 8px;
    background: var(--ds-color-border);
    border-radius: 9999px;
    margin: 0 var(--ds-layout-spacing-xl) var(--ds-layout-spacing-lg);
    overflow: hidden;
  }

  .step-progress-fill {
    height: 100%;
    background: var(--ds-color-primary);
    border-radius: 9999px;
    transition: width var(--ds-transition-duration);
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
    padding: var(--ds-layout-spacing-xl);
  }

  /* ── Segmented Control ── */
  ${segmentedControlStyles}

  .segmented-control {
    display: flex;
    max-width: 320px;
    margin-inline: auto;
  }

  .segment-btn {
    flex: 1;
  }

  /* ── Search Fields Stack (all variants overlaid, only active visible) ── */
  .search-fields-stack {
    display: grid;
    max-width: 320px;
    margin-inline: auto;
  }

  .search-fields-stack > * {
    grid-column: 1;
    grid-row: 1;
  }

  .search-fields-stack > .search-fields-hidden {
    visibility: hidden;
    pointer-events: none;
  }

  /* ── Search Form ── */
  .form-group {
    margin-bottom: var(--ds-layout-spacing-md);
  }

  .form-label {
    display: block;
    font-size: var(--ds-font-size-small);
    font-weight: var(--ds-font-weight-medium);
    color: var(--ds-color-text-secondary);
    margin-bottom: var(--ds-layout-spacing-xs);
    text-transform: uppercase;
    letter-spacing: 0.04em;
  }

  .form-input,
  .form-select {
    width: 100%;
    min-width: 0;
    padding: var(--ds-layout-spacing-sm) var(--ds-layout-spacing-md);
    font-size: var(--ds-font-size-base);
    font-family: var(--ds-font-family);
    color: var(--ds-color-text);
    background: var(--ds-color-background);
    border: 1px solid var(--ds-color-border);
    border-radius: var(--ds-border-radius);
    outline: none;
    transition: border-color var(--ds-transition-duration), box-shadow var(--ds-transition-duration);
    box-sizing: border-box;
  }

  .form-input:focus,
  .form-select:focus {
    border-color: var(--ds-color-primary);
    box-shadow: var(--ds-focus-ring);
  }

  .form-input::placeholder {
    color: var(--ds-color-text-secondary);
    opacity: 0.6;
  }

  .form-row {
    display: grid;
    grid-template-columns: minmax(0, 1fr) minmax(0, 1fr);
    gap: var(--ds-layout-spacing-md);
  }

  .search-row {
    display: grid;
    grid-template-columns: 1fr auto;
    gap: var(--ds-layout-spacing-md);
    align-items: end;
    max-width: 320px;
    margin-inline: auto;
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

  .btn-link {
    background: none;
    border: none;
    color: var(--ds-color-text-secondary);
    font-size: var(--ds-font-size-base);
    font-family: var(--ds-font-family);
    font-weight: var(--ds-font-weight-medium);
    cursor: pointer;
    padding: var(--ds-layout-spacing-sm) var(--ds-layout-spacing-md);
    transition: color var(--ds-transition-duration);
  }

  .btn-link:hover {
    color: var(--ds-color-text);
  }

  /* ── Results Table ── */
  .results-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    margin-bottom: var(--ds-layout-spacing-md);
  }

  .results-title-row {
    display: flex;
    align-items: center;
    gap: var(--ds-layout-spacing-sm);
  }

  .count-badge {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    min-width: 24px;
    height: 24px;
    padding: 0 var(--ds-spacing-sm);
    font-size: var(--ds-font-size-small);
    font-weight: var(--ds-font-weight-bold);
    color: var(--ds-color-primary);
    background: color-mix(in srgb, var(--ds-color-primary) 10%, transparent);
    border-radius: 12px;
  }

  ${tableStyles}

  tbody tr {
    cursor: pointer;
  }

  th:first-child,
  td:first-child {
    width: 40px;
    text-align: center;
  }

  tbody tr.selected {
    background: color-mix(in srgb, var(--ds-color-primary) 6%, transparent);
  }

  tbody tr.selected:hover {
    background: color-mix(in srgb, var(--ds-color-primary) 10%, transparent);
  }

  .phone-number-cell {
    font-variant-numeric: tabular-nums;
    font-weight: var(--ds-font-weight-medium);
    letter-spacing: 0.02em;
  }

  /* ── Checkbox (row checkboxes are display-only, row click handles toggle) ── */
  .checkbox-visual {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 18px;
    height: 18px;
    border: 2px solid var(--ds-color-border);
    border-radius: var(--ds-border-radius-small);
    background: var(--ds-color-background);
    transition: all var(--ds-transition-duration);
    cursor: pointer;
  }

  td .checkbox-visual {
    pointer-events: none;
  }

  .checkbox-visual.checked {
    background: var(--ds-color-primary);
    border-color: var(--ds-color-primary);
  }

  .checkbox-visual svg {
    width: 12px;
    height: 12px;
    color: #fff;
    opacity: 0;
    transform: scale(0.5);
    transition: all var(--ds-transition-duration);
  }

  .checkbox-visual.checked svg {
    opacity: 1;
    transform: scale(1);
  }

  /* ── Footer Bar ── */
  .footer-bar {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding-top: var(--ds-layout-spacing-lg);
    margin-top: var(--ds-layout-spacing-md);
    border-top: 1px solid var(--ds-color-border-subtle);
  }

  .footer-left {
    font-size: var(--ds-font-size-small);
    color: var(--ds-color-text-secondary);
    font-weight: var(--ds-font-weight-medium);
  }

  .footer-right {
    display: flex;
    align-items: center;
    gap: var(--ds-layout-spacing-sm);
  }

  /* ── Confirm List ── */
  .confirm-list {
    border: 1px solid var(--ds-color-border);
    border-radius: var(--ds-border-radius);
    overflow: hidden;
    margin-bottom: var(--ds-layout-spacing-lg);
    max-height: 280px;
    overflow-y: auto;
  }

  .confirm-item {
    display: grid;
    grid-template-columns: 1fr auto auto;
    gap: var(--ds-layout-spacing-md);
    padding: var(--ds-layout-spacing-sm) var(--ds-layout-spacing-md);
    border-bottom: 1px solid var(--ds-color-border-subtle);
    font-size: var(--ds-font-size-base);
  }

  .confirm-item:last-child {
    border-bottom: none;
  }

  .confirm-phone {
    font-weight: var(--ds-font-weight-medium);
    font-variant-numeric: tabular-nums;
    letter-spacing: 0.02em;
  }

  .confirm-city,
  .confirm-state {
    color: var(--ds-color-text-secondary);
  }

  /* ── Route step (routing-target picker) ── */
  .route-list {
    display: flex;
    flex-direction: column;
    gap: 2px;
    margin-bottom: var(--ds-layout-spacing-lg);
    max-height: 340px;
    overflow-y: auto;
  }

  .route-group-heading {
    font-size: var(--ds-font-size-small);
    font-weight: var(--ds-font-weight-medium);
    color: var(--ds-color-text-secondary);
    text-transform: uppercase;
    letter-spacing: 0.06em;
    padding: var(--ds-layout-spacing-md) var(--ds-layout-spacing-sm) var(--ds-spacing-xs);
  }

  .route-option {
    display: flex;
    align-items: center;
    gap: var(--ds-layout-spacing-md);
    padding: var(--ds-layout-spacing-sm) var(--ds-layout-spacing-md);
    border: 1px solid var(--ds-color-border);
    border-radius: var(--ds-border-radius);
    background: var(--ds-color-background);
    cursor: pointer;
    transition: all var(--ds-transition-duration);
  }

  .route-option:hover {
    border-color: var(--ds-color-primary);
    background: var(--ds-color-surface, var(--ds-color-background));
  }

  .route-option.selected {
    border-color: var(--ds-color-primary);
    background: color-mix(in srgb, var(--ds-color-primary) 8%, transparent);
  }

  .route-radio {
    flex: 0 0 auto;
    width: 18px;
    height: 18px;
    border: 2px solid var(--ds-color-border);
    border-radius: 50%;
    background: var(--ds-color-background);
    position: relative;
    transition: all var(--ds-transition-duration);
  }

  .route-option:hover .route-radio {
    border-color: var(--ds-color-primary);
  }

  .route-radio.checked {
    border-color: var(--ds-color-primary);
  }

  .route-radio.checked::after {
    content: '';
    position: absolute;
    inset: 3px;
    border-radius: 50%;
    background: var(--ds-color-primary);
  }

  .route-option-main {
    display: flex;
    align-items: baseline;
    gap: var(--ds-spacing-sm);
    min-width: 0;
    flex: 1;
  }

  .route-option-name {
    font-weight: var(--ds-font-weight-medium);
    color: var(--ds-color-text);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .route-option-ext {
    font-size: var(--ds-font-size-small);
    color: var(--ds-color-text-secondary);
    font-variant-numeric: tabular-nums;
  }

  .route-option-hint {
    font-size: var(--ds-font-size-small);
    color: var(--ds-color-text-secondary);
  }

  .route-empty {
    padding: var(--ds-layout-spacing-md);
    font-size: var(--ds-font-size-small);
    color: var(--ds-color-text-secondary);
    text-align: center;
  }

  /* ── Center State (loading, error, complete) ── */
  .center-state {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    text-align: center;
    padding: var(--ds-spacing-xl) var(--ds-layout-spacing-lg);
    min-height: 200px;
  }

  .center-icon {
    width: 48px;
    height: 48px;
    border-radius: var(--ds-border-radius-round);
    display: flex;
    align-items: center;
    justify-content: center;
    margin-bottom: var(--ds-layout-spacing-md);
  }

  .center-icon svg {
    width: 24px;
    height: 24px;
  }

  .center-icon.success {
    background: color-mix(in srgb, var(--ds-color-success) 12%, transparent);
    color: var(--ds-color-success);
  }

  .center-icon.error {
    background: color-mix(in srgb, var(--ds-color-danger) 12%, transparent);
    color: var(--ds-color-danger);
  }

  .center-title {
    font-size: var(--ds-font-size-xlarge);
    font-weight: var(--ds-font-weight-bold);
    color: var(--ds-color-text);
    margin-bottom: var(--ds-layout-spacing-xs);
  }

  .center-detail {
    font-size: var(--ds-font-size-base);
    color: var(--ds-color-text-secondary);
    margin-bottom: var(--ds-layout-spacing-sm);
  }

  .center-btn {
    margin-top: var(--ds-layout-spacing-md);
  }

  /* ── Status Badge ── */
  .status-badge {
    display: inline-flex;
    align-items: center;
    padding: 2px var(--ds-spacing-sm);
    font-size: var(--ds-font-size-small);
    font-weight: var(--ds-font-weight-bold);
    border-radius: var(--ds-border-radius-small);
    text-transform: uppercase;
    letter-spacing: 0.04em;
  }

  .status-badge.pending {
    background: color-mix(in srgb, var(--ds-color-warning) 14%, transparent);
    color: var(--ds-color-warning);
  }

  .status-badge.complete {
    background: color-mix(in srgb, var(--ds-color-success) 14%, transparent);
    color: var(--ds-color-success);
  }

  .status-badge.partial {
    background: color-mix(in srgb, var(--ds-color-warning) 14%, transparent);
    color: var(--ds-color-warning);
  }

  .status-badge.failed {
    background: color-mix(in srgb, var(--ds-color-danger) 14%, transparent);
    color: var(--ds-color-danger);
  }

  /* ── Order Meta ── */
  .order-meta {
    display: flex;
    flex-direction: column;
    gap: var(--ds-layout-spacing-xs);
    margin-bottom: var(--ds-layout-spacing-md);
  }

  .order-meta-row {
    display: flex;
    align-items: center;
    gap: var(--ds-layout-spacing-sm);
    font-size: var(--ds-font-size-base);
  }

  .order-meta-label {
    color: var(--ds-color-text-secondary);
  }

  .order-meta-value {
    font-weight: var(--ds-font-weight-medium);
    color: var(--ds-color-text);
  }

  /* ── Spinner ── */
  .spinner {
    display: inline-block;
    width: var(--ds-spinner-size);
    height: var(--ds-spinner-size);
    color: var(--ds-color-primary);
    animation: spin 0.8s linear infinite;
    margin-bottom: var(--ds-layout-spacing-md);
  }

  .spinner svg {
    width: 100%;
    height: 100%;
  }

  @keyframes spin {
    to { transform: rotate(360deg); }
  }

  .center-hint {
    font-size: var(--ds-font-size-small);
    color: var(--ds-color-text-secondary);
    max-width: 360px;
    margin: var(--ds-layout-spacing-sm) auto 0;
    text-align: center;
    opacity: 0.8;
  }

  .empty-state {
    padding: var(--ds-spacing-xl);
    text-align: center;
    background: var(--ds-color-surface-subtle);
    border-radius: var(--ds-border-radius);
    color: var(--ds-color-text-secondary);
  }

  .nearby-banner {
    padding: var(--ds-layout-spacing-sm) var(--ds-layout-spacing-md);
    margin-bottom: var(--ds-layout-spacing-md);
    font-size: var(--ds-font-size-small);
    color: var(--ds-color-text-secondary);
    background: var(--ds-color-surface-subtle);
    border-radius: var(--ds-border-radius);
  }
`;

export class PhoneNumberOrderingComponent extends BaseComponent {
  // State machine
  private step: Step = 'search';

  // Search config
  private searchTypes: SearchType[] = ['area_code', 'zip'];

  // Search state
  private searchType: SearchType = 'area_code';
  private searchValue: string = '';
  private quantity: number = 10;
  private isSearching: boolean = false;

  // Results state
  private availableNumbers: AvailablePhoneNumber[] = [];
  private selectedNumbers: Set<string> = new Set();

  // Routing state — the target chosen on the route step, applied to the
  // ordered numbers once their DIDs exist. `null` = "set up routing later"
  // (leave unrouted, no guess).
  private routingTargets: RoutingTarget[] = [];
  private isLoadingRoutingTargets: boolean = false;
  private selectedRoutingTarget: string | null = null;

  // Order state
  private order: NumberOrder | null = null;
  private errorMessage: string = '';
  private pollTimer: ReturnType<typeof setTimeout> | null = null;
  private pollCount: number = 0;

  // Override classes type
  protected override classes: PhoneNumberOrderingClasses = {};

  // Callbacks
  private _onOrderComplete?: (event: { orderId: string; order: NumberOrder }) => void;
  private _onOrderError?: (event: { error: string }) => void;

  protected initialize(): void {
    if (this.isInitialized) return;
    this.attachDelegatedClickHandler();
    this.render();
    this.isInitialized = true;
  }

  // ============================================================================
  // Public Setters
  // ============================================================================

  override setClasses(classes: PhoneNumberOrderingClasses): void {
    this.classes = { ...this.classes, ...classes };
    if (this.isInitialized) {
      this.render();
    }
  }

  setOnOrderComplete(cb: (event: { orderId: string; order: NumberOrder }) => void): void {
    this._onOrderComplete = cb;
  }

  setOnOrderError(cb: (event: { error: string }) => void): void {
    this._onOrderError = cb;
  }

  setSearchTypes(types: SearchType[]): void {
    if (types.length === 0) return;
    this.searchTypes = types;
    if (!this.searchTypes.includes(this.searchType)) {
      this.searchType = this.searchTypes[0] ?? 'area_code';
    }
    if (this.isInitialized) {
      this.render();
    }
  }

  // ============================================================================
  // Formatting
  // ============================================================================

  private formatPhone(phone: string): string {
    if (!phone) return '';
    try {
      const defaultCountry = (this.formatting.defaultCountry || 'US') as CountryCode;
      const parsed: PhoneNumber | undefined = parsePhoneNumber(phone, defaultCountry);
      if (parsed) return parsed.formatNational();
    } catch {
      // fall through
    }
    return phone;
  }

  // ============================================================================
  // Data Operations
  // ============================================================================

  private canSearch(): boolean {
    return this.searchValue.trim() !== '';
  }

  private async searchNumbers(): Promise<void> {
    if (!this.instance) return;

    this.isSearching = true;
    this.render();

    try {
      const options: SearchAvailableNumbersOptions = { quantity: this.quantity };
      if (this.searchType === 'zip') {
        options.zip = this.searchValue;
      } else {
        options.areaCode = this.searchValue;
      }

      this.availableNumbers = await this.instance.availablePhoneNumbers.search(options);
      this.selectedNumbers = new Set();
      this.step = 'results';
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Search failed';
      this._onLoadError?.({
        error: msg,
        elementTagName: 'dialstack-phone-number-ordering',
      });
      this.errorMessage = msg;
      this.step = 'error';
    } finally {
      this.isSearching = false;
      this.render();
    }
  }

  private async placeOrder(): Promise<void> {
    if (!this.instance || this.selectedNumbers.size === 0) return;

    this.step = 'ordering';
    this.render();

    try {
      const order = await this.instance.phoneNumberOrders.create([...this.selectedNumbers]);
      this.order = order;
      this.step = 'complete';
      this.render();

      if (order.status === 'failed') {
        this.errorMessage = this.t('phoneNumberOrdering.error.description');
        this.step = 'error';
        this._onOrderError?.({ error: this.errorMessage });
        this.render();
        return;
      }

      // Fire-and-forget: routing is a best-effort convenience, never a gate on
      // the order. The ordered numbers' DIDs already exist and are routable, so
      // route now rather than waiting for a pending order to resolve. `.catch`
      // keeps a future throw from escaping as an unhandled rejection.
      void this.applyRoutingToOrder(order).catch(() => {});

      if (order.status === 'pending') {
        this.startPolling();
      } else {
        this._onOrderComplete?.({ orderId: order.id, order });
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Order failed';
      this.errorMessage = msg;
      this.step = 'error';
      this._onOrderError?.({ error: msg });
      this.render();
    }
  }

  /**
   * Best-effort, fire-and-forget: apply the chosen routing target to the
   * numbers an order was placed for. The order never depends on this — callers
   * invoke it without awaiting and fire onOrderComplete regardless.
   *
   * We route the *ordered* numbers (`phone_numbers`), not `completed_numbers`:
   * the API returns an order with `completed_numbers` still empty and fills it
   * asynchronously (a carrier callback populates it later), so keying off it
   * would route nothing. The DID rows for the ordered numbers already exist
   * (inactive) the moment the order is placed and are routable immediately —
   * the API accepts routing on an inactive DID and preserves it when the number
   * activates, and it's inert if the number never provisions. So there's no
   * need to wait for provisioning to finish.
   *
   * A no-selection ("route later"), an unmatched number, or a per-DID failure
   * is left unrouted (the normal "Set routing" fallback) — never retried, never
   * surfaced as an order error.
   */
  private async applyRoutingToOrder(order: NumberOrder): Promise<void> {
    // Capture the selection up front: the per-DID updateRoute calls run later
    // inside Promise.all, and passing a null target would *clear* routing.
    const target = this.selectedRoutingTarget;
    if (!this.instance || !target) return;
    const ordered = order.phone_numbers ?? [];
    if (ordered.length === 0) return;

    try {
      const dids = await this.instance.fetchAllPages<DIDItem>((opts) =>
        this.instance!.phoneNumbers.list(opts)
      );
      // Skip released DIDs: a reacquired number can still have a lingering
      // released row, and updateRoute on it would 404. list() is newest-first,
      // so the live (active/inactive) row is the one we keep per number.
      const idByNumber = new Map(
        dids.filter((did) => did.status !== 'released').map((did) => [did.phone_number, did.id])
      );
      await Promise.all(
        ordered.map(async (phone) => {
          const didId = idByNumber.get(phone);
          if (!didId) return;
          try {
            await this.instance!.phoneNumbers.updateRoute(didId, target);
          } catch {
            // Leave this number unrouted — surfaces as the normal "set routing"
            // state on the number, no guess.
          }
        })
      );
    } catch {
      // Listing failed — leave all ordered numbers unrouted.
    }
  }

  private static readonly POLL_INTERVAL_MS = 2000;
  private static readonly POLL_MAX = 5;

  private startPolling(): void {
    this.stopPolling();
    this.pollCount = 0;
    this.pollNext();
  }

  private stopPolling(): void {
    if (this.pollTimer !== null) {
      clearTimeout(this.pollTimer);
      this.pollTimer = null;
    }
  }

  protected override cleanup(): void {
    this.stopPolling();
  }

  private pollNext(): void {
    const orderId = this.order?.id;
    if (!orderId) return;

    this.pollTimer = setTimeout(async () => {
      this.pollCount++;
      try {
        const order = await this.instance!.phoneNumberOrders.retrieve(orderId);
        this.order = order;
        this.render();

        if (order.status === 'failed') {
          this.stopPolling();
          this.errorMessage = this.t('phoneNumberOrdering.error.description');
          this.step = 'error';
          this._onOrderError?.({ error: this.errorMessage });
          this.render();
        } else if (
          order.status === 'pending' &&
          this.pollCount < PhoneNumberOrderingComponent.POLL_MAX
        ) {
          this.pollNext();
        } else {
          this.stopPolling();
          if (order.status !== 'pending') {
            // Routing already fired when the order was placed (placeOrder) —
            // polling only advances the UI status to its terminal state.
            this._onOrderComplete?.({ orderId: order.id, order });
          }
        }
      } catch {
        // Polling failed — stop silently, keep showing current state
        this.stopPolling();
      }
    }, PhoneNumberOrderingComponent.POLL_INTERVAL_MS);
  }

  // ============================================================================
  // Step Navigation
  // ============================================================================

  private goToSearch(): void {
    this.step = 'search';
    this.render();
  }

  private goToResults(): void {
    this.step = 'results';
    this.render();
  }

  private goToConfirm(): void {
    if (this.selectedNumbers.size === 0) return;
    this.step = 'confirm';
    this.render();
  }

  private goToRoute(): void {
    if (this.selectedNumbers.size === 0) return;
    this.step = 'route';
    this.render();
    void this.loadRoutingTargets();
  }

  private async loadRoutingTargets(): Promise<void> {
    if (!this.instance) return;
    this.isLoadingRoutingTargets = true;
    this.render();
    try {
      this.routingTargets = await this.instance.routingTargets();
    } catch {
      // A failed enumeration just leaves the picker empty — the user can still
      // choose "set up routing later" and proceed.
      this.routingTargets = [];
    } finally {
      this.isLoadingRoutingTargets = false;
      if (this.step === 'route') this.render();
    }
  }

  private resetFlow(): void {
    this.stopPolling();
    this.step = 'search';
    this.searchValue = '';
    this.quantity = 10;
    this.availableNumbers = [];
    this.selectedNumbers = new Set();
    this.routingTargets = [];
    this.selectedRoutingTarget = null;
    this.order = null;
    this.errorMessage = '';
    this.render();
  }

  // ============================================================================
  // Rendering
  // ============================================================================

  protected render(): void {
    if (!this.shadowRoot) return;

    const styles = this.applyAppearanceStyles();

    let content: string;
    switch (this.step) {
      case 'search':
        content = this.renderSearchStep();
        break;
      case 'results':
        content = this.renderResultsStep();
        break;
      case 'confirm':
        content = this.renderConfirmStep();
        break;
      case 'route':
        content = this.renderRouteStep();
        break;
      case 'ordering':
        content = this.renderOrderingStep();
        break;
      case 'complete':
        content = this.renderCompleteStep();
        break;
      case 'error':
        content = this.renderErrorStep();
        break;
    }

    this.shadowRoot.innerHTML = `
      <style>
        ${styles}
        ${COMPONENT_STYLES}
      </style>
      <div class="container ${this.getClassNames()}" part="container"
           role="region" aria-label="${this.t('phoneNumberOrdering.title')}">
        ${this.renderStepBreadcrumb()}
        ${content}
      </div>
    `;

    this.attachInputListeners();
  }

  private renderStepBreadcrumb(): string {
    const stepLabels = [
      this.t('phoneNumberOrdering.steps.search'),
      this.t('phoneNumberOrdering.steps.select'),
      this.t('phoneNumberOrdering.steps.confirm'),
      this.t('phoneNumberOrdering.steps.route'),
      this.t('phoneNumberOrdering.steps.done'),
    ];

    const stepProgressMap: Record<string, number> = {
      search: 0,
      results: 1,
      confirm: 2,
      route: 3,
      ordering: 4,
      complete: 4,
      error: 4,
    };
    const progressIndex = stepProgressMap[this.step] ?? 0;
    const totalSteps = stepLabels.length;
    const progressPercent = ((progressIndex + 1) / totalSteps) * 100;

    return `
      <div class="step-progress-header">
        <span class="step-progress-title">${stepLabels[progressIndex]}</span>
        <span class="step-progress-counter">${this.t('phoneNumberOrdering.steps.stepOf', { current: progressIndex + 1, total: totalSteps })}</span>
      </div>
      <div class="step-progress" role="progressbar" aria-valuenow="${progressPercent}" aria-valuemin="0" aria-valuemax="100">
        <div class="step-progress-fill" style="width: ${progressPercent}%"></div>
      </div>
    `;
  }

  private renderSearchStep(): string {
    const segmentBtn = (type: SearchType, label: string) =>
      this.searchTypes.includes(type)
        ? `<button class="segment-btn ${this.searchType === type ? 'active' : ''}" data-action="set-search-type" data-type="${type}">${label}</button>`
        : '';

    const hidden = (type: SearchType) => (this.searchType === type ? '' : 'search-fields-hidden');

    return `
      <div class="card ${this.classes.searchForm || ''}" part="search-form">
        <h2 class="section-title">${this.t('phoneNumberOrdering.search.title')}</h2>
        <p class="section-subtitle">${this.t('phoneNumberOrdering.search.subtitle')}</p>

        <div class="segmented-control" role="radiogroup" aria-label="${this.t('phoneNumberOrdering.search.searchType')}">
          ${segmentBtn('area_code', this.t('phoneNumberOrdering.search.areaCode'))}
          ${segmentBtn('zip', this.t('phoneNumberOrdering.search.zip'))}
        </div>

        <div class="search-fields-stack">
          ${this.searchTypes
            .map((type) => {
              if (type === 'area_code')
                return `
              <div class="${hidden('area_code')}">
                <div class="form-group">
                  <label class="form-label">${this.t('phoneNumberOrdering.search.areaCodeLabel')}</label>
                  <input class="form-input" type="text" id="search-area-code"
                    placeholder="${this.t('phoneNumberOrdering.search.areaCodePlaceholder')}"
                    value="${this.searchType === 'area_code' ? this.escapeHtml(this.searchValue) : ''}"
                    data-field="value" />
                </div>
              </div>`;
              if (type === 'zip')
                return `
              <div class="${hidden('zip')}">
                <div class="form-group">
                  <label class="form-label">${this.t('phoneNumberOrdering.search.zipLabel')}</label>
                  <input class="form-input" type="text" id="search-zip"
                    placeholder="${this.t('phoneNumberOrdering.search.zipPlaceholder')}"
                    value="${this.searchType === 'zip' ? this.escapeHtml(this.searchValue) : ''}"
                    data-field="value" />
                </div>
              </div>`;
              return '';
            })
            .join('')}
        </div>

        <div class="search-row">
          <div class="form-group">
            <label class="form-label" for="search-quantity">${this.t('phoneNumberOrdering.search.numberOfResults')}</label>
            <input class="form-input" type="number" id="search-quantity"
              min="1" max="100" value="${this.quantity}"
              data-field="quantity" />
          </div>
          <div class="form-group">
            <button class="btn btn-primary" data-action="search" ${this.isSearching || !this.canSearch() ? 'disabled' : ''}>
              ${this.t('phoneNumberOrdering.search.search')}
            </button>
          </div>
        </div>
      </div>
    `;
  }

  private renderResultsStep(): string {
    if (this.availableNumbers.length === 0) {
      return `
        <div class="card">
          <div class="results-header">
            <h2 class="section-title">${this.t('phoneNumberOrdering.results.title')}</h2>
          </div>
          <div class="empty-state">${this.t('phoneNumberOrdering.results.noResults')}</div>
          <div class="footer-bar">
            <div></div>
            <div class="footer-right">
              <button class="btn-link" data-action="back-to-search">${this.t('phoneNumberOrdering.results.backToSearch')}</button>
            </div>
          </div>
        </div>
      `;
    }

    const allSelected =
      this.availableNumbers.length > 0 &&
      this.selectedNumbers.size === this.availableNumbers.length;

    const rows = this.availableNumbers
      .map((num) => {
        const isSelected = this.selectedNumbers.has(num.phone_number);
        return `
          <tr class="${isSelected ? 'selected' : ''} ${this.classes.resultRow || ''} ${isSelected ? this.classes.resultRowSelected || '' : ''}"
              data-phone="${num.phone_number}" data-action="toggle-number"
              role="row" aria-selected="${isSelected}">
            <td>
              <span class="checkbox-visual ${isSelected ? 'checked' : ''}" aria-hidden="true">${CHECK_SVG}</span>
            </td>
            <td class="phone-number-cell">${this.formatPhone(num.phone_number)}</td>
            <td>${this.escapeHtml(num.state)}</td>
          </tr>
        `;
      })
      .join('');

    return `
      <div class="card ${this.classes.resultsTable || ''}" part="results">
        <div class="results-header">
          <div class="results-title-row">
            <h2 class="section-title">${this.t('phoneNumberOrdering.results.title')}</h2>
            <span class="count-badge">${this.availableNumbers.length}</span>
          </div>
        </div>

        <div class="table-container">
          <table role="grid">
            <thead>
              <tr>
                <th scope="col">
                  <span class="checkbox-visual ${allSelected ? 'checked' : ''}"
                    data-action="select-all"
                    role="checkbox" aria-checked="${allSelected}"
                    aria-label="${this.t('phoneNumberOrdering.results.selectAll')}">${CHECK_SVG}</span>
                </th>
                <th scope="col">${this.t('phoneNumberOrdering.results.phoneNumber')}</th>
                <th scope="col">${this.t('phoneNumberOrdering.results.state')}</th>
              </tr>
            </thead>
            <tbody>${rows}</tbody>
          </table>
        </div>

        <div class="footer-bar">
          <div class="footer-left">${this.t('phoneNumberOrdering.results.selected', { count: this.selectedNumbers.size })}</div>
          <div class="footer-right">
            <button class="btn-link" data-action="back-to-search">${this.t('phoneNumberOrdering.results.backToSearch')}</button>
            <button class="btn btn-primary" data-action="continue" ${this.selectedNumbers.size === 0 ? 'disabled' : ''}>
              ${this.t('phoneNumberOrdering.results.continue')}
            </button>
          </div>
        </div>
      </div>
    `;
  }

  private renderConfirmStep(): string {
    const selected = this.availableNumbers.filter((n) => this.selectedNumbers.has(n.phone_number));

    const items = selected
      .map(
        (num) => `
        <div class="confirm-item">
          <span class="confirm-phone">${this.formatPhone(num.phone_number)}</span>
          <span class="confirm-state">${this.escapeHtml(num.state)}</span>
        </div>
      `
      )
      .join('');

    return `
      <div class="card ${this.classes.confirmPanel || ''}" part="confirm">
        <h2 class="section-title">${this.t('phoneNumberOrdering.confirm.title')}</h2>
        <p class="section-subtitle">${this.t(selected.length === 1 ? 'phoneNumberOrdering.confirm.subtitleOne' : 'phoneNumberOrdering.confirm.subtitleOther', { count: selected.length })}</p>

        <div class="confirm-list">${items}</div>

        <p class="section-subtitle">${this.t('phoneNumberOrdering.confirm.description')}</p>

        <div class="footer-bar">
          <div></div>
          <div class="footer-right">
            <button class="btn btn-secondary" data-action="back-to-results">${this.t('phoneNumberOrdering.confirm.back')}</button>
            <button class="btn btn-primary" data-action="continue-to-route">
              ${this.t('phoneNumberOrdering.confirm.continue')}
            </button>
          </div>
        </div>
      </div>
    `;
  }

  private renderRouteStep(): string {
    const laterSelected = this.selectedRoutingTarget === null;

    let list: string;
    if (this.isLoadingRoutingTargets) {
      list = `<div class="center-state" role="status" aria-live="polite">
           <div class="spinner" aria-hidden="true">${this.icons.spinner}</div>
         </div>`;
    } else {
      const laterRow = `
        <div class="route-option ${laterSelected ? 'selected' : ''}" data-action="route-skip"
             role="radio" aria-checked="${laterSelected}" tabindex="0">
          <span class="route-radio ${laterSelected ? 'checked' : ''}" aria-hidden="true"></span>
          <span class="route-option-main">
            <span class="route-option-name">${this.t('phoneNumberOrdering.route.later')}</span>
            <span class="route-option-hint">${this.t('phoneNumberOrdering.route.laterHint')}</span>
          </span>
        </div>`;

      const groups =
        this.routingTargets.length === 0
          ? `<div class="route-empty">${this.t('phoneNumberOrdering.route.noTargets')}</div>`
          : this.renderRouteTargetGroups();

      list = `<div class="route-list" role="radiogroup">${laterRow}${groups}</div>`;
    }

    return `
      <div class="card" part="route">
        <h2 class="section-title">${this.t('phoneNumberOrdering.route.title')}</h2>
        <p class="section-subtitle">${this.t('phoneNumberOrdering.route.subtitle')}</p>

        ${list}

        <div class="footer-bar">
          <div></div>
          <div class="footer-right">
            <button class="btn btn-secondary" data-action="back-to-confirm">${this.t('phoneNumberOrdering.route.back')}</button>
            <button class="btn btn-primary" data-action="place-order">
              ${this.t('phoneNumberOrdering.confirm.placeOrder')}
            </button>
          </div>
        </div>
      </div>
    `;
  }

  /**
   * Toggle the selected route option in place instead of re-rendering the whole
   * component — avoids rebuilding every step's HTML and resetting the list's
   * scroll position on each click.
   */
  private updateRouteSelectionUI(): void {
    if (!this.shadowRoot) return;
    const options = this.shadowRoot.querySelectorAll<HTMLElement>('.route-option');
    for (const option of options) {
      const isSkip = option.dataset.action === 'route-skip';
      const selected = isSkip
        ? this.selectedRoutingTarget === null
        : option.dataset.targetId === this.selectedRoutingTarget;
      option.classList.toggle('selected', selected);
      option.setAttribute('aria-checked', String(selected));
      option.querySelector('.route-radio')?.classList.toggle('checked', selected);
    }
  }

  private renderRouteTargetGroups(): string {
    const grouped = new Map<RoutingTarget['type'], RoutingTarget[]>();
    for (const target of this.routingTargets) {
      const list = grouped.get(target.type) ?? [];
      list.push(target);
      grouped.set(target.type, list);
    }

    return ROUTING_TARGET_TYPE_ORDER.map((type) => {
      const items = grouped.get(type);
      if (!items?.length) return '';
      const rows = items
        .map((target) => {
          const isSelected = this.selectedRoutingTarget === target.id;
          const ext = target.extension_number
            ? `<span class="route-option-ext">${this.t('phoneNumberOrdering.route.extension', { ext: this.escapeHtml(target.extension_number) })}</span>`
            : '';
          return `
            <div class="route-option ${isSelected ? 'selected' : ''}" data-action="select-route-target"
                 data-target-id="${this.escapeHtml(target.id)}" role="radio" aria-checked="${isSelected}" tabindex="0">
              <span class="route-radio ${isSelected ? 'checked' : ''}" aria-hidden="true"></span>
              <span class="route-option-main">
                <span class="route-option-name">${this.escapeHtml(target.name || this.t('phoneNumberOrdering.route.unnamed'))}</span>
                ${ext}
              </span>
            </div>
          `;
        })
        .join('');
      return `
        <div class="route-group-heading">${this.t(`phoneNumberOrdering.route.type.${type}`)}</div>
        ${rows}
      `;
    }).join('');
  }

  private renderOrderingStep(): string {
    return `
      <div class="card">
        <div class="center-state" role="status" aria-live="polite">
          <div class="spinner" aria-hidden="true">${this.icons.spinner}</div>
          <div class="center-title">${this.t('phoneNumberOrdering.ordering.title')}</div>
        </div>
      </div>
    `;
  }

  private renderCompleteStep(): string {
    const status = this.order?.status || 'pending';
    const isPolling = this.pollTimer !== null;

    const statusSuffixMap: Record<string, string> = {
      complete: 'Complete',
      partial: 'Partial',
    };
    const statusSuffix = statusSuffixMap[status] || 'Pending';
    const plural = this.selectedNumbers.size === 1 ? 'One' : 'Other';
    const titleKey = `phoneNumberOrdering.complete.title${statusSuffix}${plural}`;
    const descKey = `phoneNumberOrdering.complete.description${statusSuffix}${plural}`;

    const pollingIndicator =
      status === 'pending' && isPolling
        ? `<div class="center-detail" style="opacity:0.7;font-size:var(--ds-font-size-small)">${this.t('phoneNumberOrdering.complete.checking')}</div>`
        : '';

    return `
      <div class="card ${this.classes.orderComplete || ''}" part="complete">
        <div class="center-state">
          <div class="center-icon success">${SUCCESS_SVG}</div>
          <div class="center-title">${this.t(titleKey)}</div>
          <div class="center-detail">${this.t(descKey)}</div>
          ${pollingIndicator}
          ${status === 'complete' ? `<div class="center-hint">${this.t('phoneNumberOrdering.complete.assignmentHint')}</div>` : ''}

          <div class="center-btn">
            <button class="btn btn-primary" data-action="order-more">
              ${this.t('phoneNumberOrdering.complete.orderMore')}
            </button>
          </div>
        </div>
      </div>
    `;
  }

  private renderErrorStep(): string {
    return `
      <div class="card" part="error-state">
        <div class="center-state">
          <div class="center-icon error">${ERROR_SVG}</div>
          <div class="center-title">${this.t('phoneNumberOrdering.error.title')}</div>
          <div class="center-detail">${this.escapeHtml(this.errorMessage || '')}</div>
          <div class="center-btn">
            <button class="btn btn-primary" data-action="try-again">
              ${this.t('phoneNumberOrdering.error.tryAgain')}
            </button>
          </div>
        </div>
      </div>
    `;
  }

  // ============================================================================
  // Event Handling
  // ============================================================================

  /** Update the search button's disabled state without a full re-render. */
  private updateSearchButton(): void {
    const btn = this.shadowRoot?.querySelector<HTMLButtonElement>('[data-action="search"]');
    if (btn) btn.disabled = this.isSearching || !this.canSearch();
  }

  /** Targeted DOM update for search type switching — avoids full re-render to preserve focus. */
  private updateSearchTypeUI(newType: SearchType): void {
    if (!this.shadowRoot) return;

    // Toggle active class on segment buttons
    const buttons = this.shadowRoot.querySelectorAll<HTMLElement>('.segment-btn');
    buttons.forEach((btn) => {
      btn.classList.toggle('active', btn.dataset.type === newType);
    });

    // Toggle visibility based on rendered search types
    const stack = this.shadowRoot.querySelector('.search-fields-stack');
    if (stack) {
      const typeIndex = this.searchTypes.indexOf(newType);
      for (let i = 0; i < stack.children.length; i++) {
        const child = stack.children[i];
        if (child) child.classList.toggle('search-fields-hidden', i !== typeIndex);
      }
    }
  }

  /** Attach the single delegated click handler — called once in initialize(). */
  private attachDelegatedClickHandler(): void {
    if (!this.shadowRoot) return;

    this.shadowRoot.addEventListener('click', (e) => {
      const actionEl = (e.target as HTMLElement).closest<HTMLElement>('[data-action]');
      if (actionEl) this.handleAction(actionEl);
    });

    // Keyboard activation for focusable action elements (e.g. the route-step
    // radio options are role="radio" tabindex="0"): Space/Enter select them, so
    // keyboard and assistive-tech users can pick a routing destination.
    this.shadowRoot.addEventListener('keydown', (e) => {
      const ke = e as KeyboardEvent;
      if (ke.key !== 'Enter' && ke.key !== ' ' && ke.key !== 'Spacebar') return;
      const actionEl = (e.target as HTMLElement).closest<HTMLElement>('[data-action][tabindex]');
      if (!actionEl) return;
      e.preventDefault(); // stop Space from scrolling the list
      this.handleAction(actionEl);
    });
  }

  /** Run the action for a `[data-action]` element (shared by click + keydown). */
  private handleAction(actionEl: HTMLElement): void {
    const action = actionEl.dataset.action;

    switch (action) {
      case 'set-search-type': {
        const type = actionEl.dataset.type as SearchType;
        if (type && type !== this.searchType) {
          this.searchType = type;
          this.updateSearchTypeUI(type);
          this.updateSearchButton();
        }
        break;
      }
      case 'search':
        this.searchNumbers();
        break;
      case 'toggle-number': {
        const phone = actionEl.dataset.phone;
        if (phone) {
          if (this.selectedNumbers.has(phone)) {
            this.selectedNumbers.delete(phone);
          } else {
            this.selectedNumbers.add(phone);
          }
          this.render();
        }
        break;
      }
      case 'select-all': {
        if (this.selectedNumbers.size === this.availableNumbers.length) {
          this.selectedNumbers = new Set();
        } else {
          this.selectedNumbers = new Set(this.availableNumbers.map((n) => n.phone_number));
        }
        this.render();
        break;
      }
      case 'continue':
        this.goToConfirm();
        break;
      case 'continue-to-route':
        this.goToRoute();
        break;
      case 'select-route-target': {
        const targetId = actionEl.dataset.targetId;
        if (targetId) {
          this.selectedRoutingTarget = targetId;
          this.updateRouteSelectionUI();
        }
        break;
      }
      case 'route-skip':
        this.selectedRoutingTarget = null;
        this.updateRouteSelectionUI();
        break;
      case 'back-to-search':
        this.goToSearch();
        break;
      case 'back-to-results':
        this.goToResults();
        break;
      case 'back-to-confirm':
        this.goToConfirm();
        break;
      case 'place-order':
        this.placeOrder();
        break;
      case 'order-more':
        this.resetFlow();
        break;
      case 'try-again':
        this.goToSearch();
        break;
    }
  }

  /** Attach per-element listeners for inputs -- called on each render(). */
  private attachInputListeners(): void {
    if (!this.shadowRoot) return;

    const bindInput = (id: string, handler: (value: string) => void): void => {
      const el = this.shadowRoot!.getElementById(id) as HTMLInputElement | null;
      el?.addEventListener('input', (e) => {
        handler((e.target as HTMLInputElement).value);
        this.updateSearchButton();
      });
    };

    bindInput('search-area-code', (v) => {
      this.searchValue = v;
    });
    bindInput('search-zip', (v) => {
      this.searchValue = v;
    });
    bindInput('search-quantity', (v) => {
      const val = parseInt(v, 10);
      if (!isNaN(val) && val > 0) this.quantity = val;
    });
  }
}

// Register the custom element
if (typeof window !== 'undefined' && !customElements.get('dialstack-phone-number-ordering')) {
  customElements.define('dialstack-phone-number-ordering', PhoneNumberOrderingComponent);
}
