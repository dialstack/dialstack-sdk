export const COMPONENT_STYLES = `
  :host {
    display: block;
  }

  .container {
    background: transparent;
    color: var(--ds-color-text);
    font-size: var(--ds-font-size-base);
    line-height: var(--ds-line-height);
    overflow: hidden;
    max-width: 1100px;
    margin: 0 auto;
  }

  /* ── Two-Column Step Layout ── */
  .step-layout {
    display: grid;
    grid-template-columns: 260px 1fr;
    gap: 24px;
    padding: var(--ds-layout-spacing-lg);
    min-height: 500px;
  }

  /* Left sidebar */
  .step-sidebar {
    background: var(--ds-color-background);
    border-radius: 20px;
    border: 1px solid var(--ds-color-border);
    padding: var(--ds-layout-spacing-lg) var(--ds-layout-spacing-md);
    height: fit-content;
  }

  .step-sidebar-header {
    display: flex;
    align-items: center;
    gap: var(--ds-spacing-xs);
    margin-bottom: var(--ds-layout-spacing-md);
    padding-bottom: var(--ds-layout-spacing-sm);
    border-bottom: 1px solid var(--ds-color-border);
  }

  .step-sidebar-icon {
    width: 28px;
    height: 28px;
    border-radius: var(--ds-border-radius-round);
    background: var(--ds-color-primary);
    color: #fff;
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 14px;
    flex-shrink: 0;
  }

  .step-sidebar-title {
    font-size: var(--ds-font-size-base);
    font-weight: var(--ds-font-weight-bold);
    color: var(--ds-color-text);
  }

  /* Vertical timeline */
  .step-timeline {
    display: flex;
    flex-direction: column;
    gap: 0;
    position: relative;
  }

  .step-timeline-item {
    display: flex;
    align-items: flex-start;
    gap: var(--ds-spacing-sm);
    padding: var(--ds-spacing-sm) 0;
    position: relative;
  }

  .step-timeline-item:not(:last-child)::before {
    content: '';
    position: absolute;
    left: 9px;
    top: 30px;
    bottom: -10px;
    width: 2px;
    background: var(--ds-color-border);
  }

  .step-timeline-item.completed:not(:last-child)::before {
    background: var(--ds-color-success);
  }

  .step-timeline-dot {
    width: 20px;
    height: 20px;
    border-radius: var(--ds-border-radius-round);
    flex-shrink: 0;
    display: flex;
    align-items: center;
    justify-content: center;
    margin-top: 1px;
    border: 2px solid var(--ds-color-border);
    background: var(--ds-color-background);
  }

  .step-timeline-item.active .step-timeline-dot {
    border-color: #e91e63;
    background: var(--ds-color-background);
    box-shadow: 0 0 0 3px rgba(233, 30, 99, 0.15);
  }

  .step-timeline-item.active .step-timeline-dot::after {
    content: '';
    width: 8px;
    height: 8px;
    border-radius: var(--ds-border-radius-round);
    background: #e91e63;
  }

  .step-timeline-item.completed .step-timeline-dot {
    border-color: var(--ds-color-success);
    background: var(--ds-color-success);
    color: #fff;
  }

  .step-timeline-text {
    display: flex;
    flex-direction: column;
    gap: 2px;
    min-width: 0;
  }

  .step-timeline-label {
    font-size: var(--ds-font-size-small);
    font-weight: var(--ds-font-weight-medium);
    color: var(--ds-color-text-secondary);
  }

  .step-timeline-item.active .step-timeline-label {
    color: var(--ds-color-text);
    font-weight: var(--ds-font-weight-bold);
  }

  .step-timeline-item.completed .step-timeline-label {
    color: var(--ds-color-success);
  }

  .step-timeline-desc {
    font-size: 11px;
    color: var(--ds-color-text-secondary);
    opacity: 0.7;
  }

  /* Right content column */
  .step-content {
    min-width: 0;
  }

  /* Ghost button for back */
  .btn-ghost {
    background: none;
    border: none;
    color: var(--ds-color-text-secondary);
    font-size: var(--ds-font-size-base);
    font-family: var(--ds-font-family);
    font-weight: var(--ds-font-weight-medium);
    cursor: pointer;
    padding: var(--ds-layout-spacing-sm) 0;
    border-radius: var(--ds-border-radius);
    display: inline-flex;
    align-items: center;
    gap: var(--ds-spacing-xs);
    transition: color var(--ds-transition-duration);
  }

  .btn-ghost:hover {
    color: var(--ds-color-text);
  }

  /* ── Section Title ── */
  .section-title {
    font-size: 30px;
    font-weight: var(--ds-font-weight-bold);
    color: var(--ds-color-text);
    margin: 0 0 var(--ds-layout-spacing-xs) 0;
    text-align: center;
  }

  .section-subtitle {
    font-size: 16px;
    color: #333;
    margin: 0 0 var(--ds-layout-spacing-lg) 0;
    text-align: center;
  }

  /* ── Card ── */
  .card {
    padding: var(--ds-layout-spacing-lg);
    background: var(--ds-color-background);
    border: 1px solid var(--ds-color-border);
    border-radius: 20px;
  }

  /* ── Placeholder ── */
  .placeholder {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    padding: var(--ds-layout-spacing-lg) 0;
    text-align: center;
    min-height: 200px;
  }

  .placeholder-icon {
    width: 48px;
    height: 48px;
    border-radius: var(--ds-border-radius-round);
    background: var(--ds-color-surface-subtle);
    display: flex;
    align-items: center;
    justify-content: center;
    margin-bottom: var(--ds-layout-spacing-md);
    color: var(--ds-color-text-secondary);
    font-size: 24px;
  }

  .placeholder-text {
    font-size: var(--ds-font-size-small);
    color: var(--ds-color-text-secondary);
    max-width: 360px;
  }

  /* ── Complete Step ── */
  .complete-icon {
    width: 100px;
    height: 100px;
    color: var(--ds-color-success);
    margin-bottom: var(--ds-layout-spacing-lg);
  }

  .complete-icon svg {
    width: 100%;
    height: 100%;
  }

  /* ── Footer Bar ── */
  .footer-bar {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: var(--ds-layout-spacing-md) 0;
  }

  .footer-bar-end {
    justify-content: flex-end;
  }

  /* ── Buttons ── */
  .btn {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    gap: var(--ds-spacing-xs);
    padding: 10px 24px;
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
    border-radius: 100px;
    min-width: 150px;
    height: 44px;
    padding: 0 28px;
  }

  .btn-primary:hover:not(:disabled) {
    opacity: 0.9;
  }

  .btn-secondary {
    background: var(--ds-color-background);
    color: var(--ds-color-text);
    border: 1px solid var(--ds-color-border);
    border-radius: 100px;
  }

  .btn-secondary:hover:not(:disabled) {
    background: var(--ds-color-surface-subtle);
  }

  /* ── Center State (loading, error) ── */
  .center-state {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    padding: var(--ds-layout-spacing-lg) 0;
    text-align: center;
    min-height: 200px;
  }

  .center-icon {
    width: 48px;
    height: 48px;
    margin-bottom: var(--ds-layout-spacing-md);
  }

  .center-icon.error {
    color: var(--ds-color-danger);
  }

  .center-icon svg {
    width: 100%;
    height: 100%;
  }

  .center-title {
    font-size: var(--ds-font-size-xlarge);
    font-weight: var(--ds-font-weight-bold);
    color: var(--ds-color-text);
    margin-bottom: var(--ds-layout-spacing-xs);
  }

  .center-description {
    font-size: var(--ds-font-size-base);
    color: var(--ds-color-text-secondary);
    margin-bottom: var(--ds-layout-spacing-lg);
    max-width: 360px;
  }

  .center-btn {
    margin-top: var(--ds-layout-spacing-sm);
  }

  /* ── Spinner ── */
  .spinner {
    display: inline-block;
    width: var(--ds-spinner-size, 32px);
    height: var(--ds-spinner-size, 32px);
    border: 3px solid var(--ds-border-color, #e5e7eb);
    border-top-color: var(--ds-color-primary, #692cff);
    border-radius: 50%;
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

  /* ── Legal Links ── */
  .legal-links {
    font-size: var(--ds-font-size-small);
    color: var(--ds-color-text-secondary);
    margin-top: var(--ds-layout-spacing-md);
    max-width: 360px;
  }

  .legal-links a {
    color: var(--ds-color-primary);
    text-decoration: none;
  }

  .legal-links a:hover {
    text-decoration: underline;
  }

  /* ── Form Elements ── */
  .form-group {
    margin-bottom: var(--ds-layout-spacing-md);
  }

  .form-label {
    display: block;
    font-size: 14px;
    font-weight: var(--ds-font-weight-medium);
    color: #717171;
    margin-bottom: var(--ds-spacing-xs);
  }

  .form-input,
  .form-select {
    width: 100%;
    height: 44px;
    padding: 0 var(--ds-layout-spacing-sm);
    font-size: var(--ds-font-size-base);
    font-family: var(--ds-font-family);
    color: var(--ds-color-text);
    background: var(--ds-color-background);
    border: 1px solid #e5e7eb;
    border-radius: 6px;
    box-sizing: border-box;
    transition: border-color var(--ds-transition-duration);
  }

  .form-input:focus,
  .form-select:focus {
    outline: none;
    border-color: var(--ds-color-primary);
  }

  .form-input.error {
    border-color: var(--ds-color-danger);
  }

  .form-row {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: var(--ds-layout-spacing-md);
  }

  .form-error {
    font-size: var(--ds-font-size-small);
    color: var(--ds-color-danger);
    margin-top: var(--ds-spacing-xs);
  }

  .form-help {
    font-size: var(--ds-font-size-small);
    color: var(--ds-color-text-secondary);
    margin-top: var(--ds-spacing-xs);
  }

  .form-static {
    padding: var(--ds-spacing-sm) var(--ds-spacing-md);
    background: var(--ds-color-surface);
    border: 1px solid var(--ds-color-border);
    border-radius: var(--ds-border-radius);
    color: var(--ds-color-text-secondary);
    font-size: var(--ds-font-size-base);
  }

  /* ── Section Divider ── */
  .section-divider {
    border: none;
    border-top: 1px solid var(--ds-color-border);
    margin: var(--ds-layout-spacing-lg) 0;
  }

  .section-heading {
    font-size: var(--ds-font-size-large);
    font-weight: var(--ds-font-weight-bold);
    color: var(--ds-color-text);
    margin: 0 0 var(--ds-spacing-xs) 0;
  }

  .section-description {
    font-size: var(--ds-font-size-small);
    color: var(--ds-color-text-secondary);
    margin: 0 0 var(--ds-layout-spacing-md) 0;
  }

  .btn-danger-ghost {
    background: none;
    border: none;
    color: var(--ds-color-danger);
    font-size: var(--ds-font-size-small);
    font-family: var(--ds-font-family);
    cursor: pointer;
    padding: var(--ds-spacing-xs) var(--ds-layout-spacing-sm);
    border-radius: var(--ds-border-radius);
  }

  .btn-danger-ghost:hover {
    background: var(--ds-color-danger);
    color: #fff;
  }

  .no-users {
    text-align: center;
    padding: var(--ds-layout-spacing-md);
    color: var(--ds-color-text-secondary);
    font-size: var(--ds-font-size-small);
  }

  /* ── User Table ── */
  .user-table {
    width: 100%;
    border-collapse: collapse;
    margin-bottom: var(--ds-layout-spacing-md);
    font-size: var(--ds-font-size-small);
  }

  .user-table th {
    text-align: left;
    font-weight: var(--ds-font-weight-medium);
    color: var(--ds-color-text-secondary);
    padding: var(--ds-spacing-xs) var(--ds-spacing-sm);
    border-bottom: 1px solid var(--ds-color-border);
  }

  .user-table td {
    padding: var(--ds-spacing-sm) var(--ds-spacing-sm);
    border-bottom: 1px solid var(--ds-color-border-subtle);
    color: var(--ds-color-text-secondary);
  }

  .user-table-name {
    font-weight: var(--ds-font-weight-medium);
    color: var(--ds-color-text);
  }

  .user-table-role {
    color: var(--ds-color-text-secondary);
  }

  /* ── Add User Form ── */
  .add-user-form {
    display: grid;
    grid-template-columns: 1fr 1fr 120px auto;
    gap: var(--ds-layout-spacing-sm);
    align-items: end;
    margin-bottom: var(--ds-layout-spacing-md);
  }

  .add-user-form .form-group {
    margin-bottom: 0;
  }

  .btn-add {
    white-space: nowrap;
    align-self: end;
    height: 44px;
    border-radius: 100px;
  }

  /* ── Inline Alert ── */
  .inline-alert {
    font-size: var(--ds-font-size-small);
    padding: var(--ds-layout-spacing-sm);
    border-radius: 6px;
    margin-top: var(--ds-layout-spacing-sm);
  }

  .inline-alert.error {
    background: color-mix(in srgb, var(--ds-color-danger) 10%, transparent);
    color: var(--ds-color-danger);
    border: 1px solid color-mix(in srgb, var(--ds-color-danger) 20%, transparent);
  }

  .inline-alert.warning {
    background: color-mix(in srgb, #f59e0b 10%, transparent);
    color: #92400e;
    border: 1px solid color-mix(in srgb, #f59e0b 20%, transparent);
  }

  .inline-alert.info {
    background: color-mix(in srgb, var(--ds-color-primary) 8%, transparent);
    color: var(--ds-color-text-secondary);
    border: 1px solid color-mix(in srgb, var(--ds-color-primary) 15%, transparent);
  }

  /* ── HW Step: Device List ── */
  .hw-device-list {
    display: flex;
    flex-direction: column;
    gap: var(--ds-spacing-xs);
    margin-bottom: var(--ds-layout-spacing-md);
  }

  .hw-device-row {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: var(--ds-layout-spacing-sm);
    background: var(--ds-color-surface-subtle);
    border-radius: 6px;
    border: 1px solid var(--ds-color-border-subtle);
  }

  .hw-device-row__info {
    display: flex;
    align-items: center;
    gap: var(--ds-spacing-xs);
    flex: 1;
    min-width: 0;
  }

  .hw-device-row__actions {
    display: flex;
    align-items: center;
    gap: var(--ds-spacing-xs);
    flex-shrink: 0;
    margin-left: auto;
    white-space: nowrap;
  }

  .hw-device-badge {
    font-size: var(--ds-font-size-small);
    color: var(--ds-color-text);
    font-weight: var(--ds-font-weight-medium);
  }

  .hw-device-mac {
    font-size: var(--ds-font-size-small);
    color: var(--ds-color-text-secondary);
    font-family: monospace;
  }

  .hw-device-user {
    font-size: var(--ds-font-size-small);
    color: var(--ds-color-text-secondary);
  }

  .hw-dect-group {
    border: 1px solid var(--ds-color-border-subtle);
    border-radius: 6px;
    overflow: hidden;
  }

  .hw-device-row--base {
    border: none;
    border-radius: 0;
  }

  .hw-device-row--handset {
    border: none;
    border-radius: 0;
    border-top: 1px solid var(--ds-color-border-subtle);
    padding-left: calc(var(--ds-layout-spacing-sm) + var(--ds-layout-spacing-sm));
  }

  .hw-device-row--editing {
    border: none;
    border-radius: 0;
    border-top: 1px solid var(--ds-color-border-subtle);
    flex-direction: column;
    align-items: stretch;
  }

  .hw-inline-form {
    display: flex;
    gap: var(--ds-layout-spacing-sm);
    align-items: end;
  }

  .hw-inline-form .form-group {
    flex: 1;
    margin-bottom: 0;
  }

  .hw-device-row--add {
    background: none;
    border: none;
    justify-content: center;
    padding: var(--ds-layout-spacing-md);
  }

  .hw-dect-base-actions {
    display: flex;
    align-items: center;
    gap: var(--ds-spacing-xs);
  }

  .form-check-label {
    display: inline-flex;
    align-items: center;
    gap: var(--ds-spacing-xs);
    font-size: var(--ds-font-size-base);
    color: var(--ds-color-text);
    cursor: pointer;
  }

  .form-check-label input[type="checkbox"] {
    width: 16px;
    height: 16px;
    cursor: pointer;
  }

  .btn-sm {
    font-size: var(--ds-font-size-small);
    padding: 2px var(--ds-spacing-xs);
  }

  /* ── Address Autocomplete ── */
  .address-autocomplete {
    position: relative;
  }

  .address-dropdown {
    position: absolute;
    top: 100%;
    left: 0;
    right: 0;
    z-index: 10;
    background: var(--ds-color-background);
    border: 1px solid var(--ds-color-border);
    border-top: none;
    border-radius: 0 0 6px 6px;
    max-height: 200px;
    overflow-y: auto;
    box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.1);
  }

  .address-suggestion {
    padding: var(--ds-layout-spacing-sm);
    cursor: pointer;
    font-size: var(--ds-font-size-small);
    transition: background var(--ds-transition-duration);
    border-bottom: 1px solid var(--ds-color-border-subtle);
  }

  .address-suggestion:last-child {
    border-bottom: none;
  }

  .address-suggestion:hover,
  .address-suggestion.highlighted {
    background: var(--ds-color-surface-subtle);
  }

  .address-suggestion-title {
    font-weight: var(--ds-font-weight-medium);
    color: var(--ds-color-text);
  }

  .address-suggestion-detail {
    color: var(--ds-color-text-secondary);
    margin-top: 2px;
  }

  .address-no-results {
    padding: var(--ds-layout-spacing-sm);
    font-size: var(--ds-font-size-small);
    color: var(--ds-color-text-secondary);
    text-align: center;
  }

  /* ── Address Confirmed Card ── */
  .address-confirmed {
    display: flex;
    align-items: center;
    gap: var(--ds-layout-spacing-sm);
    padding: var(--ds-layout-spacing-sm);
    background: var(--ds-color-surface-subtle);
    border-radius: 6px;
    border: 1px solid var(--ds-color-border-subtle);
  }

  .address-confirmed-icon {
    flex-shrink: 0;
  }

  .address-confirmed-text {
    flex: 1;
    min-width: 0;
  }

  .address-confirmed-line {
    font-size: var(--ds-font-size-small);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .address-confirmed-line:first-child {
    font-weight: var(--ds-font-weight-medium);
    color: var(--ds-color-text);
  }

  .address-confirmed-line:last-child {
    color: var(--ds-color-text-secondary);
  }

  .timezone-readonly {
    font-size: var(--ds-font-size-small);
    color: var(--ds-color-text-secondary);
    padding: var(--ds-spacing-xs) 0;
  }

  /* ── Address Manual Fields ── */
  .address-manual-fields {
    display: grid;
    grid-template-columns: 1fr 5fr;
    gap: var(--ds-layout-spacing-sm);
  }

  .address-manual-row-2 {
    display: grid;
    grid-template-columns: 2fr 2fr 2fr;
    gap: var(--ds-layout-spacing-sm);
    margin-top: var(--ds-layout-spacing-sm);
  }

  .address-manual-fields .form-group,
  .address-manual-row-2 .form-group {
    margin-bottom: 0;
  }

  /* ── Link Button ── */
  .btn-link {
    background: none;
    border: none;
    color: var(--ds-color-text-secondary);
    font-size: var(--ds-font-size-small);
    font-family: var(--ds-font-family);
    cursor: pointer;
    padding: 0;
    margin-top: var(--ds-layout-spacing-sm);
    text-decoration: none;
  }

  .btn-link:hover {
    color: var(--ds-color-primary);
    text-decoration: underline;
  }

  /* ── E911 Separator ── */
  .e911-separator {
    text-align: center;
    font-style: italic;
    color: var(--ds-color-text-secondary);
    font-size: var(--ds-font-size-small);
    margin: var(--ds-layout-spacing-md) 0;
  }

  /* ── Numbers Step ── */
  .num-action-cards {
    display: grid;
    grid-template-columns: 1fr;
    gap: var(--ds-layout-spacing-md);
    margin-top: var(--ds-layout-spacing-md);
    max-width: 560px;
    margin-left: auto;
    margin-right: auto;
  }

  .num-action-card {
    display: flex;
    align-items: flex-start;
    gap: var(--ds-layout-spacing-md);
    padding: 24px;
    border: 2px solid var(--ds-color-border);
    border-radius: 16px;
    background: var(--ds-color-background);
    cursor: pointer;
    transition: border-color var(--ds-transition-duration), box-shadow var(--ds-transition-duration);
  }

  .num-action-card:hover {
    border-color: var(--ds-color-primary);
  }

  .num-action-card.selected {
    border-color: var(--ds-color-primary);
    box-shadow: 0 0 0 1px var(--ds-color-primary);
  }

  .num-action-card-icon {
    width: 58px;
    height: 58px;
    border-radius: var(--ds-border-radius-round);
    background: var(--ds-color-surface-subtle);
    display: flex;
    align-items: center;
    justify-content: center;
    flex-shrink: 0;
    color: var(--ds-color-primary);
  }

  .num-action-card-icon svg {
    width: 24px;
    height: 24px;
  }

  .num-action-card-body {
    flex: 1;
    min-width: 0;
  }

  .num-action-card-title {
    font-weight: var(--ds-font-weight-bold);
    font-size: var(--ds-font-size-base);
    color: var(--ds-color-text);
    margin-bottom: 4px;
  }

  .num-action-card-desc {
    font-size: var(--ds-font-size-small);
    color: var(--ds-color-text-secondary);
    line-height: 1.4;
  }

  .num-overview-list {
    width: 100%;
    border-collapse: collapse;
    margin-bottom: var(--ds-layout-spacing-md);
  }

  .num-overview-list th,
  .num-overview-list td {
    text-align: left;
    padding: var(--ds-spacing-sm) var(--ds-spacing-md);
    border-bottom: 1px solid var(--ds-color-border-subtle);
    font-size: var(--ds-font-size-small);
  }

  .num-overview-list th {
    color: var(--ds-color-text-secondary);
    font-weight: var(--ds-font-weight-medium);
  }

  .num-status-badge {
    display: inline-block;
    padding: 2px 8px;
    border-radius: 12px;
    font-size: 11px;
    font-weight: var(--ds-font-weight-medium);
    text-transform: capitalize;
  }

  .num-status-active { background: color-mix(in srgb, var(--ds-color-success) 15%, transparent); color: var(--ds-color-success); }
  .num-status-ordering { background: color-mix(in srgb, var(--ds-color-primary) 15%, transparent); color: var(--ds-color-primary); }
  .num-status-porting { background: color-mix(in srgb, var(--ds-color-warning, #e9a820) 15%, transparent); color: var(--ds-color-warning, #b07d18); }
  .num-status-error { background: color-mix(in srgb, var(--ds-color-danger) 15%, transparent); color: var(--ds-color-danger); }
  .num-status-inactive { background: var(--ds-color-surface-subtle); color: var(--ds-color-text-secondary); }

  .num-sub-progress {
    display: flex;
    align-items: center;
    gap: var(--ds-spacing-xs);
    margin-bottom: var(--ds-layout-spacing-md);
    font-size: var(--ds-font-size-small);
    color: var(--ds-color-text-secondary);
  }

  .num-sub-progress-step {
    padding: 2px 10px;
    border-radius: 12px;
    background: var(--ds-color-surface-subtle);
    font-weight: var(--ds-font-weight-medium);
  }

  .num-sub-progress-step.active {
    background: var(--ds-color-primary);
    color: #fff;
  }

  .num-sub-progress-step.completed {
    background: var(--ds-color-success);
    color: #fff;
  }

  .num-sub-progress-arrow {
    color: var(--ds-color-border);
  }

  .num-phone-input-row {
    display: flex;
    align-items: center;
    gap: var(--ds-spacing-sm);
    margin-bottom: var(--ds-spacing-sm);
  }

  .num-phone-input-row .form-input {
    flex: 1;
  }

  .num-eligibility-table {
    width: 100%;
    border-collapse: collapse;
    margin-bottom: var(--ds-layout-spacing-md);
  }

  .num-eligibility-table th,
  .num-eligibility-table td {
    text-align: left;
    padding: var(--ds-spacing-sm) var(--ds-spacing-md);
    border-bottom: 1px solid var(--ds-color-border-subtle);
    font-size: var(--ds-font-size-small);
  }

  .num-eligibility-table th {
    color: var(--ds-color-text-secondary);
    font-weight: var(--ds-font-weight-medium);
  }

  .num-doc-upload {
    padding: var(--ds-layout-spacing-sm);
    border: 1px dashed var(--ds-color-border);
    border-radius: 6px;
    margin-bottom: var(--ds-layout-spacing-sm);
  }

  .num-doc-upload-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: var(--ds-spacing-xs);
  }

  .num-doc-upload-label {
    font-weight: var(--ds-font-weight-medium);
    font-size: var(--ds-font-size-base);
  }

  .num-doc-upload-badge {
    font-size: 11px;
    padding: 2px 8px;
    border-radius: 12px;
  }

  .num-doc-upload-badge.required {
    background: color-mix(in srgb, var(--ds-color-danger) 15%, transparent);
    color: var(--ds-color-danger);
  }

  .num-doc-upload-badge.optional {
    background: var(--ds-color-surface-subtle);
    color: var(--ds-color-text-secondary);
  }

  .num-doc-upload-desc {
    font-size: var(--ds-font-size-small);
    color: var(--ds-color-text-secondary);
    margin-bottom: var(--ds-spacing-sm);
  }

  .num-doc-upload-file {
    display: flex;
    align-items: center;
    gap: var(--ds-spacing-sm);
    font-size: var(--ds-font-size-small);
  }

  .num-doc-upload-file .file-name {
    color: var(--ds-color-text-secondary);
  }

  .num-review-section {
    margin-bottom: var(--ds-layout-spacing-md);
  }

  .num-review-section h4 {
    font-size: var(--ds-font-size-base);
    font-weight: var(--ds-font-weight-bold);
    margin: 0 0 var(--ds-spacing-sm) 0;
    color: var(--ds-color-text);
  }

  .num-review-row {
    display: flex;
    justify-content: space-between;
    padding: var(--ds-spacing-xs) 0;
    font-size: var(--ds-font-size-small);
    border-bottom: 1px solid var(--ds-color-border-subtle);
  }

  .num-review-label {
    color: var(--ds-color-text-secondary);
  }

  .num-review-value {
    color: var(--ds-color-text);
    font-weight: var(--ds-font-weight-medium);
  }

  .num-search-type-tabs {
    display: flex;
    gap: 0;
    margin-bottom: var(--ds-layout-spacing-md);
    border: 1px solid var(--ds-color-border);
    border-radius: 6px;
    overflow: hidden;
  }

  .num-search-type-tab {
    flex: 1;
    padding: var(--ds-spacing-sm) var(--ds-spacing-md);
    font-size: var(--ds-font-size-small);
    font-family: var(--ds-font-family);
    font-weight: var(--ds-font-weight-medium);
    background: var(--ds-color-surface-subtle);
    border: none;
    cursor: pointer;
    color: var(--ds-color-text-secondary);
    transition: background var(--ds-transition-duration), color var(--ds-transition-duration);
  }

  .num-search-type-tab:not(:last-child) {
    border-right: 1px solid var(--ds-color-border);
  }

  .num-search-type-tab.active {
    background: var(--ds-color-primary);
    color: #fff;
  }

  .num-results-table {
    width: 100%;
    border-collapse: collapse;
    margin-bottom: var(--ds-layout-spacing-md);
  }

  .num-results-table th,
  .num-results-table td {
    text-align: left;
    padding: var(--ds-spacing-sm) var(--ds-spacing-md);
    border-bottom: 1px solid var(--ds-color-border-subtle);
    font-size: var(--ds-font-size-small);
  }

  .num-results-table th {
    color: var(--ds-color-text-secondary);
    font-weight: var(--ds-font-weight-medium);
    text-transform: uppercase;
    font-size: 11px;
    letter-spacing: 0.05em;
  }

  .num-results-table tr:hover td {
    background: var(--ds-color-surface-subtle);
  }

  .num-results-table input[type="checkbox"] {
    cursor: pointer;
  }

  .num-count-badge {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 28px;
    height: 28px;
    border-radius: var(--ds-border-radius-round);
    background: var(--ds-color-primary);
    color: #fff;
    font-size: 12px;
    font-weight: var(--ds-font-weight-bold);
    margin-left: var(--ds-spacing-xs);
    vertical-align: middle;
  }

  .num-selected-count {
    font-size: var(--ds-font-size-small);
    color: var(--ds-color-primary);
    font-weight: var(--ds-font-weight-medium);
    margin-bottom: var(--ds-layout-spacing-sm);
  }

  .num-confirm-list {
    margin-bottom: var(--ds-layout-spacing-md);
  }

  .num-confirm-item {
    display: flex;
    align-items: center;
    gap: var(--ds-spacing-sm);
    padding: var(--ds-spacing-sm) 0;
    border-bottom: 1px solid var(--ds-color-border-subtle);
    font-size: var(--ds-font-size-small);
  }

  /* Confirm order table */
  .num-confirm-table {
    width: 100%;
    border-collapse: collapse;
    margin-bottom: var(--ds-layout-spacing-md);
  }

  .num-confirm-table th,
  .num-confirm-table td {
    text-align: left;
    padding: var(--ds-spacing-sm) var(--ds-spacing-md);
    border-bottom: 1px solid var(--ds-color-border-subtle);
    font-size: var(--ds-font-size-small);
  }

  .num-confirm-table th {
    color: var(--ds-color-text-secondary);
    font-weight: var(--ds-font-weight-medium);
    text-transform: uppercase;
    font-size: 11px;
    letter-spacing: 0.05em;
  }

  .num-sub-footer {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding-top: var(--ds-layout-spacing-md);
    border-top: 1px solid var(--ds-color-border);
    margin-top: var(--ds-layout-spacing-md);
  }

  .num-sub-footer-end {
    justify-content: flex-end;
  }

  .num-sub-footer-buttons {
    display: flex;
    align-items: center;
    gap: var(--ds-spacing-sm);
  }

  .num-order-status-icon {
    width: 48px;
    height: 48px;
    margin-bottom: var(--ds-layout-spacing-sm);
  }

  .num-order-status-icon.success { color: var(--ds-color-success); }
  .num-order-status-icon.error { color: var(--ds-color-danger); }
  .num-order-status-icon.pending { color: var(--ds-color-primary); }
  .num-order-status-icon .spinner { width: 48px; height: 48px; margin-bottom: 0; }

  .num-port-subscriber-form {
    display: grid;
    gap: var(--ds-layout-spacing-sm);
  }

  .num-port-address-grid {
    display: grid;
    grid-template-columns: auto 1fr;
    gap: var(--ds-layout-spacing-sm);
  }

  .num-port-address-row-2 {
    display: grid;
    grid-template-columns: 1fr auto 1fr;
    gap: var(--ds-layout-spacing-sm);
  }

  /* ── Confetti for complete screen ── */
  .confetti-container {
    position: relative;
    min-height: 400px;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    overflow: hidden;
  }

  .confetti-piece {
    position: absolute;
    width: 12px;
    height: 12px;
    opacity: 0;
    animation: confetti-fall 3s ease-in-out forwards;
  }

  @keyframes confetti-fall {
    0% {
      opacity: 1;
      transform: translateY(-100px) rotate(0deg);
    }
    100% {
      opacity: 0;
      transform: translateY(400px) rotate(720deg);
    }
  }

  .complete-title {
    font-size: 48px;
    font-weight: 900;
    color: var(--ds-color-text);
    margin: 0 0 var(--ds-layout-spacing-sm) 0;
    text-align: center;
  }

  .complete-subtitle {
    font-size: 18px;
    color: var(--ds-color-text-secondary);
    text-align: center;
    max-width: 500px;
  }

  /* ── Shipping Address in sidebar ── */
  .sidebar-section {
    margin-top: var(--ds-layout-spacing-md);
    padding-top: var(--ds-layout-spacing-md);
    border-top: 1px solid var(--ds-color-border);
  }

  .sidebar-section-header {
    display: flex;
    align-items: center;
    gap: var(--ds-spacing-xs);
    margin-bottom: var(--ds-spacing-sm);
  }

  .sidebar-section-icon {
    width: 20px;
    height: 20px;
    color: var(--ds-color-text-secondary);
  }

  .sidebar-section-title {
    font-size: var(--ds-font-size-small);
    font-weight: var(--ds-font-weight-bold);
    color: var(--ds-color-text);
  }

  .sidebar-section-text {
    font-size: var(--ds-font-size-small);
    color: var(--ds-color-text-secondary);
    line-height: 1.5;
  }

  /* ── Trash icon button ── */
  .btn-icon-danger {
    background: none;
    border: none;
    cursor: pointer;
    padding: 4px;
    color: var(--ds-color-danger);
    opacity: 0.6;
    transition: opacity var(--ds-transition-duration);
    display: inline-flex;
    align-items: center;
    justify-content: center;
  }

  .btn-icon-danger:hover {
    opacity: 1;
  }
`;
