/**
 * Phone Number Ordering Web Component - Multi-step search and order flow
 */

import { parsePhoneNumber, type CountryCode, type PhoneNumber } from 'libphonenumber-js';
import { BaseComponent } from './base-component';
import type {
  AvailablePhoneNumber,
  NumberOrder,
  PhoneNumberOrderingClasses,
  SearchAvailableNumbersOptions,
} from '../types';

type Step = 'search' | 'results' | 'confirm' | 'ordering' | 'complete' | 'error';
type SearchType = 'area_code' | 'city_state' | 'zip';

const CHECK_SVG = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>`;
const SUCCESS_SVG = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>`;
const ERROR_SVG = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/></svg>`;
const CHEVRON_SVG = `<svg viewBox="0 0 24 24" fill="currentColor" width="12" height="12"><path d="M10 6L8.59 7.41 13.17 12l-4.58 4.59L10 18l6-6z"/></svg>`;

const US_STATES = [
  ['AL', 'Alabama'],
  ['AK', 'Alaska'],
  ['AZ', 'Arizona'],
  ['AR', 'Arkansas'],
  ['CA', 'California'],
  ['CO', 'Colorado'],
  ['CT', 'Connecticut'],
  ['DE', 'Delaware'],
  ['FL', 'Florida'],
  ['GA', 'Georgia'],
  ['HI', 'Hawaii'],
  ['ID', 'Idaho'],
  ['IL', 'Illinois'],
  ['IN', 'Indiana'],
  ['IA', 'Iowa'],
  ['KS', 'Kansas'],
  ['KY', 'Kentucky'],
  ['LA', 'Louisiana'],
  ['ME', 'Maine'],
  ['MD', 'Maryland'],
  ['MA', 'Massachusetts'],
  ['MI', 'Michigan'],
  ['MN', 'Minnesota'],
  ['MS', 'Mississippi'],
  ['MO', 'Missouri'],
  ['MT', 'Montana'],
  ['NE', 'Nebraska'],
  ['NV', 'Nevada'],
  ['NH', 'New Hampshire'],
  ['NJ', 'New Jersey'],
  ['NM', 'New Mexico'],
  ['NY', 'New York'],
  ['NC', 'North Carolina'],
  ['ND', 'North Dakota'],
  ['OH', 'Ohio'],
  ['OK', 'Oklahoma'],
  ['OR', 'Oregon'],
  ['PA', 'Pennsylvania'],
  ['RI', 'Rhode Island'],
  ['SC', 'South Carolina'],
  ['SD', 'South Dakota'],
  ['TN', 'Tennessee'],
  ['TX', 'Texas'],
  ['UT', 'Utah'],
  ['VT', 'Vermont'],
  ['VA', 'Virginia'],
  ['WA', 'Washington'],
  ['WV', 'West Virginia'],
  ['WI', 'Wisconsin'],
  ['WY', 'Wyoming'],
  ['DC', 'District of Columbia'],
] as const;

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

  .step-item.completed-no-nav {
    cursor: default;
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

  /* ── Segmented Control ── */
  .segmented-control {
    display: flex;
    background: var(--ds-color-surface-subtle);
    border: 1px solid var(--ds-color-border);
    border-radius: var(--ds-border-radius);
    padding: 3px;
    gap: 2px;
    margin-bottom: var(--ds-layout-spacing-md);
  }

  .segment-btn {
    flex: 1;
    padding: var(--ds-spacing-sm) var(--ds-spacing-md);
    font-size: var(--ds-font-size-small);
    font-family: var(--ds-font-family);
    font-weight: var(--ds-font-weight-medium);
    color: var(--ds-color-text-secondary);
    background: transparent;
    border: none;
    border-radius: var(--ds-border-radius-small);
    cursor: pointer;
    transition: all var(--ds-transition-duration);
    text-align: center;
  }

  .segment-btn:hover:not(.active) {
    color: var(--ds-color-text);
  }

  .segment-btn.active {
    background: var(--ds-color-background);
    color: var(--ds-color-text);
    box-shadow: 0 1px 2px rgba(0,0,0,0.06);
  }

  /* ── Search Fields Stack (all variants overlaid, only active visible) ── */
  .search-fields-stack {
    display: grid;
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

  .results-table-wrap {
    border: 1px solid var(--ds-color-border);
    border-radius: var(--ds-border-radius);
    overflow: hidden;
  }

  .results-table {
    width: 100%;
    border-collapse: collapse;
    font-size: var(--ds-font-size-base);
  }

  .results-table th {
    text-align: left;
    padding: var(--ds-layout-spacing-sm) var(--ds-layout-spacing-md);
    font-size: var(--ds-font-size-small);
    font-weight: var(--ds-font-weight-medium);
    color: var(--ds-color-text-secondary);
    text-transform: uppercase;
    letter-spacing: 0.04em;
    background: var(--ds-color-surface-subtle);
    border-bottom: 1px solid var(--ds-color-border);
  }

  .results-table th:first-child {
    width: 40px;
    text-align: center;
  }

  .results-table td {
    padding: var(--ds-layout-spacing-sm) var(--ds-layout-spacing-md);
    border-bottom: 1px solid var(--ds-color-border-subtle);
    color: var(--ds-color-text);
  }

  .results-table td:first-child {
    text-align: center;
  }

  .results-table tr:last-child td {
    border-bottom: none;
  }

  .results-table tbody tr {
    cursor: pointer;
    transition: background var(--ds-transition-duration);
  }

  .results-table tbody tr:hover {
    background: var(--ds-color-surface-subtle);
  }

  .results-table tbody tr.selected {
    background: color-mix(in srgb, var(--ds-color-primary) 6%, transparent);
  }

  .results-table tbody tr.selected:hover {
    background: color-mix(in srgb, var(--ds-color-primary) 10%, transparent);
  }

  .phone-number-cell {
    font-variant-numeric: tabular-nums;
    font-weight: var(--ds-font-weight-medium);
    letter-spacing: 0.02em;
  }

  /* ── Checkbox (display-only, row click handles toggle) ── */
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

  .empty-state {
    padding: var(--ds-spacing-xl);
    text-align: center;
    background: var(--ds-color-surface-subtle);
    border-radius: var(--ds-border-radius);
    color: var(--ds-color-text-secondary);
  }
`;

