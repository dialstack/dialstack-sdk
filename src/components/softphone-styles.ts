/**
 * The Softphone's CSS, as a function of the resolved palette. Kept separate from
 * the React component so the (long) stylesheet is a single, framework-agnostic
 * source of truth — the React Softphone injects it into a scoped <style>, and the
 * class names (`ds-*`) are shared with the markup the component renders.
 */

import { softphoneDimensions, softphoneFontFamily, type SoftphonePalette } from './softphone-theme';

/** Build the Softphone stylesheet for a palette. `scope` is a class the rules are nested under. */
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
      max-width: ${d.maxWidth}px;
      margin: 0 auto;
      border-radius: ${d.radius}px;
      padding: clamp(12px, 4vw, 24px);
      display: flex;
      flex-direction: column;
      box-sizing: border-box;
    }
    .${scope} * { box-sizing: border-box; }
    .${scope} .ds-screen { display: flex; flex-direction: column; gap: clamp(12px, 3vw, 20px); }

    .${scope} .ds-chip {
      align-self: center;
      font-size: 12px;
      font-weight: 600;
      padding: 4px 12px;
      border-radius: 999px;
      letter-spacing: 0.02em;
    }
    .${scope} .ds-chip-spacer { visibility: hidden; }
    .${scope} .ds-chip-pending { background: var(--dsd-surface); color: var(--dsd-text-secondary); }
    .${scope} .ds-chip-off { background: var(--dsd-surface); color: var(--dsd-text-secondary); }
    .${scope} .ds-chip-error { background: color-mix(in srgb, var(--dsd-danger) 16%, transparent); color: var(--dsd-danger); }
    .${scope} .ds-call-error {
      display: flex;
      align-items: center;
      gap: 8px;
      max-width: 100%;
      text-align: left;
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

    .${scope} .ds-display { display: flex; align-items: center; gap: 8px; min-height: 56px; }
    .${scope} .ds-destination {
      flex: 1; min-width: 0;
      font-size: clamp(24px, 7vw, 32px);
      font-weight: 500;
      text-align: center;
      border: none; outline: none; background: transparent;
      color: var(--dsd-text);
      letter-spacing: 0.02em;
    }
    .${scope} .ds-destination::placeholder { color: var(--dsd-text-secondary); opacity: 0.7; }
    .${scope} .ds-backspace {
      border: none; background: transparent; cursor: pointer;
      font-size: 22px; color: var(--dsd-text-secondary);
      width: 40px; height: 40px; border-radius: 999px;
    }
    .${scope} .ds-backspace:hover { background: var(--dsd-surface); color: var(--dsd-text); }

    .${scope} .ds-keypad {
      display: grid; grid-template-columns: repeat(3, 1fr);
      gap: ${d.keyGap}px;
      justify-items: center;
    }
    .${scope} .ds-key {
      display: flex; flex-direction: column; align-items: center; justify-content: center;
      width: 100%; aspect-ratio: 1 / 1; max-width: 84px;
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

    .${scope} .ds-actions { display: flex; justify-content: center; gap: clamp(24px, 12vw, 72px); }
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

    .${scope} .ds-peer { text-align: center; display: flex; flex-direction: column; gap: 4px; }
    .${scope} .ds-peer-name { font-size: clamp(22px, 6vw, 28px); font-weight: 600; word-break: break-word; }
    .${scope} .ds-peer-number { font-size: 15px; color: var(--dsd-text-secondary); }
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
      display: grid; grid-template-columns: repeat(4, 1fr);
      gap: 10px; justify-items: center;
    }
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

    .${scope} .ds-dtmf { display: flex; flex-direction: column; gap: 10px; }
    .${scope} .ds-dtmf-readout {
      text-align: center; font-size: 22px; min-height: 28px;
      font-variant-numeric: tabular-nums; letter-spacing: 0.08em;
    }
    .${scope} .ds-transfer { display: flex; flex-direction: column; gap: 8px; }
    .${scope} .ds-transfer-input {
      flex: 1; min-width: 0; padding: 12px 14px;
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

    /* Attended-transfer banner (layered over the normal in-call view): the other
       transfer leg as a switch card + the Cancel/Complete actions. */
    .${scope} .ds-transfer-banner { display: flex; flex-direction: column; gap: 8px; }
    .${scope} .ds-consult-held { opacity: 0.7; }
    .${scope} .ds-consult-actions { display: flex; gap: 8px; }
    .${scope} .ds-consult-actions .ds-e911-btn { flex: 1; }

    /* Multi-call + transfer: switchable held-call cards. Clickable (button reset)
       to switch focus to that call; the cursor + hover signal it's actionable. */
    .${scope} .ds-held-calls { display: flex; flex-direction: column; gap: 8px; }
    .${scope} .ds-held-call {
      display: block; width: 100%; cursor: pointer; text-align: center;
      border: 1px solid var(--dsd-border); border-radius: ${d.radius}px;
      padding: 12px 14px;
      background: var(--dsd-surface); color: var(--dsd-text);
      font-family: inherit;
    }
    .${scope} .ds-held-call:hover { opacity: 1; border-color: var(--dsd-accent); }

    /* Multi-call: composite layout — the in-call screen with the ringing
       call-waiting card(s) as a compact banner ABOVE it. The banner is in normal
       flow (not absolutely positioned) so it reserves its own space and never
       overlaps the in-call peer/controls below. (Idle inbound is a dedicated
       screen, not this banner.) */
    .${scope}.ds-softphone-layout {
      display: flex; flex-direction: column; gap: 12px;
      padding: clamp(12px, 4vw, 24px); background: var(--dsd-bg);
    }
    .${scope} .ds-softphone-layout > .ds-softphone { padding: 0; background: none; }
    .${scope} .ds-incoming-overlay { flex: none; }
    .${scope} .ds-incoming-stack { display: flex; flex-direction: column; gap: 8px; }

    /* One ringing call's card. Full-size inside the dedicated incoming screen;
       the compact variant (stacked / call-waiting overlay) shrinks it and puts
       the answer/decline buttons inline so it takes less space. */
    .${scope} .ds-incoming-card {
      display: flex; flex-direction: column; gap: clamp(12px, 3vw, 20px);
      align-items: center; text-align: center;
    }
    .${scope} .ds-incoming-card-info { display: flex; flex-direction: column; gap: 4px; min-width: 0; }
    .${scope} .ds-incoming-card-compact {
      flex-direction: row; gap: 12px; align-items: center; text-align: left;
      padding: 10px 12px; border: 1px solid var(--dsd-border); border-radius: ${d.radius}px;
      background: var(--dsd-surface); box-shadow: 0 2px 8px rgb(0 0 0 / 0.12);
    }
    .${scope} .ds-incoming-card-compact .ds-incoming-card-info { flex: 1; min-width: 0; }
    .${scope} .ds-incoming-card-compact .ds-incoming-label { font-size: 11px; }
    /* Shrink the peer name/number in a compact card — otherwise they inherit the
       full-screen in-call sizes (clamp up to 28px) and overflow the small overlay
       card, colliding with the call behind it. Truncate rather than wrap. */
    .${scope} .ds-incoming-card-compact .ds-peer-name {
      font-size: 15px; font-weight: 600; line-height: 1.2;
      white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
    }
    .${scope} .ds-incoming-card-compact .ds-peer-number {
      font-size: 12px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
    }
    .${scope} .ds-incoming-card-compact .ds-actions-incoming { margin: 0; gap: 8px; flex: none; }
    .${scope} .ds-incoming-card-compact .ds-action { width: 44px; height: 44px; }

    .${scope} .ds-e911 {
      margin-bottom: 12px;
      border: 1px solid var(--dsd-border); border-radius: ${d.radius}px;
      overflow: hidden; background: var(--dsd-surface);
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
    /* Saved-address choice buttons ("Are you here?") */
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

    .${scope} button:focus-visible, .${scope} input:focus-visible {
      outline: none;
      box-shadow: 0 0 0 3px color-mix(in srgb, var(--dsd-accent) 45%, transparent);
    }
  `;
}
