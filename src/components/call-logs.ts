/**
 * CallLogs Web Component
 */

import { BaseComponent } from './base-component';

/**
 * Call log data structure from API
 */
interface CallLog {
  calldate: string;
  direction: 'inbound' | 'outbound';
  clid: string;
  from_number: string;
  dst: string;
  to_number: string;
  billsec: number;
  disposition: string;
}

/**
 * API response structure
 */
interface CallLogsResponse {
  call_logs: CallLog[];
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
  // Note: These properties are set via setter methods for React integration
  // and will be used for API filtering/pagination in future updates
  private dateRange?: DateRange;
  private limit: number = 20;
  private offset: number = 0;

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
      // Note: dateRange, limit, offset will be used for API query parameters
      // once the backend API supports filtering and pagination
      const data = await this.fetchComponentData<CallLogsResponse>('/calls');
      this.callLogs = data.call_logs || [];
      this.error = null;

      // Silence unused variable warnings (these are set via setters for React integration)
      void this.dateRange;
      void this.limit;
      void this.offset;
    } catch (err) {
      this.error = err instanceof Error ? err.message : 'Failed to load call logs';
      this.callLogs = [];
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
      return date.toLocaleString(undefined, {
        month: 'short',
        day: 'numeric',
        year: 'numeric',
        hour: 'numeric',
        minute: '2-digit',
        hour12: true,
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
   * Extract phone number from CLID (e.g., "John Doe <555-1234>" -> "555-1234")
   */
  private formatPhoneNumber(clid: string): string {
    const match = clid.match(/<(.+)>/);
    return match ? match[1] : clid;
  }

  /**
   * Get color class for call direction
   */
  private getDirectionClass(direction: string): string {
    return direction === 'inbound' ? 'badge-inbound' : 'badge-outbound';
  }

  /**
   * Get color class for call disposition/status
   */
  private getDispositionClass(disposition: string): string {
    const upper = disposition.toUpperCase();
    if (upper.includes('ANSWER')) return 'badge-answered';
    if (upper.includes('NO ANSWER') || upper.includes('NOANSWER')) return 'badge-no-answer';
    if (upper.includes('BUSY') || upper.includes('FAIL') || upper.includes('CANCEL'))
      return 'badge-failed';
    return 'badge-default';
  }

  /**
   * Format disposition for display
   */
  private formatDisposition(disposition: string): string {
    return disposition
      .toLowerCase()
      .replace(/_/g, ' ')
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

        h3 {
          margin: 0 0 calc(var(--ds-spacing-unit) * 2) 0;
          color: var(--ds-color-primary);
          font-size: 1.25rem;
          font-weight: 600;
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

        .badge-default {
          background: rgba(0, 0, 0, 0.05);
          color: var(--ds-color-text);
        }
      </style>

      <div class="container">
        <h3>Call Logs</h3>
        ${this.renderContent()}
      </div>
    `;
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
        <td>${this.formatDate(call.calldate)}</td>
        <td><span class="badge ${this.getDirectionClass(call.direction)}">${call.direction}</span></td>
        <td>${this.formatPhoneNumber(call.clid)}</td>
        <td>${call.to_number || call.dst}</td>
        <td>${this.formatDuration(call.billsec)}</td>
        <td><span class="badge ${this.getDispositionClass(call.disposition)}">${this.formatDisposition(call.disposition)}</span></td>
      </tr>
    `
      )
      .join('');

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
    `;
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
