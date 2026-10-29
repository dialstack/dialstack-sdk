/**
 * Phone Number Ordering Web Component - Multi-step search and order flow
 */

import { parsePhoneNumber, type CountryCode, type PhoneNumber } from 'libphonenumber-js';
import { BaseComponent } from './base-component';
import { segmentedControlStyles, tableStyles } from './shared-styles';
import { isApiError } from '../core/instance';
import {
  ROUTING_TARGET_TYPE_ORDER,
  type EffectivePricing,
  type AvailablePhoneNumber,
  type DIDItem,
  type NumberOrder,
  type PhoneNumberOrderErrorEvent,
  type PhoneNumberOrderPendingEvent,
  type PhoneNumberOrderingClasses,
  type RoutingTarget,
  type SearchAvailableNumbersOptions,
  type SearchType,
} from '../types';

type Step = 'search' | 'results' | 'confirm' | 'route' | 'ordering' | 'complete' | 'error';

// The API's `error` text is written for a developer's log, so the screen keys
// off the stable `code` instead. Codes not listed get the generic message.
const ORDER_ERROR_KEY: Record<string, string> = {
  phone_number_limit_exceeded: 'phoneNumberOrdering.error.limitExceeded',
  phone_numbers_already_claimed: 'phoneNumberOrdering.error.numbersUnavailable',
};

