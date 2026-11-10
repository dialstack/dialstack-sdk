/**
 * CallLogs Web Component
 */

import { parsePhoneNumber, type CountryCode, type PhoneNumber } from 'libphonenumber-js';
import { BaseComponent } from './base-component';
import { tableStyles, paginationStyles } from './shared-styles';
import type {
  CallListParams,
  CallLog,
  CallLogDatePreset,
  CallLogDisplayOptions,
  CallLogFilters,
  CallLogRowRenderer,
  CallLogsClasses,
  CallStatus,
  RangeFilter,
  SentimentFilters,
  SentimentLabel,
} from '../types';
import {
  SENTIMENT_LABEL_KEYS,
  SENTIMENT_RANGE_KEYS,
  countSentimentConditions,
  pickSentimentFilters,
  sameSentimentFilters,
} from '../utils/call-filters';

const SEARCH_INPUT_ID = 'ds-call-logs-search';

// Each settled search is a server round-trip, and a selective one can be the
// most expensive read the list endpoint serves, so wait for typing to pause.
const SEARCH_DEBOUNCE_MS = 300;

const DATE_PRESET_DAYS: Record<'7d' | '30d' | '90d', number> = { '7d': 7, '30d': 30, '90d': 90 };

const DIRECTIONS = ['inbound', 'outbound', 'internal'] as const;
function statusList(status: CallLogFilters['status']): string[] {
  return (Array.isArray(status) ? status : status ? [status] : []).slice().sort();
}

function sameStatuses(a: CallLogFilters['status'], b: CallLogFilters['status']): boolean {
  return statusList(a).join(',') === statusList(b).join(',');
}

const STATUSES = ['completed', 'no-answer', 'busy', 'failed', 'voicemail'] as const;
/** The status select's value for a host-preset set of several statuses. */
const MULTIPLE_STATUSES = '__several';

// The API's quality tiers, so a call the quality summary counts as poor is the
// one this badge marks poor.
const MOS_GOOD = 4.0;
const MOS_FAIR = 3.5;

const SENTIMENT_LABELS = ['positive', 'neutral', 'negative'] as const;

/**
 * One section of the sentiment panel per side of the reading. The panel edits
 * inclusive bounds only; `gt`/`lt` remain available to hosts and integrators.
 */
const SENTIMENT_SIDES = [
  {
    side: 'overall',
    label: 'sentiment',
    score: 'sentiment_score',
    magnitude: 'sentiment_magnitude',
  },
  {
    side: 'local',
    label: 'local_sentiment',
    score: 'local_sentiment_score',
    magnitude: 'local_sentiment_magnitude',
  },
  {
    side: 'remote',
    label: 'remote_sentiment',
    score: 'remote_sentiment_score',
    magnitude: 'remote_sentiment_magnitude',
  },
] as const satisfies ReadonlyArray<{
  side: string;
  label: keyof SentimentFilters;
  score: keyof SentimentFilters;
  magnitude: keyof SentimentFilters;
}>;

const SCORE_BOUNDS = { min: -1, max: 1 };
const MAGNITUDE_BOUNDS = { min: 0, max: 1 };

const SENTIMENT_BUTTON_ID = 'filter-sentiment';
const SENTIMENT_PANEL_ID = 'sentiment-panel';
const DATE_BUTTON_ID = 'filter-date';
const DATE_PANEL_ID = 'date-panel';
const DATE_PRESETS: Exclude<CallLogDatePreset, 'custom'>[] = ['7d', '30d', '90d', 'all'];

