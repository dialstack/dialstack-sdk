/**
 * PhoneNumbers Web Component
 */

import { parsePhoneNumber, type CountryCode, type PhoneNumber } from 'libphonenumber-js';
import { BaseComponent } from './base-component';
import { segmentedControlStyles } from './shared-styles';
import type {
  PhoneNumberItem,
  PhoneNumberStatus,
  PhoneNumbersDisplayOptions,
  PhoneNumbersClasses,
  PaginatedResponse,
  DIDItem,
  NumberOrder,
  PortOrder,
} from '../types';

/**
 * PhoneNumbers component displays a unified list of all phone numbers
 */
type SortColumn = 'phone_number' | 'status' | 'caller_id' | 'outbound' | 'notes' | 'last_updated';
type SortDirection = 'asc' | 'desc';
type StatusFilter = 'all' | 'active' | 'porting' | 'orders' | 'issues' | 'released' | 'inactive';

const STATUS_FILTER_MAP: Record<Exclude<StatusFilter, 'all'>, PhoneNumberStatus[]> = {
  active: ['active'],
  porting: ['porting_draft', 'porting_approved', 'porting_submitted', 'porting_foc'],
  orders: ['ordering'],
  issues: ['order_failed', 'porting_exception'],
  released: ['released'],
  inactive: ['inactive'],
};

export class PhoneNumbersComponent extends BaseComponent {
  private limit: number = 10;

  private isLoading: boolean = false;
  private error: string | null = null;
  private allItems: PhoneNumberItem[] = [];

  // Client-side pagination
  private currentPage: number = 0;

  // Filtering
  private activeFilter: StatusFilter = 'all';

  // Sorting
  private sortColumn: SortColumn = 'phone_number';
  private sortDirection: SortDirection = 'asc';

  // Display options
  private displayOptions: Required<PhoneNumbersDisplayOptions> = {
    showStatus: true,
    showOutbound: true,
    showCallerID: true,
    showNotes: true,
    showLastUpdated: true,
  };

  // Override classes type for component-specific classes
  protected override classes: PhoneNumbersClasses = {};

  // Callbacks
  private _onRowClick?: (event: { phoneNumber: string; item: PhoneNumberItem }) => void;

  protected initialize(): void {
    if (this.isInitialized) return;
    this.render();
    this.loadData();
    this.isInitialized = true;
  }

  // ============================================================================
  // Callback Setters
  // ============================================================================

  setOnRowClick(callback: (event: { phoneNumber: string; item: PhoneNumberItem }) => void): void {
    this._onRowClick = callback;
  }

  setDisplayOptions(options: PhoneNumbersDisplayOptions): void {
    this.displayOptions = { ...this.displayOptions, ...options };
    if (this.isInitialized) {
      this.render();
    }
  }

  override setClasses(classes: PhoneNumbersClasses): void {
    this.classes = { ...this.classes, ...classes };
    if (this.isInitialized) {
      this.render();
    }
  }

  setLimit(limit: number): void {
    this.limit = limit;
    this.currentPage = 0;
    if (this.isInitialized) {
      this.render();
    }
  }

  // ============================================================================
  // Data Loading
  // ============================================================================

  private async loadData(): Promise<void> {
    if (!this.instance) {
      this.error = this.t('common.error');
      this.render();
      return;
    }

    this.isLoading = true;
    this.error = null;
    this.currentPage = 0;
    this.render();

    try {
      this._onLoaderStart?.({ elementTagName: 'dialstack-phone-numbers' });

      // Fetch all three sources in parallel — use allSettled so partial failures
      // (e.g. port orders endpoint unavailable) don't block the entire component
      const [didsResult, ordersResult, portsResult] = await Promise.allSettled([
        this.fetchAllPages<DIDItem>((opts) => this.instance!.listPhoneNumbers(opts)),
        this.fetchAllPages<NumberOrder>((opts) => this.instance!.listNumberOrders(opts)),
        this.fetchAllPages<PortOrder>((opts) => this.instance!.listPortOrders(opts)),
      ]);

      // DIDs are required — if they fail, show an error
      if (didsResult.status === 'rejected') {
        throw didsResult.reason;
      }

      const dids = didsResult.value;
      const orders = ordersResult.status === 'fulfilled' ? ordersResult.value : [];
      const ports = portsResult.status === 'fulfilled' ? portsResult.value : [];

      // Merge into unified list
      this.allItems = this.mergePhoneNumbers(dids, orders, ports);
      this.error = null;
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : this.t('common.error');
      this.error = errorMessage;
      this._onLoadError?.({ error: errorMessage, elementTagName: 'dialstack-phone-numbers' });
      this.allItems = [];
    } finally {
      this.isLoading = false;
      this.render();
    }
  }

