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
} from '../types';
import type { Extension } from '../types/dial-plan';
import { AsYouType, parsePhoneNumberFromString } from 'libphonenumber-js';
import { debounce } from '../utils/debounce';
import { normalizeMac } from '../utils/mac';
import { US_STATES } from '../constants/us-states';
import { US_TIMEZONES } from '../constants/us-timezones';

const CHECK_SVG = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" style="width:12px;height:12px"><polyline points="20 6 9 17 4 12"/></svg>`;
const CHEVRON_SVG = `<svg viewBox="0 0 24 24" fill="currentColor" width="12" height="12"><path d="M10 6L8.59 7.41 13.17 12l-4.58 4.59L10 18l6-6z"/></svg>`;
const SUCCESS_SVG = `<svg viewBox="0 0 52 52" fill="none" xmlns="http://www.w3.org/2000/svg"><circle cx="26" cy="26" r="25" stroke="currentColor" stroke-width="2"/><polyline points="16 27 23 34 36 20" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"/></svg>`;
const ERROR_SVG = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/></svg>`;
const CHECK_CIRCLE_SVG = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="width:16px;height:16px;color:var(--ds-color-success)"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg>`;

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

  /* ── Placeholder ── */
  .placeholder {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    padding: var(--ds-layout-spacing-lg) 0;
    text-align: center;
    min-height: 200px;
  }

  .placeholder-icon {
    width: 48px;
    height: 48px;
    border-radius: var(--ds-border-radius-round);
    background: var(--ds-color-surface-subtle);
    display: flex;
    align-items: center;
    justify-content: center;
    margin-bottom: var(--ds-layout-spacing-md);
    color: var(--ds-color-text-secondary);
    font-size: 24px;
  }

  .placeholder-text {
    font-size: var(--ds-font-size-small);
    color: var(--ds-color-text-secondary);
    max-width: 360px;
  }

  /* ── Complete Step ── */
  .complete-icon {
    width: 64px;
    height: 64px;
    color: var(--ds-color-success);
    margin-bottom: var(--ds-layout-spacing-md);
  }

  /* ── Footer Bar ── */
  .footer-bar {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: var(--ds-layout-spacing-md) var(--ds-layout-spacing-lg);
    border-top: 1px solid var(--ds-color-border);
  }

  .footer-bar-end {
    justify-content: flex-end;
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

  /* ── Center State (loading, error) ── */
  .center-state {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    padding: var(--ds-layout-spacing-lg) 0;
    text-align: center;
    min-height: 200px;
  }

  .center-icon {
    width: 48px;
    height: 48px;
    margin-bottom: var(--ds-layout-spacing-md);
  }

  .center-icon.error {
    color: var(--ds-color-danger);
  }

  .center-icon svg {
    width: 100%;
    height: 100%;
  }

  .center-title {
    font-size: var(--ds-font-size-xlarge);
    font-weight: var(--ds-font-weight-bold);
    color: var(--ds-color-text);
    margin-bottom: var(--ds-layout-spacing-xs);
  }

  .center-description {
    font-size: var(--ds-font-size-base);
    color: var(--ds-color-text-secondary);
    margin-bottom: var(--ds-layout-spacing-lg);
    max-width: 360px;
  }

  .center-btn {
    margin-top: var(--ds-layout-spacing-sm);
  }

  /* ── Spinner ── */
  .spinner {
    display: inline-block;
    width: var(--ds-spinner-size);
    height: var(--ds-spinner-size);
    animation: spin 1s linear infinite;
    color: var(--ds-color-primary);
    margin-bottom: var(--ds-layout-spacing-md);
  }

  .spinner svg {
    width: 100%;
    height: 100%;
  }

  @keyframes spin {
    to { transform: rotate(360deg); }
  }

  /* ── Legal Links ── */
  .legal-links {
    font-size: var(--ds-font-size-small);
    color: var(--ds-color-text-secondary);
    margin-top: var(--ds-layout-spacing-md);
    max-width: 360px;
  }

  .legal-links a {
    color: var(--ds-color-primary);
    text-decoration: none;
  }

  .legal-links a:hover {
    text-decoration: underline;
  }

  /* ── Form Elements ── */
  .form-group {
    margin-bottom: var(--ds-layout-spacing-md);
  }

  .form-label {
    display: block;
    font-size: var(--ds-font-size-small);
    font-weight: var(--ds-font-weight-medium);
    color: var(--ds-color-text);
    margin-bottom: var(--ds-spacing-xs);
  }

  .form-input,
  .form-select {
    width: 100%;
    padding: var(--ds-layout-spacing-sm) var(--ds-layout-spacing-sm);
    font-size: var(--ds-font-size-base);
    font-family: var(--ds-font-family);
    color: var(--ds-color-text);
    background: var(--ds-color-background);
    border: 1px solid var(--ds-color-border);
    border-radius: var(--ds-border-radius);
    box-sizing: border-box;
    transition: border-color var(--ds-transition-duration);
  }

  .form-input:focus,
  .form-select:focus {
    outline: none;
    border-color: var(--ds-color-primary);
  }

  .form-input.error {
    border-color: var(--ds-color-danger);
  }

  .form-row {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: var(--ds-layout-spacing-md);
  }

  .form-error {
    font-size: var(--ds-font-size-small);
    color: var(--ds-color-danger);
    margin-top: var(--ds-spacing-xs);
  }

  .form-help {
    font-size: var(--ds-font-size-small);
    color: var(--ds-color-text-secondary);
    margin-top: var(--ds-spacing-xs);
  }

  .form-static {
    padding: var(--ds-spacing-sm) var(--ds-spacing-md);
    background: var(--ds-color-surface);
    border: 1px solid var(--ds-color-border);
    border-radius: var(--ds-border-radius);
    color: var(--ds-color-text-secondary);
    font-size: var(--ds-font-size-base);
  }

  /* ── Section Divider ── */
  .section-divider {
    border: none;
    border-top: 1px solid var(--ds-color-border);
    margin: var(--ds-layout-spacing-lg) 0;
  }

  .section-heading {
    font-size: var(--ds-font-size-large);
    font-weight: var(--ds-font-weight-bold);
    color: var(--ds-color-text);
    margin: 0 0 var(--ds-spacing-xs) 0;
  }

  .section-description {
    font-size: var(--ds-font-size-small);
    color: var(--ds-color-text-secondary);
    margin: 0 0 var(--ds-layout-spacing-md) 0;
  }

  /* ── User List ── */
  .user-list {
    display: flex;
    flex-direction: column;
    gap: var(--ds-spacing-xs);
    margin-bottom: var(--ds-layout-spacing-md);
  }

  .user-item {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: var(--ds-layout-spacing-sm) var(--ds-layout-spacing-sm);
    background: var(--ds-color-surface-subtle);
    border-radius: var(--ds-border-radius);
    border: 1px solid var(--ds-color-border-subtle);
  }

  .user-item-info {
    display: flex;
    flex-direction: column;
    gap: 2px;
    min-width: 0;
  }

  .user-item-name {
    font-size: var(--ds-font-size-base);
    font-weight: var(--ds-font-weight-medium);
    color: var(--ds-color-text);
  }

  .user-item-meta {
    font-size: var(--ds-font-size-small);
    color: var(--ds-color-text-secondary);
  }

  .user-item-actions {
    flex-shrink: 0;
  }

  .btn-danger-ghost {
    background: none;
    border: none;
    color: var(--ds-color-danger);
    font-size: var(--ds-font-size-small);
    font-family: var(--ds-font-family);
    cursor: pointer;
    padding: var(--ds-spacing-xs) var(--ds-layout-spacing-sm);
    border-radius: var(--ds-border-radius);
  }

  .btn-danger-ghost:hover {
    background: var(--ds-color-danger);
    color: #fff;
  }

  .btn-link {
    background: none;
    border: none;
    color: var(--ds-color-primary);
    font-size: var(--ds-font-size-small);
    font-family: var(--ds-font-family);
    cursor: pointer;
    padding: 0;
  }

  .btn-link:hover {
    text-decoration: underline;
  }

  .no-users {
    text-align: center;
    padding: var(--ds-layout-spacing-md);
    color: var(--ds-color-text-secondary);
    font-size: var(--ds-font-size-small);
  }

  /* ── Add User Form ── */
  .add-user-form {
    display: grid;
    grid-template-columns: 1fr 1fr auto;
    gap: var(--ds-layout-spacing-sm);
    align-items: end;
    padding: var(--ds-layout-spacing-sm);
    background: var(--ds-color-surface-subtle);
    border-radius: var(--ds-border-radius);
    border: 1px solid var(--ds-color-border-subtle);
  }

  .add-user-form .form-group {
    margin-bottom: 0;
  }

  .btn-add {
    white-space: nowrap;
    align-self: end;
    /* Override .btn horizontal padding to match .form-input vertical padding for equal height */
    padding: var(--ds-layout-spacing-sm) var(--ds-layout-spacing-md);
  }

  /* ── Inline Alert ── */
  .inline-alert {
    font-size: var(--ds-font-size-small);
    padding: var(--ds-layout-spacing-sm);
    border-radius: var(--ds-border-radius);
    margin-top: var(--ds-layout-spacing-sm);
  }

  .inline-alert.error {
    background: color-mix(in srgb, var(--ds-color-danger) 10%, transparent);
    color: var(--ds-color-danger);
    border: 1px solid color-mix(in srgb, var(--ds-color-danger) 20%, transparent);
  }

  .inline-alert.warning {
    background: color-mix(in srgb, #f59e0b 10%, transparent);
    color: #92400e;
    border: 1px solid color-mix(in srgb, #f59e0b 20%, transparent);
  }

  /* ── HW Step: Device List ── */
  .hw-device-list {
    display: flex;
    flex-direction: column;
    gap: var(--ds-spacing-xs);
    margin-bottom: var(--ds-layout-spacing-md);
  }

  .hw-device-row {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: var(--ds-layout-spacing-sm);
    background: var(--ds-color-surface-subtle);
    border-radius: var(--ds-border-radius);
    border: 1px solid var(--ds-color-border-subtle);
  }

  .hw-device-row__info {
    display: flex;
    align-items: center;
    gap: var(--ds-spacing-xs);
    flex: 1;
    min-width: 0;
  }

  .hw-device-row__actions {
    display: flex;
    align-items: center;
    gap: var(--ds-spacing-xs);
    flex-shrink: 0;
    margin-left: auto;
    white-space: nowrap;
  }

  .hw-device-badge {
    font-size: var(--ds-font-size-small);
    color: var(--ds-color-text);
    font-weight: var(--ds-font-weight-medium);
  }

  .hw-device-mac {
    font-size: var(--ds-font-size-small);
    color: var(--ds-color-text-secondary);
    font-family: monospace;
  }

  .hw-device-user {
    font-size: var(--ds-font-size-small);
    color: var(--ds-color-text-secondary);
  }

  .hw-dect-group {
    border: 1px solid var(--ds-color-border-subtle);
    border-radius: var(--ds-border-radius);
    overflow: hidden;
  }

  .hw-device-row--base {
    border: none;
    border-radius: 0;
  }

  .hw-device-row--handset {
    border: none;
    border-radius: 0;
    border-top: 1px solid var(--ds-color-border-subtle);
    padding-left: calc(var(--ds-layout-spacing-sm) + var(--ds-layout-spacing-sm));
  }

  .hw-device-row--editing {
    border: none;
    border-radius: 0;
    border-top: 1px solid var(--ds-color-border-subtle);
    flex-direction: column;
    align-items: stretch;
  }

  .hw-inline-form {
    display: flex;
    gap: var(--ds-layout-spacing-sm);
    align-items: end;
  }

  .hw-inline-form .form-group {
    flex: 1;
    margin-bottom: 0;
  }

  .hw-device-row--add {
    background: none;
    border: none;
    justify-content: center;
    padding: var(--ds-layout-spacing-md);
  }

  .hw-dect-base-actions {
    display: flex;
    align-items: center;
    gap: var(--ds-spacing-xs);
  }

  .form-check-label {
    display: inline-flex;
    align-items: center;
    gap: var(--ds-spacing-xs);
    font-size: var(--ds-font-size-base);
    color: var(--ds-color-text);
    cursor: pointer;
  }

  .form-check-label input[type="checkbox"] {
    width: 16px;
    height: 16px;
    cursor: pointer;
  }

  .btn-sm {
    font-size: var(--ds-font-size-small);
    padding: 2px var(--ds-spacing-xs);
  }

  /* ── Address Autocomplete ── */
  .address-autocomplete {
    position: relative;
  }

  .address-dropdown {
    position: absolute;
    top: 100%;
    left: 0;
    right: 0;
    z-index: 10;
    background: var(--ds-color-background);
    border: 1px solid var(--ds-color-border);
    border-top: none;
    border-radius: 0 0 var(--ds-border-radius) var(--ds-border-radius);
    max-height: 200px;
    overflow-y: auto;
    box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.1);
  }

  .address-suggestion {
    padding: var(--ds-layout-spacing-sm);
    cursor: pointer;
    font-size: var(--ds-font-size-small);
    transition: background var(--ds-transition-duration);
    border-bottom: 1px solid var(--ds-color-border-subtle);
  }

  .address-suggestion:last-child {
    border-bottom: none;
  }

  .address-suggestion:hover,
  .address-suggestion.highlighted {
    background: var(--ds-color-surface-subtle);
  }

  .address-suggestion-title {
    font-weight: var(--ds-font-weight-medium);
    color: var(--ds-color-text);
  }

  .address-suggestion-detail {
    color: var(--ds-color-text-secondary);
    margin-top: 2px;
  }

  .address-no-results {
    padding: var(--ds-layout-spacing-sm);
    font-size: var(--ds-font-size-small);
    color: var(--ds-color-text-secondary);
    text-align: center;
  }

  /* ── Address Confirmed Card ── */
  .address-confirmed {
    display: flex;
    align-items: center;
    gap: var(--ds-layout-spacing-sm);
    padding: var(--ds-layout-spacing-sm);
    background: var(--ds-color-surface-subtle);
    border-radius: var(--ds-border-radius);
    border: 1px solid var(--ds-color-border-subtle);
  }

  .address-confirmed-icon {
    flex-shrink: 0;
  }

  .address-confirmed-text {
    flex: 1;
    min-width: 0;
  }

  .address-confirmed-line {
    font-size: var(--ds-font-size-small);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .address-confirmed-line:first-child {
    font-weight: var(--ds-font-weight-medium);
    color: var(--ds-color-text);
  }

  .address-confirmed-line:last-child {
    color: var(--ds-color-text-secondary);
  }

  .timezone-readonly {
    font-size: var(--ds-font-size-small);
    color: var(--ds-color-text-secondary);
    padding: var(--ds-spacing-xs) 0;
  }

  /* ── Address Manual Fields ── */
  .address-manual-fields {
    display: grid;
    grid-template-columns: 1fr 5fr;
    gap: var(--ds-layout-spacing-sm);
  }

  .address-manual-row-2 {
    display: grid;
    grid-template-columns: 2fr 2fr 2fr;
    gap: var(--ds-layout-spacing-sm);
    margin-top: var(--ds-layout-spacing-sm);
  }

  .address-manual-fields .form-group,
  .address-manual-row-2 .form-group {
    margin-bottom: 0;
  }

  /* ── Link Button ── */
  .btn-link {
    background: none;
    border: none;
    color: var(--ds-color-text-secondary);
    font-size: var(--ds-font-size-small);
    font-family: var(--ds-font-family);
    cursor: pointer;
    padding: 0;
    margin-top: var(--ds-layout-spacing-sm);
    text-decoration: none;
  }

  .btn-link:hover {
    color: var(--ds-color-primary);
    text-decoration: underline;
  }
`;

export class AccountOnboardingComponent extends BaseComponent {
  private static readonly ALL_STEPS: AccountOnboardingStep[] = [
    'account',
    'numbers',
    'hardware',
    'complete',
  ];

  private currentStep: AccountOnboardingStep = 'account';
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

      const [account, users, extensions, locations, devices, dectBases] = await Promise.all([
        this.instance.getAccount(),
        this.instance.listUsers(),
        this.instance.listExtensions(),
        this.instance.listLocations(),
        this.instance.listDevices(),
        this.instance.listDECTBases(),
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
      this.devices = devices ?? [];
      this.dectBases = dectBases ?? [];

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

      // Jump to a specific step if configured (useful for development)
      const initial = this.collectionOptions?.initialStep;
      if (initial && this.getActiveSteps().includes(initial)) {
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
    this.currentStep = step;
    this._onStepChange?.({ step });
    this.render();

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

  private async saveAndAdvance(): Promise<void> {
    if (this.isSavingAccount) return;
    this.accountValidationErrors = {};
    this.locationValidationErrors = {};
    this.accountSaveError = null;
    this.userError = null;

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

    if (this.users.length === 0) {
      this.userError = this.t('accountOnboarding.account.users.atLeastOne');
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
      await this.instance.updateAccount({
        email: this.accountEmail.trim(),
        name: this.accountName.trim(),
        phone: parsePhoneNumberFromString(this.accountPhone, 'US')!.number,
        primary_contact_name: this.accountPrimaryContact.trim(),
        config: {
          ...configWithoutExtLength,
          ...(this.accountTimezone ? { timezone: this.accountTimezone } : {}),
        },
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
          this.existingLocation = await this.instance.updateLocation(
            this.editingLocationId,
            locationPayload
          );
        } else {
          this.existingLocation = await this.instance.createLocation(locationPayload);
        }
        this.editingLocationId = null;
      } else if (this.existingLocation.name !== this.locationName.trim()) {
        // Update location name if it changed without re-editing the address
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
      const steps = this.getActiveSteps();
      const idx = steps.indexOf('account');
      const nextStep = steps[idx + 1];
      if (nextStep) {
        this.navigateToStep(nextStep);
      }
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
    } else {
      const renderStepContent = (step: AccountOnboardingStep): string => {
        switch (step) {
          case 'account':
            return this.renderAccountStep();
          case 'numbers':
            return this.renderNumbersStep();
          case 'hardware':
            return this.renderHardwareStep();
          case 'complete':
            return this.renderCompleteStep();
        }
      };

      content = renderStepContent(this.currentStep);
    }

    this.shadowRoot.innerHTML = `
      <style>
        ${styles}
        ${COMPONENT_STYLES}
      </style>
      <div class="container ${this.getClassNames()}" part="container"
           role="region" aria-label="${this.t('accountOnboarding.title')}">
        ${this.isLoading || this.loadError ? '' : this.renderStepBreadcrumb()}
        ${content}
      </div>
    `;

    if (!this.isLoading && !this.loadError) {
      if (this.currentStep === 'account') {
        this.attachInputListeners();
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

  private renderStepBreadcrumb(): string {
    const activeSteps = this.getActiveSteps();
    const stepLabels: Record<AccountOnboardingStep, string> = {
      account: this.t('accountOnboarding.steps.account'),
      numbers: this.t('accountOnboarding.steps.numbers'),
      hardware: this.t('accountOnboarding.steps.hardware'),
      complete: this.t('accountOnboarding.steps.complete'),
    };
    const stepDefs = activeSteps.map((key) => ({ key, label: stepLabels[key] }));

    const currentIdx = activeSteps.indexOf(this.currentStep);

    return `
      <nav class="step-breadcrumb" aria-label="${this.t('accountOnboarding.breadcrumbAriaLabel')}">
        ${stepDefs
          .map((s, i) => {
            const cls = i < currentIdx ? 'completed' : i === currentIdx ? 'active' : '';
            const numberContent = i < currentIdx ? CHECK_SVG : `${i + 1}`;
            const ariaCurrent = i === currentIdx ? ' aria-current="step"' : '';
            const clickAttr =
              i < currentIdx
                ? ` data-action="go-to-step" data-step="${s.key}" role="button" tabindex="0"`
                : '';
            const item = `
              <span class="step-item ${cls}"${ariaCurrent}${clickAttr}>
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

  private renderStepFooter(): string {
    const steps = this.getActiveSteps();
    const idx = steps.indexOf(this.currentStep);
    const hasPrev = idx > 0;
    const hasNext = idx < steps.length - 1;

    if (!hasPrev && hasNext) {
      return `
        <div class="footer-bar footer-bar-end">
          <button class="btn btn-primary" data-action="next">
            ${this.t('accountOnboarding.nav.next')}
          </button>
        </div>`;
    }
    if (hasPrev && hasNext) {
      return `
        <div class="footer-bar">
          <button class="btn btn-secondary" data-action="back">
            ${this.t('accountOnboarding.nav.back')}
          </button>
          <button class="btn btn-primary" data-action="next">
            ${this.t('accountOnboarding.nav.next')}
          </button>
        </div>`;
    }
    return '';
  }

  private renderAccountStep(): string {
    const t = (key: string): string => this.t(key);
    const nameErr = this.accountValidationErrors.name;
    const emailErr = this.accountValidationErrors.email;
    const phoneErr = this.accountValidationErrors.phone;
    const primaryContactErr = this.accountValidationErrors.primaryContact;

    const userListHtml =
      this.users.length === 0
        ? `<div class="no-users">${t('accountOnboarding.account.users.noUsers')}</div>`
        : `<div class="user-list">${this.users
            .map((u) => {
              const ext = this.getExtensionForUser(u.id);
              const extDisplay = ext ? ` &middot; ext ${this.escapeHtml(ext.number)}` : '';
              return `
              <div class="user-item">
                <div class="user-item-info">
                  <span class="user-item-name">${this.escapeHtml(u.name ?? '')}</span>
                  <span class="user-item-meta">${this.escapeHtml(u.email ?? '')}${extDisplay}</span>
                </div>
                <div class="user-item-actions">
                  <button class="btn-danger-ghost" data-action="remove-user" data-user-id="${this.escapeHtml(u.id)}">
                    ${t('accountOnboarding.account.users.removeUser')}
                  </button>
                </div>
              </div>`;
            })
            .join('')}</div>`;

    const userErrorHtml = this.userError
      ? `<div class="inline-alert error">${this.escapeHtml(this.userError)}</div>`
      : '';

    const saveErrorHtml = this.accountSaveError
      ? `<div class="inline-alert error">${this.escapeHtml(this.accountSaveError)}</div>`
      : '';

    return `
      <div class="card ${this.classes.stepAccount || ''}" part="step-account">
        <h2 class="section-title">${t('accountOnboarding.account.title')}</h2>
        <p class="section-subtitle">${t('accountOnboarding.account.subtitle')}</p>

        <h3 class="section-heading">${t('accountOnboarding.account.details.heading')}</h3>

        <div class="form-group">
          <label class="form-label" for="account-name">${t('accountOnboarding.account.details.companyNameLabel')}</label>
          <input class="form-input${nameErr ? ' error' : ''}" type="text" id="account-name"
            value="${this.escapeHtml(this.accountName)}"
            placeholder="${t('accountOnboarding.account.details.companyNamePlaceholder')}" />
          ${nameErr ? `<div class="form-error">${this.escapeHtml(nameErr)}</div>` : ''}
        </div>

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

        <div class="form-group">
          <label class="form-label" for="account-primary-contact">${t('accountOnboarding.account.details.primaryContactLabel')}</label>
          <input class="form-input${primaryContactErr ? ' error' : ''}" type="text" id="account-primary-contact"
            value="${this.escapeHtml(this.accountPrimaryContact)}"
            placeholder="${t('accountOnboarding.account.details.primaryContactPlaceholder')}" />
          ${primaryContactErr ? `<div class="form-error">${this.escapeHtml(primaryContactErr)}</div>` : ''}
        </div>

        <hr class="section-divider" />

        ${this.renderLocationSection()}

        <hr class="section-divider" />

        <h3 class="section-heading">${t('accountOnboarding.account.users.heading')}</h3>
        <p class="section-description">${t('accountOnboarding.account.users.description')}</p>

        ${userListHtml}

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
    const steps = this.getActiveSteps();
    const idx = steps.indexOf(this.currentStep);
    const hasPrev = idx > 0;

    if (hasPrev) {
      return `
        <div class="footer-bar">
          <button class="btn btn-secondary" data-action="back">
            ${this.t('accountOnboarding.nav.back')}
          </button>
          <button class="btn btn-primary" data-action="next"${this.isSavingAccount ? ' disabled' : ''}>
            ${this.isSavingAccount ? this.t('accountOnboarding.account.saving') : this.t('accountOnboarding.nav.next')}
          </button>
        </div>`;
    }

    return `
      <div class="footer-bar footer-bar-end">
        <button class="btn btn-primary" data-action="next"${this.isSavingAccount ? ' disabled' : ''}>
          ${this.isSavingAccount ? this.t('accountOnboarding.account.saving') : this.t('accountOnboarding.nav.next')}
        </button>
      </div>`;
  }

  private renderNumbersStep(): string {
    const steps = this.getActiveSteps();
    const stepNum = steps.indexOf('numbers') + 1;
    return `
      <div class="card ${this.classes.stepNumbers || ''}" part="step-numbers">
        <h2 class="section-title">${this.t('accountOnboarding.numbers.title')}</h2>
        <p class="section-subtitle">${this.t('accountOnboarding.numbers.subtitle')}</p>
        <div class="placeholder">
          <div class="placeholder-icon">${stepNum}</div>
          <p class="placeholder-text">${this.t('accountOnboarding.numbers.placeholder')}</p>
        </div>
      </div>
      ${this.renderStepFooter()}
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

    return `
      <div class="card ${this.classes.stepHardware || ''}" part="step-hardware">
        <h2 class="section-title">${t('accountOnboarding.hardware.title')}</h2>
        <p class="section-subtitle">${t('accountOnboarding.hardware.subtitle')}</p>

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

          if (newDev) {
            const endpoint = await this.ensureEndpoint(this.hwEditUserId);
            await this.instance.createDeviceLine(newDev.id, { endpoint_id: endpoint.id });
            this.devices = await this.instance.listDevices();
            await this.hydrateDeviceLines();
          }

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
      this.hwEditError = this.t('accountOnboarding.hardware.removeBaseFailed');
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
      this.hwEditError = err instanceof Error ? err.message : String(err);
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
            this.saveAndAdvance();
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
          const steps = this.getActiveSteps();
          const idx = steps.indexOf(this.currentStep);
          const prevStep = steps[idx - 1];
          if (prevStep) {
            this.navigateToStep(prevStep);
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
      }
    });
  }
}

// Register the custom element
if (typeof window !== 'undefined' && !customElements.get('dialstack-account-onboarding')) {
  customElements.define('dialstack-account-onboarding', AccountOnboardingComponent);
}
