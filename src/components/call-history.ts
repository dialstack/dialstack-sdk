/**
 * CallHistory Web Component - Compact call history list for a specific phone number
 */

import { BaseComponent } from './base-component';
import type { CallHistoryDisplayOptions, CallLog } from '../types/components';
import type { CallHistoryClasses } from '../types/appearance';

/**
 * API response structure
 */
interface CallsResponse {
  object: 'list';
  url: string;
  next_page_url: string | null;
  previous_page_url: string | null;
  data: CallLog[];
}

/**
 * CallHistory component displays call history for a specific phone number
 * in a compact list format with click-to-call functionality
 */
export class CallHistoryComponent extends BaseComponent {
  private phoneNumber: string | null = null;
  private limit: number = 5;
  private isLoading: boolean = false;
  private error: string | null = null;
  private calls: CallLog[] = [];

  // Display options
  private displayOptions: Required<CallHistoryDisplayOptions> = {
    showDuration: true,
    showRelativeTime: true,
    showDirectionIcon: true,
  };

  // Override classes type for component-specific classes
  protected override classes: CallHistoryClasses = {};

  protected initialize(): void {
    if (this.isInitialized) return;
    this.render();
    if (this.phoneNumber) {
      this.loadData();
    }
    this.isInitialized = true;
  }

  // ============================================================================
  // Configuration Setters
  // ============================================================================

  /**
   * Set the phone number to filter calls by (E.164 format)
   */
  setPhoneNumber(phoneNumber: string): void {
    this.phoneNumber = phoneNumber;
    if (this.isInitialized) {
      this.loadData();
    }
  }

  /**
   * Set the maximum number of calls to display
   */
  setLimit(limit: number): void {
    this.limit = Math.min(Math.max(1, limit), 20);
    if (this.isInitialized && this.phoneNumber) {
      this.loadData();
    }
  }

  /**
   * Set display options
   */
  setDisplayOptions(options: CallHistoryDisplayOptions): void {
    this.displayOptions = { ...this.displayOptions, ...options };
    if (this.isInitialized) {
      this.render();
    }
  }

  /**
   * Override setClasses with component-specific type
   */
  override setClasses(classes: CallHistoryClasses): void {
    this.classes = { ...this.classes, ...classes };
    if (this.isInitialized) {
      this.render();
    }
  }

  // ============================================================================
  // Data Loading
  // ============================================================================

  private async loadData(): Promise<void> {
    if (!this.phoneNumber) {
      this.error = this.t('callHistory.noPhoneNumber');
      this.render();
      return;
    }

    this.isLoading = true;
    this.error = null;
    this.render();

    if (this._onLoaderStart) {
      this._onLoaderStart({ elementTagName: 'dialstack-call-history' });
    }

    try {
      // Fetch calls where this phone is the caller (from_number)
      const fromParams = new URLSearchParams({
        from_number: this.phoneNumber,
        limit: String(this.limit),
      });

      // Fetch calls where this phone is the recipient (to_number)
      const toParams = new URLSearchParams({
        to_number: this.phoneNumber,
        limit: String(this.limit),
      });

      const [fromResponse, toResponse] = await Promise.all([
        this.fetchComponentData<CallsResponse>(`/v1/calls?${fromParams}`),
        this.fetchComponentData<CallsResponse>(`/v1/calls?${toParams}`),
      ]);

      // Merge, dedupe, sort by started_at desc, and limit
      this.calls = this.mergeAndSort([...fromResponse.data, ...toResponse.data], this.limit);
    } catch (err) {
      this.error = err instanceof Error ? err.message : this.t('callHistory.error');
      if (this._onLoadError) {
        this._onLoadError({
          elementTagName: 'dialstack-call-history',
          error: this.error,
        });
      }
    } finally {
      this.isLoading = false;
      this.render();
    }
  }

  /**
   * Merge two arrays, dedupe by ID, sort by started_at desc, limit
   */
  private mergeAndSort(calls: CallLog[], limit: number): CallLog[] {
    // Dedupe by ID
    const seen = new Set<string>();
    const unique = calls.filter((call) => {
      if (seen.has(call.id)) return false;
      seen.add(call.id);
      return true;
    });

    // Sort by started_at descending
    unique.sort((a, b) => {
      const dateA = new Date(a.started_at).getTime();
      const dateB = new Date(b.started_at).getTime();
      return dateB - dateA;
    });

    return unique.slice(0, limit);
  }

