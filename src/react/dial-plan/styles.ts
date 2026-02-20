/**
 * DialPlanViewer Styles
 *
 * CSS styles exported as a string for runtime injection.
 * Uses CSS variables from the DialStack theming system where available.
 */

export const dialPlanStyles = `
/* ============================================================================
   Container
   ============================================================================ */

.ds-dial-plan-viewer {
  width: 100%;
  height: 100%;
  min-height: 400px;
  background: var(--ds-color-background, #ffffff);
  border-radius: var(--ds-border-radius, 8px);
  overflow: hidden;
}

/* ============================================================================
   Base Node Styles
   ============================================================================ */

.ds-dial-plan-node {
  padding: 12px 16px;
  border-radius: var(--ds-border-radius, 8px);
  border: 2px solid var(--ds-color-border, #e2e8f0);
  background: var(--ds-color-background, #ffffff);
  font-family: var(--ds-font-family, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif);
  font-size: var(--ds-font-size-sm, 14px);
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.1);
  transition: border-color 0.15s ease, box-shadow 0.15s ease;
  min-width: 140px;
}

.ds-dial-plan-node--selected {
  border-color: var(--ds-color-primary, #3b82f6);
  box-shadow: 0 0 0 2px rgba(59, 130, 246, 0.2);
}

.ds-dial-plan-node__content,
.ds-dial-plan-node__header {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 4px;
}

.ds-dial-plan-node__icon {
  color: var(--ds-color-text-secondary, #64748b);
}

.ds-dial-plan-node__label {
  font-weight: 600;
  color: var(--ds-color-text, #1e293b);
  text-align: center;
}

.ds-dial-plan-node__type-label {
  font-size: var(--ds-font-size-xs, 12px);
  font-weight: 500;
  color: var(--ds-color-text-secondary, #64748b);
  text-transform: uppercase;
  letter-spacing: 0.5px;
}

.ds-dial-plan-node__name {
  font-weight: 600;
  font-size: var(--ds-font-size-sm, 14px);
  color: var(--ds-color-text, #1e293b);
  text-align: center;
}

.ds-dial-plan-node__type {
  font-size: var(--ds-font-size-xs, 12px);
  color: var(--ds-color-text-secondary, #64748b);
}

.ds-dial-plan-node__exits {
  display: flex;
  flex-direction: column;
  gap: 6px;
  margin-top: 12px;
  padding-top: 10px;
  border-top: 1px solid var(--ds-color-border, #e2e8f0);
}

.ds-dial-plan-node__exit-row {
  display: flex;
  align-items: center;
  justify-content: flex-end;
  gap: 8px;
  position: relative;
}

.ds-dial-plan-node__exit-label {
  font-size: 11px;
  color: var(--ds-color-text-secondary, #64748b);
  white-space: nowrap;
}

/* Position handles at the right edge of exit rows */
.ds-dial-plan-node__exit-row .ds-dial-plan-handle {
  position: absolute;
  right: -16px;
}

/* ============================================================================
   Start Node
   ============================================================================ */

.ds-dial-plan-node--start {
  background: var(--ds-color-primary, #3b82f6);
  border-color: var(--ds-color-primary, #3b82f6);
  border-radius: 50%;
  width: 60px;
  height: 60px;
  min-width: auto;
  padding: 0;
  display: flex;
  align-items: center;
  justify-content: center;
}

.ds-dial-plan-node--start .ds-dial-plan-node__content {
  flex-direction: row;
}

.ds-dial-plan-node--start .ds-dial-plan-node__label {
  color: #ffffff;
  font-size: var(--ds-font-size-sm, 14px);
}

/* ============================================================================
   Schedule Node (Decision/Diamond shape via border styling)
   ============================================================================ */

.ds-dial-plan-node--schedule {
  background: linear-gradient(135deg, #f0f9ff 0%, #e0f2fe 100%);
  border-color: var(--ds-color-info, #0ea5e9);
  position: relative;
  min-height: 80px;
}

.ds-dial-plan-node--schedule .ds-dial-plan-node__icon {
  color: var(--ds-color-info, #0ea5e9);
}

.ds-dial-plan-node--schedule.ds-dial-plan-node--selected {
  border-color: var(--ds-color-info, #0ea5e9);
  box-shadow: 0 0 0 2px rgba(14, 165, 233, 0.2);
}

/* ============================================================================
   Internal Dial Node
   ============================================================================ */

.ds-dial-plan-node--internal-dial {
  background: linear-gradient(135deg, #f0fdf4 0%, #dcfce7 100%);
  border-color: var(--ds-color-success, #22c55e);
}

.ds-dial-plan-node--internal-dial .ds-dial-plan-node__icon {
  color: var(--ds-color-success, #22c55e);
}

.ds-dial-plan-node--internal-dial.ds-dial-plan-node--selected {
  border-color: var(--ds-color-success, #22c55e);
  box-shadow: 0 0 0 2px rgba(34, 197, 94, 0.2);
}

/* ============================================================================
   Voicemail Node
   ============================================================================ */

.ds-dial-plan-node--voicemail {
  background: linear-gradient(135deg, #faf5ff 0%, #f3e8ff 100%);
  border-color: var(--ds-color-purple, #a855f7);
}

.ds-dial-plan-node--voicemail .ds-dial-plan-node__icon {
  color: var(--ds-color-purple, #a855f7);
}

.ds-dial-plan-node--voicemail.ds-dial-plan-node--selected {
  border-color: var(--ds-color-purple, #a855f7);
  box-shadow: 0 0 0 2px rgba(168, 85, 247, 0.2);
}

/* ============================================================================
   Handles
   ============================================================================ */

.ds-dial-plan-handle {
  width: 10px;
  height: 10px;
  background: var(--ds-color-border, #e2e8f0);
  border: 2px solid var(--ds-color-background, #ffffff);
}

.ds-dial-plan-handle--open {
  background: var(--ds-color-success, #22c55e);
}

.ds-dial-plan-handle--closed {
  background: var(--ds-color-warning, #f59e0b);
}

.ds-dial-plan-handle--holiday {
  background: var(--ds-color-info, #0ea5e9);
}

.ds-dial-plan-handle--next {
  background: var(--ds-color-text-secondary, #64748b);
}

/* ============================================================================
   React Flow Overrides
   ============================================================================ */

.ds-dial-plan-viewer .react-flow__edge-path {
  stroke: var(--ds-color-border, #94a3b8);
  stroke-width: 2;
}

.ds-dial-plan-viewer .react-flow__edge.selected .react-flow__edge-path {
  stroke: var(--ds-color-primary, #3b82f6);
}

.ds-dial-plan-viewer .react-flow__edge-text {
  font-size: var(--ds-font-size-xs, 12px);
  fill: var(--ds-color-text-secondary, #64748b);
}

.ds-dial-plan-viewer .react-flow__background {
  background-color: var(--ds-color-background, #ffffff);
}

.ds-dial-plan-viewer .react-flow__minimap {
  background: var(--ds-color-background, #ffffff);
  border: 1px solid var(--ds-color-border, #e2e8f0);
  border-radius: var(--ds-border-radius, 8px);
}

.ds-dial-plan-viewer .react-flow__controls {
  border-radius: var(--ds-border-radius, 8px);
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.1);
}

.ds-dial-plan-viewer .react-flow__controls-button {
  background: var(--ds-color-background, #ffffff);
  border-color: var(--ds-color-border, #e2e8f0);
  color: var(--ds-color-text, #1e293b);
}

.ds-dial-plan-viewer .react-flow__controls-button:hover {
  background: var(--ds-color-background-hover, #f8fafc);
}

/* ============================================================================
   Loading, Error, and Empty States
   ============================================================================ */

.ds-dial-plan-viewer--loading,
.ds-dial-plan-viewer--error,
.ds-dial-plan-viewer--empty {
  display: flex;
  align-items: center;
  justify-content: center;
}

.ds-dial-plan-viewer__loading,
.ds-dial-plan-viewer__error,
.ds-dial-plan-viewer__empty {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 12px;
  font-family: var(--ds-font-family, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif);
  font-size: var(--ds-font-size-sm, 14px);
  color: var(--ds-color-text-secondary, #64748b);
}

.ds-dial-plan-viewer__spinner {
  width: 32px;
  height: 32px;
  border: 3px solid var(--ds-color-border, #e2e8f0);
  border-top-color: var(--ds-color-primary, #3b82f6);
  border-radius: 50%;
  animation: ds-dial-plan-spin 0.8s linear infinite;
}

@keyframes ds-dial-plan-spin {
  to {
    transform: rotate(360deg);
  }
}

.ds-dial-plan-viewer__error {
  color: var(--ds-color-danger, #ef4444);
}

.ds-dial-plan-viewer__error-message {
  font-size: var(--ds-font-size-xs, 12px);
  color: var(--ds-color-text-secondary, #64748b);
  max-width: 300px;
  text-align: center;
}

/* ============================================================================
   Dark Mode
   Activated by .dark class on an ancestor (Tailwind / next-themes convention)
   or data-theme="dark" attribute.
   ============================================================================ */

:is(.dark, [data-theme="dark"]) .ds-dial-plan-viewer {
  background: #1a1a2e;
}

:is(.dark, [data-theme="dark"]) .ds-dial-plan-node {
  background: #1e1e32;
  border-color: rgba(255, 255, 255, 0.1);
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.3);
}

:is(.dark, [data-theme="dark"]) .ds-dial-plan-node__label,
:is(.dark, [data-theme="dark"]) .ds-dial-plan-node__name {
  color: #e2e8f0;
}

:is(.dark, [data-theme="dark"]) .ds-dial-plan-node__icon,
:is(.dark, [data-theme="dark"]) .ds-dial-plan-node__type-label,
:is(.dark, [data-theme="dark"]) .ds-dial-plan-node__type,
:is(.dark, [data-theme="dark"]) .ds-dial-plan-node__exit-label {
  color: #94a3b8;
}

:is(.dark, [data-theme="dark"]) .ds-dial-plan-node__exits {
  border-top-color: rgba(255, 255, 255, 0.1);
}

:is(.dark, [data-theme="dark"]) .ds-dial-plan-node--schedule {
  background: linear-gradient(135deg, #0c2d48 0%, #0a3761 100%);
}

:is(.dark, [data-theme="dark"]) .ds-dial-plan-node--internal-dial {
  background: linear-gradient(135deg, #052e16 0%, #064e3b 100%);
}

:is(.dark, [data-theme="dark"]) .ds-dial-plan-node--voicemail {
  background: linear-gradient(135deg, #2e1065 0%, #3b0764 100%);
}

:is(.dark, [data-theme="dark"]) .ds-dial-plan-handle {
  border-color: #1e1e32;
}

:is(.dark, [data-theme="dark"]) .ds-dial-plan-viewer .react-flow__background {
  background-color: #1a1a2e;
}

:is(.dark, [data-theme="dark"]) .ds-dial-plan-viewer .react-flow__edge-path {
  stroke: rgba(255, 255, 255, 0.2);
}

:is(.dark, [data-theme="dark"]) .ds-dial-plan-viewer .react-flow__edge-text {
  fill: #94a3b8;
}

:is(.dark, [data-theme="dark"]) .ds-dial-plan-viewer .react-flow__minimap {
  background: #1e1e32;
  border-color: rgba(255, 255, 255, 0.1);
}

:is(.dark, [data-theme="dark"]) .ds-dial-plan-viewer .react-flow__controls {
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.3);
}

:is(.dark, [data-theme="dark"]) .ds-dial-plan-viewer .react-flow__controls-button {
  background: #1e1e32;
  border-color: rgba(255, 255, 255, 0.1);
  color: #e2e8f0;
}

:is(.dark, [data-theme="dark"]) .ds-dial-plan-viewer .react-flow__controls-button:hover {
  background: #2a2a45;
}

:is(.dark, [data-theme="dark"]) .ds-dial-plan-viewer__loading,
:is(.dark, [data-theme="dark"]) .ds-dial-plan-viewer__empty {
  color: #94a3b8;
}

:is(.dark, [data-theme="dark"]) .ds-dial-plan-viewer__spinner {
  border-color: rgba(255, 255, 255, 0.1);
}
`;

// Track if styles have been injected
let stylesInjected = false;

/**
 * Inject the dial plan styles into the document head.
 * This is idempotent - calling multiple times will only inject once.
 */
export function injectDialPlanStyles(): void {
  if (stylesInjected || typeof document === 'undefined') {
    return;
  }

  const styleElement = document.createElement('style');
  styleElement.setAttribute('data-dialstack', 'dial-plan-viewer');
  styleElement.textContent = dialPlanStyles;
  document.head.appendChild(styleElement);
  stylesInjected = true;
}
