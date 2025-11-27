/**
 * CallLogs Web Component
 */

import { parsePhoneNumber, type CountryCode, type PhoneNumber } from 'libphonenumber-js';
import { BaseComponent } from './base-component';
import type {
  CallLog,
  CallLogDisplayOptions,
  CallLogRowRenderer,
  CallLogsClasses,
} from '../core/types';

/**
 * API response structure (URL-based pagination)
 */
interface CallLogsResponse {
  object: 'list';
  url: string;
  next_page_url: string | null;
  previous_page_url: string | null;
  data: CallLog[];
}

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
  private dateRange?: DateRange;
  private limit: number = 10;

  private isLoading: boolean = false;
  private isPaginating: boolean = false;
  private error: string | null = null;
  private callLogs: CallLog[] = [];

  // URL-based pagination state
  private nextPageUrl: string | null = null;
  private previousPageUrl: string | null = null;

  // Track total and position for pagination display
  private estimatedTotal: number | null = null; // null = unknown, number = known count
  private hasMoreThan100: boolean = false;
  private currentOffset: number = 0; // Estimated position in result set

  // Display options
  private displayOptions: Required<CallLogDisplayOptions> = {
    showDate: true,
    showDirection: true,
    showFrom: true,
    showTo: true,
    showDuration: true,
    showStatus: true,
  };

  // Custom row renderer
  private customRowRenderer?: CallLogRowRenderer;

  // Override classes type for component-specific classes
  protected override classes: CallLogsClasses = {};

  // Callbacks
  private _onRowClick?: (event: { callId: string; call: CallLog }) => void;

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
   * Set display options (partial override)
   */
  setDisplayOptions(options: CallLogDisplayOptions): void {
    this.displayOptions = { ...this.displayOptions, ...options };
    if (this.isInitialized) {
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
    this.estimatedTotal = null;
    this.hasMoreThan100 = false;
    this.currentOffset = 0;

    this.isLoading = true;
    this.error = null;
    this.render();

    try {
      // First, fetch with limit=100 to estimate total count
      const estimateParams = new URLSearchParams({ limit: '100' });
      if (this.dateRange?.start) estimateParams.set('from', this.dateRange.start);
      if (this.dateRange?.end) estimateParams.set('to', this.dateRange.end);

      const estimateData = await this.fetchComponentData<CallLogsResponse>(`/v1/calls?${estimateParams}`);

      // Determine total count
      const itemCount = estimateData.data?.length || 0;
      if (itemCount === 100 && estimateData.next_page_url) {
        // More than 100 items
        this.hasMoreThan100 = true;
        this.estimatedTotal = null;
      } else {
        // Exact count (less than 100)
        this.hasMoreThan100 = false;
        this.estimatedTotal = itemCount;
      }

      // Now fetch the actual first page with normal limit
      const params = new URLSearchParams({ limit: this.limit.toString() });
      if (this.dateRange?.start) params.set('from', this.dateRange.start);
      if (this.dateRange?.end) params.set('to', this.dateRange.end);

      const pageData = await this.fetchComponentData<CallLogsResponse>(`/v1/calls?${params}`);
      this.callLogs = pageData.data || [];
      this.nextPageUrl = pageData.next_page_url;
      this.previousPageUrl = pageData.previous_page_url;

      this.error = null;
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : this.t('callLogs.loading');
      this.error = errorMessage;
      this._onLoadError?.({ error: errorMessage, elementTagName: 'dialstack-call-logs' });
      this.callLogs = [];
      this.nextPageUrl = null;
      this.previousPageUrl = null;
    } finally {
      this.isLoading = false;
      this.render();
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

    // Show pagination loading state
    this.isPaginating = true;
    this.updatePaginationState();

    try {
      const data = await this.fetchComponentData<CallLogsResponse>(pageUrl);

      this.callLogs = data.data || [];
      this.nextPageUrl = data.next_page_url;
      this.previousPageUrl = data.previous_page_url;

      this.error = null;
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : this.t('callLogs.loading');
      this.error = errorMessage;
      this._onLoadError?.({ error: errorMessage, elementTagName: 'dialstack-call-logs' });
      this.callLogs = [];
      this.nextPageUrl = null;
      this.previousPageUrl = null;
    } finally {
      this.isPaginating = false;
      this.render();
    }
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
   * Get color class for call direction
   */
  private getDirectionClass(direction: string): string {
    return direction === 'inbound' ? 'badge-inbound' : 'badge-outbound';
  }

  /**
   * Get color class for call status
   */
  private getStatusClass(status: string): string {
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
   * Format direction for display using i18n
   */
  private formatDirection(direction: 'inbound' | 'outbound' | 'internal'): string {
    return this.t(`callLogs.directions.${direction}`);
  }

  /**
   * Format status for display using i18n
   */
  private formatStatus(status: string): string {
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

        .table-container {
          overflow-x: auto;
        }

        table {
          width: 100%;
          border-collapse: collapse;
          font-size: var(--ds-font-size-base);
        }

        thead {
          background: var(--ds-color-surface-subtle);
        }

        th {
          text-align: left;
          padding: var(--ds-spacing-md);
          font-weight: var(--ds-font-weight-bold);
          border-bottom: 2px solid var(--ds-color-border);
        }

        td {
          padding: var(--ds-spacing-md);
          border-bottom: 1px solid var(--ds-color-border-subtle);
        }

        tbody tr {
          cursor: pointer;
        }

        tbody tr:hover {
          background: var(--ds-color-surface-subtle);
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

        .pagination {
          display: flex;
          align-items: center;
          justify-content: space-between;
          padding-top: var(--ds-spacing-lg);
          border-top: 1px solid var(--ds-color-border);
        }

        .pagination-info {
          font-size: var(--ds-font-size-base);
          color: var(--ds-color-text-secondary);
        }

        .pagination-buttons {
          display: flex;
          gap: var(--ds-spacing-sm);
        }

        .pagination-btn {
          padding: var(--ds-spacing-xs) var(--ds-spacing-md);
          font-size: var(--ds-font-size-base);
          font-weight: var(--ds-font-weight-medium);
          border: 1px solid var(--ds-color-border);
          border-radius: var(--ds-border-radius);
          background: var(--ds-color-background);
          color: var(--ds-color-text);
          cursor: pointer;
          transition: all var(--ds-transition-duration) ease;
        }

        .pagination-btn:hover:not(:disabled) {
          background: var(--ds-color-surface-subtle);
          border-color: var(--ds-color-border);
        }

        .pagination-btn:disabled {
          opacity: 0.4;
          cursor: not-allowed;
        }

        .pagination-btn svg {
          width: 1em;
          height: 1em;
          vertical-align: middle;
        }
      </style>

      <div class="container ${this.getClassNames()}" part="container" role="region" aria-label="${this.t('callLogs.title')}">
        ${this.renderContent()}
      </div>
    `;

    // Attach event listeners after DOM is updated
    this.attachEventListeners();
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

    // Show total count or "100+" if there are more than 100 items
    if (this.hasMoreThan100) {
      return `${start}-${end} of 100+`;
    } else if (this.estimatedTotal !== null) {
      return `${start}-${end} of ${this.estimatedTotal}`;
    } else {
      // Fallback to showing just the count
      return `${this.callLogs.length} ${this.t('common.items')}`;
    }
  }

  /**
   * Render the call logs table
   */
  private renderTable(): string {
    const { showDate, showDirection, showFrom, showTo, showDuration, showStatus } = this.displayOptions;

    const rows = this.callLogs
      .map((call) => {
        // Build row classes
        const rowClasses: string[] = [];
        if (this.classes.row) rowClasses.push(this.classes.row);
        if (call.direction === 'inbound' && this.classes.rowInbound) rowClasses.push(this.classes.rowInbound);
        if (call.direction === 'outbound' && this.classes.rowOutbound) rowClasses.push(this.classes.rowOutbound);
        const rowClassStr = rowClasses.length > 0 ? ` class="${rowClasses.join(' ')}"` : '';

        // Use custom row renderer if provided
        if (this.customRowRenderer) {
          return `<tr data-call-id="${call.id}" tabindex="0" role="row" part="table-row"${rowClassStr}>${this.customRowRenderer(call)}</tr>`;
        }

        return `
          <tr data-call-id="${call.id}" tabindex="0" role="row" part="table-row"${rowClassStr}>
            ${showDate ? `<td part="cell cell-date">${this.formatDate(call.started_at)}</td>` : ''}
            ${showDirection ? `<td part="cell cell-direction"><span class="badge ${this.getDirectionClass(call.direction)}" part="badge badge-direction">${this.formatDirection(call.direction)}</span></td>` : ''}
            ${showFrom ? `<td part="cell cell-from">${this.formatPhoneNumber(call.from_number)}</td>` : ''}
            ${showTo ? `<td part="cell cell-to">${this.formatPhoneNumber(call.to_number)}</td>` : ''}
            ${showDuration ? `<td part="cell cell-duration">${this.formatDuration(call.duration_seconds || 0)}</td>` : ''}
            ${showStatus ? `<td part="cell cell-status"><span class="badge ${this.getStatusClass(call.status)}" part="badge badge-status">${this.formatStatus(call.status)}</span></td>` : ''}
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
    this.dateRange = dateRange;
    this.loadData();
  }

  /**
   * Set page size limit (for React integration)
   */
  setLimit(limit: number): void {
    this.limit = limit;
    this.loadData();
  }
}

// Register the custom element
if (typeof window !== 'undefined' && !customElements.get('dialstack-call-logs')) {
  customElements.define('dialstack-call-logs', CallLogsComponent);
}
