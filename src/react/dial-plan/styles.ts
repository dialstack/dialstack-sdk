/**
 * DialPlan Styles
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
   Ring All Users Node
   ============================================================================ */

.ds-dial-plan-node--ring-all-users {
  background: linear-gradient(135deg, #fffbeb 0%, #fef3c7 100%);
  border-color: var(--ds-color-warning, #f59e0b);
}

.ds-dial-plan-node--ring-all-users .ds-dial-plan-node__icon {
  color: var(--ds-color-warning, #f59e0b);
}

.ds-dial-plan-node--ring-all-users.ds-dial-plan-node--selected {
  border-color: var(--ds-color-warning, #f59e0b);
  box-shadow: 0 0 0 2px rgba(245, 158, 11, 0.2);
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
  font-size: var(--ds-font-size-xs, 12px);
  color: var(--ds-color-danger, #ef4444);
  background: none;
  border: 1px solid var(--ds-color-danger, #ef4444);
  border-radius: var(--ds-border-radius, 8px);
  padding: 2px 8px;
  cursor: pointer;
}

.ds-dial-plan-config-panel__delete:hover {
  background: rgba(239, 68, 68, 0.08);
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

.ds-dial-plan-config-field__select:focus,
.ds-dial-plan-config-field__input:focus {
  border-color: var(--ds-color-primary, #3b82f6);
  box-shadow: 0 0 0 2px rgba(59, 130, 246, 0.15);
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

.ds-resource-combobox__check {
  font-size: 12px;
  opacity: 0.7;
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
  font-family: var(--ds-font-family, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif);
  font-size: var(--ds-font-size-sm, 14px);
  overflow-y: auto;
}

.ds-dial-plan-node-library__title {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 12px 16px;
  font-weight: 600;
  color: var(--ds-color-text, #1e293b);
  border-bottom: 1px solid var(--ds-color-border, #e2e8f0);
}

.ds-dial-plan-node-library__title span {
  flex: 1;
}

.ds-dial-plan-node-library__collapse {
  background: none;
  border: none;
  color: var(--ds-color-text-secondary, #64748b);
  cursor: pointer;
  padding: 2px;
  display: flex;
  align-items: center;
  border-radius: 4px;
  transition: color 0.15s ease, background 0.15s ease;
}

.ds-dial-plan-node-library__collapse:hover {
  color: var(--ds-color-text, #1e293b);
  background: var(--ds-color-background-hover, #f1f5f9);
}

:is(.dark, [data-theme="dark"]) .ds-dial-plan-node-library__collapse {
  color: #64748b;
}

:is(.dark, [data-theme="dark"]) .ds-dial-plan-node-library__collapse:hover {
  color: #e2e8f0;
  background: rgba(255, 255, 255, 0.05);
}

.ds-dial-plan-node-library__item {
  display: flex;
  flex-direction: column;
  gap: 2px;
  padding: 10px 16px;
  border-bottom: 1px solid var(--ds-color-border, #e2e8f0);
  cursor: grab;
  transition: background 0.15s ease;
}

.ds-dial-plan-node-library__item:hover {
  background: var(--ds-color-background-hover, #f1f5f9);
}

.ds-dial-plan-node-library__item:active {
  cursor: grabbing;
}

.ds-dial-plan-node-library__item-icon {
  display: flex;
  align-items: center;
  color: var(--ds-color-text-secondary, #64748b);
  margin-bottom: 4px;
}

.ds-dial-plan-node-library__item-label {
  font-size: var(--ds-font-size-sm, 14px);
  font-weight: 600;
  color: var(--ds-color-text, #1e293b);
}

.ds-dial-plan-node-library__item-desc {
  font-size: var(--ds-font-size-xs, 12px);
  color: var(--ds-color-text-secondary, #64748b);
  line-height: 1.4;
}

.ds-dial-plan-node-library__hint {
  margin-top: auto;
  padding: 12px 16px;
  font-size: var(--ds-font-size-xs, 12px);
  color: var(--ds-color-text-secondary, #64748b);
  text-align: center;
  border-top: 1px solid var(--ds-color-border, #e2e8f0);
}

:is(.dark, [data-theme="dark"]) .ds-dial-plan-node-library {
  background: #1e1e32;
  border-right-color: rgba(255, 255, 255, 0.1);
}

:is(.dark, [data-theme="dark"]) .ds-dial-plan-node-library__title {
  color: #e2e8f0;
  border-bottom-color: rgba(255, 255, 255, 0.1);
}

:is(.dark, [data-theme="dark"]) .ds-dial-plan-node-library__item {
  border-bottom-color: rgba(255, 255, 255, 0.1);
}

:is(.dark, [data-theme="dark"]) .ds-dial-plan-node-library__item:hover {
  background: rgba(255, 255, 255, 0.05);
}

:is(.dark, [data-theme="dark"]) .ds-dial-plan-node-library__item-icon {
  color: #94a3b8;
}

:is(.dark, [data-theme="dark"]) .ds-dial-plan-node-library__item-label {
  color: #e2e8f0;
}

:is(.dark, [data-theme="dark"]) .ds-dial-plan-node-library__item-desc {
  color: #64748b;
}

:is(.dark, [data-theme="dark"]) .ds-dial-plan-node-library__hint {
  color: #64748b;
  border-top-color: rgba(255, 255, 255, 0.1);
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

.ds-dial-plan-editor__canvas {
  flex: 1;
  position: relative;
}

/* Node Library wrapper (collapsible with animation) */

.ds-dial-plan-node-library-wrapper {
  width: 200px;
  flex-shrink: 0;
  align-self: stretch;
  overflow: hidden;
  transition: width 0.2s ease;
}

.ds-dial-plan-node-library-wrapper--collapsed {
  width: 0;
}

/* Library toggle button */

.ds-dial-plan-library-toggle {
  align-self: stretch;
  display: flex;
  align-items: center;
  padding: 0 2px;
  background: var(--ds-color-background, #ffffff);
  border: none;
  border-right: 1px solid var(--ds-color-border, #e2e8f0);
  color: var(--ds-color-text-secondary, #64748b);
  cursor: pointer;
  flex-shrink: 0;
  transition: color 0.15s ease;
}

.ds-dial-plan-library-toggle:hover {
  color: var(--ds-color-text, #1e293b);
}

:is(.dark, [data-theme="dark"]) .ds-dial-plan-library-toggle {
  background: #1a1a2e;
  border-right-color: rgba(255, 255, 255, 0.1);
  color: #64748b;
}

:is(.dark, [data-theme="dark"]) .ds-dial-plan-library-toggle:hover {
  color: #e2e8f0;
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

const injected = new Set<string>();

/**
 * Inject a CSS string into the document head, keyed by name.
 * Idempotent — calling with the same name twice is a no-op.
 */
export function injectStyles(name: string, css: string): void {
  if (injected.has(name) || typeof document === 'undefined') return;
  const el = document.createElement('style');
  el.setAttribute('data-dialstack', name);
  el.textContent = css;
  document.head.appendChild(el);
  injected.add(name);
}

/**
 * Inject the dial plan styles into the document head.
 * This is idempotent - calling multiple times will only inject once.
 */
export function injectDialPlanStyles(): void {
  injectStyles('dial-plan', dialPlanStyles);
}