export class PhoneNumberOrderingComponent extends BaseComponent {
  // State machine
  private step: Step = 'search';

  // Search state
  private searchType: SearchType = 'area_code';
  private searchValue: string = '';
  private searchCity: string = '';
  private searchState: string = '';
  private quantity: number = 10;
  private isSearching: boolean = false;

  // Results state
  private availableNumbers: AvailablePhoneNumber[] = [];
  private selectedNumbers: Set<string> = new Set();

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

  private async searchNumbers(): Promise<void> {
    if (!this.instance) return;

    this.isSearching = true;
    this.render();

    try {
      const options: SearchAvailableNumbersOptions = { quantity: this.quantity };
      if (this.searchType === 'city_state') {
        options.city = this.searchCity;
        options.state = this.searchState;
      } else if (this.searchType === 'zip') {
        options.zip = this.searchValue;
      } else {
        options.areaCode = this.searchValue;
      }

      this.availableNumbers = await this.instance.searchAvailableNumbers(options);
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
      const order = await this.instance.createPhoneNumberOrder([...this.selectedNumbers]);
      this.order = order;
      this.step = 'complete';
      this.render();

      // Route based on order status
      if (order.status === 'failed') {
        this.errorMessage = this.t('phoneNumberOrdering.error.description');
        this.step = 'error';
        this._onOrderError?.({ error: this.errorMessage });
        this.render();
      } else if (order.status === 'pending') {
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
        const order = await this.instance!.getPhoneNumberOrder(orderId);
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

  private resetFlow(): void {
    this.stopPolling();
    this.step = 'search';
    this.searchValue = '';
    this.searchCity = '';
    this.searchState = '';
    this.quantity = 10;
    this.availableNumbers = [];
    this.selectedNumbers = new Set();
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
    const stepDefs = [
      { key: 'search', label: this.t('phoneNumberOrdering.steps.search') },
      { key: 'results', label: this.t('phoneNumberOrdering.steps.select') },
      { key: 'confirm', label: this.t('phoneNumberOrdering.steps.confirm') },
      { key: 'complete', label: this.t('phoneNumberOrdering.steps.done') },
    ];

    let currentKey: string;
    if (this.step === 'ordering') {
      currentKey = 'confirm';
    } else if (this.step === 'error') {
      currentKey = 'complete';
    } else {
      currentKey = this.step;
    }
    const currentIdx = stepDefs.findIndex((s) => s.key === currentKey);

    // Disable backward navigation once the order has been placed
    const isTerminal =
      this.step === 'ordering' || this.step === 'complete' || this.step === 'error';

    return `
      <nav class="step-breadcrumb" aria-label="Order progress">
        ${stepDefs
          .map((s, i) => {
            const cls =
              i < currentIdx
                ? isTerminal
                  ? 'completed completed-no-nav'
                  : 'completed'
                : i === currentIdx
                  ? 'active'
                  : '';
            const numberContent =
              i < currentIdx
                ? `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" style="width:12px;height:12px"><polyline points="20 6 9 17 4 12"/></svg>`
                : `${i + 1}`;
            const clickAttr =
              i < currentIdx && !isTerminal ? ` data-action="go-to-step" data-step="${s.key}"` : '';
            const item = `
              <span class="step-item ${cls}"${clickAttr}>
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

  private renderSearchStep(): string {
    const segmentBtn = (type: SearchType, label: string) =>
      `<button class="segment-btn ${this.searchType === type ? 'active' : ''}" data-action="set-search-type" data-type="${type}">${label}</button>`;

    const hidden = (type: SearchType) => (this.searchType === type ? '' : 'search-fields-hidden');

    const stateOptions = US_STATES.map(
      ([code, name]) =>
        `<option value="${code}" ${this.searchState === code ? 'selected' : ''}>${name}</option>`
    ).join('');

    return `
      <div class="card ${this.classes.searchForm || ''}" part="search-form">
        <h2 class="section-title">${this.t('phoneNumberOrdering.search.title')}</h2>

        <div class="segmented-control" role="radiogroup" aria-label="${this.t('phoneNumberOrdering.search.searchType')}">
          ${segmentBtn('area_code', this.t('phoneNumberOrdering.search.areaCode'))}
          ${segmentBtn('city_state', this.t('phoneNumberOrdering.search.cityState'))}
          ${segmentBtn('zip', this.t('phoneNumberOrdering.search.zip'))}
        </div>

        <div class="search-fields-stack">
          <div class="${hidden('area_code')}">
            <div class="form-group">
              <label class="form-label">${this.t('phoneNumberOrdering.search.areaCodeLabel')}</label>
              <input class="form-input" type="text" id="search-area-code"
                placeholder="${this.t('phoneNumberOrdering.search.areaCodePlaceholder')}"
                value="${this.searchType === 'area_code' ? this.searchValue : ''}"
                data-field="value" />
            </div>
          </div>
          <div class="${hidden('city_state')}">
            <div class="form-row">
              <div class="form-group">
                <label class="form-label">${this.t('phoneNumberOrdering.search.cityLabel')}</label>
                <input class="form-input" type="text" id="search-city"
                  placeholder="${this.t('phoneNumberOrdering.search.cityPlaceholder')}"
                  value="${this.searchType === 'city_state' ? this.searchCity : ''}"
                  data-field="city" />
              </div>
              <div class="form-group">
                <label class="form-label">${this.t('phoneNumberOrdering.search.stateLabel')}</label>
                <select class="form-select" id="search-state" data-field="state">
                  <option value=""></option>
                  ${stateOptions}
                </select>
              </div>
            </div>
          </div>
          <div class="${hidden('zip')}">
            <div class="form-group">
              <label class="form-label">${this.t('phoneNumberOrdering.search.zipLabel')}</label>
              <input class="form-input" type="text" id="search-zip"
                placeholder="${this.t('phoneNumberOrdering.search.zipPlaceholder')}"
                value="${this.searchType === 'zip' ? this.searchValue : ''}"
                data-field="value" />
            </div>
          </div>
        </div>

        <div class="search-row">
          <div class="form-group">
            <label class="form-label" for="search-quantity">${this.t('phoneNumberOrdering.search.numberOfResults')}</label>
            <input class="form-input" type="number" id="search-quantity"
              min="1" max="100" value="${this.quantity}"
              data-field="quantity" />
          </div>
          <div class="form-group">
            <button class="btn btn-primary" data-action="search" ${this.isSearching ? 'disabled' : ''}>
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
            <td>${this.escapeHtml(num.city)}</td>
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

        <div class="results-table-wrap">
          <table class="results-table" role="grid">
            <thead>
              <tr>
                <th scope="col"></th>
                <th scope="col">${this.t('phoneNumberOrdering.results.phoneNumber')}</th>
                <th scope="col">${this.t('phoneNumberOrdering.results.city')}</th>
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
          <span class="confirm-city">${this.escapeHtml(num.city)}</span>
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
            <button class="btn btn-primary" data-action="place-order">
              ${this.t('phoneNumberOrdering.confirm.placeOrder')}
            </button>
          </div>
        </div>
      </div>
    `;
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

  /** Targeted DOM update for search type switching — avoids full re-render to preserve focus. */
  private updateSearchTypeUI(newType: SearchType): void {
    if (!this.shadowRoot) return;

    // Toggle active class on segment buttons
    const buttons = this.shadowRoot.querySelectorAll<HTMLElement>('.segment-btn');
    buttons.forEach((btn) => {
      btn.classList.toggle('active', btn.dataset.type === newType);
    });

    // Toggle visibility: area_code=0, city_state=1, zip=2
    const stack = this.shadowRoot.querySelector('.search-fields-stack');
    if (stack) {
      const typeIndexMap: Record<SearchType, number> = { area_code: 0, city_state: 1, zip: 2 };
      const typeIndex = typeIndexMap[newType];
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
      const target = e.target as HTMLElement;
      const actionEl = target.closest<HTMLElement>('[data-action]');
      if (!actionEl) return;

      const action = actionEl.dataset.action;

      switch (action) {
        case 'set-search-type': {
          const type = actionEl.dataset.type as SearchType;
          if (type && type !== this.searchType) {
            this.searchType = type;
            this.updateSearchTypeUI(type);
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
        case 'continue':
          this.goToConfirm();
          break;
        case 'back-to-search':
          this.goToSearch();
          break;
        case 'back-to-results':
          this.goToResults();
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
        case 'go-to-step': {
          const step = actionEl.dataset.step as Step;
          if (step) {
            this.step = step;
            this.render();
          }
          break;
        }
      }
    });
  }

  /** Attach per-element listeners for inputs -- called on each render(). */
  private attachInputListeners(): void {
    if (!this.shadowRoot) return;

    const bindInput = (id: string, handler: (value: string) => void): void => {
      const el = this.shadowRoot!.getElementById(id) as HTMLInputElement | null;
      el?.addEventListener('input', (e) => handler((e.target as HTMLInputElement).value));
    };

    bindInput('search-area-code', (v) => {
      this.searchValue = v;
    });
    bindInput('search-zip', (v) => {
      this.searchValue = v;
    });
    bindInput('search-city', (v) => {
      this.searchCity = v;
    });
    bindInput('search-quantity', (v) => {
      const val = parseInt(v, 10);
      if (!isNaN(val) && val > 0) this.quantity = val;
    });

    const stateSelect = this.shadowRoot.getElementById('search-state') as HTMLSelectElement | null;
    stateSelect?.addEventListener('change', (e) => {
      this.searchState = (e.target as HTMLSelectElement).value;
    });
  }
}

// Register the custom element
if (typeof window !== 'undefined' && !customElements.get('dialstack-phone-number-ordering')) {
  customElements.define('dialstack-phone-number-ordering', PhoneNumberOrderingComponent);
}
