/**
 * Shared design tokens for the DialStack Softphone.
 *
 * This module is intentionally framework-agnostic (no DOM, no React Native) so
 * that BOTH the web Softphone (Web Component, consumes these as CSS values) and the
 * React Native Softphone (consumes these in a StyleSheet) render from a single
 * source of truth — that is what makes the two look identical by default.
 *
 * Colors resolve from the same `AppearanceOptions` surface the rest of the SDK
 * uses (theme + variables), so theming through `DialstackComponentsProvider` /
 * the `appearance` prop flows through identically on both platforms.
 */

import type { AppearanceOptions, AppearanceVariables, Theme } from '../../../types/appearance';

/** Flat color set the Softphone paints from, after appearance is resolved. */
export interface SoftphonePalette {
  /** Component background. */
  background: string;
  /** Dial-pad key / control surface fill. */
  surface: string;
  /** Surface fill while pressed/active. */
  surfaceActive: string;
  /** Primary text (digits, destination, peer name). */
  text: string;
  /** Secondary text (letter sub-labels, call state, hints). */
  textSecondary: string;
  /** Hairline borders/dividers. */
  border: string;
  /** Accent (links, focus ring, keypad/secondary control highlight). */
  accent: string;
  /** Call / Answer (green) action color. */
  success: string;
  /** Hang up / Decline (red) action color. */
  danger: string;
  /** Warning / caution (amber) — used by the E911 banner. */
  warning: string;
  /** Foreground used on top of accent/success/danger fills. */
  onAccent: string;
}

/** Numeric layout tokens (in px on web, in dp on native — same numbers). */
export const softphoneDimensions = {
  /** The Softphone caps its width and centers, so it reads as a phone on big screens. */
  maxWidth: 420,
  /** Diameter of the round primary actions (Call, Hang up, Answer, Decline). */
  actionButtonSize: 68,
  /** Diameter of the secondary in-call controls (Mute, Hold, Keypad, Transfer). */
  controlButtonSize: 60,
  /** Gap between dial-pad keys. */
  keyGap: 14,
  /** Corner radius for cards/inputs. */
  radius: 14,
  /** Generic spacing unit. */
  space: 16,
} as const;

export type SoftphoneDimensions = typeof softphoneDimensions;

// Theme-aware defaults. The shared colors (background/text/secondary/border/
// accent/success/danger) mirror the SDK's base-component defaults so the Softphone
// sits in the same visual family as CallLogs/Voicemails/etc. The surface fills
// are Softphone-specific (keys need a touch more contrast than the table surfaces).
const LIGHT: SoftphonePalette = {
  background: '#ffffff',
  surface: 'rgba(0, 0, 0, 0.04)',
  surfaceActive: 'rgba(0, 0, 0, 0.09)',
  text: '#1a1a1a',
  textSecondary: 'rgba(0, 0, 0, 0.55)',
  border: 'rgba(0, 0, 0, 0.1)',
  accent: '#6772e5',
  success: '#30a46c',
  danger: '#e5484d',
  warning: '#f5a623',
  onAccent: '#ffffff',
};

const DARK: SoftphonePalette = {
  background: '#1a1a1a',
  surface: 'rgba(255, 255, 255, 0.06)',
  surfaceActive: 'rgba(255, 255, 255, 0.12)',
  text: '#ffffff',
  textSecondary: 'rgba(255, 255, 255, 0.6)',
  border: 'rgba(255, 255, 255, 0.12)',
  accent: '#828bf0',
  success: '#3dd68c',
  danger: '#ff6369',
  warning: '#f5a623',
  onAccent: '#ffffff',
};

/** The standard 12-key dial pad: digit + its letter sub-label. */
export const dialPadKeys: ReadonlyArray<{ digit: string; letters: string }> = [
  { digit: '1', letters: '' },
  { digit: '2', letters: 'ABC' },
  { digit: '3', letters: 'DEF' },
  { digit: '4', letters: 'GHI' },
  { digit: '5', letters: 'JKL' },
  { digit: '6', letters: 'MNO' },
  { digit: '7', letters: 'PQRS' },
  { digit: '8', letters: 'TUV' },
  { digit: '9', letters: 'WXYZ' },
  { digit: '*', letters: '' },
  { digit: '0', letters: '+' },
  { digit: '#', letters: '' },
];

function isDark(theme: Theme | undefined): boolean {
  // 'auto' is treated as light here; the web component additionally honors the
  // OS preference via prefers-color-scheme, the native one via Appearance.
  return theme === 'dark';
}

/**
 * Resolve the final palette from appearance: theme picks the base set, then any
 * `appearance.variables` overrides (the same keys other SDK components honor)
 * are layered on top. Unrecognized/absent variables fall back to the theme
 * default, so a bare `{ theme: 'dark' }` and a fully-specified palette both work.
 */
export function resolveSoftphonePalette(appearance?: AppearanceOptions): SoftphonePalette {
  const base = isDark(appearance?.theme) ? DARK : LIGHT;
  const v: AppearanceVariables = appearance?.variables ?? {};
  return {
    background: v.colorBackground ?? base.background,
    surface: v.colorSurfaceSubtle ?? base.surface,
    surfaceActive: base.surfaceActive,
    text: v.colorText ?? base.text,
    textSecondary: v.colorTextSecondary ?? base.textSecondary,
    border: v.colorBorder ?? base.border,
    accent: v.colorPrimary ?? base.accent,
    success: v.colorSuccess ?? base.success,
    danger: v.colorDanger ?? base.danger,
    warning: v.colorWarning ?? base.warning,
    onAccent: base.onAccent,
  };
}

/** Default font stack, shared with the rest of the SDK. */
export const softphoneFontFamily =
  '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif';
