/**
 * CallLogs Web Component
 */

import { parsePhoneNumber, type PhoneNumber } from 'libphonenumber-js';
import { BaseComponent } from './base-component';

/**
 * Call log data structure from API
 */
interface CallLog {
  id: string;
  user_id?: string;
  endpoint_id?: string;
  did_id?: string;
  direction: 'inbound' | 'outbound' | 'internal';
  from_number: string;
  to_number: string;
  started_at: string;
  answered_at?: string;
  ended_at?: string;
  duration_seconds?: number;
  status: 'completed' | 'no-answer' | 'busy' | 'failed' | 'voicemail';
}

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

  protected initialize(): void {
    if (this.isInitialized) return;
    this.render();
    this.loadData();
    this.isInitialized = true;
  }

  /**
   * Load call logs from API
   */
  private async loadData(): Promise<void> {
    if (!this.instance) {
      this.error = 'Component not initialized with instance';
      this.render();
      return;
    }

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
      this.error = err instanceof Error ? err.message : 'Failed to load call logs';
      this.callLogs = [];
      this.totalCount = 0;
    } finally {
      this.isLoading = false;
      this.render();
    }
  }

  /**
   * Format timestamp to localized date/time string
   */
  private formatDate(timestamp: string): string {
    try {
      const date = new Date(timestamp);
      return date.toLocaleString('en-US', {
        month: 'short',
        day: 'numeric',
        year: 'numeric',
        hour: 'numeric',
        minute: '2-digit',
        hour12: true,
        timeZoneName: 'short',
      });
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
      // Try to parse with US as default country
      const parsed: PhoneNumber | undefined = parsePhoneNumber(phone, 'US');
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
   * Format status for display
   */
  private formatStatus(status: string): string {
    return status
      .replace(/-/g, ' ')
      .replace(/\b\w/g, (l) => l.toUpperCase());
  }

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
          padding: calc(var(--ds-spacing-unit) * 2);
          background: var(--ds-color-background);
          color: var(--ds-color-text);
          border: 1px solid rgba(0, 0, 0, 0.1);
          border-radius: var(--ds-border-radius);
        }

        .loading,
        .error,
        .empty {
          padding: calc(var(--ds-spacing-unit) * 3);
          text-align: center;
          background: rgba(0, 0, 0, 0.02);
          border-radius: var(--ds-border-radius);
        }

        .error {
          background: rgba(229, 72, 77, 0.1);
          color: var(--ds-color-danger);
        }

        .spinner {
          display: inline-block;
          width: 24px;
          height: 24px;
          border: 3px solid rgba(0, 0, 0, 0.1);
          border-top-color: var(--ds-color-primary);
          border-radius: 50%;
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
          font-size: 0.875rem;
        }

        thead {
          background: rgba(0, 0, 0, 0.03);
        }

        th {
          text-align: left;
          padding: calc(var(--ds-spacing-unit) * 1.5);
          font-weight: 600;
          border-bottom: 2px solid rgba(0, 0, 0, 0.1);
        }

        td {
          padding: calc(var(--ds-spacing-unit) * 1.5);
          border-bottom: 1px solid rgba(0, 0, 0, 0.05);
        }

        tr:hover {
          background: rgba(0, 0, 0, 0.02);
        }

        .badge {
          display: inline-block;
          padding: 2px 8px;
          border-radius: 12px;
          font-size: 0.75rem;
          font-weight: 500;
          text-transform: capitalize;
        }

        .badge-inbound {
          background: rgba(16, 185, 129, 0.1);
          color: #059669;
        }

        .badge-outbound {
          background: rgba(59, 130, 246, 0.1);
          color: #2563eb;
        }

        .badge-answered {
          background: rgba(16, 185, 129, 0.1);
          color: #059669;
        }

        .badge-no-answer {
          background: rgba(245, 158, 11, 0.1);
          color: #d97706;
        }

        .badge-failed {
          background: rgba(239, 68, 68, 0.1);
          color: #dc2626;
        }

        .badge-voicemail {
          background: rgba(139, 92, 246, 0.1);
          color: #7c3aed;
        }

        .badge-default {
          background: rgba(0, 0, 0, 0.05);
          color: var(--ds-color-text);
        }

        .pagination {
          display: flex;
          align-items: center;
          justify-content: space-between;
          margin-top: calc(var(--ds-spacing-unit) * 2);
          padding-top: calc(var(--ds-spacing-unit) * 2);
          border-top: 1px solid rgba(0, 0, 0, 0.1);
        }

        .pagination-info {
          font-size: 0.875rem;
          color: rgba(0, 0, 0, 0.6);
        }

        .pagination-buttons {
          display: flex;
          gap: calc(var(--ds-spacing-unit) * 1);
        }

        .pagination-btn {
          padding: 6px 12px;
          font-size: 0.875rem;
          font-weight: 500;
          border: 1px solid rgba(0, 0, 0, 0.2);
          border-radius: var(--ds-border-radius);
          background: var(--ds-color-background);
          color: var(--ds-color-text);
          cursor: pointer;
          transition: all 0.15s ease;
        }

        .pagination-btn:hover:not(:disabled) {
          background: rgba(0, 0, 0, 0.05);
          border-color: rgba(0, 0, 0, 0.3);
        }

        .pagination-btn:disabled {
          opacity: 0.4;
          cursor: not-allowed;
        }

        .page-size-selector {
          display: flex;
          align-items: center;
          gap: 8px;
          font-size: 0.875rem;
          color: rgba(0, 0, 0, 0.6);
        }

        .page-size-select {
          padding: 4px 8px;
          font-size: 0.875rem;
          border: 1px solid rgba(0, 0, 0, 0.2);
          border-radius: var(--ds-border-radius);
          background: var(--ds-color-background);
          color: var(--ds-color-text);
          cursor: pointer;
        }

        .page-size-select:hover {
          border-color: rgba(0, 0, 0, 0.3);
        }
      </style>

      <div class="container">
        ${this.renderContent()}
      </div>
    `;

    // Attach event listeners after DOM is updated
    this.attachPaginationListeners();
  }

  /**
   * Render content based on state
   */
  private renderContent(): string {
    if (this.isLoading) {
      return `
        <div class="loading">
          <div class="spinner"></div>
          <p>Loading call logs...</p>
        </div>
      `;
    }

    if (this.error) {
      return `
        <div class="error">
          <p><strong>Error:</strong> ${this.error}</p>
        </div>
      `;
    }

    if (this.callLogs.length === 0) {
      return `
        <div class="empty">
          <p>No call logs found</p>
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
      <tr>
        <td>${this.formatDate(call.started_at)}</td>
        <td><span class="badge ${this.getDirectionClass(call.direction)}">${call.direction}</span></td>
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
        <table>
          <thead>
            <tr>
              <th>Date</th>
              <th>Direction</th>
              <th>From</th>
              <th>To</th>
              <th>Duration</th>
              <th>Status</th>
            </tr>
          </thead>
          <tbody>
            ${rows}
          </tbody>
        </table>
      </div>
      <div class="pagination">
        <span class="pagination-info">
          Showing ${startItem}–${endItem} of ${this.totalCount} calls
        </span>
        <div class="page-size-selector">
          <label for="page-size">Per page:</label>
          <select id="page-size" class="page-size-select">
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
            <button class="pagination-btn" id="prev-btn" ${hasPrev ? '' : 'disabled'}>
              ← Previous
            </button>
            <button class="pagination-btn" id="next-btn" ${hasNext ? '' : 'disabled'}>
              Next →
            </button>
          </div>
        `
            : ''
        }
      </div>
    `;
  }

  /**
   * Attach event listeners after render
   */
  private attachPaginationListeners(): void {
    if (!this.shadowRoot) return;

    const prevBtn = this.shadowRoot.getElementById('prev-btn');
    const nextBtn = this.shadowRoot.getElementById('next-btn');
    const pageSizeSelect = this.shadowRoot.getElementById('page-size') as HTMLSelectElement;

    prevBtn?.addEventListener('click', () => this.goToPreviousPage());
    nextBtn?.addEventListener('click', () => this.goToNextPage());
    pageSizeSelect?.addEventListener('change', () => this.changePageSize(parseInt(pageSizeSelect.value, 10)));
  }

  /**
   * Navigate to previous page
   */
  private goToPreviousPage(): void {
    if (this.offset > 0) {
      this.offset = Math.max(0, this.offset - this.limit);
      this.loadData();
    }
  }

  /**
   * Navigate to next page
   */
  private goToNextPage(): void {
    if (this.offset + this.limit < this.totalCount) {
      this.offset += this.limit;
      this.loadData();
    }
  }

  /**
   * Change page size and reload from first page
   */
  private changePageSize(newLimit: number): void {
    this.limit = newLimit;
    this.offset = 0;
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
