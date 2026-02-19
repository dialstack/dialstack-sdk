/**
 * PhoneNumbers Web Component
 */

import { parsePhoneNumber, type CountryCode, type PhoneNumber } from 'libphonenumber-js';
import { BaseComponent } from './base-component';
import { segmentedControlStyles } from './shared-styles';
import './routing-target';
import type { RoutingTargetComponent } from './routing-target';
import type {
  PhoneNumberItem,
  PhoneNumberStatus,
  PhoneNumbersClasses,
  PaginatedResponse,
  DIDItem,
  NumberOrder,
  PortOrder,
} from '../types';

/**
 * PhoneNumbers component displays a unified list of all phone numbers
 */
type SortColumn =
  | 'phone_number'
  | 'status'
  | 'caller_id'
  | 'outbound'
  | 'routing_target'
  | 'carrier'
  | 'transfer_date'
  | 'cancelled_date';
type SortDirection = 'asc' | 'desc';
type StatusFilter = 'active' | 'in_progress' | 'cancelled';

const STATUS_FILTER_MAP: Record<StatusFilter, PhoneNumberStatus[]> = {
  active: ['active'],
  in_progress: [
    'ordering',
    'order_failed',
    'porting_draft',
    'porting_approved',
    'porting_submitted',
    'porting_foc',
    'porting_exception',
  ],
  cancelled: ['released', 'inactive'],
};

const ISSUE_STATUSES: PhoneNumberStatus[] = ['order_failed', 'porting_exception'];

/** Columns visible per tab */
type ColumnId =
  | 'phone_number'
  | 'status'
  | 'caller_id'
  | 'outbound'
  | 'routing_target'
  | 'carrier'
  | 'transfer_date'
  | 'cancelled_date';

const TAB_COLUMNS: Record<StatusFilter, ColumnId[]> = {
  active: ['phone_number', 'caller_id', 'outbound', 'routing_target'],
  in_progress: ['phone_number', 'status', 'carrier', 'transfer_date'],
  cancelled: ['phone_number', 'cancelled_date'],
};

export class PhoneNumbersComponent extends BaseComponent {
  private limit: number = 10;

  private isLoading: boolean = false;
  private error: string | null = null;
  private allItems: PhoneNumberItem[] = [];

  // Client-side pagination
  private currentPage: number = 0;

  // Filtering
  private activeFilter: StatusFilter = 'active';

  // Sorting
  private sortColumn: SortColumn = 'phone_number';
  private sortDirection: SortDirection = 'asc';

  // Resolved routing target names for sorting (target TypeID → display name)
  private resolvedTargetNames = new Map<string, string>();

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

      // Pre-resolve routing target names for sorting
      await this.resolveAllRoutingTargets();

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
   * Merge DIDs, number orders, and port orders into a unified list.
   *
   * Inactive DIDs that have a corresponding non-complete/non-cancelled port order
   * are excluded — the port order entry in "In Progress" is the correct representation.
   */
  private mergePhoneNumbers(
    dids: DIDItem[],
    orders: NumberOrder[],
    ports: PortOrder[]
  ): PhoneNumberItem[] {
    const map = new Map<string, PhoneNumberItem>();

    // Build a set of phone numbers that have an active (non-complete/non-cancelled) port order
    const activePortNumbers = new Set<string>();
    for (const port of ports) {
      if (port.status !== 'complete' && port.status !== 'cancelled') {
        for (const num of port.details.phone_numbers) {
          activePortNumbers.add(num);
        }
      }
    }

    // Add DIDs first (they take precedence for non-inactive numbers)
    for (const did of dids) {
      // Skip inactive DIDs that have an in-progress port order
      if (did.status === 'inactive' && activePortNumbers.has(did.phone_number)) {
        continue;
      }

      map.set(did.phone_number, {
        phone_number: did.phone_number,
        status: did.status as PhoneNumberStatus,
        number_class: did.number_class,
        expires_at: did.expires_at,
        outbound_enabled: did.outbound_enabled,
        caller_id_name: did.caller_id_name,
        routing_target: did.routing_target,
        source: 'did',
        created_at: did.created_at,
        updated_at: did.updated_at,
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
          order_id: order.id,
        });
      }
    }

