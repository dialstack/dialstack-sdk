/**
 * CallLogs Web Component
 */

import { parsePhoneNumber, type CountryCode, type PhoneNumber } from 'libphonenumber-js';
import { BaseComponent } from './base-component';
import type { CallLog } from '../core/types';

/**
 * API response structure
 */
interface CallLogsResponse {
  calls: CallLog[];
  count: number;
  limit: number;
  offset: number;
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
  private limit: number = 20;
  private offset: number = 0;
  private totalCount: number = 0;

  private isLoading: boolean = false;
  private error: string | null = null;
  private callLogs: CallLog[] = [];

  // Callbacks
  private _onPageChange?: (event: { offset: number; limit: number }) => void;
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
   * Set callback for page change events
   */
  setOnPageChange(callback: (event: { offset: number; limit: number }) => void): void {
    this._onPageChange = callback;
  }

  /**
   * Set callback for row click events
   */
  setOnRowClick(callback: (event: { callId: string; call: CallLog }) => void): void {
    this._onRowClick = callback;
  }

  // ============================================================================
  // Data Loading
  // ============================================================================

  /**
   * Load call logs from API
   */
  private async loadData(): Promise<void> {
    if (!this.instance) {
      this.error = this.t('common.error');
      this.render();
      return;
    }

    this._onLoaderStart?.({ elementTagName: 'dialstack-call-logs' });
    this.isLoading = true;
    this.error = null;
    this.render();

    try {
      const params = new URLSearchParams({
        limit: this.limit.toString(),
        offset: this.offset.toString(),
      });

      if (this.dateRange?.start) {
        params.set('from', this.dateRange.start);
      }
      if (this.dateRange?.end) {
        params.set('to', this.dateRange.end);
      }

      const data = await this.fetchComponentData<CallLogsResponse>(`/v1/calls?${params}`);
      this.callLogs = data.calls || [];
      this.totalCount = data.count || 0;
      this.error = null;
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : this.t('callLogs.loading');
      this.error = errorMessage;
      this._onLoadError?.({ error: errorMessage, elementTagName: 'dialstack-call-logs' });
      this.callLogs = [];
      this.totalCount = 0;
    } finally {
      this.isLoading = false;
      this.render();
    }
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
          width: 24px;
          height: 24px;
          border: 3px solid var(--ds-color-border);
          border-top-color: var(--ds-color-primary);
          border-radius: var(--ds-border-radius-round);
          animation: spin 0.8s linear infinite;
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
          background: color-mix(in srgb, #7c3aed 10%, transparent);
          color: #7c3aed;
        }

        .badge-default {
          background: var(--ds-color-surface-subtle);
          color: var(--ds-color-text-secondary);
        }

        .pagination {
          display: flex;
          align-items: center;
          justify-content: space-between;
          padding-top: var(--ds-spacing-lg);
          margin-top: var(--ds-spacing-lg);
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

        .page-size-selector {
          display: flex;
          align-items: center;
          gap: var(--ds-spacing-sm);
          font-size: var(--ds-font-size-base);
          color: var(--ds-color-text-secondary);
        }

        .page-size-select {
          padding: var(--ds-spacing-xs) var(--ds-spacing-sm);
          font-size: var(--ds-font-size-base);
          border: 1px solid var(--ds-color-border);
          border-radius: var(--ds-border-radius);
          background: var(--ds-color-background);
          color: var(--ds-color-text);
          cursor: pointer;
        }

        .page-size-select:hover {
          border-color: var(--ds-color-border);
        }
      </style>

      <div class="container" role="region" aria-label="${this.t('callLogs.title')}">
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
        <div class="loading" role="status" aria-live="polite">
          <div class="spinner" aria-hidden="true"></div>
          <p>${this.t('callLogs.loading')}</p>
        </div>
      `;
    }

    if (this.error) {
      return `
        <div class="error" role="alert">
          <p><strong>${this.t('common.error')}:</strong> ${this.error}</p>
        </div>
      `;
    }

    if (this.callLogs.length === 0) {
      return `
        <div class="empty" role="status">
          <p>${this.t('callLogs.empty')}</p>
        </div>
      `;
    }

    return this.renderTable();
  }

  /**
   * Render the call logs table
   */
  private renderTable(): string {
    const rows = this.callLogs
      .map(
        (call) => `
      <tr data-call-id="${call.id}" tabindex="0" role="row">
        <td>${this.formatDate(call.started_at)}</td>
        <td><span class="badge ${this.getDirectionClass(call.direction)}">${this.formatDirection(call.direction)}</span></td>
        <td>${this.formatPhoneNumber(call.from_number)}</td>
        <td>${this.formatPhoneNumber(call.to_number)}</td>
        <td>${this.formatDuration(call.duration_seconds || 0)}</td>
        <td><span class="badge ${this.getStatusClass(call.status)}">${this.formatStatus(call.status)}</span></td>
      </tr>
    `
      )
      .join('');

    const totalPages = Math.ceil(this.totalCount / this.limit);
    const startItem = this.offset + 1;
    const endItem = Math.min(this.offset + this.limit, this.totalCount);

    const hasPrev = this.offset > 0;
    const hasNext = this.offset + this.limit < this.totalCount;

    return `
      <div class="table-container">
        <table role="grid" aria-label="${this.t('callLogs.title')}">
          <thead>
            <tr role="row">
              <th role="columnheader" scope="col">${this.t('callLogs.columns.date')}</th>
              <th role="columnheader" scope="col">${this.t('callLogs.columns.direction')}</th>
              <th role="columnheader" scope="col">${this.t('callLogs.columns.from')}</th>
              <th role="columnheader" scope="col">${this.t('callLogs.columns.to')}</th>
              <th role="columnheader" scope="col">${this.t('callLogs.columns.duration')}</th>
              <th role="columnheader" scope="col">${this.t('callLogs.columns.status')}</th>
            </tr>
          </thead>
          <tbody>
            ${rows}
          </tbody>
        </table>
      </div>
      <nav class="pagination" aria-label="Pagination">
        <span class="pagination-info" aria-live="polite">
          ${this.t('common.showing', { start: startItem, end: endItem, total: this.totalCount })}
        </span>
        <div class="page-size-selector">
          <label for="page-size">${this.t('common.perPage')}:</label>
          <select id="page-size" class="page-size-select" aria-label="${this.t('common.perPage')}">
            <option value="10" ${this.limit === 10 ? 'selected' : ''}>10</option>
            <option value="20" ${this.limit === 20 ? 'selected' : ''}>20</option>
            <option value="50" ${this.limit === 50 ? 'selected' : ''}>50</option>
            <option value="100" ${this.limit === 100 ? 'selected' : ''}>100</option>
          </select>
        </div>
        ${
          totalPages > 1
            ? `
          <div class="pagination-buttons">
            <button class="pagination-btn" id="prev-btn" ${hasPrev ? '' : 'disabled'} aria-label="${this.t('common.previous')}">
              ← ${this.t('common.previous')}
            </button>
            <button class="pagination-btn" id="next-btn" ${hasNext ? '' : 'disabled'} aria-label="${this.t('common.next')}">
              ${this.t('common.next')} →
            </button>
          </div>
        `
            : ''
        }
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
    const pageSizeSelect = this.shadowRoot.getElementById('page-size') as HTMLSelectElement;

    prevBtn?.addEventListener('click', () => this.goToPreviousPage());
    nextBtn?.addEventListener('click', () => this.goToNextPage());
    pageSizeSelect?.addEventListener('change', () =>
      this.changePageSize(parseInt(pageSizeSelect.value, 10))
    );

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
   * Navigate to previous page
   */
  private goToPreviousPage(): void {
    if (this.offset > 0) {
      this.offset = Math.max(0, this.offset - this.limit);
      this._onPageChange?.({ offset: this.offset, limit: this.limit });
      this.loadData();
    }
  }

  /**
   * Navigate to next page
   */
  private goToNextPage(): void {
    if (this.offset + this.limit < this.totalCount) {
      this.offset += this.limit;
      this._onPageChange?.({ offset: this.offset, limit: this.limit });
      this.loadData();
    }
  }

  /**
   * Change page size and reload from first page
   */
  private changePageSize(newLimit: number): void {
    this.limit = newLimit;
    this.offset = 0;
    this._onPageChange?.({ offset: this.offset, limit: this.limit });
    this.loadData();
  }

  /**
   * Set date range filter and reload data (for React integration)
   */
  setDateRange(dateRange: DateRange): void {
    this.dateRange = dateRange;
    this.loadData();
  }

  /**
   * Set limit and reload data (for React integration)
   */
  setLimit(limit: number): void {
    this.limit = limit;
    this.loadData();
  }

  /**
   * Set offset for pagination (for React integration)
   */
  setOffset(offset: number): void {
    this.offset = offset;
    this.loadData();
  }
}

// Register the custom element
if (typeof window !== 'undefined' && !customElements.get('dialstack-call-logs')) {
  customElements.define('dialstack-call-logs', CallLogsComponent);
}
