/**
 * The CSS of the call UI primitives, as fragments a host stylesheet interpolates
 * under its own scope class. The softphone's stylesheet places each one where
 * its rules have always been, so the cascade order is the softphone's to keep.
 *
 * Each fragment is written on lines of its own; `slice(1, -1)` drops the two
 * newlines that costs, so a host's output does not depend on how it is split.
 */
import { callDimensions, type CallPalette } from './core/palette';

const d = callDimensions;

/**
 * The palette as the `--dsd-*` custom properties every rule below reads.
 * Declarations only: the caller wraps them in its own root rule.
 */
export function paletteVariables(p: CallPalette): string {
  return `
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
`.slice(1, -1);
}

/** The round primary action: call, answer, decline, hang up. */
export function actionButtonRules(scope: string): string {
  return `
    .${scope} .ds-action {
      flex: none; width: ${d.actionButtonSize}px; height: ${d.actionButtonSize}px;
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
    .${scope} .ds-call:not(:disabled):hover, .${scope} .ds-answer:not(:disabled):hover,
    .${scope} .ds-hangup:not(:disabled):hover, .${scope} .ds-decline:not(:disabled):hover { filter: brightness(1.06); }
    .${scope} .ds-keypad-close { background: var(--dsd-surface); color: var(--dsd-text); }
    .${scope} .ds-keypad-close:not(:disabled):hover { filter: brightness(0.96); }
`.slice(1, -1);
}

/** A peer's avatar, large or inline, and the row that sets a small one beside a name. */
export function peerAvatarRules(scope: string): string {
  return `
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
`.slice(1, -1);
}

/** An in-call control: a round glyph over its label, with a pressed state. */
export function controlButtonRules(scope: string): string {
  return `
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
`.slice(1, -1);
}

/** A user's presence as a small disc. */
export function presenceBadgeRules(scope: string): string {
  return `
    .${scope} .ds-directory-presence {
      flex: none; display: inline-flex; width: 12px; height: 12px; border-radius: 50%;
      color: var(--dsd-bg); background: var(--dsd-text-secondary);
    }
    .${scope} .ds-directory-presence svg { width: 100%; height: 100%; display: block; }
    .${scope} .ds-directory-presence[data-tone='success'] { background: var(--dsd-success); }
    .${scope} .ds-directory-presence[data-tone='warning'] { background: var(--dsd-warning); }
    .${scope} .ds-directory-presence[data-tone='danger'] { background: var(--dsd-danger); }
    .${scope} .ds-directory-presence[data-presence='offline'] {
      background: none; color: var(--dsd-text-secondary);
      box-shadow: inset 0 0 0 1.5px var(--dsd-text-secondary);
    }
`.slice(1, -1);
}

/** The focus ring for every button and input under the scope. */
export function focusRingRules(scope: string): string {
  return `
    .${scope} button:focus-visible, .${scope} input:focus-visible {
      outline: none;
      box-shadow: 0 0 0 3px color-mix(in srgb, var(--dsd-accent) 45%, transparent);
    }
`.slice(1, -1);
}
