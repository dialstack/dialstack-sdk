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
} from '../types';

const SEARCH_INPUT_ID = 'ds-call-logs-search';

// Each settled search is a server round-trip, and a selective one can be the
// most expensive read the list endpoint serves, so wait for typing to pause.
const SEARCH_DEBOUNCE_MS = 300;

const DATE_PRESET_DAYS: Record<'7d' | '30d' | '90d', number> = { '7d': 7, '30d': 30, '90d': 90 };

const DIRECTIONS = ['inbound', 'outbound', 'internal'] as const;
const STATUSES = ['completed', 'no-answer', 'busy', 'failed', 'voicemail'] as const;

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
  setOnRowClick(callback: (event: { callId: string; call: CallLog }) => void): void {
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
    this.displayOptions = { ...this.displayOptions, ...options };
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
    this.classes = { ...this.classes, ...classes };
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
      from_date: fromDate,
      to_date: toDate,
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
    const { search, direction, status, datePreset } = this.filters;
    const dateActive =
      datePreset !== undefined &&
      (this.hostDateRange !== undefined ||
        (datePreset !== this.defaultDatePreset() && datePreset !== 'all'));
    return Boolean(search || direction || status || dateActive);
  }

  /**
   * Apply a toolbar change: reload from the first page and tell the host.
   */
  private applyFilters(patch: CallLogFilters): void {
    this.filters = { ...this.filters, ...patch };
    // Choosing a preset replaces a host-set custom range.
    if ('datePreset' in patch) this.dateRange = undefined;
    this._onFiltersChange?.({ ...this.filters });
    this.loadData();
  }

  private clearFilters(): void {
    this.cancelSearchDebounce();
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

  protected override cleanup(): void {
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
   * Get color class for MOS quality score
   */
  private getMosClass(mos: number | null | undefined): string {
    if (mos == null) return 'badge-quality-unavailable';
    if (mos >= 4.0) return 'badge-quality-good';
    if (mos >= 3.0) return 'badge-quality-fair';
    return 'badge-quality-poor';
  }

  /**
   * Get quality tooltip for MOS score
   */
  private getMosTooltip(mos: number | null | undefined): string {
    if (mos == null) return this.t('callLogs.quality.unavailableTooltip');
    if (mos >= 4.0) return this.t('callLogs.quality.good');
    if (mos >= 3.0) return this.t('callLogs.quality.fair');
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
    }
  }

  private renderToolbar(): string {
    const option = (value: string, label: string, selected: boolean) =>
      `<option value="${value}"${selected ? ' selected' : ''}>${this.escapeHtml(label)}</option>`;
    const placeholder = this.escapeHtml(this.t('callLogs.filters.searchPlaceholder'));
    const preset = this.effectiveDatePreset();

    const directions = [
      option('', this.t('callLogs.filters.allDirections'), !this.filters.direction),
      ...DIRECTIONS.map((d) =>
        option(d, this.t(`callLogs.directions.${d}`), this.filters.direction === d)
      ),
    ].join('');
    const statuses = [
      option('', this.t('callLogs.filters.allStatuses'), !this.filters.status),
      ...STATUSES.map((st) => option(st, this.formatStatus(st), this.filters.status === st)),
    ].join('');
    const presets: CallLogDatePreset[] = ['7d', '30d', '90d', 'all'];
    if (preset === 'custom') presets.push('custom');
    const dates = presets
      .map((p) => option(p, this.t(`callLogs.filters.dates.${p}`), preset === p))
      .join('');

    return `
      <div class="toolbar" part="toolbar" role="search">
        <input
          id="${SEARCH_INPUT_ID}"
          type="search"
          class="search-input"
          part="search-input"
          placeholder="${placeholder}"
          aria-label="${placeholder}"
          autocomplete="off"
          maxlength="100"
          value="${this.escapeHtml(this.searchText)}"
        />
        <select id="filter-direction" class="filter-select" part="filter-select filter-direction" aria-label="${this.t('callLogs.columns.direction')}">${directions}</select>
        <select id="filter-status" class="filter-select" part="filter-select filter-status" aria-label="${this.t('callLogs.columns.status')}">${statuses}</select>
        <select id="filter-date" class="filter-select" part="filter-select filter-date" aria-label="${this.t('callLogs.filters.dateRange')}">${dates}</select>
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
    const { showDate, showDirection, showFrom, showTo, showDuration, showStatus, showQuality } =
      this.displayOptions;

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
      const value = (e.target as HTMLSelectElement).value as CallLogFilters['status'] | '';
      this.applyFilters({ status: value || undefined });
    });
    this.shadowRoot.getElementById('filter-date')?.addEventListener('change', (e) => {
      const value = (e.target as HTMLSelectElement).value as CallLogDatePreset;
      if (value === 'custom') return;
      this.applyFilters({ datePreset: value });
    });
    this.shadowRoot
      .getElementById('clear-filters-btn')
      ?.addEventListener('click', () => this.clearFilters());

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
    // React re-runs setters every render. Re-applying the same range would
    // reload each time and undo a preset the user picked since.
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
    // onFiltersChange back in (React re-runs the setter every render) does not
    // reload the list.
    const keys: Array<keyof CallLogFilters> = ['search', 'direction', 'status', 'datePreset'];
    if (keys.every((k) => (filters[k] || undefined) === (this.filters[k] || undefined))) return;

    this.cancelSearchDebounce();
    this.filters = { ...filters };
    this.searchText = filters.search ?? '';
    if (filters.datePreset) this.dateRange = undefined;
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
