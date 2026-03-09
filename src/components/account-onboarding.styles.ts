export const CHECK_SVG = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" style="width:12px;height:12px"><polyline points="20 6 9 17 4 12"/></svg>`;
export const SUCCESS_SVG = `<svg viewBox="0 0 52 52" fill="none" xmlns="http://www.w3.org/2000/svg"><circle cx="26" cy="26" r="25" stroke="currentColor" stroke-width="2"/><polyline points="16 27 23 34 36 20" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"/></svg>`;
export const ERROR_SVG = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/></svg>`;
export const CHECK_CIRCLE_SVG = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="width:16px;height:16px;color:var(--ds-color-success)"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg>`;
export const BUILDING_SVG = `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M6 22V4a2 2 0 0 1 2-2h8a2 2 0 0 1 2 2v18Z"/><path d="M6 12H4a2 2 0 0 0-2 2v6a2 2 0 0 0 2 2h2"/><path d="M18 9h2a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2h-2"/><path d="M10 6h4"/><path d="M10 10h4"/><path d="M10 14h4"/><path d="M10 18h4"/></svg>`;
export const PHONE_SVG = `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z"/></svg>`;
export const MONITOR_SVG = `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect width="20" height="14" x="2" y="3" rx="2"/><line x1="8" x2="16" y1="21" y2="21"/><line x1="12" x2="12" y1="17" y2="21"/></svg>`;

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
  }

  /* ── Two-Column Step Layout ── */
  .step-layout {
    display: grid;
    grid-template-columns: 260px 1fr;
    gap: var(--ds-layout-spacing-lg);
    padding: var(--ds-layout-spacing-lg);
    min-height: 500px;
  }

  /* Left sidebar */
  .step-sidebar {
    background: var(--ds-color-background);
    border-radius: var(--ds-border-radius-large);
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
    border-color: var(--ds-color-primary);
    background: var(--ds-color-primary);
    box-shadow: 0 0 0 3px color-mix(in srgb, var(--ds-color-primary) 20%, transparent);
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
    color: var(--ds-color-primary);
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
    padding: var(--ds-layout-spacing-sm) var(--ds-layout-spacing-sm);
    border-radius: var(--ds-border-radius);
    display: inline-flex;
    align-items: center;
    gap: var(--ds-spacing-xs);
    transition: color var(--ds-transition-duration), background var(--ds-transition-duration);
  }

  .btn-ghost:hover {
    color: var(--ds-color-text);
    background: var(--ds-color-surface-subtle);
  }

  /* ── Section Title ── */
  .section-title {
    font-size: var(--ds-font-size-xlarge);
    font-weight: var(--ds-font-weight-bold);
    color: var(--ds-color-text);
    margin: 0 0 var(--ds-layout-spacing-xs) 0;
  }

  .section-subtitle {
    font-size: var(--ds-font-size-base);
    color: var(--ds-color-text-secondary);
    margin: 0 0 var(--ds-layout-spacing-lg) 0;
  }

  /* ── Card ── */
  .card {
    padding: var(--ds-layout-spacing-lg);
    background: var(--ds-color-background);
    border: 1px solid var(--ds-color-border);
    border-radius: var(--ds-border-radius-large);
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
    width: 64px;
    height: 64px;
    color: var(--ds-color-success);
    margin-bottom: var(--ds-layout-spacing-md);
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
    padding: var(--ds-layout-spacing-sm) var(--ds-layout-spacing-lg);
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
  }

  .btn-primary:hover:not(:disabled) {
    opacity: 0.9;
  }

  .btn-secondary {
    background: var(--ds-color-surface-subtle);
    color: var(--ds-color-text);
    border: 1px solid var(--ds-color-border);
  }

  .btn-secondary:hover:not(:disabled) {
    background: var(--ds-color-border-subtle);
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
    width: var(--ds-spinner-size);
    height: var(--ds-spinner-size);
    animation: spin 1s linear infinite;
    color: var(--ds-color-primary);
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
    font-size: var(--ds-font-size-small);
    font-weight: var(--ds-font-weight-medium);
    color: var(--ds-color-text);
    margin-bottom: var(--ds-spacing-xs);
  }

  .form-input,
  .form-select {
    width: 100%;
    padding: var(--ds-layout-spacing-sm) var(--ds-layout-spacing-sm);
    font-size: var(--ds-font-size-base);
    font-family: var(--ds-font-family);
    color: var(--ds-color-text);
    background: var(--ds-color-background);
    border: 1px solid var(--ds-color-border);
    border-radius: var(--ds-border-radius);
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

  /* ── Add User Form ── */
  .add-user-form {
    display: grid;
    grid-template-columns: 1fr 1fr auto;
    gap: var(--ds-layout-spacing-sm);
    align-items: end;
    padding: var(--ds-layout-spacing-sm);
    background: var(--ds-color-surface-subtle);
    border-radius: var(--ds-border-radius);
    border: 1px solid var(--ds-color-border-subtle);
  }

  .add-user-form .form-group {
    margin-bottom: 0;
  }

  .btn-add {
    white-space: nowrap;
    align-self: end;
    /* Override .btn horizontal padding to match .form-input vertical padding for equal height */
    padding: var(--ds-layout-spacing-sm) var(--ds-layout-spacing-md);
  }

  /* ── Inline Alert ── */
  .inline-alert {
    font-size: var(--ds-font-size-small);
    padding: var(--ds-layout-spacing-sm);
    border-radius: var(--ds-border-radius);
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
    border-radius: var(--ds-border-radius);
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
    border-radius: var(--ds-border-radius);
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
    border-radius: 0 0 var(--ds-border-radius) var(--ds-border-radius);
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
    border-radius: var(--ds-border-radius);
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

  /* ── Numbers Step ── */
  .num-action-cards {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: var(--ds-layout-spacing-md);
    margin-top: var(--ds-layout-spacing-md);
  }

  .num-action-card {
    display: flex;
    flex-direction: column;
    gap: var(--ds-spacing-xs);
    padding: var(--ds-layout-spacing-md);
    border: 1px solid var(--ds-color-border);
    border-radius: var(--ds-border-radius);
    background: var(--ds-color-surface-subtle);
    cursor: pointer;
    transition: border-color var(--ds-transition-duration), box-shadow var(--ds-transition-duration);
  }

  .num-action-card:hover {
    border-color: var(--ds-color-primary);
    box-shadow: 0 0 0 1px var(--ds-color-primary);
  }

  .num-action-card-title {
    font-weight: var(--ds-font-weight-bold);
    font-size: var(--ds-font-size-base);
    color: var(--ds-color-text);
  }

  .num-action-card-desc {
    font-size: var(--ds-font-size-small);
    color: var(--ds-color-text-secondary);
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
    border-radius: var(--ds-border-radius);
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
    border-radius: var(--ds-border-radius);
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
  }

  .num-results-table tr:hover td {
    background: var(--ds-color-surface-subtle);
  }

  .num-results-table input[type="checkbox"] {
    cursor: pointer;
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

  .num-order-status-icon {
    width: 48px;
    height: 48px;
    margin-bottom: var(--ds-layout-spacing-sm);
  }

  .num-order-status-icon.success { color: var(--ds-color-success); }
  .num-order-status-icon.error { color: var(--ds-color-danger); }
  .num-order-status-icon.pending { color: var(--ds-color-primary); }

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
`;
