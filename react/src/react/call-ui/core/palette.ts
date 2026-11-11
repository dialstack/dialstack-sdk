/**
 * The design tokens shared by every call UI: the softphone and the components
 * that show and control calls.
 *
 * Framework-agnostic (no DOM, no React Native), so the web UIs consume these as
 * CSS values and the React Native ones in a StyleSheet, and the two look the
 * same by default.
 *
 * Colors resolve from the same `AppearanceOptions` surface the rest of the SDK
 * uses (theme + variables), so theming through `DialstackComponentsProvider` /
 * the `appearance` prop flows through identically on both platforms.
 */
import type { AppearanceOptions, AppearanceVariables, Theme } from '@dialstack/sdk-js';

export interface CallPalette {
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

export const callDimensions = {
  actionButtonSize: 68,
  controlButtonSize: 60,
  radius: 14,
} as const;

const LIGHT: CallPalette = {
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

const DARK: CallPalette = {
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

function isDark(theme: Theme | undefined): boolean {
  return theme === 'dark';
}

export function resolveCallPalette(appearance?: AppearanceOptions): CallPalette {
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

export const callFontFamily =
  '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif';
