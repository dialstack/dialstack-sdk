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
import type { AppearanceOptions, AppearanceVariables, Theme } from '@dialstack/sdk-js';

export interface SoftphonePalette {
  background: string;
  surface: string;
  surfaceActive: string;
  text: string;
  textSecondary: string;
  border: string;
  accent: string;
  success: string;
  danger: string;
  warning: string;
  onAccent: string;
}

export const softphoneDimensions = {
  maxWidth: 420,
  defaultHeight: 644,
  actionButtonSize: 68,
  controlButtonSize: 60,
  keyGap: 14,
  keyMaxSize: 84,
  radius: 14,
  space: 16,
} as const;

export type SoftphoneDimensions = typeof softphoneDimensions;

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
  return theme === 'dark';
}

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

export const softphoneFontFamily =
  '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif';