  // ============================================================================
  // Formatting Helpers
  // ============================================================================

  /**
   * Format relative time (e.g., "2 min ago", "Yesterday")
   */
  private formatRelativeTime(timestamp: string): string {
    const date = new Date(timestamp);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMs / 3600000);
    const diffDays = Math.floor(diffMs / 86400000);

    const dateLocale = this.formatting.dateLocale || 'en-US';

    if (diffMins < 1) {
      return this.t('callHistory.relativeTime.justNow');
    }
    if (diffMins === 1) {
      return this.t('callHistory.relativeTime.minuteAgo');
    }
    if (diffMins < 60) {
      return this.t('callHistory.relativeTime.minutesAgo', { count: diffMins });
    }
    if (diffHours === 1) {
      return this.t('callHistory.relativeTime.hourAgo');
    }
    if (diffHours < 24) {
      return this.t('callHistory.relativeTime.hoursAgo', { count: diffHours });
    }
    if (diffDays === 1) {
      return this.t('callHistory.relativeTime.yesterday');
    }
    if (diffDays < 7) {
      return date.toLocaleDateString(dateLocale, { weekday: 'long' });
    }
    if (date.getFullYear() === now.getFullYear()) {
      return date.toLocaleDateString(dateLocale, { month: 'short', day: 'numeric' });
    }
    return date.toLocaleDateString(dateLocale, {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    });
  }

  /**
   * Format duration in seconds to human readable (e.g., "1m 23s")
   */
  private formatDuration(seconds: number | undefined): string {
    if (!seconds || seconds === 0) return '0s';

    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;

    if (mins === 0) {
      return `${secs}s`;
    }
    return `${mins}m ${secs}s`;
  }

  /**
   * Determine if a call was missed (inbound + not answered)
   */
  private isMissedCall(call: CallLog): boolean {
    return (
      call.direction === 'inbound' &&
      (call.status === 'no-answer' || call.status === 'busy' || call.status === 'failed')
    );
  }

  /**
   * Determine if a call has a voicemail
   */
  private hasVoicemail(call: CallLog): boolean {
    return call.status === 'voicemail';
  }

  /**
   * Determine if a call should show an AI summary
   * (completed calls or voicemails)
   */
  private shouldShowSummary(call: CallLog): boolean {
    return call.status === 'completed' || call.status === 'voicemail';
  }

  // ============================================================================
  // Rendering
  // ============================================================================

  protected render(): void {
    if (!this.shadowRoot) return;

    const styles = this.applyAppearanceStyles();

    // Build class string for container
    let containerClasses = 'call-history-container';
    if (this.isLoading) containerClasses += ' loading';
    if (this.error) containerClasses += ' error';
    if (!this.isLoading && !this.error && this.calls.length === 0) containerClasses += ' empty';

    // Add custom classes
    const customClasses = this.getClassNames(
      this.isLoading ? 'loading' : this.error ? 'error' : this.calls.length === 0 ? 'empty' : 'base'
    );

    this.shadowRoot.innerHTML = `
      <style>
        ${styles}
        ${this.getComponentStyles()}
      </style>
      <div class="${containerClasses} ${customClasses}">
        ${this.renderContent()}
      </div>
    `;
  }

  private renderContent(): string {
    if (this.isLoading) {
      return this.renderLoading();
    }

    if (this.error) {
      return this.renderError();
    }

    if (!this.phoneNumber) {
      return this.renderNoPhoneNumber();
    }

    if (this.calls.length === 0) {
      return this.renderEmpty();
    }

    return this.renderList();
  }

  private renderLoading(): string {
    return `
      <div class="call-history-loading">
        <div class="call-history-skeleton">
          <div class="skeleton-item"></div>
          <div class="skeleton-item"></div>
          <div class="skeleton-item"></div>
        </div>
      </div>
    `;
  }

  private renderError(): string {
    return `
      <div class="call-history-error">
        <span class="error-message">${this.error}</span>
      </div>
    `;
  }

  private renderNoPhoneNumber(): string {
    return `
      <div class="call-history-empty">
        <span class="empty-message">${this.t('callHistory.noPhoneNumber')}</span>
      </div>
    `;
  }

  private renderEmpty(): string {
    return `
      <div class="call-history-empty ${this.classes.empty || ''}">
        <span class="empty-message">${this.t('callHistory.empty')}</span>
      </div>
    `;
  }

  private renderList(): string {
    const listClass = this.classes.list || '';
    return `
      <div class="call-history-list ${listClass}" role="list">
        ${this.calls.map((call) => this.renderItem(call)).join('')}
      </div>
    `;
  }

  private renderItem(call: CallLog): string {
    const isMissed = this.isMissedCall(call);
    const voicemail = this.hasVoicemail(call);
    const showSummary = this.shouldShowSummary(call);
    const relativeTime = this.formatRelativeTime(call.started_at);
    const duration = this.formatDuration(call.duration_seconds);

    // Determine item class based on call type
    let itemTypeClass: string;
    let customTypeClass: string;
    if (voicemail) {
      itemTypeClass = 'call-history-item--voicemail';
      customTypeClass = this.classes.itemVoicemail || '';
    } else if (isMissed) {
      itemTypeClass = 'call-history-item--missed';
      customTypeClass = this.classes.itemMissed || '';
    } else if (call.direction === 'inbound') {
      itemTypeClass = 'call-history-item--inbound';
      customTypeClass = this.classes.itemInbound || '';
    } else {
      itemTypeClass = 'call-history-item--outbound';
      customTypeClass = this.classes.itemOutbound || '';
    }

    const itemClass = this.classes.item || '';
    const iconClass = this.classes.icon || '';
    const timeClass = this.classes.time || '';
    const durationClass = this.classes.duration || '';

    return `
      <div
        class="call-history-item ${itemTypeClass} ${showSummary ? 'call-history-item--with-summary' : ''} ${itemClass} ${customTypeClass}"
        data-call-id="${call.id}"
        role="listitem"
      >
        <div class="call-history-item-header">
          ${
            this.displayOptions.showDirectionIcon
              ? `
            <div class="call-history-icon ${iconClass}">
              ${this.getDirectionIcon(call, isMissed, voicemail)}
            </div>
          `
              : ''
          }
          ${
            this.displayOptions.showRelativeTime
              ? `
            <span class="call-history-time ${timeClass}">${relativeTime}</span>
          `
              : ''
          }
          ${
            this.displayOptions.showDuration
              ? `
            <span class="call-history-duration ${durationClass}">${duration}</span>
          `
              : ''
          }
        </div>
        ${showSummary ? this.renderSummary(call) : ''}
      </div>
    `;
  }

  private renderSummary(call: CallLog): string {
    const summary = call.summary ?? this.t('callHistory.summaryNotAvailable');
    return `
      <div class="call-history-summary">
        <div class="call-history-summary-badge">
          <span class="call-history-summary-icon">${this.icons.sparkle}</span>
          <span class="call-history-summary-label">AI Summary</span>
        </div>
        <p class="call-history-summary-text">${summary}</p>
      </div>
    `;
  }

  private getDirectionIcon(call: CallLog, isMissed: boolean, voicemail: boolean): string {
    if (voicemail) {
      // Voicemail - show voicemail icon
      return this.icons.voicemail;
    }
    if (isMissed) {
      // Missed call - use inbound icon with red styling
      return this.icons.inbound;
    }
    if (call.direction === 'inbound') {
      return this.icons.inbound;
    }
    return this.icons.outbound;
  }

  private getComponentStyles(): string {
    return `
      .call-history-container {
        display: flex;
        flex-direction: column;
        background: var(--ds-color-background);
        color: var(--ds-color-text);
        border-radius: var(--ds-border-radius-large);
        overflow: hidden;
      }

      /* List */
      .call-history-list {
        display: flex;
        flex-direction: column;
      }

      /* Item */
      .call-history-item {
        display: flex;
        flex-direction: column;
        gap: var(--ds-spacing-sm);
        padding: var(--ds-layout-spacing-sm) var(--ds-layout-spacing-md);
        border-radius: var(--ds-border-radius);
      }

      .call-history-item--with-summary {
        padding-bottom: var(--ds-layout-spacing-md);
      }

      /* Item Header Row */
      .call-history-item-header {
        display: flex;
        align-items: center;
        gap: var(--ds-spacing-md);
        min-height: 28px;
      }

      /* Direction Icon */
      .call-history-icon {
        display: flex;
        align-items: center;
        justify-content: center;
        width: 28px;
        height: 28px;
        border-radius: var(--ds-border-radius-round);
        flex-shrink: 0;
        transition: background var(--ds-transition-duration);
      }

      .call-history-icon svg {
        width: 16px;
        height: 16px;
      }

      /* Inbound - green */
      .call-history-item--inbound .call-history-icon {
        background: color-mix(in srgb, var(--ds-color-success) 12%, transparent);
        color: var(--ds-color-success);
      }

      /* Outbound - blue/primary */
      .call-history-item--outbound .call-history-icon {
        background: color-mix(in srgb, var(--ds-color-primary) 12%, transparent);
        color: var(--ds-color-primary);
      }

      /* Missed - red */
      .call-history-item--missed .call-history-icon {
        background: color-mix(in srgb, var(--ds-color-danger) 12%, transparent);
        color: var(--ds-color-danger);
      }

      /* Voicemail */
      .call-history-item--voicemail .call-history-icon {
        background: color-mix(in srgb, var(--ds-color-primary) 12%, transparent);
        color: var(--ds-color-primary);
      }

      /* AI Summary */
      .call-history-summary {
        margin-left: calc(28px + var(--ds-spacing-md));
        margin-top: var(--ds-spacing-xs);
      }

      .call-history-summary-badge {
        display: inline-flex;
        align-items: center;
        gap: 4px;
        margin-bottom: 2px;
      }

      .call-history-summary-icon {
        display: flex;
        align-items: center;
        justify-content: center;
        width: 12px;
        height: 12px;
        color: var(--ds-color-primary);
      }

      .call-history-summary-icon svg {
        width: 10px;
        height: 10px;
      }

      .call-history-summary-label {
        font-size: 9px;
        font-weight: 600;
        text-transform: uppercase;
        letter-spacing: 0.5px;
        color: var(--ds-color-primary);
      }

      .call-history-summary-text {
        margin: 0;
        font-size: var(--ds-font-size-small);
        line-height: 1.4;
        color: var(--ds-color-text);
        hyphens: auto;
        -webkit-hyphens: auto;
        overflow-wrap: break-word;
      }

      /* Time */
      .call-history-time {
        flex: 1;
        font-size: var(--ds-font-size-base);
        color: var(--ds-color-text);
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
      }

      /* Duration */
      .call-history-duration {
        font-size: var(--ds-font-size-small);
        color: var(--ds-color-text-secondary);
        font-variant-numeric: tabular-nums;
        white-space: nowrap;
      }

      /* Empty State */
      .call-history-empty {
        display: flex;
        align-items: center;
        justify-content: center;
        padding: var(--ds-spacing-lg);
        color: var(--ds-color-text-secondary);
        font-size: var(--ds-font-size-small);
        text-align: center;
      }

      /* Error State */
      .call-history-error {
        display: flex;
        align-items: center;
        justify-content: center;
        padding: var(--ds-spacing-md);
        color: var(--ds-color-danger);
        font-size: var(--ds-font-size-small);
        text-align: center;
      }

      /* Loading State */
      .call-history-loading {
        padding: var(--ds-spacing-sm);
      }

      .call-history-skeleton {
        display: flex;
        flex-direction: column;
        gap: var(--ds-spacing-xs);
      }

      .skeleton-item {
        height: 44px;
        background: linear-gradient(
          90deg,
          var(--ds-color-surface-subtle) 25%,
          var(--ds-color-border-subtle) 50%,
          var(--ds-color-surface-subtle) 75%
        );
        background-size: 200% 100%;
        animation: skeleton-shimmer 1.5s infinite;
        border-radius: var(--ds-border-radius);
      }

      @keyframes skeleton-shimmer {
        0% {
          background-position: 200% 0;
        }
        100% {
          background-position: -200% 0;
        }
      }
    `;
  }
}

// Register the custom element
if (typeof window !== 'undefined' && !customElements.get('dialstack-call-history')) {
  customElements.define('dialstack-call-history', CallHistoryComponent);
}