/** `YYYY-MM-DD` of a timestamp in the viewer's time zone, as a date input wants it. */
function localDay(iso: string | undefined): string {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

/** Draft panel values, keyed by input id, as typed. */
type SentimentDraft = Record<string, string>;

/**
 * Where an entry sits in its conversation. `none` is a conversation of one
 * entry, which is the overwhelming majority and carries no grouping mark.
 *
 * These are positions in a sequence, not depths in a tree. Every entry of a
 * conversation is a peer covering its own stretch of it.
 */
type GroupPosition = 'none' | 'start' | 'middle' | 'end';

/**
 * Date range filter
 */
export interface DateRange {
  start?: string;
  end?: string;
}

/**
 * CallLogs component displays call history in a table format
 */
export class CallLogsComponent extends BaseComponent {
  // The range in force, and the last one the host set. They differ once the
  // user picks a preset; Clear filters returns to the host's.
  private dateRange?: DateRange;
  private hostDateRange?: DateRange;
  private limit: number = 10;

  private filters: CallLogFilters = {};
  // What the search field shows, ahead of the debounced filters.search.
  private searchText: string = '';
  private searchDebounce: ReturnType<typeof setTimeout> | null = null;
  // The sentiment panel edits a draft; nothing reloads until Apply.
  private sentimentOpen: boolean = false;
  private dateOpen: boolean = false;
  private dateDraft: { from: string; to: string } = { from: '', to: '' };
  private dateError: string | null = null;
  private sentimentDraft: SentimentDraft = {};
  private sentimentError: string | null = null;
  // Kept across re-renders, which rebuild the <details>.
  private sentimentAdvancedOpen: boolean = false;
  // Responses can land out of order while filters change under them; only the
  // latest request may update the table.
  private requestSeq: number = 0;

  private isLoading: boolean = false;
  private isPaginating: boolean = false;
  private error: string | null = null;
  private callLogs: CallLog[] = [];

  // URL-based pagination state
  private nextPageUrl: string | null = null;
  private previousPageUrl: string | null = null;

  // Track total and position for pagination display
  private currentOffset: number = 0; // Estimated position in result set

  // Display options
  private displayOptions: Required<CallLogDisplayOptions> = {
    showDate: true,
    showDirection: true,
    showFrom: true,
    showTo: true,
    showDuration: true,
    showStatus: true,
    showQuality: true,
    showSentiment: true,
    showFilters: true,
  };

  // Custom row renderer
  private customRowRenderer?: CallLogRowRenderer;

  // Override classes type for component-specific classes
  protected override classes: CallLogsClasses = {};

  // Callbacks
  private _onRowClick?: (event: { callId: string; call: CallLog }) => void;
  private _onFiltersChange?: (filters: CallLogFilters) => void;

  protected initialize(): void {
    if (this.isInitialized) return;
    this.render();
    this.loadData();
    this.isInitialized = true;
  }

  // ============================================================================
  // Callback Setters
  // ============================================================================

  /**
   * Set callback for row click events
   */
  setOnRowClick(callback: ((event: { callId: string; call: CallLog }) => void) | undefined): void {
    this._onRowClick = callback;
  }

  /**
   * Set callback fired when the user changes a toolbar filter
   */
  setOnFiltersChange(callback: ((filters: CallLogFilters) => void) | undefined): void {
    this._onFiltersChange = callback;
  }

  /**
   * Set display options (partial override)
   */
  setDisplayOptions(options: CallLogDisplayOptions): void {
    const defaultPreset = this.defaultDatePreset();
    const next = this.mergeIfChanged(this.displayOptions, options);
    if (!next) return;
    this.displayOptions = next;
    if (!this.isInitialized) return;
    // Hiding the toolbar moves the default window to all time, which changes
    // the query when the window in force is that default.
    const followsDefault = !this.filters.datePreset && !this.dateRange;
    if (followsDefault && this.defaultDatePreset() !== defaultPreset) {
      this.loadData();
    } else {
      this.render();
    }
  }

  /**
   * Set custom row renderer for call log rows
   */
  setCustomRowRenderer(renderer: CallLogRowRenderer | undefined): void {
    this.customRowRenderer = renderer;
    if (this.isInitialized) {
      this.render();
    }
  }

  /**
   * Set custom CSS classes for styling integration
   */
  override setClasses(classes: CallLogsClasses): void {
    const next = this.mergeIfChanged(this.classes, classes);
    if (!next) return;
    this.classes = next;
    if (this.isInitialized) {
      this.render();
    }
  }

  // ============================================================================
  // Data Loading
  // ============================================================================

  /**
   * Load call logs from API (initial load - resets pagination)
   */
  private async loadData(): Promise<void> {
    if (!this.instance) {
      this.error = this.t('common.error');
      this.render();
      return;
    }

    // Reset pagination state
    this.nextPageUrl = null;
    this.previousPageUrl = null;
    this.currentOffset = 0;

    const seq = ++this.requestSeq;
    // A table already on screen stays there, dimmed, while a filter change
    // reloads it, as it does between pages. Swapping it for the spinner and
    // back on every settled keystroke made the whole list flicker.
    if (this.callLogs.length > 0 && !this.error) {
      this.isPaginating = true;
      this.updatePaginationState();
    } else {
      this.isLoading = true;
      this.error = null;
      this.render();
    }

    try {
      // One request per page, deliberately. This used to issue a second
      // limit=100 request first, whose only product was a total for the
      // "1-10 of N" label -- and an unfiltered call list is the most expensive
      // read in the API, so that label cost a full extra scan of the account's
      // call history on every page load. There is no count endpoint to use
      // instead: any exact total has to aggregate the whole history, which is
      // the cost we are avoiding. The label shows the range without a total.
      const pageData = await this.instance.calls.list(this.listParams());
      if (seq !== this.requestSeq) return;
      this.callLogs = pageData.data || [];
      this.nextPageUrl = pageData.next_page_url;
      this.previousPageUrl = pageData.previous_page_url;

      this.error = null;
    } catch (err) {
      if (seq !== this.requestSeq) return;
      const errorMessage = err instanceof Error ? err.message : this.t('callLogs.loading');
      this.error = errorMessage;
      this._onLoadError?.({ error: errorMessage, elementTagName: 'dialstack-call-logs' });
      this.callLogs = [];
      this.nextPageUrl = null;
      this.previousPageUrl = null;
    } finally {
      if (seq === this.requestSeq) {
        this.isLoading = false;
        this.isPaginating = false;
        this.render();
      }
    }
  }

  /**
   * Load a specific page using URL
   */
  private async loadPage(pageUrl: string): Promise<void> {
    if (!this.instance) {
      this.error = this.t('common.error');
      this.render();
      return;
    }

    this._onLoaderStart?.({ elementTagName: 'dialstack-call-logs' });

    const seq = ++this.requestSeq;

    // Show pagination loading state
    this.isPaginating = true;
    this.updatePaginationState();

    try {
      // Only the page token is taken from the URL. The filters it also carries
      // are the ones in force, since any change to them restarts at page one.
      const page = new URL(pageUrl, 'https://api.invalid').searchParams.get('page') ?? undefined;
      const data = await this.instance.calls.list({ ...this.listParams(), page });
      if (seq !== this.requestSeq) return;

      this.callLogs = data.data || [];
      this.nextPageUrl = data.next_page_url;
      this.previousPageUrl = data.previous_page_url;

      this.error = null;
    } catch (err) {
      if (seq !== this.requestSeq) return;
      const errorMessage = err instanceof Error ? err.message : this.t('callLogs.loading');
      this.error = errorMessage;
      this._onLoadError?.({ error: errorMessage, elementTagName: 'dialstack-call-logs' });
      this.callLogs = [];
      this.nextPageUrl = null;
      this.previousPageUrl = null;
    } finally {
      if (seq === this.requestSeq) {
        this.isPaginating = false;
        this.render();
      }
    }
  }

  private listParams(): CallListParams {
    const { fromDate, toDate } = this.dateBounds();
    return {
      limit: this.limit,
      expand: ['did'],
      search: this.filters.search,
      direction: this.filters.direction,
      status: this.filters.status,
      remote_number: this.filters.remote_number,
      connected: this.filters.connected,
      from_date: fromDate,
      to_date: toDate,
      ...pickSentimentFilters(this.filters),
    };
  }

  /**
   * Update pagination UI state without full re-render (for loading indicator)
   */
  private updatePaginationState(): void {
    if (!this.shadowRoot) return;

    const container = this.shadowRoot.querySelector('.container');
    if (container) {
      container.classList.toggle('is-paginating', this.isPaginating);
    }

    // Disable pagination buttons while loading
    const prevBtn = this.shadowRoot.getElementById('prev-btn') as HTMLButtonElement;
    const nextBtn = this.shadowRoot.getElementById('next-btn') as HTMLButtonElement;

    if (prevBtn) prevBtn.disabled = true;
    if (nextBtn) nextBtn.disabled = true;
  }

  // ============================================================================
  // Filters
  // ============================================================================

  /**
   * The date window in force. A host-set range wins; otherwise the toolbar's
   * preset, which defaults to 30 days because a search that matches few calls
   * over an account's whole history is the slowest read the list serves. With
   * the toolbar hidden nothing could widen it, so the default stays all time.
   */
  private effectiveDatePreset(): CallLogDatePreset {
    if (this.dateRange?.start || this.dateRange?.end) return 'custom';
    return this.filters.datePreset ?? this.defaultDatePreset();
  }

  private dateBounds(): { fromDate?: string; toDate?: string } {
    const preset = this.effectiveDatePreset();
    if (preset === 'custom')
      return { fromDate: this.dateRange?.start, toDate: this.dateRange?.end };
    if (preset === 'all') return {};
    const from = new Date(Date.now() - DATE_PRESET_DAYS[preset] * 24 * 60 * 60 * 1000);
    return { fromDate: from.toISOString() };
  }

  private defaultDatePreset(): CallLogDatePreset {
    return this.displayOptions.showFilters ? '30d' : 'all';
  }

  /**
   * Anything Clear filters would undo. A host-set range is the baseline it
   * returns to, not a filter. Without one, an all-time pick is not either:
   * clearing it would only narrow an empty list.
   */
  private hasActiveFilters(): boolean {
    const { search, direction, status, datePreset, dateRange, remote_number, connected } =
      this.filters;
    const dateActive =
      datePreset !== undefined &&
      (this.hostDateRange !== undefined ||
        (datePreset !== this.defaultDatePreset() && datePreset !== 'all'));
    return Boolean(
      search ||
      direction ||
      status ||
      remote_number ||
      connected !== undefined ||
      dateActive ||
      dateRange !== undefined ||
      countSentimentConditions(this.filters) > 0
    );
  }

  /**
   * Apply a toolbar change: reload from the first page and tell the host.
   */
  private applyFilters(patch: CallLogFilters): void {
    this.filters = { ...this.filters, ...patch };
    // A preset and a custom range replace each other, and either replaces a
    // host-set range.
    if (patch.datePreset) {
      this.dateRange = undefined;
      delete this.filters.dateRange;
    }
    if (patch.dateRange) {
      this.dateRange = patch.dateRange;
      delete this.filters.datePreset;
    }
    this._onFiltersChange?.({ ...this.filters });
    this.loadData();
  }

  private clearFilters(): void {
    this.cancelSearchDebounce();
    this.closeSentimentPanel();
    this.closeDatePanel();
    this.filters = {};
    this.searchText = '';
    this.dateRange = this.hostDateRange;
    this._onFiltersChange?.({});
    this.loadData();
  }

  private cancelSearchDebounce(): void {
    if (this.searchDebounce) clearTimeout(this.searchDebounce);
    this.searchDebounce = null;
  }

  // ============================================================================
  // Sentiment panel
  // ============================================================================

  private openSentimentPanel(): void {
    if (this.dateOpen) this.closeDatePanel();
    this.sentimentDraft = this.draftFromFilters();
    this.sentimentError = null;
    this.sentimentOpen = true;
    // Ranges stay tucked away unless one is already set, so a host-preset
    // range is never hidden.
    this.sentimentAdvancedOpen = Object.entries(this.sentimentDraft).some(
      ([id, v]) => !id.endsWith('-label') && v !== ''
    );
    document.addEventListener('pointerdown', this.onDocumentPointerDown, true);
    this.render();
    const overall = this.sentimentDraft['sentiment-overall-label'] || 'any';
    this.shadowRoot?.getElementById(`sentiment-overall-label-${overall}`)?.focus();
  }

  private closeSentimentPanel(returnFocus = false): void {
    if (!this.sentimentOpen) return;
    this.sentimentOpen = false;
    this.sentimentError = null;
    document.removeEventListener('pointerdown', this.onDocumentPointerDown, true);
    this.render();
    if (returnFocus) this.shadowRoot?.getElementById(SENTIMENT_BUTTON_ID)?.focus();
  }

  // A press anywhere outside the panel and its button dismisses it, draft
  // discarded, as a native popover would.
  private onDocumentPointerDown = (e: Event): void => {
    const root = this.shadowRoot;
    if (!root) return;
    const path = e.composedPath();
    const inside = (...ids: string[]) =>
      ids.some((id) => {
        const el = root.getElementById(id);
        return !!el && path.includes(el);
      });
    // Dismissed by removing the panel alone, not by a render: this runs on
    // pointerdown, and replacing the toolbar and table here would take the
    // control under the pointer away before its click, so a press on a select
    // or a call row would do nothing.
    if (this.sentimentOpen && !inside(SENTIMENT_PANEL_ID, SENTIMENT_BUTTON_ID)) {
      this.sentimentOpen = false;
      this.sentimentError = null;
      this.dismissPanel(SENTIMENT_PANEL_ID, SENTIMENT_BUTTON_ID);
    }
    if (this.dateOpen && !inside(DATE_PANEL_ID, DATE_BUTTON_ID)) {
      this.dateOpen = false;
      this.dateError = null;
      this.dismissPanel(DATE_PANEL_ID, DATE_BUTTON_ID);
    }
    if (!this.sentimentOpen && !this.dateOpen) {
      document.removeEventListener('pointerdown', this.onDocumentPointerDown, true);
    }
  };

  private dismissPanel(panelId: string, buttonId: string): void {
    const root = this.shadowRoot;
    root?.getElementById(panelId)?.remove();
    root?.getElementById(buttonId)?.setAttribute('aria-expanded', 'false');
  }

  // ============================================================================
  // Date panel
  // ============================================================================

  private openDatePanel(): void {
    if (this.sentimentOpen) this.closeSentimentPanel();
    const range = this.effectiveDatePreset() === 'custom' ? this.dateRange : undefined;
    this.dateDraft = { from: localDay(range?.start), to: localDay(range?.end) };
    this.dateError = null;
    this.dateOpen = true;
    document.addEventListener('pointerdown', this.onDocumentPointerDown, true);
    this.render();
    this.shadowRoot?.querySelector<HTMLElement>(`#${DATE_PANEL_ID} [aria-checked="true"]`)?.focus();
  }

  private closeDatePanel(returnFocus = false): void {
    if (!this.dateOpen) return;
    this.dateOpen = false;
    this.dateError = null;
    if (!this.sentimentOpen) {
      document.removeEventListener('pointerdown', this.onDocumentPointerDown, true);
    }
    this.render();
    if (returnFocus) this.shadowRoot?.getElementById(DATE_BUTTON_ID)?.focus();
  }

  private pickDatePreset(preset: Exclude<CallLogDatePreset, 'custom'>): void {
    this.dateOpen = false;
    this.dateError = null;
    document.removeEventListener('pointerdown', this.onDocumentPointerDown, true);
    this.applyFilters({ datePreset: preset, dateRange: undefined });
    this.shadowRoot?.getElementById(DATE_BUTTON_ID)?.focus();
  }

  /** Whole days in the viewer's time zone: the start of the first, the end of the last. */
  private applyDateRange(): void {
    const { from, to } = this.dateDraft;
    this.dateError = null;
    if (!from && !to) {
      this.dateError = this.t('callLogs.filters.datePanel.empty');
    } else if (from && to && from > to) {
      this.dateError = this.t('callLogs.filters.datePanel.invalid');
    }
    if (this.dateError) {
      this.render();
      this.shadowRoot?.getElementById('date-apply')?.focus();
      return;
    }
    const range: { start?: string; end?: string } = {};
    if (from) range.start = new Date(`${from}T00:00:00`).toISOString();
    if (to) range.end = new Date(`${to}T23:59:59.999`).toISOString();
    this.dateOpen = false;
    document.removeEventListener('pointerdown', this.onDocumentPointerDown, true);
    this.applyFilters({ datePreset: undefined, dateRange: range });
    this.shadowRoot?.getElementById(DATE_BUTTON_ID)?.focus();
  }

  /** What the date button says: the preset's name, or the custom days. */
  private dateButtonLabel(): string {
    const preset = this.effectiveDatePreset();
    if (preset !== 'custom') return this.t(`callLogs.filters.dates.${preset}`);
    const fmt = new Intl.DateTimeFormat(this.formatting.dateLocale || 'en-US', {
      month: 'short',
      day: 'numeric',
    });
    const start = this.dateRange?.start ? fmt.format(new Date(this.dateRange.start)) : '';
    const end = this.dateRange?.end ? fmt.format(new Date(this.dateRange.end)) : '';
    if (start && end) return start === end ? start : `${start} – ${end}`;
    if (start) return this.t('callLogs.filters.datePanel.rangeFrom', { date: start });
    if (end) return this.t('callLogs.filters.datePanel.rangeUntil', { date: end });
    return this.t('callLogs.filters.dates.custom');
  }

  private draftFromFilters(): SentimentDraft {
    const draft: SentimentDraft = {};
    const fmt = (n: number | undefined) => (typeof n === 'number' ? String(n) : '');
    for (const s of SENTIMENT_SIDES) {
      draft[`sentiment-${s.side}-label`] = this.filters[s.label] ?? '';
      for (const field of ['score', 'magnitude'] as const) {
        const range = this.filters[s[field]] as RangeFilter | undefined;
        // An exclusive bound a host set shows as its inclusive neighbour; it is
        // only rewritten if the user applies the panel.
        draft[`sentiment-${s.side}-${field}-min`] = fmt(range?.gte ?? range?.gt);
        draft[`sentiment-${s.side}-${field}-max`] = fmt(range?.lte ?? range?.lt);
      }
    }
    return draft;
  }

  /**
   * The draft as filters, or an error message when a bound is out of range or
   * a minimum exceeds its maximum.
   */
  private filtersFromDraft(): { filters: SentimentFilters } | { error: string } {
    const filters: SentimentFilters = {};
    const parse = (id: string): number | undefined | null => {
      const raw = (this.sentimentDraft[id] ?? '').trim();
      if (raw === '') return undefined;
      const n = Number(raw);
      return Number.isFinite(n) ? n : null;
    };
    for (const s of SENTIMENT_SIDES) {
      const label = this.sentimentDraft[`sentiment-${s.side}-label`];
      if (label) filters[s.label] = label as SentimentLabel;
      for (const field of ['score', 'magnitude'] as const) {
        const bounds = field === 'score' ? SCORE_BOUNDS : MAGNITUDE_BOUNDS;
        const min = parse(`sentiment-${s.side}-${field}-min`);
        const max = parse(`sentiment-${s.side}-${field}-max`);
        const outside = (v: number | undefined) =>
          v !== undefined && (v < bounds.min || v > bounds.max);
        if (min === null || max === null || outside(min) || outside(max)) {
          return { error: this.t('callLogs.filters.sentiment.outOfBounds') };
        }
        if (min !== undefined && max !== undefined && min > max) {
          return { error: this.t('callLogs.filters.sentiment.invalidRange') };
        }
        if (min === undefined && max === undefined) continue;
        const range: RangeFilter = {};
        if (min !== undefined) range.gte = min;
        if (max !== undefined) range.lte = max;
        filters[s[field]] = range;
      }
    }
    return { filters };
  }

  /** Every sentiment key, unset unless the panel set it, so Apply replaces them all. */
  private sentimentPatch(next: SentimentFilters): CallLogFilters {
    const patch: CallLogFilters = {};
    for (const key of SENTIMENT_LABEL_KEYS) patch[key] = next[key];
    for (const key of SENTIMENT_RANGE_KEYS) patch[key] = next[key];
    return patch;
  }

  private applySentimentPanel(): void {
    const result = this.filtersFromDraft();
    if ('error' in result) {
      this.sentimentError = result.error;
      this.render();
      this.shadowRoot?.getElementById('sentiment-apply')?.focus();
      return;
    }
    this.sentimentOpen = false;
    this.sentimentError = null;
    document.removeEventListener('pointerdown', this.onDocumentPointerDown, true);
    this.applyFilters(this.sentimentPatch(result.filters));
    this.shadowRoot?.getElementById(SENTIMENT_BUTTON_ID)?.focus();
  }

  private clearSentimentPanel(): void {
    this.sentimentOpen = false;
    this.sentimentError = null;
    document.removeEventListener('pointerdown', this.onDocumentPointerDown, true);
    if (countSentimentConditions(this.filters) > 0) {
      this.applyFilters(this.sentimentPatch({}));
    } else {
      this.render();
    }
    this.shadowRoot?.getElementById(SENTIMENT_BUTTON_ID)?.focus();
  }

  protected override cleanup(): void {
    document.removeEventListener('pointerdown', this.onDocumentPointerDown, true);
    this.sentimentOpen = false;
    this.dateOpen = false;
    // A debounce firing after removal would report a filter change for a list
    // that is gone; a host syncing filters to the URL would navigate back to it.
    this.cancelSearchDebounce();
    // Drops any response still in flight, so its loading flags would never
    // clear; start over instead, and a reattach reloads from scratch.
    this.requestSeq++;
    this.isLoading = false;
    this.isPaginating = false;
    this.isInitialized = false;
  }

  // ============================================================================
  // Formatting Helpers
  // ============================================================================

  /**
   * Format timestamp to localized date/time string
   */
  private formatDate(timestamp: string): string {
    try {
      const date = new Date(timestamp);
      const dateLocale = this.formatting.dateLocale || 'en-US';
      const use24Hour = this.formatting.use24HourTime ?? false;
      const showTimezone = this.formatting.showTimezone ?? true;

      const options: Intl.DateTimeFormatOptions = {
        month: 'short',
        day: 'numeric',
        year: 'numeric',
        hour: 'numeric',
        minute: '2-digit',
        hour12: !use24Hour,
      };

      if (showTimezone) {
        options.timeZoneName = 'short';
      }

      return date.toLocaleString(dateLocale, options);
    } catch {
      return timestamp;
    }
  }

  /**
   * Format duration in seconds to "Xm Ys" format
   */
  private formatDuration(seconds: number): string {
    if (seconds < 60) {
      return `${seconds}s`;
    }
    const minutes = Math.floor(seconds / 60);
    const remainingSeconds = seconds % 60;
    return remainingSeconds > 0 ? `${minutes}m ${remainingSeconds}s` : `${minutes}m`;
  }

  /**
   * Format phone number for display using libphonenumber-js
   */
  private formatPhoneNumber(phone: string): string {
    if (!phone) return '';

    // A feature code is not a phone number. libphonenumber discards the leading
    // "*" or "#" as a dialing prefix, so "*681" — the call park slot a call was
    // retrieved from — parses as +1681 and formats national as "681", which
    // reads as a real (and wrong) extension. Show these verbatim.
    if (/^[*#]/.test(phone)) return phone;

    try {
      const defaultCountry = (this.formatting.defaultCountry || 'US') as CountryCode;
      const parsed: PhoneNumber | undefined = parsePhoneNumber(phone, defaultCountry);
      if (parsed) {
        return parsed.formatNational();
      }
    } catch {
      // If parsing fails, return original
    }

    // Return original if parsing fails
    return phone;
  }

  /**
   * Whether a party's label is just the number again, in which case rendering
   * it would produce "(581) 702-7849 (+15817027849)".
   *
   * The API reports the caller name exactly as the carrier sent it, and some
   * carriers put the number in the display-name field — often in a different
   * format than the number itself, so a string comparison isn't enough. Compare
   * the parsed E.164 forms, falling back to digits-only when either side won't
   * parse (an extension, a malformed number).
   */
  private labelIsNumber(number: string, label: string): boolean {
    // Only a label that is *nothing but* a number can be a restatement of it.
    // This guard comes first because libphonenumber happily extracts digits out
    // of surrounding text: without it, "Marine (1002)" parses to the same number
    // as extension 1002 and the name would be stripped.
    if (!/^[+\d\s()./-]+$/.test(label)) return false;

    const defaultCountry = (this.formatting.defaultCountry || 'US') as CountryCode;
    try {
      const a = parsePhoneNumber(number, defaultCountry);
      const b = parsePhoneNumber(label, defaultCountry);
      if (a && b) return a.number === b.number;
    } catch {
      // Fall through to the digit comparison below.
    }

    const digits = (s: string) => s.replace(/\D/g, '');
    const numberDigits = digits(number);
    return numberDigits !== '' && numberDigits === digits(label);
  }

  /**
   * Format a call party (from/to) with optional label.
   * Extensions show as "106 (Front Desk)", external numbers get phone formatting.
   */
  private formatCallParty(number: string, label?: string | null): string {
    // The guards below come before the label: a label annotates a number, so
    // when the number itself is an identifier we can't show, there is nothing
    // for the label to annotate — and a clid-derived label makes these rows
    // reachable where an extension lookup never was.
    // Defensive: never render a raw internal identifier verbatim. A voicemail
    // MWI presentity (vm_user_/vm_svm_), a bare 32-char SIP auth username, or a
    // WebRTC AOR (user_<26>-wrtc) can reach the CDR unattributed on legacy rows;
    // a readable placeholder beats a raw ID. A real phone number or extension
    // never matches these shapes.
    // The ARI voicemail-access funnel stamps the fixed sentinel "Voicemail"
    // into cdr.to_number (see adoptVoicemailAccessWithResolvedTarget). Storing a
    // readable literal keeps older SDKs sane, but the current locale should win —
    // localize it here rather than let it fall through to formatPhoneNumber.
    if (/^vm_(user|svm)_/.test(number) || number === 'Voicemail')
      return this.t('callLogs.statuses.voicemail');
    if (/^[A-Za-z0-9]{32}$/.test(number) || /^user_[0-9a-z]{26}-wrtc$/.test(number)) return '—';

    // A labelled number is still a number: format it, so a row that gains a
    // CNAM name doesn't also lose its national formatting.
    const display = this.escapeHtml(this.formatPhoneNumber(number));
    if (label && !this.labelIsNumber(number, label))
      return `${display} (${this.escapeHtml(label)})`;
    return display;
  }

  /**
   * The DID's phone number, available only when the API returned the expanded
   * `did` object (expand[]=did). Undefined when `did` is just the id string or null.
   */
  private didPhoneNumber(call: CallLog): string | undefined {
    return call.did && typeof call.did === 'object' ? call.did.phone_number : undefined;
  }

  /**
   * Render one party cell (From or To), showing the account's DID when the
   * call's direction makes this cell the DID side.
   *
   * - When direction === didDirection and the DID is expanded, the DID is the
   *   primary line and the party moves to a secondary line labelled by labelKey.
   * - When direction === spacerDirection (the OTHER cell is the DID side), an
   *   empty secondary line keeps PSTN numbers vertically aligned.
   * - Otherwise (incl. internal calls, or no expanded DID), just the party.
   */
  private formatPartyCell(
    call: CallLog,
    number: string,
    label: string | null,
    didDirection: 'inbound' | 'outbound',
    spacerDirection: 'inbound' | 'outbound',
    labelKey: string
  ): string {
    const didPhoneNumber = this.didPhoneNumber(call);
    if (didPhoneNumber && call.direction === didDirection) {
      const did = this.formatPhoneNumber(didPhoneNumber);
      const party = this.formatCallParty(number, label);
      return `${did}<br><span class="cell-secondary">${this.t(labelKey)} ${party}</span>`;
    }
    if (didPhoneNumber && call.direction === spacerDirection) {
      return `${this.formatCallParty(number, label)}<br><span class="cell-secondary">&nbsp;</span>`;
    }
    return this.formatCallParty(number, label);
  }

  private formatFromCell(call: CallLog): string {
    return this.formatPartyCell(
      call,
      call.from_number,
      call.from_label,
      'outbound',
      'inbound',
      'callLogs.calledBy'
    );
  }

  private formatToCell(call: CallLog): string {
    return this.formatPartyCell(
      call,
      call.to_number ?? '',
      call.to_label,
      'inbound',
      'outbound',
      'callLogs.routedTo'
    );
  }

  /**
   * Get color class for call direction
   */
  private getDirectionClass(direction: string): string {
    switch (direction) {
      case 'inbound':
        return 'badge-inbound';
      case 'internal':
        return 'badge-internal';
      case 'outbound':
        return 'badge-outbound';
      default:
        return 'badge-default';
    }
  }

  /**
   * Get color class for call status
   */
  private getStatusClass(status: string | null): string {
    switch (status) {
      case 'completed':
        return 'badge-answered';
      case 'no-answer':
        return 'badge-no-answer';
      case 'busy':
      case 'failed':
        return 'badge-failed';
      case 'voicemail':
        return 'badge-voicemail';
      default:
        return 'badge-default';
    }
  }

  /**
   * The sides the sentiment filter has conditions on, in panel order. The
   * column shows these, so a list narrowed on the caller's side shows the
   * caller's side, not an overall reading that may disagree with it.
   */
  private filteredSentimentSides(): Array<(typeof SENTIMENT_SIDES)[number]['side']> {
    return SENTIMENT_SIDES.filter(
      (s) =>
        this.filters[s.label] !== undefined ||
        this.filters[s.score] !== undefined ||
        this.filters[s.magnitude] !== undefined
    ).map((s) => s.side);
  }

  /** "Sentiment" unfiltered or on several sides, "Remote sentiment" on one. */
  private sentimentHeader(): string {
    const sides = this.filteredSentimentSides();
    if (sides.length !== 1) return this.t('callLogs.columns.sentiment');
    return this.t('callLogs.columns.sentimentSide', {
      side: this.t(`callLogs.filters.sentiment.sides.${sides[0]}`),
    });
  }

  /**
   * The reading the list is filtered on: overall when unfiltered, else each
   * filtered side (prefixed with its name when there are several). The
   * tooltip always has all three.
   */
  private formatSentimentCell(call: CallLog): string {
    const s = call.sentiment;
    if (!s) {
      return `<span class="badge badge-sentiment-unavailable" part="badge badge-sentiment" title="${this.escapeHtml(this.t('callLogs.sentiment.unavailableTooltip'))}">${this.t('callLogs.sentiment.unavailable')}</span>`;
    }
    const label = (l: string) => this.t(`callLogs.filters.sentiment.labels.${l}`);
    const sideName = (side: string) => this.t(`callLogs.filters.sentiment.sides.${side}`);
    const reading = (side: string): string | undefined =>
      side === 'overall' ? s.overall : side === 'local' ? s.local?.sentiment : s.remote?.sentiment;
    const tooltip = (['overall', 'local', 'remote'] as const)
      .filter((side) => reading(side))
      .map((side) => `${sideName(side)}: ${label(reading(side) ?? '')}`)
      .join(', ');
    const filtered = this.filteredSentimentSides();
    const sides = filtered.length > 0 ? filtered : (['overall'] as const);
    const badges = sides.map((side) => {
      const value = reading(side);
      const text = value ? label(value) : this.t('callLogs.sentiment.unavailable');
      const prefix = sides.length > 1 ? `${sideName(side)}: ` : '';
      return `<span class="badge badge-sentiment-${value ?? 'unavailable'}" part="badge badge-sentiment">${this.escapeHtml(prefix + text)}</span>`;
    });
    return `<span class="sentiment-cell" title="${this.escapeHtml(tooltip)}">${badges.join('')}</span>`;
  }

  private getMosClass(mos: number | null | undefined): string {
    if (mos == null) return 'badge-quality-unavailable';
    if (mos >= MOS_GOOD) return 'badge-quality-good';
    if (mos >= MOS_FAIR) return 'badge-quality-fair';
    return 'badge-quality-poor';
  }

  /**
   * Get quality tooltip for MOS score
   */
  private getMosTooltip(mos: number | null | undefined): string {
    if (mos == null) return this.t('callLogs.quality.unavailableTooltip');
    if (mos >= MOS_GOOD) return this.t('callLogs.quality.good');
    if (mos >= MOS_FAIR) return this.t('callLogs.quality.fair');
    return this.t('callLogs.quality.poor');
  }

  /**
   * Format MOS value for display
   */
  private formatMos(mos: number | null | undefined): string {
    if (mos == null) return this.t('callLogs.quality.unavailable');
    return mos.toFixed(1);
  }

  /**
   * Get the worst (minimum) MOS score across all call legs.
   * Returns the minimum MOS to highlight the weakest link in call quality.
   */
  private getWorstMos(call: CallLog): number | null | undefined {
    if (!call.quality_metrics || call.quality_metrics.length === 0) {
      return undefined;
    }

    const mosValues = call.quality_metrics
      .map((m) => m.mos)
      .filter((mos): mos is number => mos != null);

    if (mosValues.length === 0) {
      return null;
    }

    return Math.min(...mosValues);
  }

  /**
   * Format direction for display using i18n
   */
  private formatDirection(direction: string): string {
    // Guard unknown/empty so an unattributed row shows a neutral dash rather
    // than the raw i18n key (e.g. "callLogs.directions."). Matches formatStatus.
    if (direction !== 'inbound' && direction !== 'outbound' && direction !== 'internal') {
      return '—';
    }
    return this.t(`callLogs.directions.${direction}`);
  }

  /**
   * Format status for display using i18n
   */
  private formatStatus(status: string | null): string {
    // Null status = a live (in-progress) call; the historical list is
    // CDR-backed so this is defensive.
    if (!status) {
      return '—';
    }
    const statusKey = status === 'no-answer' ? 'noAnswer' : status;
    return this.t(`callLogs.statuses.${statusKey}`);
  }

  /**
   * Get icon SVG by name
   */
  private getIcon(name: keyof typeof this.icons): string {
    return this.icons[name];
  }

  // ============================================================================
  // Rendering
  // ============================================================================

  /**
   * Render the component
   */
  protected render(): void {
    if (!this.shadowRoot) return;

    // Replacing the shadow DOM drops focus from the search field mid-type, so
    // capture focus and caret first and restore them after.
    const focused = this.shadowRoot.activeElement;
    const searchWasFocused = focused instanceof HTMLInputElement && focused.id === SEARCH_INPUT_ID;
    const caret = searchWasFocused ? focused.selectionStart : null;
    // Applying a panel returns focus to its button, and the reload that
    // follows must not drop it.
    const buttonToRefocus = [SENTIMENT_BUTTON_ID, DATE_BUTTON_ID].find((id) => focused?.id === id);

    const styles = this.applyAppearanceStyles();

    this.shadowRoot.innerHTML = `
      <style>
        ${styles}

        .container {
          background: var(--ds-color-background);
          color: var(--ds-color-text);
          font-size: var(--ds-font-size-base);
          line-height: var(--ds-line-height);
        }


        .loading,
        .error,
        .empty {
          padding: var(--ds-spacing-xl);
          text-align: center;
          background: var(--ds-color-surface-subtle);
          border-radius: var(--ds-border-radius);
        }

        .error {
          background: color-mix(in srgb, var(--ds-color-danger) 10%, transparent);
          color: var(--ds-color-danger);
        }

        .toolbar {
          display: flex;
          flex-wrap: wrap;
          gap: var(--ds-spacing-sm);
          margin-bottom: var(--ds-layout-spacing-lg);
        }

        .search-input,
        .filter-select {
          box-sizing: border-box;
          height: var(--ds-control-height);
          padding: var(--ds-spacing-sm) var(--ds-spacing-md);
          font-family: var(--ds-font-family);
          font-size: var(--ds-font-size-base);
          line-height: var(--ds-line-height);
          color: var(--ds-color-text);
          background: var(--ds-color-input-background);
          border: 1px solid var(--ds-color-border);
          border-radius: var(--ds-border-radius);
          outline: none;
        }

        .search-input {
          flex: 1 1 240px;
          max-width: 384px;
        }

        .search-input::placeholder {
          color: var(--ds-color-placeholder);
        }

        .filter-select {
          flex: 0 1 auto;
          cursor: pointer;
        }

        /* Selects draw the same chevron as the Sentiment button rather than
           the browser's arrow, which differs from one browser to the next. */
        .select-field {
          position: relative;
          display: inline-flex;
          flex: 0 1 auto;
        }

        .select-field select {
          appearance: none;
          -webkit-appearance: none;
          width: 100%;
          padding-inline-end: calc(var(--ds-spacing-md) + 1.1em + 2 * var(--ds-spacing-xs));
        }

        .select-field .filter-chevron {
          position: absolute;
          inset-inline-end: var(--ds-spacing-md);
          top: 50%;
          transform: translateY(-50%);
          margin: 0;
          pointer-events: none;
        }

        .sentiment-filter,
        .date-filter {
          position: relative;
          flex: 0 1 auto;
        }

        .date-panel {
          position: absolute;
          top: calc(100% + var(--ds-spacing-xs));
          left: 0;
          z-index: 10;
          box-sizing: border-box;
          width: max-content;
          max-width: min(320px, calc(100vw - 2 * var(--ds-spacing-md)));
          padding: var(--ds-spacing-sm);
          background: var(--ds-color-background);
          border: 1px solid var(--ds-color-border);
          border-radius: var(--ds-border-radius);
          box-shadow: 0 4px 24px rgba(0, 0, 0, 0.12);
        }

        .date-presets {
          display: grid;
        }

        .date-preset {
          padding: var(--ds-spacing-xs) var(--ds-spacing-sm);
          font: inherit;
          text-align: start;
          color: var(--ds-color-text);
          background: none;
          border: 0;
          border-radius: var(--ds-border-radius);
          cursor: pointer;
        }

        .date-preset:hover,
        .date-preset:focus-visible {
          background: var(--ds-color-surface-subtle);
          outline: none;
        }

        .date-preset[aria-checked='true'] {
          font-weight: var(--ds-font-weight-medium);
          color: var(--ds-color-primary);
        }

        .date-custom {
          display: grid;
          grid-template-columns: auto 1fr;
          align-items: center;
          gap: var(--ds-spacing-xs) var(--ds-spacing-sm);
          margin: var(--ds-spacing-sm) 0 0;
          padding: var(--ds-spacing-sm) var(--ds-spacing-sm) 0;
          border: 0;
          border-top: 1px solid var(--ds-color-border);
        }

        .date-custom legend {
          float: left;
          grid-column: 1 / -1;
          padding: 0;
          font-size: var(--ds-font-size-small);
          color: var(--ds-color-text-secondary);
        }

        .date-actions {
          margin-top: var(--ds-spacing-sm);
        }

        .filter-button {
          display: inline-flex;
          align-items: center;
          gap: var(--ds-spacing-xs);
        }

        .filter-select.is-active,
        .search-input.is-active {
          border-color: var(--ds-color-primary);
        }

        /* The chevron the selects draw too, so every filter reads as one. */
        .filter-chevron {
          display: inline-flex;
          width: 1.1em;
          height: 1.1em;
          margin-inline-start: var(--ds-spacing-xs);
          color: var(--ds-color-text-secondary);
        }

        .filter-chevron svg {
          width: 100%;
          height: 100%;
        }

        .filter-count {
          display: inline-block;
          min-width: 1.25em;
          padding: 0 var(--ds-spacing-xs);
          border-radius: var(--ds-border-radius-large);
          background: var(--ds-color-primary);
          color: var(--ds-color-background);
          font-size: var(--ds-font-size-small);
          font-weight: var(--ds-font-weight-medium);
          text-align: center;
        }

        .sentiment-panel {
          position: absolute;
          top: calc(100% + var(--ds-spacing-xs));
          right: 0;
          z-index: 10;
          box-sizing: border-box;
          width: max-content;
          max-width: min(440px, calc(100vw - 2 * var(--ds-spacing-md)));
          padding: var(--ds-spacing-md);
          background: var(--ds-color-background);
          border: 1px solid var(--ds-color-border);
          border-radius: var(--ds-border-radius);
          box-shadow: 0 4px 24px rgba(0, 0, 0, 0.12);
        }

        .sentiment-rows {
          display: grid;
          gap: var(--ds-spacing-sm);
        }

        .sentiment-row {
          display: grid;
          grid-template-columns: 5.5em 1fr;
          align-items: center;
          gap: var(--ds-spacing-sm);
          margin: 0;
          padding: 0;
          border: none;
          min-width: 0;
        }

        /* A legend will not sit in a grid cell; float lets it. */
        .sentiment-side-name {
          float: left;
          padding: 0;
          color: var(--ds-color-text-secondary);
          font-size: var(--ds-font-size-small);
        }

        .seg {
          display: flex;
          border: 1px solid var(--ds-color-border);
          border-radius: var(--ds-border-radius);
          overflow: hidden;
        }

        .seg-input {
          position: absolute;
          opacity: 0;
          width: 1px;
          height: 1px;
          pointer-events: none;
        }

        .seg-option {
          flex: 1 1 0;
          display: inline-flex;
          align-items: center;
          justify-content: center;
          gap: 0.35em;
          padding: var(--ds-spacing-xs) var(--ds-spacing-sm);
          font-size: var(--ds-font-size-small);
          color: var(--ds-color-text-secondary);
          cursor: pointer;
          user-select: none;
          white-space: nowrap;
        }

        .seg-option + .seg-input + .seg-option {
          border-left: 1px solid var(--ds-color-border);
        }

        .seg-input:checked + .seg-option {
          background: var(--ds-color-primary);
          color: var(--ds-color-background);
        }

        .seg-input:focus-visible + .seg-option {
          outline: 2px solid var(--ds-color-primary);
          outline-offset: -2px;
        }

        .seg-dot {
          width: 0.5em;
          height: 0.5em;
          border-radius: 50%;
        }

        .seg-dot-positive {
          background: var(--ds-color-success);
        }

        .seg-dot-neutral {
          background: var(--ds-color-text-secondary);
        }

        .seg-dot-negative {
          background: var(--ds-color-danger);
        }

        .seg-input:checked + .seg-option .seg-dot {
          box-shadow: 0 0 0 1px var(--ds-color-background);
        }

        .sentiment-advanced {
          margin-top: var(--ds-spacing-md);
          padding-top: var(--ds-spacing-sm);
          border-top: 1px solid var(--ds-color-border);
        }

        .sentiment-advanced summary {
          cursor: pointer;
          font-size: var(--ds-font-size-small);
          color: var(--ds-color-text-secondary);
        }

        .sentiment-hint {
          margin: var(--ds-spacing-sm) 0;
          font-size: var(--ds-font-size-small);
          color: var(--ds-color-text-secondary);
        }

        .range-grid {
          display: grid;
          gap: var(--ds-spacing-xs);
        }

        .range-grid-row {
          display: grid;
          grid-template-columns: 5.5em 1fr 1fr;
          align-items: center;
          gap: var(--ds-spacing-sm);
        }

        .range-grid-head {
          font-size: var(--ds-font-size-small);
          color: var(--ds-color-text-secondary);
        }

        .range-bounds {
          opacity: 0.75;
        }

        .range-side {
          font-size: var(--ds-font-size-small);
          color: var(--ds-color-text-secondary);
        }

        .range-cell {
          display: flex;
          align-items: center;
          gap: var(--ds-spacing-xs);
        }

        .range-input {
          box-sizing: border-box;
          width: 4.5em;
          height: var(--ds-control-height);
          padding: var(--ds-spacing-xs) var(--ds-spacing-sm);
          font-family: var(--ds-font-family);
          font-size: var(--ds-font-size-base);
          color: var(--ds-color-text);
          background: var(--ds-color-input-background);
          border: 1px solid var(--ds-color-border);
          border-radius: var(--ds-border-radius);
          outline: none;
        }

        .range-sep {
          color: var(--ds-color-text-secondary);
        }

        .sentiment-error {
          margin: 0 0 var(--ds-spacing-sm);
          color: var(--ds-color-danger);
          font-size: var(--ds-font-size-small);
        }

        .sentiment-actions {
          display: flex;
          justify-content: space-between;
          align-items: center;
          gap: var(--ds-spacing-sm);
          margin-top: var(--ds-spacing-md);
        }

        .link-btn {
          padding: 0;
          font-family: var(--ds-font-family);
          font-size: var(--ds-font-size-small);
          color: var(--ds-color-text-secondary);
          background: none;
          border: none;
          text-decoration: underline;
          cursor: pointer;
        }

        .link-btn:focus-visible {
          outline: 2px solid var(--ds-color-primary);
          outline-offset: 2px;
        }

        .panel-btn {
          padding: var(--ds-spacing-sm) var(--ds-spacing-md);
          font-family: var(--ds-font-family);
          font-size: var(--ds-font-size-base);
          color: var(--ds-color-text);
          background: transparent;
          border: 1px solid var(--ds-color-border);
          border-radius: var(--ds-border-radius);
          cursor: pointer;
          outline: none;
        }

        .panel-btn.primary {
          color: var(--ds-color-background);
          background: var(--ds-color-primary);
          border-color: var(--ds-color-primary);
        }

        .range-input:focus-visible,
        .panel-btn:focus-visible,
        .search-input:focus-visible,
        .filter-select:focus-visible,
        .clear-filters-btn:focus-visible {
          box-shadow:
            0 0 0 var(--ds-focus-ring-offset) var(--ds-color-input-background),
            0 0 0 calc(var(--ds-focus-ring-offset) + var(--ds-focus-ring-width))
              var(--ds-focus-ring-color);
        }

        .clear-filters-btn {
          margin-top: var(--ds-spacing-sm);
          padding: var(--ds-spacing-sm) var(--ds-spacing-md);
          font-family: var(--ds-font-family);
          font-size: var(--ds-font-size-base);
          color: var(--ds-color-primary);
          background: transparent;
          border: 1px solid var(--ds-color-border);
          border-radius: var(--ds-border-radius);
          cursor: pointer;
          outline: none;
        }

        .spinner {
          display: inline-block;
          width: var(--ds-spinner-size);
          height: var(--ds-spinner-size);
          color: var(--ds-color-primary);
          animation: spin 0.8s linear infinite;
        }

        .spinner svg {
          width: 100%;
          height: 100%;
        }

        @keyframes spin {
          to { transform: rotate(360deg); }
        }

        ${tableStyles}

        tbody tr {
          cursor: pointer;
        }

        /* Several entries can be one conversation, because picking a parked
           caller back up places a new call. A bracket down the left edge spans
           every entry of one conversation.

           Grouping, not nesting. The entries are consecutive stretches of the
           same conversation, so none of them contains another, none is
           indented, and a conversation that fits in a single entry carries no
           mark at all.

           The bracket is drawn on the first cell whichever column is showing,
           since every column is individually toggleable. It is a positioned
           element rather than a border-left for two reasons: the table
           collapses its borders, which would merge the rule with its
           neighbours', and the ends need rounding. It sits inside the cell's
           own left padding so it never reads as the table's edge. */
        tbody tr.in-conversation > td:first-child {
          position: relative;
        }

        tbody tr.in-conversation > td:first-child::before {
          content: '';
          position: absolute;
          left: var(--ds-spacing-sm);
          top: 0;
          bottom: 0;
          width: 2px;
          background: color-mix(in srgb, var(--ds-color-primary) 45%, transparent);
        }

        /* Stop the bracket short at both ends so it reads as a span with a
           beginning and an end rather than a rule running off the table. */
        tbody tr.conversation-start > td:first-child::before {
          top: 25%;
          border-radius: 1px 1px 0 0;
        }

        tbody tr.conversation-end > td:first-child::before {
          bottom: 25%;
          border-radius: 0 0 1px 1px;
        }

        .cell-secondary {
          display: block;
          font-size: var(--ds-font-size-small);
          color: var(--ds-color-text-secondary);
          margin-top: 2px;
        }

        .badge {
          display: inline-block;
          padding: var(--ds-spacing-xs) var(--ds-spacing-sm);
          border-radius: var(--ds-border-radius-large);
          font-size: var(--ds-font-size-small);
          font-weight: var(--ds-font-weight-medium);
        }

        .badge-inbound {
          background: color-mix(in srgb, var(--ds-color-success) 10%, transparent);
          color: var(--ds-color-success);
        }

        .badge-outbound {
          background: color-mix(in srgb, var(--ds-color-primary) 10%, transparent);
          color: var(--ds-color-primary);
        }

        .badge-internal {
          background: var(--ds-color-surface-subtle);
          color: var(--ds-color-text-secondary);
        }

        .badge-answered {
          background: color-mix(in srgb, var(--ds-color-success) 10%, transparent);
          color: var(--ds-color-success);
        }

        .badge-no-answer {
          background: color-mix(in srgb, var(--ds-color-warning) 10%, transparent);
          color: var(--ds-color-warning);
        }

        .badge-failed {
          background: color-mix(in srgb, var(--ds-color-danger) 10%, transparent);
          color: var(--ds-color-danger);
        }

        .badge-voicemail {
          background: color-mix(in srgb, var(--ds-color-primary) 10%, transparent);
          color: var(--ds-color-primary);
        }

        .badge-default {
          background: var(--ds-color-surface-subtle);
          color: var(--ds-color-text-secondary);
        }

        .badge-quality-good {
          background: color-mix(in srgb, var(--ds-color-success) 10%, transparent);
          color: var(--ds-color-success);
        }

        .badge-quality-fair {
          background: color-mix(in srgb, var(--ds-color-warning) 10%, transparent);
          color: var(--ds-color-warning);
        }

        .badge-quality-poor {
          background: color-mix(in srgb, var(--ds-color-danger) 10%, transparent);
          color: var(--ds-color-danger);
        }

        .sentiment-cell {
          display: inline-flex;
          flex-wrap: wrap;
          gap: var(--ds-spacing-xs);
        }

        .badge-sentiment-positive {
          background: color-mix(in srgb, var(--ds-color-success) 10%, transparent);
          color: var(--ds-color-success);
        }

        .badge-sentiment-neutral,
        .badge-sentiment-unavailable {
          background: var(--ds-color-surface-subtle);
          color: var(--ds-color-text-secondary);
        }

        .badge-sentiment-negative {
          background: color-mix(in srgb, var(--ds-color-danger) 10%, transparent);
          color: var(--ds-color-danger);
        }

        .badge-quality-unavailable {
          background: var(--ds-color-surface-subtle);
          color: var(--ds-color-text-secondary);
        }

        /* Subtle loading state during pagination */
        .container.is-paginating .table-container {
          opacity: 0.6;
          pointer-events: none;
          transition: opacity 0.15s ease;
        }

        .container.is-paginating .pagination {
          opacity: 0.6;
          pointer-events: none;
        }

        ${paginationStyles}
      </style>

      <div class="container ${this.getClassNames()}" part="container" role="region" aria-label="${this.t('callLogs.title')}">
        ${this.displayOptions.showFilters ? this.renderToolbar() : ''}
        ${this.renderContent()}
      </div>
    `;

    // Attach event listeners after DOM is updated
    this.attachEventListeners();

    if (searchWasFocused) {
      const input = this.shadowRoot.getElementById(SEARCH_INPUT_ID);
      if (input instanceof HTMLInputElement) {
        input.focus();
        const pos = caret ?? input.value.length;
        input.setSelectionRange(pos, pos);
      }
    } else if (buttonToRefocus) {
      this.shadowRoot.getElementById(buttonToRefocus)?.focus();
    }
  }

  private renderToolbar(): string {
    const option = (value: string, label: string, selected: boolean) =>
      `<option value="${value}"${selected ? ' selected' : ''}>${this.escapeHtml(label)}</option>`;
    const placeholder = this.escapeHtml(this.t('callLogs.filters.searchPlaceholder'));

    const directions = [
      option('', this.t('callLogs.filters.allDirections'), !this.filters.direction),
      ...DIRECTIONS.map((d) =>
        option(d, this.t(`callLogs.directions.${d}`), this.filters.direction === d)
      ),
    ].join('');
    const preset = this.filters.status;
    const several = Array.isArray(preset) && preset.length > 1 ? preset : null;
    const single = Array.isArray(preset) ? (several ? undefined : preset[0]) : preset;
    const statuses = [
      option(
        '',
        this.t('callLogs.filters.allStatuses'),
        !preset || (Array.isArray(preset) && preset.length === 0)
      ),
      ...(several
        ? [option(MULTIPLE_STATUSES, several.map((st) => this.formatStatus(st)).join(', '), true)]
        : []),
      ...STATUSES.map((st) => option(st, this.formatStatus(st), single === st)),
    ].join('');
    // Every filter away from its default is marked the way Sentiment is, so a
    // narrowed list says so at a glance.
    const active = (on: boolean) => (on ? ' is-active' : '');
    const chevron = this.getIcon('chevronDown');

    return `
      <div class="toolbar" part="toolbar" role="search">
        <input
          id="${SEARCH_INPUT_ID}"
          type="search"
          class="search-input${active(this.searchText.trim() !== '')}"
          part="search-input"
          placeholder="${placeholder}"
          aria-label="${placeholder}"
          autocomplete="off"
          maxlength="100"
          value="${this.escapeHtml(this.searchText)}"
        />
        <span class="select-field"><select id="filter-direction" class="filter-select${active(!!this.filters.direction)}" part="filter-select filter-direction" aria-label="${this.t('callLogs.columns.direction')}">${directions}</select><span class="filter-chevron" part="filter-chevron" aria-hidden="true">${chevron}</span></span>
        <span class="select-field"><select id="filter-status" class="filter-select${active(!!this.filters.status)}" part="filter-select filter-status" aria-label="${this.t('callLogs.columns.status')}">${statuses}</select><span class="filter-chevron" part="filter-chevron" aria-hidden="true">${chevron}</span></span>
${this.renderDateFilter()}
        ${this.displayOptions.showSentiment ? this.renderSentimentFilter() : ''}
      </div>
    `;
  }

  private renderDateFilter(): string {
    const preset = this.effectiveDatePreset();
    const active = preset !== this.defaultDatePreset();
    const label = this.escapeHtml(this.dateButtonLabel());
    const name = this.escapeHtml(this.t('callLogs.filters.dateRange'));
    return `
      <div class="date-filter" part="date-filter">
        <button
          type="button"
          id="${DATE_BUTTON_ID}"
          class="filter-select filter-button${active ? ' is-active' : ''}"
          part="filter-select filter-date"
          aria-haspopup="dialog"
          aria-expanded="${this.dateOpen}"
          aria-controls="${DATE_PANEL_ID}"
          aria-label="${name}: ${label}"
        >${label}<span class="filter-chevron" part="filter-chevron" aria-hidden="true">${this.getIcon('chevronDown')}</span></button>
        ${this.dateOpen ? this.renderDatePanel(preset) : ''}
      </div>
    `;
  }

  private renderDatePanel(preset: CallLogDatePreset): string {
    const t = (key: string) => this.escapeHtml(this.t(`callLogs.filters.datePanel.${key}`));
    const presets = DATE_PRESETS.map(
      (p) =>
        `<button type="button" role="menuitemradio" class="date-preset" part="date-preset" data-preset="${p}" aria-checked="${preset === p}">${this.escapeHtml(this.t(`callLogs.filters.dates.${p}`))}</button>`
    ).join('');
    const error = this.dateError
      ? `<p class="sentiment-error" part="date-error" role="alert">${this.escapeHtml(this.dateError)}</p>`
      : '';
    return `
      <div id="${DATE_PANEL_ID}" class="date-panel" part="date-panel" role="dialog" aria-label="${t('title')}">
        <div class="date-presets" role="menu">${presets}</div>
        <fieldset class="date-custom" part="date-custom">
          <legend>${t('custom')}</legend>
          <label for="date-from">${t('from')}</label>
          <input type="date" id="date-from" class="filter-select" value="${this.escapeHtml(this.dateDraft.from)}" />
          <label for="date-to">${t('to')}</label>
          <input type="date" id="date-to" class="filter-select" value="${this.escapeHtml(this.dateDraft.to)}" />
        </fieldset>
        ${error}
        <div class="sentiment-actions date-actions">
          <span></span>
          <button type="button" id="date-apply" class="panel-btn primary" part="date-apply-button">${t('apply')}</button>
        </div>
      </div>
    `;
  }

  private renderSentimentFilter(): string {
    const count = countSentimentConditions(this.filters);
    const buttonLabel = this.escapeHtml(this.t('callLogs.filters.sentiment.button'));
    const countLabel = count
      ? this.escapeHtml(this.t('callLogs.filters.sentiment.activeCount', { count }))
      : '';
    const badge = count
      ? `<span class="filter-count" part="filter-count" aria-hidden="true">${count}</span>`
      : '';
    return `
      <div class="sentiment-filter" part="sentiment-filter">
        <button
          type="button"
          id="${SENTIMENT_BUTTON_ID}"
          class="filter-select filter-button${count ? ' is-active' : ''}"
          part="filter-select filter-sentiment"
          aria-haspopup="dialog"
          aria-expanded="${this.sentimentOpen}"
          aria-controls="${SENTIMENT_PANEL_ID}"
          ${countLabel ? `aria-label="${buttonLabel}, ${countLabel}"` : ''}
        >${buttonLabel}${badge}<span class="filter-chevron" part="filter-chevron" aria-hidden="true">${this.getIcon('chevronDown')}</span></button>
        ${this.sentimentOpen ? this.renderSentimentPanel() : ''}
      </div>
    `;
  }

  /**
   * The panel leads with what most people filter on, a label per side, as one
   * segmented row each. Score and magnitude ranges are a refinement few need,
   * so they sit in a disclosure that opens by itself only when one is set.
   */
  private renderSentimentPanel(): string {
    const t = (key: string) => this.escapeHtml(this.t(`callLogs.filters.sentiment.${key}`));
    const value = (id: string) => this.escapeHtml(this.sentimentDraft[id] ?? '');

    const labelRows = SENTIMENT_SIDES.map((s) => {
      const name = `sentiment-${s.side}-label`;
      const current = this.sentimentDraft[name] ?? '';
      const sideName = t(`sides.${s.side}`);
      const choices = ['', ...SENTIMENT_LABELS].map((l) => {
        const id = `${name}-${l || 'any'}`;
        const text = l ? t(`labels.${l}`) : t('any');
        const dot = l ? `<span class="seg-dot seg-dot-${l}" aria-hidden="true"></span>` : '';
        return `
          <input type="radio" class="seg-input" id="${id}" name="${name}" value="${l}"${current === l ? ' checked' : ''} />
          <label class="seg-option" part="sentiment-choice" for="${id}">${dot}${text}</label>`;
      });
      return `
        <fieldset class="sentiment-row" part="sentiment-side">
          <legend class="sentiment-side-name">${sideName}</legend>
          <div class="seg" part="sentiment-segmented">${choices.join('')}</div>
        </fieldset>`;
    }).join('');

    const numberInput = (
      id: string,
      label: string,
      bounds: { min: number; max: number },
      placeholder: string
    ) => `
      <input
        id="${id}"
        type="number"
        class="range-input"
        part="sentiment-range-input"
        inputmode="decimal"
        step="0.1"
        min="${bounds.min}"
        max="${bounds.max}"
        placeholder="${placeholder}"
        aria-label="${label}"
        value="${value(id)}"
      />`;
    const rangeCell = (side: string, field: 'score' | 'magnitude') => {
      const bounds = field === 'score' ? SCORE_BOUNDS : MAGNITUDE_BOUNDS;
      const base = `sentiment-${side}-${field}`;
      const label = `${t(`sides.${side}`)} ${t(field)}`;
      return `
        <div class="range-cell">
          ${numberInput(`${base}-min`, `${label} ${t('min')}`, bounds, t('min'))}
          <span class="range-sep" aria-hidden="true">–</span>
          ${numberInput(`${base}-max`, `${label} ${t('max')}`, bounds, t('max'))}
        </div>`;
    };
    const rangeRows = SENTIMENT_SIDES.map(
      (s) => `
        <div class="range-grid-row" role="group" aria-label="${t(`sides.${s.side}`)}">
          <span class="range-side">${t(`sides.${s.side}`)}</span>
          ${rangeCell(s.side, 'score')}
          ${rangeCell(s.side, 'magnitude')}
        </div>`
    ).join('');

    const error = this.sentimentError
      ? `<p class="sentiment-error" part="sentiment-error" role="alert">${this.escapeHtml(this.sentimentError)}</p>`
      : '';
    return `
      <div
        id="${SENTIMENT_PANEL_ID}"
        class="sentiment-panel"
        part="sentiment-panel"
        role="dialog"
        aria-label="${t('title')}"
      >
        <div class="sentiment-rows">${labelRows}</div>
        <details id="sentiment-advanced" class="sentiment-advanced" part="sentiment-advanced"${this.sentimentAdvancedOpen ? ' open' : ''}>
          <summary>${t('advanced')}</summary>
          <p class="sentiment-hint">${t('advancedHint')}</p>
          <div class="range-grid">
            <div class="range-grid-row range-grid-head" aria-hidden="true">
              <span></span>
              <span>${t('score')} <span class="range-bounds">${t('scoreBounds')}</span></span>
              <span>${t('magnitude')} <span class="range-bounds">${t('magnitudeBounds')}</span></span>
            </div>
            ${rangeRows}
          </div>
        </details>
        ${error}
        <div class="sentiment-actions">
          <button type="button" id="sentiment-clear" class="link-btn" part="sentiment-clear-button">${t('clear')}</button>
          <button type="button" id="sentiment-apply" class="panel-btn primary" part="sentiment-apply-button">${t('apply')}</button>
        </div>
      </div>
    `;
  }

  /**
   * Render content based on state
   */
  private renderContent(): string {
    if (this.isLoading) {
      return `
        <div class="loading ${this.classes.loading || ''}" part="loading" role="status" aria-live="polite">
          <slot name="loading">
            <div class="spinner" part="spinner" aria-hidden="true">${this.getIcon('spinner')}</div>
            <p>${this.t('callLogs.loading')}</p>
          </slot>
        </div>
      `;
    }

    if (this.error) {
      return `
        <div class="error ${this.classes.error || ''}" part="error" role="alert">
          <slot name="error">
            <p><strong>${this.t('common.error')}:</strong> ${this.error}</p>
          </slot>
        </div>
      `;
    }

    if (this.callLogs.length === 0 && this.hasActiveFilters()) {
      return `
        <div class="empty ${this.classes.empty || ''}" part="empty empty-filtered" role="status">
          <p>${this.t('callLogs.filters.noMatches')}</p>
          <button type="button" class="clear-filters-btn" part="clear-filters-button" id="clear-filters-btn">${this.t('callLogs.filters.clear')}</button>
        </div>
      `;
    }

    // The default window alone is not something Clear filters can undo, but an
    // account whose calls are all older must not read "no call logs found".
    if (this.callLogs.length === 0 && this.effectiveDatePreset() !== 'all') {
      return `
        <div class="empty ${this.classes.empty || ''}" part="empty empty-filtered" role="status">
          <p>${this.t('callLogs.filters.noCallsInRange')}</p>
        </div>
      `;
    }

    if (this.callLogs.length === 0) {
      return `
        <div class="empty ${this.classes.empty || ''}" part="empty" role="status">
          <slot name="empty">
            <p>${this.t('callLogs.empty')}</p>
          </slot>
        </div>
      `;
    }

    return this.renderTable();
  }

  /**
   * Get pagination info text showing current page
   */
  private getPaginationInfoText(): string {
    if (this.callLogs.length === 0) {
      return this.t('common.noItems');
    }

    // Calculate range for current page
    const start = this.currentOffset + 1;
    const end = this.currentOffset + this.callLogs.length;

    return `${start}-${end}`;
  }

  /**
   * Render the call logs table
   */
  /**
   * Group the page by conversation, in the order the conversation happened.
   *
   * One conversation does not always fit in one call log. A parked caller
   * picked back up is a second entry, and they chain when a retriever is itself
   * parked and someone else picks them up. `related_call` links each entry to a
   * counterpart, which is enough to rebuild the group. Follow the links, then
   * order by `started_at`, since a continuation always begins after the call it
   * continues. That holds even when the opening entry ended early.
   *
   * `related_call` does not say which direction it points, and it does not need
   * to, because ordering by `started_at` decides that.
   *
   * The members are peers, not a hierarchy. Each one covers its own stretch of
   * the conversation, so the position returned says where a member sits in its
   * group rather than how deep it is nested. A conversation of one entry is
   * `none` and gets no grouping mark.
   *
   * Only entries on this page can be linked up. One that sits on the next page
   * renders on its own there, which is why a group is rendered where its
   * first-encountered member fell rather than re-sorted to the top.
   */
  private orderByConversation(calls: CallLog[]): Array<{ call: CallLog; group: GroupPosition }> {
    const byID = new Map(calls.map((c) => [c.id, c]));

    const neighbours = new Map<string, Set<string>>();
    const link = (a: string, b: string) => {
      if (!neighbours.has(a)) neighbours.set(a, new Set());
      neighbours.get(a)?.add(b);
    };
    for (const call of calls) {
      const peer = call.related_call;
      if (!peer || !byID.has(peer)) continue;
      link(call.id, peer);
      link(peer, call.id);
    }

    const started = (c: CallLog) => new Date(c.started_at).getTime();
    const emitted = new Set<string>();
    const ordered: Array<{ call: CallLog; group: GroupPosition }> = [];

    for (const call of calls) {
      if (emitted.has(call.id)) continue;

      // Collect the whole group this call belongs to, then order it in time.
      const group: CallLog[] = [];
      const queue = [call.id];
      const seen = new Set(queue);
      while (queue.length > 0) {
        const id = queue.shift();
        if (id === undefined) break;
        const member = byID.get(id);
        if (!member) continue;
        group.push(member);
        for (const next of neighbours.get(id) ?? []) {
          if (seen.has(next)) continue;
          seen.add(next);
          queue.push(next);
        }
      }
      group.sort((a, b) => started(a) - started(b));

      for (const [i, member] of group.entries()) {
        emitted.add(member.id);
        let position: GroupPosition = 'middle';
        if (group.length === 1) position = 'none';
        else if (i === 0) position = 'start';
        else if (i === group.length - 1) position = 'end';
        ordered.push({ call: member, group: position });
      }
    }

    return ordered;
  }

  private renderTable(): string {
    const {
      showDate,
      showDirection,
      showFrom,
      showTo,
      showDuration,
      showStatus,
      showQuality,
      showSentiment,
    } = this.displayOptions;

    const rows = this.orderByConversation(this.callLogs)
      .map(({ call, group }) => {
        // Build row classes
        const rowClasses: string[] = [];
        if (this.classes.row) rowClasses.push(this.classes.row);
        if (call.direction === 'inbound' && this.classes.rowInbound)
          rowClasses.push(this.classes.rowInbound);
        if (call.direction === 'outbound' && this.classes.rowOutbound)
          rowClasses.push(this.classes.rowOutbound);
        if (group !== 'none') {
          rowClasses.push('in-conversation');
          if (group === 'start') rowClasses.push('conversation-start');
          if (group === 'end') rowClasses.push('conversation-end');
        }
        const rowClassStr = rowClasses.length > 0 ? ` class="${rowClasses.join(' ')}"` : '';
        // Separate parts so a host can restyle the grouping, including its two
        // ends, without having to reimplement the row.
        const rowPart =
          group === 'none'
            ? 'table-row'
            : `table-row table-row-in-conversation table-row-conversation-${group}`;

        // Use custom row renderer if provided
        if (this.customRowRenderer) {
          return `<tr data-call-id="${call.id}" tabindex="0" role="row" part="${rowPart}"${rowClassStr}>${this.customRowRenderer(call)}</tr>`;
        }

        // Pre-compute MOS once for quality column (used in class, tooltip, and value)
        const mos = showQuality ? this.getWorstMos(call) : undefined;

        return `
          <tr data-call-id="${call.id}" tabindex="0" role="row" part="${rowPart}"${rowClassStr}>
            ${showDate ? `<td part="cell cell-date">${this.formatDate(call.started_at)}</td>` : ''}
            ${showDirection ? `<td part="cell cell-direction"><span class="badge ${this.getDirectionClass(call.direction)}" part="badge badge-direction">${this.formatDirection(call.direction)}</span></td>` : ''}
            ${showFrom ? `<td part="cell cell-from">${this.formatFromCell(call)}</td>` : ''}
            ${showTo ? `<td part="cell cell-to">${this.formatToCell(call)}</td>` : ''}
            ${showDuration ? `<td part="cell cell-duration">${this.formatDuration(call.duration_seconds || 0)}</td>` : ''}
            ${showStatus ? `<td part="cell cell-status"><span class="badge ${this.getStatusClass(call.status)}" part="badge badge-status">${this.formatStatus(call.status)}</span></td>` : ''}
            ${showQuality ? `<td part="cell cell-quality"><span class="badge ${this.getMosClass(mos)}" part="badge badge-quality" title="${this.getMosTooltip(mos)}">${this.formatMos(mos)}</span></td>` : ''}
            ${showSentiment ? `<td part="cell cell-sentiment">${this.formatSentimentCell(call)}</td>` : ''}
          </tr>
        `;
      })
      .join('');

    return `
      <div class="table-container" part="table-container">
        <table role="grid" aria-label="${this.t('callLogs.title')}" part="table" class="${this.classes.table || ''}">
          <thead part="table-header" class="${this.classes.header || ''}">
            <tr role="row">
              ${showDate ? `<th role="columnheader" scope="col" part="header-cell">${this.t('callLogs.columns.date')}</th>` : ''}
              ${showDirection ? `<th role="columnheader" scope="col" part="header-cell">${this.t('callLogs.columns.direction')}</th>` : ''}
              ${showFrom ? `<th role="columnheader" scope="col" part="header-cell">${this.t('callLogs.columns.from')}</th>` : ''}
              ${showTo ? `<th role="columnheader" scope="col" part="header-cell">${this.t('callLogs.columns.to')}</th>` : ''}
              ${showDuration ? `<th role="columnheader" scope="col" part="header-cell">${this.t('callLogs.columns.duration')}</th>` : ''}
              ${showStatus ? `<th role="columnheader" scope="col" part="header-cell">${this.t('callLogs.columns.status')}</th>` : ''}
              ${showQuality ? `<th role="columnheader" scope="col" part="header-cell">${this.t('callLogs.columns.quality')}</th>` : ''}
              ${showSentiment ? `<th role="columnheader" scope="col" part="header-cell">${this.escapeHtml(this.sentimentHeader())}</th>` : ''}
            </tr>
          </thead>
          <tbody part="table-body">
            ${rows}
          </tbody>
        </table>
      </div>
      <nav class="pagination ${this.classes.pagination || ''}" part="pagination" aria-label="Pagination">
        <div class="pagination-info" part="pagination-info" aria-live="polite">
          ${this.getPaginationInfoText()}
        </div>
        <div class="pagination-buttons" part="pagination-buttons">
          <button class="pagination-btn" part="pagination-button prev-button" id="prev-btn" ${!this.previousPageUrl ? 'disabled' : ''} aria-label="${this.t('common.previous')}">
            ${this.getIcon('chevronLeft')} ${this.t('common.previous')}
          </button>
          <button class="pagination-btn" part="pagination-button next-button" id="next-btn" ${!this.nextPageUrl ? 'disabled' : ''} aria-label="${this.t('common.next')}">
            ${this.t('common.next')} ${this.getIcon('chevronRight')}
          </button>
        </div>
      </nav>
    `;
  }

  // ============================================================================
  // Event Handling
  // ============================================================================

  /**
   * Attach event listeners after render
   */
  private attachEventListeners(): void {
    if (!this.shadowRoot) return;

    // Pagination buttons
    const prevBtn = this.shadowRoot.getElementById('prev-btn');
    const nextBtn = this.shadowRoot.getElementById('next-btn');

    prevBtn?.addEventListener('click', () => this.goToPreviousPage());
    nextBtn?.addEventListener('click', () => this.goToNextPage());

    const searchInput = this.shadowRoot.getElementById(SEARCH_INPUT_ID);
    searchInput?.addEventListener('input', (e) => {
      this.searchText = (e.target as HTMLInputElement).value;
      if (this.searchDebounce) clearTimeout(this.searchDebounce);
      this.searchDebounce = setTimeout(() => {
        this.searchDebounce = null;
        const search = this.searchText.trim() || undefined;
        if (search !== this.filters.search) this.applyFilters({ search });
      }, SEARCH_DEBOUNCE_MS);
    });

    this.shadowRoot.getElementById('filter-direction')?.addEventListener('change', (e) => {
      const value = (e.target as HTMLSelectElement).value as CallLogFilters['direction'] | '';
      this.applyFilters({ direction: value || undefined });
    });
    this.shadowRoot.getElementById('filter-status')?.addEventListener('change', (e) => {
      const value = (e.target as HTMLSelectElement).value;
      if (value === MULTIPLE_STATUSES) return;
      this.applyFilters({ status: (value as CallStatus) || undefined });
    });
    this.shadowRoot.getElementById(DATE_BUTTON_ID)?.addEventListener('click', () => {
      if (this.dateOpen) this.closeDatePanel(true);
      else this.openDatePanel();
    });
    const datePanel = this.shadowRoot.getElementById(DATE_PANEL_ID);
    if (datePanel) {
      datePanel
        .querySelectorAll<HTMLButtonElement>('[data-preset]')
        .forEach((b) =>
          b.addEventListener('click', () =>
            this.pickDatePreset(b.dataset.preset as Exclude<CallLogDatePreset, 'custom'>)
          )
        );
      datePanel.addEventListener('input', (e) => {
        const target = e.target as HTMLInputElement;
        if (target.id === 'date-from') this.dateDraft.from = target.value;
        if (target.id === 'date-to') this.dateDraft.to = target.value;
      });
      datePanel.addEventListener('keydown', (e) => {
        const key = (e as KeyboardEvent).key;
        if (key === 'Escape') {
          e.preventDefault();
          this.closeDatePanel(true);
        } else if (key === 'Enter' && (e.target as HTMLInputElement).type === 'date') {
          e.preventDefault();
          this.applyDateRange();
        }
      });
      this.shadowRoot
        .getElementById('date-apply')
        ?.addEventListener('click', () => this.applyDateRange());
    }
    this.shadowRoot
      .getElementById('clear-filters-btn')
      ?.addEventListener('click', () => this.clearFilters());

    this.shadowRoot.getElementById(SENTIMENT_BUTTON_ID)?.addEventListener('click', () => {
      if (this.sentimentOpen) this.closeSentimentPanel(true);
      else this.openSentimentPanel();
    });
    const panel = this.shadowRoot.getElementById(SENTIMENT_PANEL_ID);
    if (panel) {
      const record = (e: Event) => {
        const target = e.target as HTMLInputElement | HTMLSelectElement;
        // A label is a radio group, keyed by its name; a range input by its id.
        const key = target.type === 'radio' ? target.name : target.id;
        if (key) this.sentimentDraft[key] = target.value;
      };
      panel.addEventListener('input', record);
      panel.addEventListener('change', record);
      this.shadowRoot.getElementById('sentiment-advanced')?.addEventListener('toggle', (e) => {
        this.sentimentAdvancedOpen = (e.target as HTMLDetailsElement).open;
      });
      panel.addEventListener('keydown', (e) => {
        const key = (e as KeyboardEvent).key;
        if (key === 'Escape') {
          e.preventDefault();
          this.closeSentimentPanel(true);
        } else if (key === 'Enter' && (e.target as HTMLInputElement).type === 'number') {
          e.preventDefault();
          this.applySentimentPanel();
        }
      });
      this.shadowRoot
        .getElementById('sentiment-apply')
        ?.addEventListener('click', () => this.applySentimentPanel());
      this.shadowRoot
        .getElementById('sentiment-clear')
        ?.addEventListener('click', () => this.clearSentimentPanel());
    }

    // Row click handlers
    const rows = this.shadowRoot.querySelectorAll('tbody tr[data-call-id]');
    rows.forEach((row) => {
      const callId = row.getAttribute('data-call-id');
      if (!callId) return;

      // Click handler
      row.addEventListener('click', () => this.handleRowClick(callId));

      // Keyboard handler
      row.addEventListener('keydown', (e) => {
        if ((e as KeyboardEvent).key === 'Enter' || (e as KeyboardEvent).key === ' ') {
          e.preventDefault();
          this.handleRowClick(callId);
        }
      });
    });
  }

  /**
   * Handle row click
   */
  private handleRowClick(callId: string): void {
    const call = this.callLogs.find((c) => c.id === callId);
    if (call && this._onRowClick) {
      this._onRowClick({ callId, call });
    }
  }

  /**
   * Navigate to previous page using URL
   */
  private async goToPreviousPage(): Promise<void> {
    if (!this.previousPageUrl) return;
    this.currentOffset = Math.max(0, this.currentOffset - this.limit);
    await this.loadPage(this.previousPageUrl);
  }

  /**
   * Navigate to next page using URL
   */
  private async goToNextPage(): Promise<void> {
    if (!this.nextPageUrl) return;
    this.currentOffset += this.limit;
    await this.loadPage(this.nextPageUrl);
  }

  /**
   * Set date range filter and reload data (for React integration)
   */
  setDateRange(dateRange: DateRange): void {
    // A host may apply the same range again (a fresh `{ start, end }` object,
    // say). Re-applying it would reload and undo a preset the user picked since.
    if (
      this.hostDateRange &&
      this.hostDateRange.start === dateRange.start &&
      this.hostDateRange.end === dateRange.end
    )
      return;
    const range = dateRange.start || dateRange.end ? dateRange : undefined;
    this.hostDateRange = range;
    this.dateRange = range;
    this.filters = { ...this.filters, datePreset: undefined };
    if (this.isInitialized) this.loadData();
  }

  /**
   * Set toolbar filters and reload data (for React integration, or restoring
   * filters a host persisted from onFiltersChange). Does not fire
   * onFiltersChange.
   */
  setFilters(filters: CallLogFilters): void {
    // A no-op for the filters already applied, so a host that feeds
    // onFiltersChange back in does not reload the list.
    const keys = ['search', 'direction', 'datePreset', 'remote_number'] as const;
    if (
      keys.every((k) => (filters[k] || undefined) === (this.filters[k] || undefined)) &&
      sameStatuses(filters.status, this.filters.status) &&
      filters.connected === this.filters.connected &&
      filters.dateRange?.start === this.filters.dateRange?.start &&
      filters.dateRange?.end === this.filters.dateRange?.end &&
      sameSentimentFilters(filters, this.filters)
    )
      return;

    this.cancelSearchDebounce();
    // Closed with a render, not just flagged: a reload over rows on screen
    // does not re-render until it settles, and an open panel left live until
    // then could apply its stale draft over the filters set here.
    this.closeSentimentPanel();
    this.closeDatePanel();
    this.filters = { ...filters };
    this.searchText = filters.search ?? '';
    // With neither, the window falls back to the host's, as Clear filters
    // does: keeping the last one would filter on a window nothing shows.
    if (filters.dateRange) this.dateRange = filters.dateRange;
    else if (filters.datePreset) this.dateRange = undefined;
    else this.dateRange = this.hostDateRange;
    if (this.isInitialized) this.loadData();
  }

  /**
   * Set page size limit (for React integration)
   */
  setLimit(limit: number): void {
    if (limit === this.limit) return;
    this.limit = limit;
    if (this.isInitialized) this.loadData();
  }
}

// Register the custom element
if (typeof window !== 'undefined' && !customElements.get('dialstack-call-logs')) {
  customElements.define('dialstack-call-logs', CallLogsComponent);
}
