/**
 * The Softphone's CSS, as a function of the resolved palette. Kept separate from
 * the React component so the (long) stylesheet is a single, framework-agnostic
 * source of truth — the React Softphone injects it into a scoped <style>, and the
 * class names (`ds-*`) are shared with the markup the component renders.
 */
import { softphoneDimensions, softphoneFontFamily, type SoftphonePalette } from './theme';

export function buildSoftphoneStyles(p: SoftphonePalette, scope = 'ds-softphone'): string {
  const d = softphoneDimensions;
  return `
    .${scope} {
      --dsd-bg: ${p.background};
      --dsd-surface: ${p.surface};
      --dsd-surface-active: ${p.surfaceActive};
      --dsd-text: ${p.text};
      --dsd-text-secondary: ${p.textSecondary};
      --dsd-border: ${p.border};
      --dsd-accent: ${p.accent};
      --dsd-success: ${p.success};
      --dsd-danger: ${p.danger};
      --dsd-warning: ${p.warning};
      --dsd-on-accent: ${p.onAccent};
      font-family: var(--ds-font-family, ${softphoneFontFamily});
      background: var(--dsd-bg);
      color: var(--dsd-text);
      width: 100%;
      min-width: 0;
      height: var(--ds-softphone-height, 100%);
      min-height: 0;
      max-width: ${d.maxWidth}px;
      margin: 0 auto;
      border-radius: ${d.radius}px;
      padding: clamp(12px, 4vw, 24px);
      display: flex;
      flex-direction: column;
      box-sizing: border-box;
    }
    .${scope} * { box-sizing: border-box; }
    .${scope} .ds-softphone {
      padding: 0; background: none; max-width: none; margin: 0;
      min-width: 0; flex: 1;
      height: auto; min-height: 0;
    }
    .${scope} .ds-screen {
      display: flex; flex: 1; flex-direction: column;
      min-height: 0;
      gap: clamp(12px, 3vw, 20px);
      overflow-y: auto;
      scrollbar-gutter: stable both-edges;
    }
    .${scope} .ds-screen > *:not(.ds-actions) { flex-shrink: 0; }
    .${scope} .ds-screen > .ds-actions {
      position: sticky; bottom: 0;
      background: var(--dsd-bg);
      padding-bottom: 2px;
    }

    .${scope} .ds-screen-dial { position: relative; padding-top: 26px; }

    .${scope} .ds-chip {
      position: absolute;
      top: 0;
      left: 0;
      right: 0;
      width: fit-content;
      margin-inline: auto;
      font-size: 12px;
      font-weight: 600;
      padding: 4px 12px;
      border-radius: 999px;
      letter-spacing: 0.02em;
    }
    .${scope} .ds-chip-spacer { visibility: hidden; position: absolute; }
    .${scope} .ds-chip-pending { background: var(--dsd-surface); color: var(--dsd-text-secondary); }
    .${scope} .ds-chip-off { background: var(--dsd-surface); color: var(--dsd-text-secondary); }
    .${scope} .ds-chip-error { background: color-mix(in srgb, var(--dsd-danger) 16%, transparent); color: var(--dsd-danger); }
    .${scope} .ds-call-error {
      display: flex;
      align-items: center;
      gap: 8px;
      max-width: 100%;
      text-align: left;
      position: static;
      align-self: stretch;
    }
    .${scope} .ds-call-error-dismiss {
      border: none;
      background: transparent;
      color: inherit;
      cursor: pointer;
      font-size: 12px;
      line-height: 1;
      padding: 0;
    }

    .${scope} .ds-display { display: flex; align-items: center; min-height: 56px; gap: 8px; }
    .${scope} .ds-display-spacer { width: 40px; flex: none; }
    .${scope} .ds-destination {
      flex: 1; min-width: 0;
      font-size: clamp(22px, 6vw, 28px);
      font-weight: 600;
      font-family: inherit;
      text-align: center;
      border: none; outline: none; background: transparent;
      color: var(--dsd-text);
    }
    .${scope} .ds-destination::placeholder { color: var(--dsd-text-secondary); opacity: 0.7; }
    .${scope} .ds-backspace {
      flex: none;
      border: none; background: transparent; cursor: pointer;
      font-size: 22px; color: var(--dsd-text-secondary);
      width: 40px; height: 40px; border-radius: 999px;
    }
    .${scope} .ds-backspace:hover { background: var(--dsd-surface); color: var(--dsd-text); }

    .${scope} .ds-keypad {
      display: grid; grid-template-columns: repeat(3, minmax(0, 1fr));
      gap: ${d.keyGap}px;
      justify-items: center;
      max-width: min(${d.keyMaxSize * 3 + d.keyGap * 2}px, 100%);
      width: 100%; margin: 0 auto;
      flex: 1 1 auto; min-height: 0;
      align-content: center;
    }
    .${scope} .ds-key {
      display: flex; flex-direction: column; align-items: center; justify-content: center;
      aspect-ratio: 1 / 1; width: 100%; max-width: ${d.keyMaxSize}px;
      height: auto;
      border: none; border-radius: 999px;
      background: var(--dsd-surface); color: var(--dsd-text);
      cursor: pointer; gap: 2px;
      transition: background-color 0.12s ease, transform 0.06s ease;
      -webkit-tap-highlight-color: transparent;
      user-select: none;
    }
    .${scope} .ds-key:hover { background: var(--dsd-surface-active); }
    .${scope} .ds-key:active { transform: scale(0.94); }
    .${scope} .ds-key-digit { font-size: clamp(22px, 6vw, 28px); font-weight: 500; line-height: 1; }
    .${scope} .ds-key-letters {
      font-size: 10px; font-weight: 600; letter-spacing: 0.12em;
      color: var(--dsd-text-secondary); min-height: 12px;
    }
    .${scope} .ds-keypad-dtmf .ds-key { aspect-ratio: auto; padding: 10px 0; max-width: 72px; }

    .${scope} .ds-actions {
      display: flex; justify-content: center; gap: clamp(24px, 12vw, 72px);
      margin-top: auto; padding-top: clamp(8px, 2vw, 16px);
      flex: 0 0 auto;
    }
    .${scope} .ds-actions-incoming { justify-content: space-evenly; }
    .${scope} .ds-action {
      width: ${d.actionButtonSize}px; height: ${d.actionButtonSize}px;
      border: none; border-radius: 999px; cursor: pointer;
      display: flex; align-items: center; justify-content: center;
      color: var(--dsd-on-accent);
      transition: transform 0.06s ease, filter 0.12s ease;
      -webkit-tap-highlight-color: transparent;
    }
    .${scope} .ds-action svg { width: 46%; height: 46%; }
    .${scope} .ds-action:active { transform: scale(0.92); }
    .${scope} .ds-action:disabled { opacity: 0.4; cursor: not-allowed; }
    .${scope} .ds-call, .${scope} .ds-answer { background: var(--dsd-success); }
    .${scope} .ds-hangup, .${scope} .ds-decline { background: var(--dsd-danger); }
    .${scope} .ds-call:not(:disabled):hover, .${scope} .ds-answer:hover,
    .${scope} .ds-hangup:hover, .${scope} .ds-decline:hover { filter: brightness(1.06); }

    .${scope} .ds-peer {
      flex: 1 1 auto;
      min-height: min-content;
      justify-content: center;
    }
    .${scope} .ds-display {
      flex: 0 1 auto; min-height: 0;
      justify-content: center;
    }
    .${scope} .ds-controls { flex: 0 1 auto; min-height: 0; }
    .${scope} .ds-controls-slot { visibility: hidden; pointer-events: none; }
    .${scope} .ds-peer { text-align: center; display: flex; flex-direction: column; gap: 4px; }
    .${scope} .ds-peer-name { font-size: clamp(22px, 6vw, 28px); font-weight: 600; word-break: break-word; }
    .${scope} .ds-peer-number { font-size: 15px; color: var(--dsd-text-secondary); }
    /* The large avatar shrinks first when the screen runs out of height
       (flex-shrink well above its siblings'). It is a size container, so its
       content never holds the peer block open, and below a legible size the
       disc hides rather than turning into a dot. */
    .${scope} .ds-peer-avatar {
      flex: 0 100 64px; min-height: 0; max-height: 64px; width: 64px;
      align-self: center; margin-bottom: 4px;
      container-type: size; display: flex; align-items: center; justify-content: center;
    }
    .${scope} .ds-peer-avatar-disc {
      height: 100%; aspect-ratio: 1; border-radius: 999px; overflow: hidden;
      display: flex; align-items: center; justify-content: center;
      background: var(--dsd-accent); color: var(--dsd-on-accent);
      font-size: 34cqh; font-weight: 600;
    }
    .${scope} .ds-peer-avatar-disc img { width: 100%; height: 100%; object-fit: cover; }
    @container (max-height: 39px) {
      .${scope} .ds-peer-avatar-disc { display: none; }
    }
    .${scope} .ds-peer-avatar-sm { flex: none; width: 32px; height: 32px; margin: 0; }
    .${scope} .ds-peer-avatar-sm .ds-peer-avatar-disc { font-size: 13px; }
    .${scope} .ds-peer-row { display: flex; align-items: center; justify-content: center; gap: 10px; }
    .${scope} .ds-peer-row-text { min-width: 0; text-align: left; }
    .${scope} .ds-callstate { display: flex; flex-direction: column; align-items: center; gap: 2px; margin-top: 6px; }
    .${scope} .ds-callstate-text { font-size: 14px; color: var(--dsd-text-secondary); }
    .${scope} .ds-duration { font-size: 18px; font-variant-numeric: tabular-nums; font-weight: 500; }

    .${scope} .ds-incoming-label {
      text-align: center; font-size: 13px; font-weight: 600;
      letter-spacing: 0.08em; text-transform: uppercase; color: var(--dsd-text-secondary);
    }
    .${scope} .ds-incoming-pulse {
      width: 12px; height: 12px; border-radius: 999px; margin: 4px auto;
      background: var(--dsd-success);
      box-shadow: 0 0 0 0 color-mix(in srgb, var(--dsd-success) 60%, transparent);
      animation: ds-pulse 1.6s infinite;
    }
    @keyframes ds-pulse {
      0% { box-shadow: 0 0 0 0 color-mix(in srgb, var(--dsd-success) 50%, transparent); }
      70% { box-shadow: 0 0 0 16px transparent; }
      100% { box-shadow: 0 0 0 0 transparent; }
    }

    .${scope} .ds-controls {
      display: flex; flex-wrap: wrap; justify-content: center;
      gap: 8px 12px;
      max-width: ${(d.controlButtonSize + 12) * 3 + 24}px;
      align-content: flex-end;
      margin: 0 auto;
    }
    /* Three to a row: the column gap is sized so a row of three fits the
       narrowest host (inside the scrollbar gutters) instead of wrapping to two. */
    .${scope} .ds-controls > * { flex: 0 0 ${d.controlButtonSize + 12}px; }
    .${scope} .ds-control {
      display: flex; flex-direction: column; align-items: center; gap: 6px;
      border: none; background: transparent; cursor: pointer;
      color: var(--dsd-text); font-family: inherit;
    }
    .${scope} .ds-control-glyph {
      width: ${d.controlButtonSize}px; height: ${d.controlButtonSize}px;
      border-radius: 999px; background: var(--dsd-surface);
      display: flex; align-items: center; justify-content: center;
      transition: background-color 0.12s ease;
    }
    .${scope} .ds-control-glyph svg { width: 42%; height: 42%; }
    .${scope} .ds-control:hover:not(:disabled) .ds-control-glyph { background: var(--dsd-surface-active); }
    .${scope} .ds-control-on .ds-control-glyph { background: var(--dsd-accent); color: var(--dsd-on-accent); }
    .${scope} .ds-control-label { font-size: 12px; color: var(--dsd-text-secondary); }
    .${scope} .ds-control-on .ds-control-label { color: var(--dsd-text); }
    .${scope} .ds-control:disabled { cursor: not-allowed; opacity: 0.4; }

    .${scope} .ds-dtmf {
      display: flex; flex-direction: column; gap: 10px;
      flex: 1; min-height: 0; justify-content: center;
    }
    /* The in-call peer may give up height (its avatar first) before the screen
       has to scroll; the other children stay rigid. */
    .${scope} .ds-screen-incall > .ds-peer { flex-shrink: 1; min-height: 0; }
    .${scope} .ds-screen-incoming > .ds-incoming-card:not(.ds-incoming-card-compact) {
      flex-shrink: 1; min-height: 0;
    }
    .${scope} .ds-incoming-card:not(.ds-incoming-card-compact) > .ds-incoming-card-info {
      min-height: 0;
    }
    /* The invisible controls placeholder (it lines the answer buttons up with
       the in-call screen) gives up its height before the caller does. */
    .${scope} .ds-incoming-card > .ds-controls-slot { flex-shrink: 1000; }
    .${scope} .ds-screen-incall:has(.ds-dtmf) > .ds-peer { flex: 0 0 auto; }
    .${scope} .ds-keypad-dtmf {
      flex: 1; min-height: 0;
      grid-auto-rows: minmax(0, ${d.keyMaxSize}px);
      align-content: center;
    }
    .${scope} .ds-keypad-dtmf .ds-key {
      aspect-ratio: 1 / 1; width: auto; height: 100%;
      max-height: ${d.keyMaxSize}px; max-width: 100%; padding: 0;
    }
    .${scope} .ds-keypad-close { background: var(--dsd-surface); color: var(--dsd-text); }
    .${scope} .ds-keypad-close:hover { filter: brightness(0.96); }
    .${scope} .ds-dtmf-readout {
      text-align: center; font-size: 22px; min-height: 28px;
      font-variant-numeric: tabular-nums; letter-spacing: 0.08em;
    }
    .${scope} .ds-transfer-input {
      flex: 0 0 auto; min-width: 0; padding: 12px 14px;
      border: 1px solid var(--dsd-border); border-radius: ${d.radius}px;
      background: var(--dsd-bg); color: var(--dsd-text); font-size: 16px; outline: none;
    }
    .${scope} .ds-transfer-input:focus { border-color: var(--dsd-accent); }
    .${scope} .ds-transfer-actions { display: flex; gap: 8px; }
    .${scope} .ds-transfer-send {
      flex: 1; border: none; border-radius: ${d.radius}px; padding: 12px 18px;
      background: var(--dsd-accent); color: var(--dsd-on-accent);
      font-weight: 600; cursor: pointer; font-family: inherit; font-size: 14px;
    }
    .${scope} .ds-transfer-send:disabled { opacity: 0.5; cursor: not-allowed; }
    .${scope} .ds-transfer-send-secondary {
      background: var(--dsd-surface); color: var(--dsd-text);
    }
    /* The transfer / add-call screen: it fills the in-call screen above hang
       up, and only the directory list flexes (and scrolls). */
    .${scope} .ds-dial-panel {
      display: flex; flex-direction: column; gap: 10px;
      flex: 1 1 auto; min-height: 0;
      width: 100%; max-width: ${(d.controlButtonSize + 12) * 3 + 24}px; margin: 0 auto;
    }
    .${scope} .ds-screen > .ds-dial-panel { flex-shrink: 1; }
    .${scope} .ds-dial-panel > * { flex: none; }
    /* Same spot in both modes, just above hang up. */
    .${scope} .ds-dial-panel > .ds-transfer-actions { margin-top: auto; }
    /* Sits with the buttons, so it moves down with them. */
    .${scope} .ds-dial-panel > .ds-dial-panel-target { margin-top: auto; }
    .${scope} .ds-dial-panel > .ds-dial-panel-target + .ds-transfer-actions { margin-top: 0; }
    /* With just the field, the auto margins split the spare height a third
       above, two thirds below: within reach in a tall host instead of pinned
       to the top. The list stays anchored to the top (so the header doesn't
       move as a search shortens it) and grows to its content, scrolling only
       once it reaches the buttons. */
    .${scope} .ds-dial-panel-main {
      display: flex; flex-direction: column; gap: 10px; margin-block: auto;
    }
    .${scope} .ds-dial-panel-main > * { flex: none; }
    .${scope} .ds-dial-panel > .ds-dial-panel-main-list {
      flex: 0 1 auto; min-height: 0; margin-block: 0;
    }
    .${scope} .ds-dial-panel-header { display: flex; align-items: flex-start; gap: 8px; }
    .${scope} .ds-dial-panel-heading { flex: 1; min-width: 0; }
    .${scope} .ds-dial-panel-title { font-size: 18px; font-weight: 600; }
    .${scope} .ds-dial-panel-peer {
      font-size: 13px; color: var(--dsd-text-secondary);
      overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
    }
    .${scope} .ds-dial-panel-close {
      flex: none; width: 36px; height: 36px; padding: 8px;
      border: none; border-radius: 50%; cursor: pointer;
      background: var(--dsd-surface); color: var(--dsd-text);
    }
    .${scope} .ds-dial-panel-close:hover { background: var(--dsd-surface-active); }
    .${scope} .ds-dial-panel-close svg { width: 100%; height: 100%; display: block; }
    .${scope} .ds-dial-panel-mode {
      align-self: center; border: none; background: none; padding: 4px 8px;
      color: var(--dsd-accent); font-family: inherit; font-size: 14px; font-weight: 500;
      cursor: pointer;
    }
    .${scope} .ds-dial-panel-mode:hover { text-decoration: underline; }
    .${scope} .ds-dial-panel-target {
      font-size: 13px; color: var(--dsd-text-secondary); text-align: center;
      overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
    }
    .${scope} .ds-dial-panel-main > .ds-directory {
      display: flex; flex-direction: column; gap: 8px; flex: 0 1 auto; min-height: 0;
    }
    .${scope} .ds-directory-search { flex: none; }
    .${scope} .ds-directory-options {
      display: flex; flex-direction: column; gap: 4px;
      flex: 0 1 auto; min-height: 0; overflow-y: auto;
      border: 1px solid var(--dsd-border); border-radius: ${d.radius}px;
      background: var(--dsd-surface); padding: 4px;
    }
    .${scope} .ds-directory-group {
      padding: 6px 10px 2px; font-size: 11px; font-weight: 600;
      text-transform: uppercase; letter-spacing: 0.04em; color: var(--dsd-text-secondary);
    }
    .${scope} .ds-directory-option {
      display: flex; flex-direction: column; align-items: flex-start; gap: 2px;
      width: 100%; padding: 8px 10px; text-align: left; cursor: pointer;
      border: 1px solid transparent; border-radius: ${Math.max(d.radius - 4, 4)}px;
      background: none; color: var(--dsd-text); font-family: inherit;
    }
    .${scope} .ds-directory-option:hover { background: var(--dsd-surface-active); }
    .${scope} .ds-directory-option[aria-pressed='true'] {
      border-color: var(--dsd-accent);
      background: color-mix(in srgb, var(--dsd-accent) 12%, transparent);
    }
    .${scope} .ds-directory-option-title {
      display: flex; flex-wrap: wrap; align-items: center; gap: 4px 6px;
    }
    .${scope} .ds-directory-option-label { font-size: 14px; font-weight: 500; }
    .${scope} .ds-directory-tag {
      padding: 1px 7px; border-radius: 999px; font-size: 11px; font-weight: 500;
      /* Not surface-active: that is the row's hover fill, which would swallow
         the chip under the pointer. */
      background: var(--dsd-bg); color: var(--dsd-text-secondary);
    }
    .${scope} .ds-directory-option-detail { font-size: 12px; color: var(--dsd-text-secondary); }
    .${scope} .ds-directory-empty {
      padding: 10px; font-size: 13px; text-align: center; color: var(--dsd-text-secondary);
    }

    .${scope} .ds-devices {
      display: flex; flex-direction: column; gap: 10px;
      width: 100%; max-width: ${(d.controlButtonSize + 12) * 3 + 24}px; margin: 0 auto;
    }
    .${scope} .ds-device-row { display: flex; flex-direction: column; gap: 4px; }
    .${scope} .ds-device-label { font-size: 12px; color: var(--dsd-text-muted); }
    .${scope} .ds-device-select {
      width: 100%; padding: 10px 12px;
      border: 1px solid var(--dsd-border); border-radius: ${d.radius}px;
      background: var(--dsd-bg); color: var(--dsd-text);
      font-size: 14px; font-family: inherit; outline: none;
    }
    .${scope} .ds-device-select:focus { border-color: var(--dsd-accent); }
    .${scope} .ds-device-select:disabled { opacity: 0.5; cursor: not-allowed; }
    .${scope} .ds-device-hint { margin: 0; font-size: 12px; color: var(--dsd-text-muted); }
    .${scope} .ds-device-alert { font-size: 12px; color: var(--dsd-danger); }

    .${scope} .ds-transfer-banner { display: flex; flex-direction: column; gap: 8px; }
    .${scope} .ds-consult-held { opacity: 0.7; }
    .${scope} .ds-consult-actions { display: flex; gap: 8px; }
    .${scope} .ds-consult-actions .ds-e911-btn { flex: 1; }

    .${scope} .ds-held-calls {
      display: flex; flex-direction: column; gap: 8px;
      flex: 0 1 auto; min-height: 0; overflow: auto;
    }
    .${scope} .ds-held-call {
      display: block; width: 100%; cursor: pointer; text-align: center;
      border: 1px solid var(--dsd-border); border-radius: ${d.radius}px;
      padding: 12px 14px;
      background: var(--dsd-surface); color: var(--dsd-text);
      font-family: inherit;
    }
    .${scope} .ds-held-call:hover { opacity: 1; border-color: var(--dsd-accent); }
    .${scope} .ds-conference-parties {
      display: flex; flex-direction: column; align-items: center; gap: 2px;
      border: 1px solid var(--dsd-border); border-radius: ${d.radius}px;
      padding: 10px 14px; margin: 6px 0;
      background: var(--dsd-surface);
    }
    .${scope} .ds-conference-party {
      display: flex; align-items: center; gap: 10px; align-self: stretch; min-width: 0;
    }
    .${scope} .ds-conference-party-name {
      min-width: 0; font-size: 17px; font-weight: 600;
      white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
    }

    .${scope}.ds-softphone-layout {
      display: flex; flex-direction: column; gap: 12px;
      padding: clamp(12px, 4vw, 24px); background: var(--dsd-bg);
    }
    .${scope} .ds-softphone-layout > .ds-softphone { padding: 0; background: none; }
    .${scope} .ds-incoming-overlay { flex: none; }

    .${scope}.ds-dial-screen {
      display: flex; flex: 1; flex-direction: column;
      padding: clamp(12px, 4vw, 24px); background: var(--dsd-bg);
    }
    .${scope} .ds-dial-screen > .ds-softphone { display: flex; min-height: 0; }
    .${scope} .ds-incoming-stack { display: flex; flex-direction: column; gap: 8px; }

    .${scope} .ds-incoming-card {
      display: flex; flex: 1; flex-direction: column;
      min-height: 0;
      gap: clamp(12px, 3vw, 20px);
      align-items: stretch; text-align: center;
    }
    .${scope} .ds-incoming-card-info { min-width: 0; min-height: min-content; }
    .${scope} .ds-incoming-card-compact {
      flex-direction: row; gap: 12px; align-items: center; text-align: left;
      min-height: 0; flex: none;
      padding: 10px 12px; border: 1px solid var(--dsd-border); border-radius: ${d.radius}px;
      background: var(--dsd-surface); box-shadow: 0 2px 8px rgb(0 0 0 / 0.12);
    }
    .${scope} .ds-incoming-card-compact .ds-incoming-card-info {
      flex: 1 1 auto; min-width: 0; min-height: 0; justify-content: center;
    }
    .${scope} .ds-incoming-card-compact .ds-incoming-label { font-size: 11px; }
    .${scope} .ds-incoming-card-compact .ds-callstate { margin-top: 0; }
    .${scope} .ds-incoming-card-compact .ds-duration { display: none; }
    .${scope} .ds-incoming-card-compact .ds-peer-name {
      font-size: 15px; font-weight: 600; line-height: 1.2;
      white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
    }
    .${scope} .ds-incoming-card-compact .ds-peer-number {
      font-size: 12px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
    }
    .${scope} .ds-incoming-card-compact .ds-actions-incoming { margin: 0; gap: 8px; flex: none; }
    .${scope} .ds-incoming-card-compact .ds-action { width: 44px; height: 44px; }

    .${scope}.ds-e911-root {
      padding: 0; background: none; max-width: none; margin: 0;
      flex: 0 0 auto; height: auto; min-height: 0;
    }
    .${scope} .ds-e911 {
      border: 1px solid var(--dsd-border); border-radius: ${d.radius}px;
      overflow: hidden; background: var(--dsd-surface);
    }
    .${scope} .ds-e911-open {
      position: relative; overflow: visible; z-index: 3;
    }
    .${scope} .ds-e911-open > .ds-e911-toggle {
      border-radius: ${d.radius}px ${d.radius}px 0 0;
    }
    .${scope} .ds-e911-open > .ds-e911-body {
      position: absolute; top: 100%; left: 0; right: 0; z-index: 3;
      background: color-mix(in srgb, var(--dsd-text) 6%, var(--dsd-bg));
      border: 1px solid var(--dsd-border); border-top: none;
      border-radius: 0 0 ${d.radius}px ${d.radius}px;
      box-shadow: 0 6px 16px rgb(0 0 0 / 0.28), 0 1px 3px rgb(0 0 0 / 0.22);
    }
    .${scope} .ds-e911-toggle {
      display: flex; align-items: center; justify-content: center; gap: 8px; width: 100%;
      padding: 10px 12px; border: none; cursor: pointer;
      background: color-mix(in srgb, var(--dsd-warning) 18%, transparent);
      color: color-mix(in srgb, var(--dsd-warning) 60%, var(--dsd-text));
      font-family: inherit; font-size: 13px;
      font-weight: 600; text-align: center;
    }
    .${scope} .ds-e911-toggle svg { width: 16px; height: 16px; flex: none; }
    .${scope} .ds-e911-label { flex: 0 1 auto; text-align: center; }
    .${scope} .ds-e911-chevron { transition: transform 0.15s ease; }
    .${scope} .ds-e911-open .ds-e911-chevron { transform: rotate(180deg); }
    .${scope} .ds-e911-body {
      display: flex; flex-direction: column; gap: 8px;
      padding: 12px; border-top: 1px solid var(--dsd-border);
    }
    .${scope} .ds-e911-hint { font-size: 12px; color: var(--dsd-text-secondary); margin: 0; }
    .${scope} .ds-e911-choice {
      display: flex; align-items: center; gap: 8px; width: 100%; text-align: left;
      padding: 10px 12px; border: 1px solid var(--dsd-border); border-radius: 8px;
      background: var(--dsd-bg); color: var(--dsd-text); cursor: pointer;
      font-family: inherit; font-size: 13px;
    }
    .${scope} .ds-e911-choice:hover { border-color: var(--dsd-accent); }
    .${scope} .ds-e911-choice svg { width: 14px; height: 14px; flex: none; color: var(--dsd-success); }
    .${scope} .ds-e911-choice-addr { flex: 1; min-width: 0; }
    .${scope} .ds-e911-choice-cta { font-size: 12px; font-weight: 600; color: var(--dsd-accent); }
    .${scope} .ds-e911-row { display: flex; gap: 8px; }
    .${scope} .ds-e911-field { display: flex; flex-direction: column; gap: 3px; flex: 1; min-width: 0; }
    .${scope} .ds-e911-field-sm { flex: none; width: 88px; }
    .${scope} .ds-e911-field label { font-size: 11px; color: var(--dsd-text-secondary); }
    .${scope} .ds-e911-input {
      padding: 8px 10px; border: 1px solid var(--dsd-border); border-radius: 8px;
      background: var(--dsd-bg); color: var(--dsd-text); font-size: 14px; outline: none;
      font-family: inherit; width: 100%;
    }
    .${scope} .ds-e911-input:focus { border-color: var(--dsd-accent); }
    .${scope} .ds-e911-error { font-size: 12px; color: var(--dsd-danger); margin: 0; }
    .${scope} .ds-e911-actions { display: flex; gap: 8px; }
    .${scope} .ds-e911-btn {
      flex: 1; border: none; border-radius: 8px; padding: 10px;
      background: var(--dsd-accent); color: var(--dsd-on-accent);
      font-weight: 600; cursor: pointer; font-family: inherit; font-size: 14px;
    }
    .${scope} .ds-e911-btn:disabled { opacity: 0.5; cursor: not-allowed; }
    .${scope} .ds-e911-btn-secondary {
      flex: none; background: var(--dsd-surface); color: var(--dsd-text);
    }

    /* Compact size tier for small hosts (narrower than 300px or shorter than
       480px; set by useRoomyHost). Everything steps down together so the
       screens fit instead of clipping; a host smaller still scrolls. */
    .ds-host-small.${scope}, .ds-host-small > .${scope} { padding: 12px; }
    .ds-host-small .ds-screen { gap: 8px; }
    .ds-host-small .ds-screen-dial { padding-top: 18px; }
    .ds-host-small .ds-display { min-height: 36px; }
    .ds-host-small .ds-destination, .ds-host-small .ds-peer-name { font-size: 20px; }
    .ds-host-small .ds-peer-number { font-size: 13px; }
    .ds-host-small .ds-callstate { margin-top: 2px; }
    .ds-host-small .ds-callstate-text { font-size: 12px; }
    .ds-host-small .ds-duration { font-size: 15px; }
    .ds-host-small .ds-keypad { gap: 6px; max-width: min(${48 * 3 + 6 * 2}px, 100%); }
    .ds-host-small .ds-key { max-width: 48px; }
    .ds-host-small .ds-key-digit { font-size: 18px; }
    .ds-host-small .ds-key-letters { font-size: 8px; min-height: 9px; }
    .ds-host-small .ds-actions { gap: 32px; padding-top: 4px; }
    .ds-host-small .ds-action { width: 48px; height: 48px; }
    .ds-host-small .ds-controls { gap: 4px 8px; max-width: ${56 * 3 + 8 * 2}px; }
    .ds-host-small .ds-controls > * { flex-basis: 56px; }
    .ds-host-small .ds-control { gap: 3px; }
    .ds-host-small .ds-control-glyph { width: 42px; height: 42px; }
    .ds-host-small .ds-control-label { font-size: 10px; }
    .ds-host-small .ds-held-call { padding: 8px 10px; }
    .ds-host-small .ds-held-call .ds-peer-name { font-size: 15px; }
    .ds-host-small .ds-held-calls { gap: 4px; }
    .ds-host-small .ds-chip { font-size: 10px; padding: 2px 8px; }
    .ds-host-small .ds-e911-toggle { padding: 6px 8px; font-size: 11px; gap: 6px; }
    .ds-host-small .ds-transfer-input { padding: 6px 10px; font-size: 14px; }
    .ds-host-small .ds-dial-panel, .ds-host-small .ds-dial-panel-main { gap: 6px; }
    .ds-host-small .ds-dial-panel-title { font-size: 15px; }
    .ds-host-small .ds-dial-panel-close { width: 30px; height: 30px; padding: 7px; }
    .ds-host-small .ds-dial-panel-mode { font-size: 12px; padding: 2px 6px; }
    .ds-host-small .ds-directory-option { padding: 5px 8px; }
    .ds-host-small .ds-directory-option-label { font-size: 13px; }
    .ds-host-small .ds-directory-tag { font-size: 10px; padding: 0 6px; }
    .ds-host-small .ds-transfer-actions, .ds-host-small .ds-consult-actions { gap: 6px; }
    .ds-host-small .ds-transfer-send, .ds-host-small .ds-e911-btn { padding: 7px 8px; font-size: 12px; }
    .ds-host-small .ds-incoming-card-compact { padding: 8px 10px; gap: 8px; }
    .ds-host-small .ds-incoming-card-compact .ds-peer-name { font-size: 13px; }
    .ds-host-small .ds-incoming-card-compact .ds-action { width: 36px; height: 36px; }

    .${scope} button:focus-visible, .${scope} input:focus-visible {
      outline: none;
      box-shadow: 0 0 0 3px color-mix(in srgb, var(--dsd-accent) 45%, transparent);
    }
  `;
}