const CHECK_SVG = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>`;
const SUCCESS_SVG = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>`;
const RECEIPT_SVG = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 2v20l2-1 2 1 2-1 2 1 2-1 2 1 2-1 2 1V2l-2 1-2-1-2 1-2-1-2 1-2-1-2 1Z"/><path d="M8 8h8"/><path d="M8 12h8"/><path d="M8 16h5"/></svg>`;
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

  .vanity-spelling {
    margin-left: var(--ds-layout-spacing-sm);
    color: var(--ds-color-text-secondary);
  }

  /* Side by side, so the toll-free panel is no taller than the others in the
     overlaid stack, which sizes every tab to its tallest panel. */
  .toll-free-row {
    display: grid;
    grid-template-columns: minmax(0, 1fr) minmax(0, 1fr);
    gap: var(--ds-layout-spacing-sm);
  }

  .form-input[aria-invalid='true'] {
    border-color: var(--ds-color-danger);
  }

  /* Shown only while the entry can't become valid, so it adds height only then. */
  .field-error {
    margin: calc(-1 * var(--ds-layout-spacing-sm)) 0 var(--ds-layout-spacing-md);
    font-size: var(--ds-font-size-small);
    color: var(--ds-color-danger);
  }

  .field-error[hidden],
  .search-fields-hidden .field-error {
    display: none;
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

  /* Billing-impact disclosure on the confirm step */
  .billing-impact {
    display: flex;
    gap: var(--ds-layout-spacing-sm);
    padding: var(--ds-layout-spacing-md);
    margin-top: var(--ds-layout-spacing-md);
    background: var(--ds-color-surface-subtle);
    border-radius: var(--ds-border-radius);
  }

  .billing-impact-icon {
    flex: none;
    width: 16px;
    height: 16px;
    margin-top: 2px;
    color: var(--ds-color-text-secondary);
  }

  .billing-impact-icon svg {
    width: 100%;
    height: 100%;
    display: block;
  }

  .billing-impact-headline {
    font-weight: var(--ds-font-weight-medium);
    color: var(--ds-color-text);
  }

  .billing-impact-loading {
    /* Two lines of copy, so the step does not reflow when the reads land. */
    min-height: 40px;
  }

  .billing-impact-detail {
    font-size: var(--ds-font-size-small);
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

/** The toll-free codes a toll-free search can narrow to. */
const TOLL_FREE_AREA_CODES = ['800', '833', '844', '855', '866', '877', '888'];

/** What the API accepts as `contains`, once case, spaces and hyphens are dropped. */
const CONTAINS_RE = /^[A-Z0-9]{4,7}$/;

const KEYPAD: Record<string, string> = Object.fromEntries(
  ['ABC', 'DEF', 'GHI', 'JKL', 'MNO', 'PQRS', 'TUV', 'WXYZ'].flatMap((letters, i) =>
    [...letters].map((l) => [l, String(i + 2)])
  )
);

/**
 * Reads the Contains field. Someone typing "800-HELP" or "1-800-FLOWERS"
 * means the code and the word; the search takes the code separately and at
 * most seven characters of word, so an entry that starts with a toll-free
 * code is split when the rest has a letter or the whole is too long to be
 * the word. "8005551" stays whole: it is a valid digit pattern.
 */
export function parseTollFreeContains(raw: string): { code?: string; word: string } {
  const word = raw.toUpperCase().replace(/[\s\-().]/g, '');
  const [, code, rest] = /^1?(8\d\d)(.+)$/.exec(word) || [];
  if (code && rest && TOLL_FREE_AREA_CODES.includes(code)) {
    if (word.length > 7 || /[A-Z]/.test(rest)) return { code, word: rest };
  }
  return { word };
}

/**
 * Whether no further typing can make the Contains entry valid: too long, or a
 * character the search refuses. Too short is not flagged, since "FLO" is
 * on its way to "FLOW"; the disabled Search button covers it.
 */
function containsCannotBecomeValid(raw: string): boolean {
  const { word } = parseTollFreeContains(raw);
  return word.length > 7 || /[^A-Z0-9]/.test(word);
}

/**
 * Spells `word` into a toll-free number the way it is advertised:
 * +18447543556 with HELLO is "1-844-75-HELLO". Undefined when the word's
 * keypad digits aren't in the last seven digits.
 */
export function vanitySpelling(phoneNumber: string, word: string): string | undefined {
  const digits = phoneNumber.replace(/\D/g, '');
  if (digits.length !== 11 || !word) return undefined;
  const code = digits.slice(1, 4);
  const line = digits.slice(4);
  const at = line.indexOf([...word].map((c) => KEYPAD[c] ?? c).join(''));
  if (at < 0) return undefined;
  const parts = [line.slice(0, at), word, line.slice(at + word.length)].filter(Boolean);
  return ['1', code, ...parts].join('-');
}

export class PhoneNumberOrderingComponent extends BaseComponent {
  // State machine
  private step: Step = 'search';

  // Search config
  private searchTypes: SearchType[] = ['area_code', 'zip', 'toll_free'];

  // Search state
  private searchType: SearchType = 'area_code';
  private searchValue: string = '';
  // The toll-free code to narrow to, '' for any. Kept apart from searchValue:
  // a local area code is never a valid toll-free one.
  private tollFreeCode: string = '';
  // The Contains field as typed, and the word the shown results were searched
  // for, which spells them.
  private tollFreeContains: string = '';
  private searchedContains: string = '';
  // The code last typed into Contains, and whether tollFreeCode came from it,
  // so it goes when that code is typed away.
  private typedTollFreeCode: string | undefined;
  private tollFreeCodeFromContains: boolean = false;
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

  // Billing-disclosure state, loaded when the component starts. Best-effort:
  // a failure leaves it null and the disclosure renders without a price rather
  // than blocking the order. It also decides whether toll-free search is
  // offered: the toll-free minute rate is present only when the account may
  // order toll-free numbers, so without it the tab stays hidden.
  private pricing: EffectivePricing | null = null;
  // False until the read settles, so the confirm step can hold space for the
  // disclosure instead of reflowing when it arrives.
  private billingContextLoaded = false;
  private pricingLoad: Promise<void> | null = null;

  // Order state
  private order: NumberOrder | null = null;
  private errorMessage: string = '';
  // The error screen serves both a failed search and a failed order; only the
  // latter is an "Order Failed".
  private errorKind: 'search' | 'order' = 'order';
  private pollTimer: ReturnType<typeof setTimeout> | null = null;
  private pollCount: number = 0;
  // Set once polling gives up on a still-pending order, so the complete step
  // can say so instead of looking like it is still checking.
  private pollGaveUp = false;

  // Override classes type
  protected override classes: PhoneNumberOrderingClasses = {};

  // Callbacks
  private _onOrderComplete?: (event: { orderId: string; order: NumberOrder }) => void;
  private _onOrderError?: (event: PhoneNumberOrderErrorEvent) => void;
  private _onOrderPending?: (event: PhoneNumberOrderPendingEvent) => void;

  protected initialize(): void {
    if (this.isInitialized) return;
    this.attachDelegatedClickHandler();
    this.render();
    this.isInitialized = true;
    void this.loadBillingContext();
  }

  /** The configured search types this account can use right now. */
  private visibleSearchTypes(): SearchType[] {
    const tollFree = this.pricing?.toll_free_minute_rate_decimal !== undefined;
    return this.searchTypes.filter((type) => type !== 'toll_free' || tollFree);
  }

  /**
   * The search type in effect. `searchType` keeps the configured preference
   * even while it is hidden, so a host's toll-free default comes back once
   * pricing shows the account can use it.
   */
  private activeSearchType(): SearchType | null {
    const visible = this.visibleSearchTypes();
    return visible.includes(this.searchType) ? this.searchType : (visible[0] ?? null);
  }

  // ============================================================================
  // Public Setters
  // ============================================================================

  override setClasses(classes: PhoneNumberOrderingClasses): void {
    const next = this.mergeIfChanged(this.classes, classes);
    if (!next) return;
    this.classes = next;
    if (this.isInitialized) {
      this.render();
    }
  }

  setOnOrderComplete(
    cb: ((event: { orderId: string; order: NumberOrder }) => void) | undefined
  ): void {
    this._onOrderComplete = cb;
  }

  setOnOrderError(cb: ((event: PhoneNumberOrderErrorEvent) => void) | undefined): void {
    this._onOrderError = cb;
  }

  setOnOrderPending(cb: ((event: PhoneNumberOrderPendingEvent) => void) | undefined): void {
    this._onOrderPending = cb;
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

  private renderVanitySpelling(num: AvailablePhoneNumber): string {
    const spelled = vanitySpelling(num.phone_number, this.searchedContains);
    return spelled ? `<span class="vanity-spelling">${this.escapeHtml(spelled)}</span>` : '';
  }

  /** The results' State column: a toll-free number has no state. */
  private numberRegion(num: AvailablePhoneNumber): string {
    if (num.number_type === 'toll_free') return this.t('phoneNumberOrdering.results.tollFree');
    return num.state ?? '';
  }

  // ============================================================================
  // Data Operations
  // ============================================================================

  private canSearch(): boolean {
    const type = this.activeSearchType();
    if (!type) return false;
    // A toll-free search needs no filter: "any code" is a valid search.
    if (type === 'toll_free') return this.canSearchTollFree();
    return this.searchValue.trim() !== '';
  }

  /** A toll-free search takes any code, and a Contains word only if valid. */
  private canSearchTollFree(): boolean {
    const { word } = parseTollFreeContains(this.tollFreeContains);
    return word === '' || CONTAINS_RE.test(word);
  }

  private async searchNumbers(): Promise<void> {
    if (!this.instance) return;

    this.isSearching = true;
    this.render();

    try {
      const options: SearchAvailableNumbersOptions = { quantity: this.quantity };
      const type = this.activeSearchType();
      if (type === 'toll_free') {
        options.numberType = 'toll_free';
        if (this.tollFreeCode) options.areaCode = this.tollFreeCode;
        const { word } = parseTollFreeContains(this.tollFreeContains);
        if (word) options.contains = word;
      } else if (type === 'zip') {
        options.zip = this.searchValue;
      } else {
        options.areaCode = this.searchValue;
      }

      this.availableNumbers = await this.instance.availablePhoneNumbers.search(options);
      this.searchedContains = options.contains ?? '';
      this.selectedNumbers = new Set();
      this.step = 'results';
    } catch (err) {
      // The host's load-error hook gets the API's own text for its logs; the
      // screen gets a translated one.
      this._onLoadError?.({
        error: err instanceof Error ? err.message : 'Search failed',
        elementTagName: 'dialstack-phone-number-ordering',
      });
      this.errorMessage = this.searchErrorMessage(err);
      this.errorKind = 'search';
      this.step = 'error';
    } finally {
      this.isSearching = false;
      this.render();
    }
  }

  /**
   * Keyed off the API's `code`, never its `error` text, which is English and
   * written for a log. A 400 without a known code is still a query the user
   * can change; anything else means search itself is unavailable.
   */
  private searchErrorMessage(err: unknown): string {
    if (!isApiError(err)) return this.t('phoneNumberOrdering.searchError.description');
    if (err.code === 'zip_not_available') {
      const zip = typeof err.details?.zip === 'string' ? err.details.zip : this.searchValue;
      return this.t('phoneNumberOrdering.searchError.zipNotAvailable', { zip });
    }
    // Reachable when the pricing leg that shows the tab is present only because
    // the account still holds a toll-free number.
    if (err.code === 'toll_free_not_enabled') {
      return this.t('phoneNumberOrdering.searchError.tollFreeNotEnabled');
    }
    if (err.code === 'search_unavailable' || err.status !== 400) {
      return this.t('phoneNumberOrdering.searchError.description');
    }
    return this.t('phoneNumberOrdering.searchError.invalid');
  }

  private async placeOrder(): Promise<void> {
    if (!this.instance || this.selectedNumbers.size === 0) return;

    this.step = 'ordering';
    this.render();

    let order: NumberOrder;
    try {
      order = await this.instance.phoneNumberOrders.create([...this.selectedNumbers]);
    } catch (err) {
      const apiErr = isApiError(err) ? err : undefined;
      const key =
        (apiErr?.code && ORDER_ERROR_KEY[apiErr.code]) || 'phoneNumberOrdering.error.generic';
      this.errorMessage = this.t(key);
      this.errorKind = 'order';
      this.step = 'error';
      this.render();
      this._onOrderError?.({
        error: this.errorMessage,
        message: err instanceof Error ? err.message : String(err),
        code: apiErr?.code,
        status: apiErr?.status,
        details: apiErr?.details,
      });
      return;
    }

    // The order exists from here on, so nothing below may report it as
    // failed: a throw can only come from a host callback.
    try {
      this.order = order;
      this.step = 'complete';
      this.render();

      if (order.status === 'failed') {
        this.showOrderFailed(order);
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
      console.error('DialStack: phone number ordering callback threw:', err);
    }
  }

  /** A placed order the carrier could not fulfill. */
  private showOrderFailed(order: NumberOrder): void {
    this.errorMessage = this.t('phoneNumberOrdering.error.description');
    this.errorKind = 'order';
    this.step = 'error';
    // Render first, so a host callback that throws cannot leave the screen
    // behind the state.
    this.render();
    this._onOrderError?.({
      error: this.errorMessage,
      message: order.error_message ?? undefined,
      order,
    });
  }

  /**
   * Polling has stopped short of a terminal status. The order is still with
   * the carrier and will finish on its own, so this is neither a completion
   * nor an error; the host hears about it so it can follow up by retrieving
   * the order later.
   */
  private stopPollingPending(order: NumberOrder): void {
    this.stopPolling();
    this.pollGaveUp = true;
    this.render();
    this._onOrderPending?.({ orderId: order.id, order });
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
    this.pollGaveUp = false;
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
      let order: NumberOrder;
      try {
        order = await this.instance!.phoneNumberOrders.retrieve(orderId);
      } catch {
        // A failed check says nothing about the order itself, so it is
        // reported as still pending, not as an error.
        if (this.order?.id === orderId) this.stopPollingPending(this.order);
        return;
      }
      // Stopping the timer cannot cancel a request already in flight. If the
      // user started over meanwhile, this answer is for an order they left.
      if (this.order?.id !== orderId) return;

      try {
        this.order = order;
        this.render();

        if (order.status === 'failed') {
          this.stopPolling();
          this.showOrderFailed(order);
        } else if (order.status !== 'pending') {
          this.stopPolling();
          // Routing already fired when the order was placed (placeOrder) —
          // polling only advances the UI status to its terminal state.
          this._onOrderComplete?.({ orderId: order.id, order });
        } else if (this.pollCount < PhoneNumberOrderingComponent.POLL_MAX) {
          this.pollNext();
        } else {
          this.stopPollingPending(order);
        }
      } catch (err) {
        // Only a host callback can throw here. It says nothing about the
        // order, and the screen already shows the order's state.
        console.error('DialStack: phone number ordering callback threw:', err);
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
    void this.loadBillingContext();
  }

  /**
   * Loads the per-number rate the account is billed, for the confirm step.
   * Best-effort by design: the disclosure degrades to its no-price wording
   * rather than standing between the customer and their order.
   *
   * Whether the account bills at all needs no request. Mode follows the API key
   * prefix, and the instance already holds the publishable key it was built
   * with, so `livemode` answers it locally.
   */
  private loadBillingContext(): Promise<void> {
    // One read per mount, shared by the mount and the confirm step, which can
    // be reached before it settles.
    this.pricingLoad ??= this.fetchBillingContext();
    return this.pricingLoad;
  }

  private async fetchBillingContext(): Promise<void> {
    const instance = this.instance;
    if (!instance) return;
    const typesBefore = this.visibleSearchTypes().join();
    try {
      this.pricing = await instance.account.effectivePricing.retrieve();
    } catch {
      // Leaves pricing null; renderBillingImpact drops to its no-price wording.
    }
    this.billingContextLoaded = true;
    if (this.step === 'confirm') {
      this.render();
    } else if (this.step === 'search' && this.visibleSearchTypes().join() !== typesBefore) {
      // Only when a tab appeared: a full render takes focus from a half-typed
      // search, which is why switching tabs patches the DOM instead.
      this.render();
    }
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
    this.tollFreeCode = '';
    this.tollFreeContains = '';
    this.searchedContains = '';
    this.typedTollFreeCode = undefined;
    this.tollFreeCodeFromContains = false;
    this.quantity = 10;
    this.availableNumbers = [];
    this.selectedNumbers = new Set();
    this.routingTargets = [];
    this.selectedRoutingTarget = null;
    this.order = null;
    this.errorMessage = '';
    this.errorKind = 'order';
    this.pollGaveUp = false;
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
      error: this.errorKind === 'search' ? 0 : 4,
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
    const searchTypes = this.visibleSearchTypes();
    const active = this.activeSearchType();
    // A host that offers only toll-free search, on an account that cannot use
    // it, would otherwise get a form with no fields and a dead button.
    if (!active) {
      return `
      <div class="card ${this.classes.searchForm || ''}" part="search-form">
        <h2 class="section-title">${this.t('phoneNumberOrdering.search.title')}</h2>
        <p class="section-subtitle">${this.t('phoneNumberOrdering.search.noSearchTypes')}</p>
      </div>`;
    }
    const segmentBtn = (type: SearchType, label: string) =>
      searchTypes.includes(type)
        ? `<button class="segment-btn ${active === type ? 'active' : ''}" data-action="set-search-type" data-type="${type}">${label}</button>`
        : '';

    const hidden = (type: SearchType) => (active === type ? '' : 'search-fields-hidden');

    return `
      <div class="card ${this.classes.searchForm || ''}" part="search-form">
        <h2 class="section-title">${this.t('phoneNumberOrdering.search.title')}</h2>
        <p class="section-subtitle">${this.t('phoneNumberOrdering.search.subtitle')}</p>

        <div class="segmented-control" role="radiogroup" aria-label="${this.t('phoneNumberOrdering.search.searchType')}">
          ${segmentBtn('area_code', this.t('phoneNumberOrdering.search.areaCode'))}
          ${segmentBtn('zip', this.t('phoneNumberOrdering.search.zip'))}
          ${segmentBtn('toll_free', this.t('phoneNumberOrdering.search.tollFree'))}
        </div>

        <div class="search-fields-stack">
          ${searchTypes
            .map((type) => {
              if (type === 'area_code')
                return `
              <div class="${hidden('area_code')}" data-panel="area_code">
                <div class="form-group">
                  <label class="form-label">${this.t('phoneNumberOrdering.search.areaCodeLabel')}</label>
                  <input class="form-input" type="text" id="search-area-code"
                    placeholder="${this.t('phoneNumberOrdering.search.areaCodePlaceholder')}"
                    value="${active === 'area_code' ? this.escapeHtml(this.searchValue) : ''}"
                    data-field="value" />
                </div>
              </div>`;
              if (type === 'zip')
                return `
              <div class="${hidden('zip')}" data-panel="zip">
                <div class="form-group">
                  <label class="form-label">${this.t('phoneNumberOrdering.search.zipLabel')}</label>
                  <input class="form-input" type="text" id="search-zip"
                    placeholder="${this.t('phoneNumberOrdering.search.zipPlaceholder')}"
                    value="${active === 'zip' ? this.escapeHtml(this.searchValue) : ''}"
                    data-field="value" />
                </div>
              </div>`;
              if (type === 'toll_free')
                return `
              <div class="${hidden('toll_free')}" data-panel="toll_free">
                <div class="toll-free-row">
                <div class="form-group">
                  <label class="form-label" for="search-toll-free">${this.t('phoneNumberOrdering.search.tollFreeLabel')}</label>
                  <select class="form-input" id="search-toll-free">
                    <option value="" ${this.tollFreeCode === '' ? 'selected' : ''}>${this.t('phoneNumberOrdering.search.tollFreeAny')}</option>
                    ${TOLL_FREE_AREA_CODES.map(
                      (code) =>
                        `<option value="${code}" ${this.tollFreeCode === code ? 'selected' : ''}>${code}</option>`
                    ).join('')}
                  </select>
                </div>
                <div class="form-group">
                  <label class="form-label" for="search-toll-free-contains">${this.t('phoneNumberOrdering.search.tollFreeContainsLabel')}</label>
                  <input class="form-input" type="text" id="search-toll-free-contains"
                    placeholder="${this.t('phoneNumberOrdering.search.tollFreeContainsPlaceholder')}"
                    value="${this.escapeHtml(this.tollFreeContains)}"
                    aria-describedby="search-toll-free-contains-error"
                    aria-invalid="${containsCannotBecomeValid(this.tollFreeContains)}" />
                </div>
                </div>
                <div class="field-error" id="search-toll-free-contains-error"
                  ${containsCannotBecomeValid(this.tollFreeContains) ? '' : 'hidden'}>${this.t('phoneNumberOrdering.search.tollFreeContainsInvalid')}</div>
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
          <div class="empty-state">${
            this.searchedContains
              ? this.t('phoneNumberOrdering.results.noVanityResults', {
                  word: this.escapeHtml(this.searchedContains),
                })
              : this.t('phoneNumberOrdering.results.noResults')
          }</div>
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
            <td class="phone-number-cell">${this.formatPhone(num.phone_number)}${this.renderVanitySpelling(num)}</td>
            <td>${this.escapeHtml(this.numberRegion(num))}</td>
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
          <span class="confirm-phone">${this.formatPhone(num.phone_number)}${this.renderVanitySpelling(num)}</span>
          <span class="confirm-state">${this.escapeHtml(this.numberRegion(num))}</span>
        </div>
      `
      )
      .join('');

    return `
      <div class="card ${this.classes.confirmPanel || ''}" part="confirm">
        <h2 class="section-title">${this.t('phoneNumberOrdering.confirm.title')}</h2>
        <p class="section-subtitle">${this.t(selected.length === 1 ? 'phoneNumberOrdering.confirm.subtitleOne' : 'phoneNumberOrdering.confirm.subtitleOther', { count: selected.length })}</p>

        <div class="confirm-list">${items}</div>

        ${this.renderBillingImpact(
          selected.length,
          selected.some((n) => n.number_type === 'toll_free')
        )}

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

  /**
   * What ordering these numbers does to the account's bill, stated before the
   * order is placed. Three shapes, in order of how much we can honestly say:
   * nothing bills at all (sandbox/demo), a real agreed rate (quote it), or an
   * unset rate (name the billable status without inventing a price, because the rate
   * columns store "never agreed" as 0, and the billing run silently falls back
   * to a catalog default we must not present as the customer's price).
   *
   * The rate quoted is the one in force. A scheduled change, when the account
   * has one, is deliberately not mentioned here: a second future price at the
   * moment of ordering is noise rather than disclosure.
   *
   * The figure is the full monthly rate. A number added part-way through a
   * month is charged only for its in-service days, so the monthly total is the
   * larger figure whenever the rate is stable. A scheduled rate *decrease* is
   * the exception, since the higher rate still in force can prorate above the
   * lower one quoted here, so the copy does not promise otherwise.
   */
  private renderBillingImpact(count: number, hasTollFree: boolean): string {
    if (count === 0) return '';

    const key = (name: string) => `phoneNumberOrdering.confirm.billing.${name}`;
    const line = (headline: string | null, detail: string) => `
      <div class="billing-impact" part="billing-impact" role="note" aria-label="${this.t(key('label'))}">
        <span class="billing-impact-icon" aria-hidden="true">${RECEIPT_SVG}</span>
        <div>
          ${headline ? `<div class="billing-impact-headline">${headline}</div>` : ''}
          <div class="billing-impact-detail">${detail}</div>
        </div>
      </div>
    `;

    // A sandbox or demo account never bills. Known locally from the key prefix,
    // so this branch needs no request and cannot be wrong about a live account.
    if (!this.instance?.livemode) {
      return line(null, this.t(key('notBilled')));
    }

    // While the read is in flight the block is rendered empty rather than
    // omitted, so the disclosure cannot pop in under the cursor of someone
    // already reaching for Continue. Once it settles, a failure collapses it.
    if (!this.billingContextLoaded) {
      return `<div class="billing-impact billing-impact-loading" part="billing-impact" aria-hidden="true"></div>`;
    }

    // A toll-free number also bills its inbound minutes. The rate is not in
    // the pricing this component can read, so the disclosure names the charge
    // without quoting it; it stands even when the monthly price is unknown.
    const tollFree = hasTollFree ? this.t(key('tollFreeMinutes')) : '';

    // The effective rate, not the agreed schedule: after a mid-month change the
    // agreed rate is next month's rather than what is billed.
    const rate = this.pricing?.per_did_rate ?? 0;
    if (rate <= 0) {
      if (this.pricing) {
        return line(null, [this.t(key('noPrice'), { count }), tollFree].filter(Boolean).join(' '));
      }
      return tollFree ? line(null, tollFree) : '';
    }

    return line(
      this.t(key('headline'), { amount: this.formatRate(rate * count) }),
      [
        this.t(key('detail'), { count, rate: this.formatRate(rate) }),
        tollFree,
        this.t(key('timing')),
        this.t(key('taxesAndFees')),
      ]
        .filter(Boolean)
        .join(' ')
    );
  }

  /** Formats integer cents as a USD amount in the component's number locale. */
  private formatRate(cents: number): string {
    return new Intl.NumberFormat(this.formatting.dateLocale ?? 'en-US', {
      style: 'currency',
      currency: 'USD',
    }).format(cents / 100);
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

    const statusSuffixMap: Record<string, string> = {
      complete: 'Complete',
      partial: 'Partial',
    };
    const statusSuffix = statusSuffixMap[status] || 'Pending';
    const plural = this.selectedNumbers.size === 1 ? 'One' : 'Other';
    const titleKey = `phoneNumberOrdering.complete.title${statusSuffix}${plural}`;
    const descKey = `phoneNumberOrdering.complete.description${statusSuffix}${plural}`;

    let pollingIndicator = '';
    if (status === 'pending' && this.pollGaveUp) {
      pollingIndicator = `<div class="center-hint">${this.t('phoneNumberOrdering.complete.stillProcessing')}</div>`;
    } else if (status === 'pending' && this.pollTimer !== null) {
      pollingIndicator = `<div class="center-detail" style="opacity:0.7;font-size:var(--ds-font-size-small)">${this.t('phoneNumberOrdering.complete.checking')}</div>`;
    }

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
          <div class="center-title">${this.t(this.errorKind === 'search' ? 'phoneNumberOrdering.searchError.title' : 'phoneNumberOrdering.error.title')}</div>
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
      const typeIndex = this.visibleSearchTypes().indexOf(newType);
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
        if (type && type !== this.activeSearchType()) {
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
    bindInput('search-toll-free', (v) => {
      this.tollFreeCode = v;
      this.tollFreeCodeFromContains = false;
    });
    bindInput('search-toll-free-contains', (v) => {
      this.tollFreeContains = v;
      const invalid = containsCannotBecomeValid(v);
      this.shadowRoot!.getElementById('search-toll-free-contains')?.setAttribute(
        'aria-invalid',
        String(invalid)
      );
      this.shadowRoot!.getElementById('search-toll-free-contains-error')?.toggleAttribute(
        'hidden',
        !invalid
      );
      // A code typed with the word ("800-FLOWERS") selects that code, and
      // typing it away puts the select back on any code. Only a change to the
      // typed code does: a code picked since then survives editing the word.
      const { code } = parseTollFreeContains(v);
      if (code === this.typedTollFreeCode) return;
      this.typedTollFreeCode = code;
      if (!code && !this.tollFreeCodeFromContains) return;
      this.tollFreeCode = code ?? '';
      this.tollFreeCodeFromContains = code !== undefined;
      const select = this.shadowRoot!.getElementById(
        'search-toll-free'
      ) as HTMLSelectElement | null;
      if (select) select.value = this.tollFreeCode;
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
