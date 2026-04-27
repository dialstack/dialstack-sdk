/**
 * DialPlan Styles
 *
 * CSS styles exported as a string for runtime injection.
 * Uses CSS variables from the DialStack theming system where available.
 */

export const dialPlanStyles = `
/* ============================================================================
   Shadow DOM Reset
   ============================================================================ */

:host {
  display: flex;
  flex-direction: column;
  width: 100%;
  height: 100%;
}

*, *::before, *::after {
  box-sizing: border-box;
}

/* ============================================================================
   Container
   ============================================================================ */

.ds-dial-plan-viewer {
  width: 100%;
  height: 100%;
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
  transition: border-color 0.15s ease, box-shadow 0.15s ease, outline-color 0.15s ease;
  min-width: 140px;
  outline: 3px solid transparent;
  outline-offset: 2px;
}

.ds-dial-plan-node--selected {
  border-color: var(--ds-color-primary, #3b82f6);
  outline-color: var(--ds-color-primary, #3b82f6);
  box-shadow: 0 0 16px 2px rgba(59, 130, 246, 0.4), 0 4px 12px rgba(59, 130, 246, 0.2);
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
   Node color theming (driven by --node-color CSS variable from registration)
   ============================================================================ */

.ds-dial-plan-node--themed {
  border-color: var(--node-color);
  background: color-mix(in srgb, var(--node-color) 8%, white);
}

.ds-dial-plan-node--themed .ds-dial-plan-node__icon {
  color: var(--node-color);
}

.ds-dial-plan-node--themed.ds-dial-plan-node--selected {
  border-color: var(--node-color);
  outline-color: var(--node-color);
  box-shadow: 0 0 16px 2px color-mix(in srgb, var(--node-color) 40%, transparent),
              0 4px 12px color-mix(in srgb, var(--node-color) 20%, transparent);
}

/* ============================================================================
   Per-type node colors (override --themed fallback with hand-crafted gradients)
   ============================================================================ */

.ds-dial-plan-node--schedule {
  background: linear-gradient(135deg, #f0f9ff 0%, #e0f2fe 100%);
  border-color: var(--ds-color-info, #0ea5e9);
  min-height: 80px;
}
.ds-dial-plan-node--schedule .ds-dial-plan-node__icon { color: var(--ds-color-info, #0ea5e9); }
.ds-dial-plan-node--schedule.ds-dial-plan-node--selected {
  border-color: var(--ds-color-info, #0ea5e9);
  outline-color: var(--ds-color-info, #0ea5e9);
  box-shadow: 0 0 16px 2px rgba(14, 165, 233, 0.4), 0 4px 12px rgba(14, 165, 233, 0.2);
}

.ds-dial-plan-node--internal-dial {
  background: linear-gradient(135deg, #f0fdf4 0%, #dcfce7 100%);
  border-color: var(--ds-color-success, #22c55e);
}
.ds-dial-plan-node--internal-dial .ds-dial-plan-node__icon { color: var(--ds-color-success, #22c55e); }
.ds-dial-plan-node--internal-dial.ds-dial-plan-node--selected {
  border-color: var(--ds-color-success, #22c55e);
  outline-color: var(--ds-color-success, #22c55e);
  box-shadow: 0 0 16px 2px rgba(34, 197, 94, 0.4), 0 4px 12px rgba(34, 197, 94, 0.2);
}

.ds-dial-plan-node--voicemail {
  background: linear-gradient(135deg, #faf5ff 0%, #f3e8ff 100%);
  border-color: var(--ds-color-purple, #a855f7);
}
.ds-dial-plan-node--voicemail .ds-dial-plan-node__icon { color: var(--ds-color-purple, #a855f7); }
.ds-dial-plan-node--voicemail.ds-dial-plan-node--selected {
  border-color: var(--ds-color-purple, #a855f7);
  outline-color: var(--ds-color-purple, #a855f7);
  box-shadow: 0 0 16px 2px rgba(168, 85, 247, 0.4), 0 4px 12px rgba(168, 85, 247, 0.2);
}

.ds-dial-plan-node--ring-all-users {
  background: linear-gradient(135deg, #fffbeb 0%, #fef3c7 100%);
  border-color: var(--ds-color-warning, #f59e0b);
}
.ds-dial-plan-node--ring-all-users .ds-dial-plan-node__icon { color: var(--ds-color-warning, #f59e0b); }
.ds-dial-plan-node--ring-all-users.ds-dial-plan-node--selected {
  border-color: var(--ds-color-warning, #f59e0b);
  outline-color: var(--ds-color-warning, #f59e0b);
  box-shadow: 0 0 16px 2px rgba(245, 158, 11, 0.4), 0 4px 12px rgba(245, 158, 11, 0.2);
}

.ds-dial-plan-node--external-dial {
  background: linear-gradient(135deg, #fff1f2 0%, #fecdd3 100%);
  border-color: var(--ds-color-rose, #f43f5e);
}
.ds-dial-plan-node--external-dial .ds-dial-plan-node__icon { color: var(--ds-color-rose, #f43f5e); }
.ds-dial-plan-node--external-dial.ds-dial-plan-node--selected {
  border-color: var(--ds-color-rose, #f43f5e);
  outline-color: var(--ds-color-rose, #f43f5e);
  box-shadow: 0 0 16px 2px rgba(244, 63, 94, 0.4), 0 4px 12px rgba(244, 63, 94, 0.2);
}

.ds-dial-plan-node--voice-app {
  border: 2px solid transparent;
  background:
    linear-gradient(135deg, #c7d2fe 0%, #ddd6fe 40%, #bae6fd 100%) padding-box,
    linear-gradient(135deg, #38bdf8 0%, #818cf8 35%, #a855f7 60%, #ec4899 100%) border-box;
  position: relative;
  transition: box-shadow 0.15s ease;
}
.ds-dial-plan-node--voice-app .ds-dial-plan-node__icon { color: #4f46e5; }
.ds-dial-plan-node--voice-app.ds-dial-plan-node--selected {
  border-color: transparent;
  outline: none;
  box-shadow: 0 0 16px 2px rgba(99, 102, 241, 0.4), 0 4px 12px rgba(56, 189, 248, 0.2);
}
.ds-dial-plan-node--voice-app::after {
  content: '';
  position: absolute;
  inset: -7px;
  border-radius: calc(var(--ds-border-radius, 8px) + 5px);
  border: 3px solid transparent;
  background: linear-gradient(135deg, #38bdf8 0%, #818cf8 35%, #a855f7 60%, #ec4899 100%) border-box;
  -webkit-mask: linear-gradient(#fff 0 0) padding-box, linear-gradient(#fff 0 0);
  -webkit-mask-composite: xor;
  mask: linear-gradient(#fff 0 0) padding-box, linear-gradient(#fff 0 0);
  mask-composite: exclude;
  pointer-events: none;
  opacity: 0;
  transition: opacity 0.15s ease;
  z-index: -1;
}
.ds-dial-plan-node--voice-app.ds-dial-plan-node--selected::after { opacity: 1; }

.ds-dial-plan-node--menu {
  background: linear-gradient(135deg, #fdf2f8 0%, #fce7f3 100%);
  border-color: #ec4899;
}
.ds-dial-plan-node--menu .ds-dial-plan-node__icon { color: #ec4899; }
.ds-dial-plan-node--menu.ds-dial-plan-node--selected {
  border-color: #ec4899;
  outline-color: #ec4899;
  box-shadow: 0 0 16px 2px rgba(236, 72, 153, 0.4), 0 4px 12px rgba(236, 72, 153, 0.2);
}

.ds-dial-plan-node--sound-clip {
  background: linear-gradient(135deg, #f0fdfa 0%, #ccfbf1 100%);
  border-color: #14b8a6;
}
.ds-dial-plan-node--sound-clip .ds-dial-plan-node__icon { color: #14b8a6; }
.ds-dial-plan-node--sound-clip.ds-dial-plan-node--selected {
  border-color: #14b8a6;
  outline-color: #14b8a6;
  box-shadow: 0 0 16px 2px rgba(20, 184, 166, 0.4), 0 4px 12px rgba(20, 184, 166, 0.2);
}

/* ============================================================================
   Menu Config Panel — Options List
   ============================================================================ */

.ds-dial-plan-config-field__header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 6px;
}

.ds-dial-plan-config-field__header .ds-dial-plan-config-field__label {
  margin: 0;
}

.ds-dial-plan-menu-options {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.ds-dial-plan-menu-options__row {
  display: flex;
  align-items: center;
  gap: 6px;
}

.ds-dial-plan-menu-options__digit {
  flex: 1;
}

.ds-dial-plan-menu-options__remove {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 28px;
  height: 28px;
  border: none;
  background: none;
  color: var(--ds-color-text-muted, #94a3b8);
  cursor: pointer;
  border-radius: 4px;
  flex-shrink: 0;
}

.ds-dial-plan-menu-options__remove:hover {
  color: var(--ds-color-danger, #ef4444);
  background: rgba(239, 68, 68, 0.1);
}

.ds-dial-plan-menu-options__add {
  padding: 3px 10px;
  border: 1px solid var(--ds-color-primary, #6366f1);
  background: none;
  color: var(--ds-color-primary, #6366f1);
  cursor: pointer;
  border-radius: 4px;
  font-size: 11px;
  font-weight: 500;
  white-space: nowrap;
}

.ds-dial-plan-menu-options__add:hover:not(:disabled) {
  background: var(--ds-color-primary, #6366f1);
  color: #ffffff;
}

.ds-dial-plan-menu-options__add:disabled {
  opacity: 0.4;
  cursor: default;
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

.ds-dial-plan-handle--next {
  background: var(--ds-color-text-secondary, #64748b);
}

/* ============================================================================
   React Flow Overrides (both viewer and editor)
   ============================================================================ */

:is(.ds-dial-plan-viewer, .ds-dial-plan-editor) .react-flow__edge-path {
  stroke: var(--ds-color-border, #94a3b8);
  stroke-width: 2;
}

:is(.ds-dial-plan-viewer, .ds-dial-plan-editor) .react-flow__edge.selected .react-flow__edge-path {
  stroke: var(--ds-color-primary, #3b82f6);
}

:is(.ds-dial-plan-viewer, .ds-dial-plan-editor) .react-flow__edge-text {
  font-size: var(--ds-font-size-xs, 12px);
  fill: var(--ds-color-text-secondary, #64748b);
}

:is(.ds-dial-plan-viewer, .ds-dial-plan-editor) .react-flow__background {
  background-color: var(--ds-color-background, #ffffff);
}

:is(.ds-dial-plan-viewer, .ds-dial-plan-editor) .react-flow__minimap {
  background: var(--ds-color-background, #ffffff);
  border: 1px solid var(--ds-color-border, #e2e8f0);
  border-radius: var(--ds-border-radius, 8px);
}

:is(.ds-dial-plan-viewer, .ds-dial-plan-editor) .react-flow__controls {
  border-radius: var(--ds-border-radius, 8px);
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.1);
}

:is(.ds-dial-plan-viewer, .ds-dial-plan-editor) .react-flow__controls-button {
  background: var(--ds-color-background, #ffffff);
  border-color: var(--ds-color-border, #e2e8f0);
  color: var(--ds-color-text, #1e293b);
}

:is(.ds-dial-plan-viewer, .ds-dial-plan-editor) .react-flow__controls-button:hover {
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
   Config Panel
   ============================================================================ */

.ds-dial-plan-config-panel {
  width: 260px;
  height: 100%;
  background: var(--ds-color-background, #ffffff);
  border-left: 1px solid var(--ds-color-border, #e2e8f0);
  display: flex;
  flex-direction: column;
  font-family: var(--ds-font-family, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif);
  font-size: var(--ds-font-size-sm, 14px);
  overflow-y: auto;
}

.ds-dial-plan-config-panel__header {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 12px 16px;
  border-bottom: 1px solid var(--ds-color-border, #e2e8f0);
}

.ds-dial-plan-config-panel__header-icon {
  color: var(--ds-color-text-secondary, #64748b);
  display: flex;
  align-items: center;
}

.ds-dial-plan-config-panel__header-label {
  flex: 1;
  font-weight: 600;
  color: var(--ds-color-text, #1e293b);
}

.ds-dial-plan-config-panel__delete {
  color: var(--ds-color-danger, #ef4444);
  background: none;
  border: none;
  padding: 2px;
  cursor: pointer;
  display: flex;
  align-items: center;
}

.ds-dial-plan-config-panel__delete:hover {
  color: #dc2626;
}

.ds-dial-plan-config-panel__close {
  background: none;
  border: none;
  color: var(--ds-color-text-secondary, #64748b);
  cursor: pointer;
  padding: 2px;
  display: flex;
  align-items: center;
}

.ds-dial-plan-config-panel__close:hover {
  color: var(--ds-color-text, #1e293b);
}

.ds-dial-plan-config-panel__body {
  padding: 16px;
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.ds-dial-plan-config-field {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.ds-dial-plan-config-field__label {
  font-size: var(--ds-font-size-xs, 12px);
  font-weight: 500;
  color: var(--ds-color-text-secondary, #64748b);
  text-transform: uppercase;
  letter-spacing: 0.5px;
}

.ds-dial-plan-config-field__select,
.ds-dial-plan-config-field__input {
  width: 100%;
  padding: 6px 8px;
  border: 1px solid var(--ds-color-border, #e2e8f0);
  border-radius: var(--ds-border-radius, 8px);
  background: var(--ds-color-background, #ffffff);
  color: var(--ds-color-text, #1e293b);
  font-size: var(--ds-font-size-sm, 14px);
  font-family: inherit;
  outline: none;
  box-sizing: border-box;
}

.ds-dial-plan-edge-panel__value {
  font-size: var(--ds-font-size-sm, 14px);
  color: var(--ds-color-text, #1e293b);
}

:is(.dark, [data-theme="dark"]) .ds-dial-plan-edge-panel__value {
  color: #e2e8f0;
}

.ds-dial-plan-config-field__open-link {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  background: none;
  border: none;
  padding: 0;
  margin-top: 4px;
  font-size: var(--ds-font-size-xs, 12px);
  color: var(--ds-color-primary, #3b82f6);
  cursor: pointer;
  font-family: inherit;
}

.ds-dial-plan-config-field__open-link:hover {
  text-decoration: underline;
}

.ds-dial-plan-config-field__select:focus,
.ds-dial-plan-config-field__input:focus {
  border-color: var(--ds-color-primary, #3b82f6);
  box-shadow: 0 0 0 2px rgba(59, 130, 246, 0.15);
}

.ds-dial-plan-config-field__input-wrapper {
  position: relative;
  display: flex;
  align-items: center;
}

.ds-dial-plan-config-field__input-wrapper .ds-dial-plan-config-field__input {
  padding-right: 28px;
}

.ds-dial-plan-config-field__clear {
  position: absolute;
  right: 6px;
  display: flex;
  align-items: center;
  justify-content: center;
  width: 20px;
  height: 20px;
  padding: 0;
  border: none;
  border-radius: 50%;
  background: transparent;
  color: var(--ds-color-text-secondary, #64748b);
  cursor: pointer;
}

.ds-dial-plan-config-field__clear:hover {
  background: var(--ds-color-border, #e2e8f0);
  color: var(--ds-color-text, #1e293b);
}

:is(.dark, [data-theme="dark"]) .ds-dial-plan-config-field__clear:hover {
  background: rgba(255, 255, 255, 0.1);
  color: #e2e8f0;
}

/* ============================================================================
   Resource Combobox
   ============================================================================ */

.ds-resource-combobox {
  border: 1px solid var(--ds-color-border, #e2e8f0);
  border-radius: var(--ds-border-radius, 8px);
  background: var(--ds-color-background, #ffffff);
  overflow: hidden;
}

.ds-resource-combobox__trigger {
  width: 100%;
  padding: 6px 8px;
  border: 1px solid var(--ds-color-border, #e2e8f0);
  border-radius: var(--ds-border-radius, 8px);
  background: var(--ds-color-background, #ffffff);
  color: var(--ds-color-text, #1e293b);
  font-size: var(--ds-font-size-sm, 14px);
  font-family: inherit;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: space-between;
  text-align: left;
}

.ds-resource-combobox__trigger:hover {
  border-color: var(--ds-color-primary, #3b82f6);
}

.ds-resource-combobox__trigger-placeholder {
  color: var(--ds-color-text-secondary, #64748b);
}

.ds-resource-combobox__trigger-chevron {
  color: var(--ds-color-text-secondary, #64748b);
  opacity: 0.5;
  flex-shrink: 0;
}

.ds-resource-combobox__input {
  width: 100%;
  padding: 8px 10px;
  border: none;
  border-bottom: 1px solid var(--ds-color-border, #e2e8f0);
  background: transparent;
  color: var(--ds-color-text, #1e293b);
  font-size: var(--ds-font-size-sm, 14px);
  font-family: inherit;
  outline: none;
  box-sizing: border-box;
}

.ds-resource-combobox__input::placeholder {
  color: var(--ds-color-text-secondary, #64748b);
}

.ds-resource-combobox__list {
  max-height: 400px;
  overflow-y: auto;
  padding: 4px 0;
}

.ds-resource-combobox__group [cmdk-group-heading] {
  padding: 6px 10px 2px;
  font-size: var(--ds-font-size-xs, 12px);
  font-weight: 500;
  color: var(--ds-color-text-secondary, #64748b);
  text-transform: uppercase;
  letter-spacing: 0.5px;
}

.ds-resource-combobox__item {
  padding: 6px 10px;
  font-size: var(--ds-font-size-sm, 14px);
  color: var(--ds-color-text, #1e293b);
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: space-between;
  border-radius: 0;
}

.ds-resource-combobox__item[data-selected="true"] {
  background: var(--ds-color-primary, #3b82f6);
  color: #ffffff;
}

.ds-resource-combobox__item--selected {
  font-weight: 500;
}

.ds-resource-combobox__name {
  flex: 1;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.ds-resource-combobox__ext {
  font-size: var(--ds-font-size-xs, 12px);
  color: var(--ds-color-text-secondary, #64748b);
  margin-left: auto;
  padding-left: 8px;
  white-space: nowrap;
  flex-shrink: 0;
}

.ds-resource-combobox__check {
  font-size: 12px;
  opacity: 0.7;
  width: 16px;
  text-align: center;
  flex-shrink: 0;
}

.ds-resource-combobox__create {
  padding: 6px 10px;
  font-size: var(--ds-font-size-sm, 14px);
  color: var(--ds-color-primary, #3b82f6);
  cursor: pointer;
  font-style: italic;
}

.ds-resource-combobox__create[data-selected="true"] {
  background: var(--ds-color-primary, #3b82f6);
  color: #ffffff;
}

.ds-resource-combobox__empty {
  padding: 12px 10px;
  font-size: var(--ds-font-size-sm, 14px);
  color: var(--ds-color-text-secondary, #64748b);
  text-align: center;
}

/* ============================================================================
   Dark Mode
   Activated by .dark class on an ancestor (Tailwind / next-themes convention)
   or data-theme="dark" attribute.
   ============================================================================ */

:is(.dark, [data-theme="dark"]) .ds-dial-plan-viewer,
:is(.dark, [data-theme="dark"]) .ds-dial-plan-editor {
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

:is(.dark, [data-theme="dark"]) .ds-dial-plan-node--themed {
  background: color-mix(in srgb, var(--node-color) 20%, #1a1a2e);
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
:is(.dark, [data-theme="dark"]) .ds-dial-plan-node--ring-all-users {
  background: linear-gradient(135deg, #451a03 0%, #78350f 100%);
}
:is(.dark, [data-theme="dark"]) .ds-dial-plan-node--external-dial {
  background: linear-gradient(135deg, #4c0519 0%, #881337 100%);
}
:is(.dark, [data-theme="dark"]) .ds-dial-plan-node--voice-app {
  background:
    linear-gradient(135deg, #252262 0%, #3b1d7e 40%, #0c3a5e 100%) padding-box,
    linear-gradient(135deg, #38bdf8 0%, #818cf8 35%, #a855f7 60%, #ec4899 100%) border-box;
}
:is(.dark, [data-theme="dark"]) .ds-dial-plan-node--menu {
  background: linear-gradient(135deg, #500724 0%, #831843 100%);
}
:is(.dark, [data-theme="dark"]) .ds-dial-plan-node--sound-clip {
  background: linear-gradient(135deg, #042f2e 0%, #115e59 100%);
}


:is(.dark, [data-theme="dark"]) .ds-dial-plan-handle {
  border-color: #1e1e32;
}

:is(.dark, [data-theme="dark"]) :is(.ds-dial-plan-viewer, .ds-dial-plan-editor) .react-flow__background {
  background-color: #1a1a2e;
}

:is(.dark, [data-theme="dark"]) :is(.ds-dial-plan-viewer, .ds-dial-plan-editor) .react-flow__edge-path {
  stroke: rgba(255, 255, 255, 0.2);
}

:is(.dark, [data-theme="dark"]) :is(.ds-dial-plan-viewer, .ds-dial-plan-editor) .react-flow__edge-text {
  fill: #94a3b8;
}

:is(.dark, [data-theme="dark"]) :is(.ds-dial-plan-viewer, .ds-dial-plan-editor) .react-flow__minimap {
  background: #1e1e32;
  border-color: rgba(255, 255, 255, 0.1);
}

:is(.dark, [data-theme="dark"]) :is(.ds-dial-plan-viewer, .ds-dial-plan-editor) .react-flow__controls {
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.3);
}

:is(.dark, [data-theme="dark"]) :is(.ds-dial-plan-viewer, .ds-dial-plan-editor) .react-flow__controls-button {
  background: #1e1e32;
  border-color: rgba(255, 255, 255, 0.1);
  color: #e2e8f0;
}

:is(.dark, [data-theme="dark"]) :is(.ds-dial-plan-viewer, .ds-dial-plan-editor) .react-flow__controls-button:hover {
  background: #2a2a45;
}

:is(.dark, [data-theme="dark"]) .ds-dial-plan-viewer__loading,
:is(.dark, [data-theme="dark"]) .ds-dial-plan-viewer__empty {
  color: #94a3b8;
}

:is(.dark, [data-theme="dark"]) .ds-dial-plan-viewer__spinner {
  border-color: rgba(255, 255, 255, 0.1);
}

:is(.dark, [data-theme="dark"]) .ds-dial-plan-config-panel {
  background: #1e1e32;
  border-left-color: rgba(255, 255, 255, 0.1);
}

:is(.dark, [data-theme="dark"]) .ds-dial-plan-config-panel__header {
  border-bottom-color: rgba(255, 255, 255, 0.1);
}

:is(.dark, [data-theme="dark"]) .ds-dial-plan-config-panel__header-label {
  color: #e2e8f0;
}

:is(.dark, [data-theme="dark"]) .ds-dial-plan-config-panel__close {
  color: #94a3b8;
}

:is(.dark, [data-theme="dark"]) .ds-dial-plan-config-panel__close:hover {
  color: #e2e8f0;
}

:is(.dark, [data-theme="dark"]) .ds-dial-plan-config-field__label {
  color: #94a3b8;
}

:is(.dark, [data-theme="dark"]) .ds-dial-plan-config-field__select,
:is(.dark, [data-theme="dark"]) .ds-dial-plan-config-field__input {
  background: #12122a;
  border-color: rgba(255, 255, 255, 0.1);
  color: #e2e8f0;
}

:is(.dark, [data-theme="dark"]) .ds-resource-combobox__trigger {
  background: #12122a;
  border-color: rgba(255, 255, 255, 0.1);
  color: #e2e8f0;
}

:is(.dark, [data-theme="dark"]) .ds-resource-combobox {
  border-color: rgba(255, 255, 255, 0.1);
  background: #12122a;
}

:is(.dark, [data-theme="dark"]) .ds-resource-combobox__input {
  color: #e2e8f0;
  border-bottom-color: rgba(255, 255, 255, 0.1);
}

:is(.dark, [data-theme="dark"]) .ds-resource-combobox__item {
  color: #e2e8f0;
}

:is(.dark, [data-theme="dark"]) .ds-resource-combobox__item--selected {
  color: #e2e8f0;
}

/* Node Library */

.ds-dial-plan-node-library {
  width: 200px;
  height: 100%;
  background: var(--ds-color-background, #ffffff);
  border-right: 1px solid var(--ds-color-border, #e2e8f0);
  display: flex;
  flex-direction: column;
  gap: 10px;
  padding: 12px;
  font-family: var(--ds-font-family, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif);
  font-size: var(--ds-font-size-sm, 14px);
  overflow-y: auto;
}

.ds-dial-plan-node-library__item {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 4px;
  padding: 10px 12px;
  border-radius: var(--ds-border-radius, 8px);
  border: 2px solid var(--node-color, var(--ds-color-border, #e2e8f0));
  background: color-mix(in srgb, var(--node-color, #ffffff) 10%, white);
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.1);
  cursor: grab;
  transition: border-color 0.15s ease, box-shadow 0.15s ease, transform 0.15s ease;
}

.ds-dial-plan-node-library__item:hover {
  box-shadow: 0 2px 6px rgba(0, 0, 0, 0.15);
  transform: translateY(-1px);
}

.ds-dial-plan-node-library__item:active {
  cursor: grabbing;
  transform: scale(0.97);
}

/* Per-type library item colors */
.ds-dial-plan-node-library__item--schedule { background: linear-gradient(135deg, #f0f9ff 0%, #e0f2fe 100%); border-color: var(--ds-color-info, #0ea5e9); }
.ds-dial-plan-node-library__item--internal_dial { background: linear-gradient(135deg, #f0fdf4 0%, #dcfce7 100%); border-color: var(--ds-color-success, #22c55e); }
.ds-dial-plan-node-library__item--voicemail { background: linear-gradient(135deg, #faf5ff 0%, #f3e8ff 100%); border-color: var(--ds-color-purple, #a855f7); }
.ds-dial-plan-node-library__item--ring_all_users { background: linear-gradient(135deg, #fffbeb 0%, #fef3c7 100%); border-color: var(--ds-color-warning, #f59e0b); }
.ds-dial-plan-node-library__item--external_dial { background: linear-gradient(135deg, #fff1f2 0%, #fecdd3 100%); border-color: var(--ds-color-rose, #f43f5e); }
.ds-dial-plan-node-library__item--voice_app,
.ds-dial-plan-node-library__item--voice_app:hover {
  border: 2px solid transparent;
  background: linear-gradient(135deg, #c7d2fe 0%, #ddd6fe 40%, #bae6fd 100%) padding-box, linear-gradient(135deg, #38bdf8 0%, #818cf8 35%, #a855f7 60%, #ec4899 100%) border-box;
}
.ds-dial-plan-node-library__item--menu { background: linear-gradient(135deg, #fdf2f8 0%, #fce7f3 100%); border-color: #ec4899; }
.ds-dial-plan-node-library__item--sound_clip { background: linear-gradient(135deg, #f0fdfa 0%, #ccfbf1 100%); border-color: #14b8a6; }

.ds-dial-plan-node-library__item-icon {
  display: flex;
  align-items: center;
  color: var(--node-color);
}
.ds-dial-plan-node-library__item--schedule .ds-dial-plan-node-library__item-icon { color: var(--ds-color-info, #0ea5e9); }
.ds-dial-plan-node-library__item--internal_dial .ds-dial-plan-node-library__item-icon { color: var(--ds-color-success, #22c55e); }
.ds-dial-plan-node-library__item--voicemail .ds-dial-plan-node-library__item-icon { color: var(--ds-color-purple, #a855f7); }
.ds-dial-plan-node-library__item--ring_all_users .ds-dial-plan-node-library__item-icon { color: var(--ds-color-warning, #f59e0b); }
.ds-dial-plan-node-library__item--external_dial .ds-dial-plan-node-library__item-icon { color: var(--ds-color-rose, #f43f5e); }
.ds-dial-plan-node-library__item--voice_app .ds-dial-plan-node-library__item-icon { color: #4f46e5; }
.ds-dial-plan-node-library__item--menu .ds-dial-plan-node-library__item-icon { color: #ec4899; }
.ds-dial-plan-node-library__item--sound_clip .ds-dial-plan-node-library__item-icon { color: #14b8a6; }

.ds-dial-plan-node-library__item-label {
  font-size: var(--ds-font-size-xs, 12px);
  font-weight: 600;
  color: var(--ds-color-text, #1e293b);
  text-align: center;
}

:is(.dark, [data-theme="dark"]) .ds-dial-plan-node-library {
  background: #1e1e32;
  border-right-color: rgba(255, 255, 255, 0.1);
}

:is(.dark, [data-theme="dark"]) .ds-dial-plan-node-library__item {
  background: color-mix(in srgb, var(--node-color, #1e1e32) 20%, #1e1e32);
  border-color: rgba(255, 255, 255, 0.1);
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.3);
}
:is(.dark, [data-theme="dark"]) .ds-dial-plan-node-library__item--schedule { background: linear-gradient(135deg, #0c2d48 0%, #0a3761 100%); }
:is(.dark, [data-theme="dark"]) .ds-dial-plan-node-library__item--internal_dial { background: linear-gradient(135deg, #052e16 0%, #064e3b 100%); }
:is(.dark, [data-theme="dark"]) .ds-dial-plan-node-library__item--voicemail { background: linear-gradient(135deg, #2e1065 0%, #3b0764 100%); }
:is(.dark, [data-theme="dark"]) .ds-dial-plan-node-library__item--ring_all_users { background: linear-gradient(135deg, #451a03 0%, #78350f 100%); }
:is(.dark, [data-theme="dark"]) .ds-dial-plan-node-library__item--external_dial { background: linear-gradient(135deg, #4c0519 0%, #881337 100%); }
:is(.dark, [data-theme="dark"]) .ds-dial-plan-node-library__item--voice_app { background: linear-gradient(135deg, #252262 0%, #3b1d7e 40%, #0c3a5e 100%) padding-box, linear-gradient(135deg, #38bdf8 0%, #818cf8 35%, #a855f7 60%, #ec4899 100%) border-box; }
:is(.dark, [data-theme="dark"]) .ds-dial-plan-node-library__item--menu { background: linear-gradient(135deg, #500724 0%, #831843 100%); }
:is(.dark, [data-theme="dark"]) .ds-dial-plan-node-library__item--sound_clip { background: linear-gradient(135deg, #042f2e 0%, #115e59 100%); }

:is(.dark, [data-theme="dark"]) .ds-dial-plan-node-library__item-label {
  color: #e2e8f0;
}

/* ============================================================================
   Editor Toolbar
   ============================================================================ */

.ds-dial-plan-editor-toolbar {
  position: absolute;
  top: 16px;
  right: 16px;
  z-index: 10;
  display: flex;
  gap: 8px;
}

.ds-dial-plan-editor-toolbar__button {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 8px 12px;
  background: var(--ds-color-background, #ffffff);
  border: 1px solid var(--ds-color-border, #e2e8f0);
  border-radius: var(--ds-border-radius, 8px);
  color: var(--ds-color-text, #1e293b);
  font-family: var(--ds-font-family, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif);
  font-size: var(--ds-font-size-sm, 14px);
  font-weight: 500;
  cursor: pointer;
  transition: all 0.15s ease;
}

.ds-dial-plan-editor-toolbar__button:hover {
  background: var(--ds-color-background-hover, #f1f5f9);
  border-color: var(--ds-color-border, #cbd5e1);
}

.ds-dial-plan-editor-toolbar__button:active {
  transform: scale(0.98);
}

.ds-dial-plan-editor-toolbar__button:disabled {
  opacity: 0.4;
  cursor: not-allowed;
}

.ds-dial-plan-editor-toolbar__button:disabled:hover {
  background: var(--ds-color-background, #ffffff);
  border-color: var(--ds-color-border, #e2e8f0);
}

.ds-dial-plan-editor-toolbar__button svg {
  color: var(--ds-color-text-secondary, #64748b);
}

:is(.dark, [data-theme="dark"]) .ds-dial-plan-editor-toolbar__button {
  background: #1e293b;
  border-color: #334155;
  color: #e2e8f0;
}

:is(.dark, [data-theme="dark"]) .ds-dial-plan-editor-toolbar__button:hover {
  background: #334155;
  border-color: #475569;
}

:is(.dark, [data-theme="dark"]) .ds-dial-plan-editor-toolbar__button:disabled:hover {
  background: #1e293b;
  border-color: #334155;
}

:is(.dark, [data-theme="dark"]) .ds-dial-plan-editor-toolbar__button svg {
  color: #cbd5e1;
}

/* Editor Layout */

.ds-dial-plan-editor {
  display: flex;
  width: 100%;
  height: 100%;
  flex: 1;
  min-height: 400px;
  background: var(--ds-color-background, #ffffff);
  overflow: hidden;
}

.ds-dial-plan-editor--preview {
  min-height: 0;
}

.ds-dial-plan-editor__canvas {
  flex: 1;
  position: relative;
}

/* Node Library wrapper */

.ds-dial-plan-node-library-wrapper {
  width: 200px;
  flex-shrink: 0;
  align-self: stretch;
  overflow: hidden;
}

/* Config panel wrapper (slide-in animation) */

.ds-dial-plan-config-panel-wrapper {
  width: 0;
  flex-shrink: 0;
  align-self: stretch;
  overflow: hidden;
  transition: width 0.2s ease;
}

.ds-dial-plan-config-panel-wrapper--open {
  width: 260px;
}


`;