  /**
   * Fetch all pages from a paginated API endpoint
   */
  private async fetchAllPages<T>(
    fetchFn: (opts: { limit: number }) => Promise<PaginatedResponse<T>>
  ): Promise<T[]> {
    const allData: T[] = [];
    const MAX_PAGES = 100;
    let pages = 0;
    let response = await fetchFn({ limit: 100 });
    allData.push(...response.data);

    while (response.next_page_url && ++pages < MAX_PAGES) {
      response = await this.fetchComponentData<PaginatedResponse<T>>(response.next_page_url);
      allData.push(...response.data);
    }

    return allData;
  }

  /**
   * Merge DIDs, number orders, and port orders into a unified list
   */
  private mergePhoneNumbers(
    dids: DIDItem[],
    orders: NumberOrder[],
    ports: PortOrder[]
  ): PhoneNumberItem[] {
    const map = new Map<string, PhoneNumberItem>();

    // Add DIDs first (they take precedence)
    for (const did of dids) {
      map.set(did.phone_number, {
        phone_number: did.phone_number,
        status: did.status as PhoneNumberStatus,
        outbound_enabled: did.outbound_enabled,
        caller_id_name: did.caller_id_name,
        source: 'did',
        created_at: did.created_at,
        updated_at: did.updated_at,
        notes: '',
      });
    }

    // Add numbers from pending/partial number orders not already in map
    for (const order of orders) {
      if (order.status !== 'pending' && order.status !== 'partial') continue;

      for (const num of order.phone_numbers) {
        // Skip if already completed (in completed_numbers) or already a DID
        if (order.completed_numbers.includes(num)) continue;
        if (map.has(num)) continue;

        const isFailed = order.failed_numbers.includes(num);
        map.set(num, {
          phone_number: num,
          status: isFailed ? 'order_failed' : 'ordering',
          outbound_enabled: null,
          source: 'number_order',
          created_at: order.created_at,
          updated_at: order.updated_at,
          notes: this.buildOrderNotes(order, num),
          order_id: order.id,
        });
      }
    }

    // Add numbers from non-complete port orders not already in map
    for (const port of ports) {
      if (port.status === 'complete' || port.status === 'cancelled') continue;

      const portStatusMap: Record<string, PhoneNumberStatus> = {
        draft: 'porting_draft',
        approved: 'porting_approved',
        submitted: 'porting_submitted',
        exception: 'porting_exception',
        foc: 'porting_foc',
      };

      const portStatus = portStatusMap[port.status] || 'porting_draft';

      for (const num of port.details.phone_numbers) {
        if (map.has(num)) continue;

        map.set(num, {
          phone_number: num,
          status: portStatus,
          outbound_enabled: null,
          source: 'port_order',
          created_at: port.created_at,
          updated_at: port.updated_at,
          notes: this.buildPortNotes(port),
          port_order_id: port.id,
        });
      }
    }

    // Sort by phone number ascending
    return Array.from(map.values()).sort((a, b) => a.phone_number.localeCompare(b.phone_number));
  }

