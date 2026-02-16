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
    padding: 3px;
    gap: 2px;
    margin-bottom: var(--ds-layout-spacing-md);
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