    // Add numbers from non-complete/non-cancelled port orders not already in map
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
          carrier: port.details.losing_carrier?.name,
          transfer_date: port.details.actual_foc_date || port.details.requested_foc_date,
          source: 'port_order',
          created_at: port.created_at,
          updated_at: port.updated_at,
          port_order_id: port.id,
        });
      }
    }

    // Sort by phone number ascending
    return Array.from(map.values()).sort((a, b) => a.phone_number.localeCompare(b.phone_number));
  }

  /**
   * Pre-resolve all unique routing targets so sort can use display names.
   * Also pre-warms the instance-level cache for the routing-target sub-components.
   */
  private async resolveAllRoutingTargets(): Promise<void> {
    if (!this.instance) return;

    const targets = new Set<string>();
    for (const item of this.allItems) {
      if (item.routing_target) targets.add(item.routing_target);
    }

    const entries = await Promise.all(
      [...targets].map(async (target) => {
        const result = await this.instance!.resolveRoutingTarget(target);
        return [target, result?.name ?? ''] as const;
      })
    );

    this.resolvedTargetNames.clear();
    for (const [target, name] of entries) {
      this.resolvedTargetNames.set(target, name);
    }
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

  private formatShortDate(dateStr: string): string {
    try {
      const date = new Date(dateStr);
      const locale = this.formatting.dateLocale || 'en-US';
      return date.toLocaleDateString(locale, {
        month: 'short',
        day: 'numeric',
        year: 'numeric',
      });
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
      case 'porting_approved':
        return 'badge-active';
      case 'ordering':
      case 'porting_draft':
      case 'porting_submitted':
      case 'porting_foc':
        return 'badge-info';
      case 'order_failed':
      case 'porting_exception':
        return 'badge-danger';
      default:
        return 'badge-default';
    }
  }

  private isTemporaryNumber(item: PhoneNumberItem): boolean {
    return item.source === 'did' && item.number_class === 'temporary';
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
      case 'routing_target':
        return item.routing_target ? (this.resolvedTargetNames.get(item.routing_target) ?? '') : '';
      case 'carrier':
        return item.carrier || '';
      case 'transfer_date':
        return item.transfer_date || '';
      case 'cancelled_date':
        return item.updated_at || '';
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

  // Renders the component using Shadow DOM innerHTML — all dynamic content
  // is escaped via escapeHtml() inherited from BaseComponent.
  // This follows the same trusted template pattern as all other SDK components.
  protected render(): void {
    if (!this.shadowRoot) return;

    const styles = this.applyAppearanceStyles();

    const html = this.buildComponentHtml(styles);

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
          background: transparent;
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

        .status-badges {
          display: inline-flex;
          align-items: center;
          gap: var(--ds-spacing-xs);
          flex-wrap: wrap;
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

        .text-muted {
          color: var(--ds-color-text-secondary);
          font-style: italic;
        }

        .badge-temporary {
          background: color-mix(in srgb, var(--ds-color-warning) 12%, transparent);
          color: var(--ds-color-warning);
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
    const filters: StatusFilter[] = ['active', 'in_progress', 'cancelled'];
    const issueCount = this.allItems.filter((item) => ISSUE_STATUSES.includes(item.status)).length;
    const tabs = filters
      .map((filter) => {
        const active = this.activeFilter === filter ? ' active' : '';
        const label = this.t(`phoneNumbers.filters.${filter}`);
        const badge =
          filter === 'in_progress' && issueCount > 0
            ? ` <span class="badge-count" aria-label="${issueCount} issues">${issueCount}</span>`
            : '';
        return `<button class="segment-btn${active}" part="filter-tab" data-filter="${filter}" aria-pressed="${this.activeFilter === filter}">${label}${badge}</button>`;
      })
      .join('');

    return `<div class="segmented-control" part="filter-tabs" role="toolbar" aria-label="${this.t('phoneNumbers.filterLabel')}">${tabs}</div>`;
  }

  private getColumnLabel(col: ColumnId): string {
    const labelMap: Record<ColumnId, string> = {
      phone_number: 'phoneNumbers.columns.phoneNumber',
      status: 'phoneNumbers.columns.status',
      caller_id: 'phoneNumbers.columns.callerID',
      outbound: 'phoneNumbers.columns.outbound',
      routing_target: 'phoneNumbers.columns.routingTarget',
      carrier: 'phoneNumbers.columns.carrier',
      transfer_date: 'phoneNumbers.columns.transferDate',
      cancelled_date: 'phoneNumbers.columns.cancelledDate',
    };
    return this.t(labelMap[col]);
  }

  private getColumnSortKey(col: ColumnId): SortColumn {
    return col === 'caller_id' ? 'caller_id' : (col as SortColumn);
  }

  private renderCellContent(item: PhoneNumberItem, col: ColumnId): string {
    const badgeClass = this.classes.statusBadge || '';
    switch (col) {
      case 'phone_number':
        return this.escapeHtml(this.formatPhoneNumber(item.phone_number));
      case 'status': {
        const temporaryBadge = this.isTemporaryNumber(item)
          ? `<span class="badge badge-temporary ${badgeClass}" part="badge badge-temporary">${this.t('phoneNumbers.badges.temporary')}</span>`
          : '';
        return `<div class="status-badges"><span class="badge ${this.getStatusBadgeClass(item.status)} ${badgeClass}" part="badge badge-status">${this.t(this.getStatusLocaleKey(item.status))}</span>${temporaryBadge}</div>`;
      }
      case 'caller_id':
        return item.caller_id_name
          ? this.escapeHtml(item.caller_id_name)
          : `<span class="text-muted">${this.t('phoneNumbers.routingTarget.notSet')}</span>`;
      case 'outbound':
        return item.outbound_enabled === true
          ? this.t('phoneNumbers.outbound.enabled')
          : item.outbound_enabled === false
            ? this.t('phoneNumbers.outbound.disabled')
            : '';
      case 'routing_target':
        return item.routing_target
          ? `<dialstack-routing-target target="${this.escapeHtml(item.routing_target)}"></dialstack-routing-target>`
          : `<span class="text-muted">${this.t('phoneNumbers.routingTarget.notSet')}</span>`;
      case 'carrier':
        return this.escapeHtml(item.carrier || '');
      case 'transfer_date':
        return item.transfer_date ? this.formatShortDate(item.transfer_date) : '';
      case 'cancelled_date':
        return item.updated_at ? this.formatShortDate(item.updated_at) : '';
    }
  }

  private renderTable(): string {
    const columns = TAB_COLUMNS[this.activeFilter];
    const items = this.pageItems;

    const headerCells = columns
      .map((col) => {
        const sortKey = this.getColumnSortKey(col);
        return `<th role="columnheader" scope="col" part="header-cell" class="sortable" data-sort="${sortKey}" aria-sort="${this.getAriaSort(sortKey)}">${this.getColumnLabel(col)}&nbsp;${this.getSortIndicator(sortKey)}</th>`;
      })
      .join('');

    const rows = items
      .map((item) => {
        const hasDetail = !!(item.port_order_id || item.order_id);
        const classes = [this.classes.row, this._onRowClick && hasDetail ? 'clickable' : '']
          .filter(Boolean)
          .join(' ');
        const rowClass = classes ? ` class="${classes}"` : '';

        const cells = columns
          .map((col) => `<td part="cell cell-${col}">${this.renderCellContent(item, col)}</td>`)
          .join('');

        return `<tr data-phone="${this.escapeHtml(item.phone_number)}" tabindex="0" role="row" part="table-row"${rowClass}>${cells}</tr>`;
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
            <tr role="row">${headerCells}</tr>
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
        this.sortColumn = 'phone_number';
        this.sortDirection = 'asc';
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

    // Pass the SDK instance to routing-target elements rendered inside shadow DOM
    if (this.instance) {
      const targets = this.shadowRoot.querySelectorAll('dialstack-routing-target');
      targets.forEach((el) => {
        (el as RoutingTargetComponent).setInstance(this.instance!);
      });
    }

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