  // ============================================================================
  // Formatting Helpers
  // ============================================================================

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
    return phone;
  }

  private buildOrderNotes(order: NumberOrder, phoneNumber: string): string {
    const parts: string[] = [];
    if (order.failed_numbers.includes(phoneNumber)) {
      parts.push(order.error_message || this.t('phoneNumbers.notes.orderFailed'));
    } else {
      parts.push(this.t('phoneNumbers.notes.activatingByCarrier'));
    }
    parts.push(
      this.t('phoneNumbers.notes.submittedOn', { date: this.formatShortDate(order.created_at) })
    );
    return parts.join(' · ');
  }

  private buildPortNotes(port: PortOrder): string {
    const parts: string[] = [];

    if (port.details.losing_carrier?.name) {
      parts.push(
        this.t('phoneNumbers.notes.transferringFrom', { carrier: port.details.losing_carrier.name })
      );
    }

    if (port.status === 'foc' && port.details.actual_foc_date) {
      parts.push(
        this.t('phoneNumbers.notes.transfersOn', {
          date: this.formatShortDate(port.details.actual_foc_date),
        })
      );
    } else if (port.status === 'draft') {
      const missing = this.getMissingPortFields(port);
      if (missing.length > 0) {
        parts.push(this.t('phoneNumbers.notes.missing', { fields: missing.join(', ') }));
      } else {
        parts.push(this.t('phoneNumbers.notes.readyForApproval'));
      }
    } else if (port.status === 'submitted') {
      parts.push(this.t('phoneNumbers.notes.waitingForConfirmation'));
      if (port.submitted_at) {
        parts.push(
          this.t('phoneNumbers.notes.submittedOn', {
            date: this.formatShortDate(port.submitted_at),
          })
        );
      }
    } else if (port.status === 'approved') {
      parts.push(this.t('phoneNumbers.notes.readyToSubmit'));
    } else if (port.status === 'exception') {
      if (port.details.rejection?.message) {
        parts.push(port.details.rejection.message);
      }
      if (port.submitted_at) {
        parts.push(
          this.t('phoneNumbers.notes.submittedOn', {
            date: this.formatShortDate(port.submitted_at),
          })
        );
      }
    } else if (port.details.requested_foc_date) {
      parts.push(
        this.t('phoneNumbers.notes.requestedFor', {
          date: this.formatShortDate(port.details.requested_foc_date),
        })
      );
    }

    return parts.join(' · ');
  }

  private getMissingPortFields(port: PortOrder): string[] {
    const missing: string[] = [];
    if (!port.details.subscriber) {
      missing.push(this.t('phoneNumbers.notes.missingAccountHolder'));
    }
    if (!port.details.requested_foc_date) {
      missing.push(this.t('phoneNumbers.notes.missingTransferDate'));
    }
    return missing;
  }

  private formatShortDate(dateStr: string): string {
    try {
      const date = new Date(dateStr);
      const locale = this.formatting.dateLocale || 'en-US';
      const use24Hour = this.formatting.use24HourTime ?? false;
      const options: Intl.DateTimeFormatOptions = {
        month: 'short',
        day: 'numeric',
        year: 'numeric',
        hour: 'numeric',
        minute: '2-digit',
        hour12: !use24Hour,
      };
      return date.toLocaleString(locale, options);
    } catch {
      return dateStr;
    }
  }

  private formatRelativeDate(dateStr: string): string {
    try {
      const date = new Date(dateStr);
      const now = new Date();
      const diffMs = now.getTime() - date.getTime();
      const diffMins = Math.floor(diffMs / 60000);
      const diffHours = Math.floor(diffMs / 3600000);
      const diffDays = Math.floor(diffMs / 86400000);

      if (diffMins < 1) return 'Just now';
      if (diffMins < 60) return `${diffMins}m ago`;
      if (diffHours < 24) return `${diffHours}h ago`;
      if (diffDays < 7) return `${diffDays}d ago`;

      const locale = this.formatting.dateLocale || 'en-US';
      return date.toLocaleDateString(locale, { month: 'short', day: 'numeric', year: 'numeric' });
    } catch {
      return dateStr;
    }
  }

  private getStatusLocaleKey(status: PhoneNumberStatus): string {
    const keyMap: Record<PhoneNumberStatus, string> = {
      active: 'active',
      inactive: 'inactive',
      released: 'released',
      ordering: 'ordering',
      order_failed: 'orderFailed',
      porting_draft: 'portingDraft',
      porting_approved: 'portingApproved',
      porting_submitted: 'portingSubmitted',
      porting_exception: 'portingException',
      porting_foc: 'portingFoc',
    };
    return `phoneNumbers.statuses.${keyMap[status]}`;
  }

  private getStatusBadgeClass(status: PhoneNumberStatus): string {
    switch (status) {
      case 'active':
        return 'badge-active';
      case 'inactive':
        return 'badge-inactive';
      case 'released':
        return 'badge-released';
      case 'ordering':
      case 'porting_draft':
      case 'porting_submitted':
      case 'porting_foc':
      case 'porting_approved':
        return 'badge-info';
      case 'order_failed':
      case 'porting_exception':
        return 'badge-danger';
      default:
        return 'badge-default';
    }
  }

  private getIcon(name: keyof typeof this.icons): string {
    return this.icons[name];
  }

  // ============================================================================
  // Sorting
  // ============================================================================

  private toggleSort(column: SortColumn): void {
    if (this.sortColumn === column) {
      this.sortDirection = this.sortDirection === 'asc' ? 'desc' : 'asc';
    } else {
      this.sortColumn = column;
      this.sortDirection = 'asc';
    }
    this.currentPage = 0;
    this.render();
  }

  private get filteredItems(): PhoneNumberItem[] {
    if (this.activeFilter === 'all') return this.allItems;
    const allowed = STATUS_FILTER_MAP[this.activeFilter];
    return this.allItems.filter((item) => allowed.includes(item.status));
  }

  private get sortedItems(): PhoneNumberItem[] {
    const dir = this.sortDirection === 'asc' ? 1 : -1;
    return [...this.filteredItems].sort((a, b) => {
      const valA = this.getSortValue(a, this.sortColumn);
      const valB = this.getSortValue(b, this.sortColumn);
      if (valA < valB) return -1 * dir;
      if (valA > valB) return 1 * dir;
      return 0;
    });
  }

  private getSortValue(item: PhoneNumberItem, column: SortColumn): string {
    switch (column) {
      case 'phone_number':
        return this.formatPhoneNumber(item.phone_number);
      case 'status':
        return this.t(this.getStatusLocaleKey(item.status));
      case 'caller_id':
        return item.caller_id_name || '';
      case 'outbound':
        if (item.outbound_enabled === true) return 'a';
        if (item.outbound_enabled === false) return 'b';
        return 'c';
      case 'notes':
        return item.notes;
      case 'last_updated':
        return item.updated_at;
    }
  }

  private getSortIndicator(column: SortColumn): string {
    if (this.sortColumn !== column) return '<span class="sort-icon" aria-hidden="true">⇅</span>';
    return this.sortDirection === 'asc'
      ? '<span class="sort-icon sort-active" aria-hidden="true">↑</span>'
      : '<span class="sort-icon sort-active" aria-hidden="true">↓</span>';
  }

  private getAriaSort(column: SortColumn): string {
    if (this.sortColumn !== column) return 'none';
    return this.sortDirection === 'asc' ? 'ascending' : 'descending';
  }

  // ============================================================================
  // Pagination
  // ============================================================================

  private get totalPages(): number {
    return Math.max(1, Math.ceil(this.filteredItems.length / this.limit));
  }

  private get pageItems(): PhoneNumberItem[] {
    const sorted = this.sortedItems;
    const start = this.currentPage * this.limit;
    return sorted.slice(start, start + this.limit);
  }

  // ============================================================================
  // Rendering
  // ============================================================================

  protected render(): void {
    if (!this.shadowRoot) return;

    const styles = this.applyAppearanceStyles();

    // Build the full component HTML using safe string construction.
    // All dynamic values are either from trusted locale strings or escaped via escapeHtml().
    const html = this.buildComponentHtml(styles);

    // Use Shadow DOM innerHTML — this is an internal render of trusted template strings,
    // following the same pattern as CallLogsComponent and other SDK components.
    // All user-controlled data (phone numbers, error messages) is escaped via escapeHtml().
    this.shadowRoot.innerHTML = html;

    this.attachEventListeners();
  }

  private buildComponentHtml(styles: string): string {
    return [
      '<style>',
      styles,
      this.getComponentStyles(),
      '</style>',
      `<div class="container ${this.getClassNames()}" part="container" role="region" aria-label="${this.t('phoneNumbers.title')}">`,
      this.renderContent(),
      '</div>',
    ].join('\n');
  }

  private getComponentStyles(): string {
    return `
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

        ${segmentedControlStyles}

        .badge-count {
          display: inline-flex;
          align-items: center;
          justify-content: center;
          min-width: 18px;
          height: 18px;
          padding: 0 5px;
          margin-left: 4px;
          border-radius: 9999px;
          background: var(--ds-color-danger);
          color: #fff;
          font-size: 11px;
          font-weight: 600;
          line-height: 1;
          vertical-align: middle;
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

        th.sortable {
          cursor: pointer;
          user-select: none;
        }

        th.sortable:hover {
          background: var(--ds-color-surface-subtle);
        }

        .sort-icon {
          font-size: 0.75em;
          opacity: 0.3;
          margin-left: 2px;
        }

        .sort-icon.sort-active {
          opacity: 1;
        }

        td {
          padding: var(--ds-spacing-md);
          border-bottom: 1px solid var(--ds-color-border-subtle);
        }

        tbody tr.clickable {
          cursor: pointer;
        }

        tbody tr.clickable:hover {
          background: var(--ds-color-surface-subtle);
        }

        .badge {
          display: inline-block;
          padding: var(--ds-spacing-xs) var(--ds-spacing-sm);
          border-radius: var(--ds-border-radius-large);
          font-size: var(--ds-font-size-small);
          font-weight: var(--ds-font-weight-medium);
        }

        .badge-active {
          background: color-mix(in srgb, var(--ds-color-success) 10%, transparent);
          color: var(--ds-color-success);
        }

        .badge-inactive {
          background: color-mix(in srgb, var(--ds-color-warning) 10%, transparent);
          color: var(--ds-color-warning);
        }

        .badge-released {
          background: var(--ds-color-surface-subtle);
          color: var(--ds-color-text-secondary);
        }

        .badge-info {
          background: color-mix(in srgb, var(--ds-color-primary) 10%, transparent);
          color: var(--ds-color-primary);
        }

        .badge-danger {
          background: color-mix(in srgb, var(--ds-color-danger) 10%, transparent);
          color: var(--ds-color-danger);
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
    `;
  }

  private renderContent(): string {
    if (this.isLoading) {
      return `
        <div class="loading ${this.classes.loading || ''}" part="loading" role="status" aria-live="polite">
          <slot name="loading">
            <div class="spinner" part="spinner" aria-hidden="true">${this.getIcon('spinner')}</div>
            <p>${this.t('phoneNumbers.loading')}</p>
          </slot>
        </div>
      `;
    }

    if (this.error) {
      return `
        <div class="error ${this.classes.error || ''}" part="error" role="alert">
          <slot name="error">
            <p><strong>${this.t('common.error')}:</strong> ${this.escapeHtml(this.error)}</p>
          </slot>
        </div>
      `;
    }

    if (this.allItems.length === 0) {
      return `
        <div class="empty ${this.classes.empty || ''}" part="empty" role="status">
          <slot name="empty">
            <p>${this.t('phoneNumbers.empty')}</p>
          </slot>
        </div>
      `;
    }

    return this.renderTable();
  }

  private renderFilterTabs(): string {
    const filters: StatusFilter[] = [
      'all',
      'active',
      'porting',
      'orders',
      'issues',
      'released',
      'inactive',
    ];
    const issueCount = this.allItems.filter((item) =>
      STATUS_FILTER_MAP.issues.includes(item.status)
    ).length;
    const tabs = filters
      .map((filter) => {
        const active = this.activeFilter === filter ? ' active' : '';
        const label = this.t(`phoneNumbers.filters.${filter}`);
        const badge =
          filter === 'issues' && issueCount > 0
            ? ` <span class="badge-count" aria-label="${issueCount} ${label}">${issueCount}</span>`
            : '';
        return `<button class="segment-btn${active}" part="filter-tab" data-filter="${filter}" aria-pressed="${this.activeFilter === filter}">${label}${badge}</button>`;
      })
      .join('');

    return `<div class="segmented-control" part="filter-tabs" role="toolbar" aria-label="${this.t('phoneNumbers.filterLabel')}">${tabs}</div>`;
  }

  private renderTable(): string {
    const { showStatus, showCallerID, showOutbound, showNotes, showLastUpdated } =
      this.displayOptions;
    const items = this.pageItems;

    const rows = items
      .map((item) => {
        const classes = [this.classes.row, this._onRowClick ? 'clickable' : '']
          .filter(Boolean)
          .join(' ');
        const rowClass = classes ? ` class="${classes}"` : '';
        const badgeClass = this.classes.statusBadge || '';

        return `
          <tr data-phone="${this.escapeHtml(item.phone_number)}" tabindex="0" role="row" part="table-row"${rowClass}>
            <td part="cell cell-phone-number">${this.escapeHtml(this.formatPhoneNumber(item.phone_number))}</td>
            ${showStatus ? `<td part="cell cell-status"><span class="badge ${this.getStatusBadgeClass(item.status)} ${badgeClass}" part="badge badge-status">${this.t(this.getStatusLocaleKey(item.status))}</span></td>` : ''}
            ${showCallerID ? `<td part="cell cell-caller-id">${this.escapeHtml(item.caller_id_name || '')}</td>` : ''}
            ${showOutbound ? `<td part="cell cell-outbound">${item.outbound_enabled === true ? this.t('phoneNumbers.outbound.enabled') : item.outbound_enabled === false ? this.t('phoneNumbers.outbound.disabled') : ''}</td>` : ''}
            ${showNotes ? `<td part="cell cell-notes">${this.escapeHtml(item.notes)}</td>` : ''}
            ${showLastUpdated ? `<td part="cell cell-last-updated">${this.formatRelativeDate(item.updated_at)}</td>` : ''}
          </tr>
        `;
      })
      .join('');

    const start = this.currentPage * this.limit + 1;
    const end = this.currentPage * this.limit + items.length;
    const total = this.filteredItems.length;

    return `
      ${this.renderFilterTabs()}
      <div class="table-container" part="table-container">
        <table role="grid" aria-label="${this.t('phoneNumbers.title')}" part="table" class="${this.classes.table || ''}">
          <thead part="table-header">
            <tr role="row">
              <th role="columnheader" scope="col" part="header-cell" class="sortable" data-sort="phone_number" aria-sort="${this.getAriaSort('phone_number')}">${this.t('phoneNumbers.columns.phoneNumber')}&nbsp;${this.getSortIndicator('phone_number')}</th>
              ${showStatus ? `<th role="columnheader" scope="col" part="header-cell" class="sortable" data-sort="status" aria-sort="${this.getAriaSort('status')}">${this.t('phoneNumbers.columns.status')}&nbsp;${this.getSortIndicator('status')}</th>` : ''}
              ${showCallerID ? `<th role="columnheader" scope="col" part="header-cell" class="sortable" data-sort="caller_id" aria-sort="${this.getAriaSort('caller_id')}">${this.t('phoneNumbers.columns.callerID')}&nbsp;${this.getSortIndicator('caller_id')}</th>` : ''}
              ${showOutbound ? `<th role="columnheader" scope="col" part="header-cell" class="sortable" data-sort="outbound" aria-sort="${this.getAriaSort('outbound')}">${this.t('phoneNumbers.columns.outbound')}&nbsp;${this.getSortIndicator('outbound')}</th>` : ''}
              ${showNotes ? `<th role="columnheader" scope="col" part="header-cell" class="sortable" data-sort="notes" aria-sort="${this.getAriaSort('notes')}">${this.t('phoneNumbers.columns.notes')}&nbsp;${this.getSortIndicator('notes')}</th>` : ''}
              ${showLastUpdated ? `<th role="columnheader" scope="col" part="header-cell" class="sortable" data-sort="last_updated" aria-sort="${this.getAriaSort('last_updated')}">${this.t('phoneNumbers.columns.lastUpdated')}&nbsp;${this.getSortIndicator('last_updated')}</th>` : ''}
            </tr>
          </thead>
          <tbody part="table-body">
            ${rows}
          </tbody>
        </table>
      </div>
      <nav class="pagination ${this.classes.pagination || ''}" part="pagination" aria-label="Pagination">
        <div class="pagination-info" part="pagination-info" aria-live="polite">
          ${start}-${end} of ${total}
        </div>
        <div class="pagination-buttons" part="pagination-buttons">
          <button class="pagination-btn" part="pagination-button prev-button" id="prev-btn" ${this.currentPage === 0 ? 'disabled' : ''} aria-label="${this.t('common.previous')}">
            ${this.getIcon('chevronLeft')} ${this.t('common.previous')}
          </button>
          <button class="pagination-btn" part="pagination-button next-button" id="next-btn" ${this.currentPage >= this.totalPages - 1 ? 'disabled' : ''} aria-label="${this.t('common.next')}">
            ${this.t('common.next')} ${this.getIcon('chevronRight')}
          </button>
        </div>
      </nav>
    `;
  }

  // ============================================================================
  // Event Handling
  // ============================================================================

  private attachEventListeners(): void {
    if (!this.shadowRoot) return;

    // Filter tabs
    const filterTabs = this.shadowRoot.querySelectorAll('.segment-btn[data-filter]');
    filterTabs.forEach((tab) => {
      const filter = tab.getAttribute('data-filter') as StatusFilter;
      tab.addEventListener('click', () => {
        this.activeFilter = filter;
        this.currentPage = 0;
        this.render();
      });
    });

    // Sort headers
    const sortHeaders = this.shadowRoot.querySelectorAll('th.sortable[data-sort]');
    sortHeaders.forEach((header) => {
      const column = header.getAttribute('data-sort') as SortColumn;
      header.addEventListener('click', () => this.toggleSort(column));
    });

    const prevBtn = this.shadowRoot.getElementById('prev-btn');
    const nextBtn = this.shadowRoot.getElementById('next-btn');

    prevBtn?.addEventListener('click', () => {
      if (this.currentPage > 0) {
        this.currentPage--;
        this.render();
      }
    });

    nextBtn?.addEventListener('click', () => {
      if (this.currentPage < this.totalPages - 1) {
        this.currentPage++;
        this.render();
      }
    });

    const rows = this.shadowRoot.querySelectorAll('tbody tr[data-phone]');
    rows.forEach((row) => {
      const phoneNumber = row.getAttribute('data-phone');
      if (!phoneNumber) return;

      row.addEventListener('click', () => this.handleRowClick(phoneNumber));
      row.addEventListener('keydown', (e) => {
        if ((e as KeyboardEvent).key === 'Enter' || (e as KeyboardEvent).key === ' ') {
          e.preventDefault();
          this.handleRowClick(phoneNumber);
        }
      });
    });
  }

  private handleRowClick(phoneNumber: string): void {
    const item = this.allItems.find((i) => i.phone_number === phoneNumber);
    if (item && this._onRowClick) {
      this._onRowClick({ phoneNumber, item });
    }
  }
}

// Register the custom element
if (typeof window !== 'undefined' && !customElements.get('dialstack-phone-numbers')) {
  customElements.define('dialstack-phone-numbers', PhoneNumbersComponent);
}
