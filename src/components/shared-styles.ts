/**
 * Shared CSS fragments for SDK components using Shadow DOM.
 *
 * Because each component lives in its own shadow root, styles can't be
 * shared via a global stylesheet. Instead, components import these
 * constants and include them in their own <style> blocks.
 */

/** Segmented control — a row of mutually-exclusive toggle buttons. */
export const segmentedControlStyles = `
  .segmented-control {
    display: flex;
    background: var(--ds-color-surface-subtle);
    border: 1px solid var(--ds-color-border);
    border-radius: var(--ds-border-radius);
    padding: var(--ds-spacing-xs);
    gap: 2px;
    margin-bottom: var(--ds-layout-spacing-lg);
  }

  .segment-btn {
    padding: var(--ds-spacing-sm) var(--ds-spacing-md);
    font-size: var(--ds-font-size-small);
    font-family: var(--ds-font-family);
    font-weight: var(--ds-font-weight-medium);
    color: var(--ds-color-text-secondary);
    background: transparent;
    border: none;
    border-radius: var(--ds-border-radius-small);
    cursor: pointer;
    transition: all var(--ds-transition-duration);
    text-align: center;
    white-space: nowrap;
  }

  .segment-btn:hover:not(.active) {
    color: var(--ds-color-text);
  }

  .segment-btn.active {
    background: var(--ds-color-background);
    color: var(--ds-color-text);
    box-shadow: 0 1px 2px rgba(0,0,0,0.06);
  }
`;

/** Base table — bordered container, clean header, row dividers, hover. */
export const tableStyles = `
  .table-container {
    overflow: hidden;
    border: 1px solid var(--ds-color-border);
    border-radius: var(--ds-border-radius-large);
  }

  table {
    width: 100%;
    border-collapse: collapse;
    font-size: var(--ds-font-size-base);
  }

  thead {
    background: transparent;
  }

  th {
    text-align: left;
    padding: var(--ds-spacing-lg);
    font-weight: var(--ds-font-weight-medium);
    color: var(--ds-color-text-secondary);
    border-bottom: 1px solid var(--ds-color-border);
    height: 48px;
    vertical-align: middle;
  }

  td {
    padding: var(--ds-spacing-sm) var(--ds-spacing-lg);
    height: 48px;
    vertical-align: middle;
  }

  tbody tr {
    border-bottom: 1px solid var(--ds-color-border);
    transition: background-color var(--ds-transition-duration) ease;
  }

  tbody tr:last-child {
    border-bottom: none;
  }

  tbody tr:hover {
    background: var(--ds-color-surface-subtle);
  }
`;

/** Pagination — prev/next buttons with page info. */
export const paginationStyles = `
  .pagination {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: var(--ds-spacing-md) var(--ds-spacing-lg);
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
