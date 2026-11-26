/**
 * Shared design token definitions for the onboarding UI.
 *
 * Used by both OnboardingPortal (inline style) and OnboardingLayout (CSS string
 * for Shadow DOM). Defined once here to prevent drift.
 */

import type React from 'react';

/** Static (non-theme-sensitive) design tokens. */
export const STATIC_TOKENS = {
  '--ds-font-family': '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
  '--ds-font-size-base': '14px',
  '--ds-font-size-small': '12px',
  '--ds-font-size-large': '16px',
  '--ds-font-size-xlarge': '18px',
  '--ds-font-weight-normal': '400',
  '--ds-font-weight-medium': '500',
  '--ds-font-weight-bold': '600',
  '--ds-line-height': '1.5',
  '--ds-spacing-unit': '8px',
  '--ds-spacing-xs': '4px',
  '--ds-spacing-sm': '8px',
  '--ds-spacing-md': '12px',
  '--ds-spacing-lg': '16px',
  '--ds-spacing-xl': '24px',
  '--ds-layout-spacing-xs': '4px',
  '--ds-layout-spacing-sm': '8px',
  '--ds-layout-spacing-md': '12px',
  '--ds-layout-spacing-lg': '16px',
  '--ds-layout-spacing-xl': '24px',
  '--ds-border-radius': '4px',
  '--ds-border-radius-small': '2px',
  '--ds-border-radius-large': '8px',
  '--ds-border-radius-round': '50%',
  '--ds-transition-duration': '0.15s',
  '--ds-icon-size': '24px',
  '--ds-icon-size-small': '20px',
} as const;

/** Light-theme color defaults (also used as fallbacks in OnboardingLayout CSS). */
export const LIGHT_COLORS = {
  '--ds-color-primary': '#6772E5',
  '--ds-color-primary-hover': '#5469d4',
  '--ds-color-primary-text': '#ffffff',
  '--ds-color-background': '#ffffff',
  '--ds-color-text': '#1a1a1a',
  '--ds-color-text-secondary': 'rgba(0,0,0,0.6)',
  '--ds-color-danger': '#e5484d',
  '--ds-color-success': '#30a46c',
  '--ds-color-warning': '#f5a623',
  '--ds-color-surface-subtle': 'rgba(0,0,0,0.02)',
  '--ds-color-border': 'rgba(0,0,0,0.1)',
  '--ds-color-border-subtle': 'rgba(0,0,0,0.05)',
} as const;

/** Dark-theme color overrides. */
export const DARK_COLORS = {
  '--ds-color-background': '#1a1a1a',
  '--ds-color-text': '#ffffff',
  '--ds-color-text-secondary': 'rgba(255,255,255,0.6)',
  '--ds-color-surface-subtle': 'rgba(255,255,255,0.02)',
  '--ds-color-border': 'rgba(255,255,255,0.1)',
  '--ds-color-border-subtle': 'rgba(255,255,255,0.05)',
} as const;

type PrimaryVariables = { colorPrimary?: string; colorPrimaryText?: string };

/**
 * The primary and the text drawn on it, taken from the same source. A text color
 * is chosen for one primary, so a prop that sets `colorPrimary` must not pick up
 * the instance's `colorPrimaryText`; left unset, the text takes its default.
 */
export function resolvePrimaryPair(
  prop: PrimaryVariables | undefined,
  instance: PrimaryVariables | undefined
): PrimaryVariables {
  if (prop?.colorPrimary) {
    return { colorPrimary: prop.colorPrimary, colorPrimaryText: prop.colorPrimaryText };
  }
  return {
    colorPrimary: instance?.colorPrimary,
    colorPrimaryText: prop?.colorPrimaryText ?? instance?.colorPrimaryText,
  };
}

export interface PortalCssVarsOptions {
  colorPrimary?: string;
  colorPrimaryHover?: string;
  colorPrimaryText?: string;
  isDark?: boolean;
  baseStyle?: React.CSSProperties;
}

/**
 * Compute the inline-style CSS-variable block applied to the portal root.
 *
 * Returns DS token vars (`--ds-color-*`) plus their `--ds-portal-*` mirrors —
 * the latter are the source-of-truth that OnboardingLayout's Shadow DOM reads
 * via `generateLayoutCssVars()`. The white-label primary must reach BOTH sets,
 * otherwise wizard content (which lives inside the layout shadow root) and the
 * FinalCompleteScreen button (which reads `--ds-portal-color-primary` directly)
 * fall back to the default DialStack purple.
 */
export function computePortalCssVars(opts: PortalCssVarsOptions): React.CSSProperties {
  const { colorPrimary, colorPrimaryHover, colorPrimaryText, isDark = false, baseStyle } = opts;

  const effectivePrimary = colorPrimary ?? LIGHT_COLORS['--ds-color-primary'];
  const effectivePrimaryHover =
    colorPrimaryHover ??
    (colorPrimary
      ? `color-mix(in srgb, ${colorPrimary}, black 10%)`
      : LIGHT_COLORS['--ds-color-primary-hover']);

  const primaryText = colorPrimaryText ?? '#ffffff';

  // Without a brand color the sidebar and splash use their own purples, not the
  // default primary, so their text keeps its own light default.
  const sidebarBg = colorPrimary ?? '#1c1247';
  const sidebarText = colorPrimary ? primaryText : (colorPrimaryText ?? '#f0f0ff');
  const sidebarActive = colorPrimary
    ? `color-mix(in srgb, ${colorPrimary}, ${primaryText} 20%)`
    : '#4c3c8e';
  const splashBg = colorPrimary ? `color-mix(in srgb, ${colorPrimary}, black 15%)` : '#2d2065';
  const splashShape = colorPrimary ? `color-mix(in srgb, ${colorPrimary}, white 30%)` : '#8A7ACE';
  const splashShelf = colorPrimary ? `color-mix(in srgb, ${colorPrimary}, white 70%)` : '#d1c6ff';

  // Bake the white-label primary into the theme map so every derived
  // var (including `--ds-portal-color-primary*`) reflects the override.
  const themeColors: Record<string, string> = {
    ...LIGHT_COLORS,
    ...(isDark ? DARK_COLORS : {}),
    '--ds-color-primary': effectivePrimary,
    '--ds-color-primary-hover': effectivePrimaryHover,
    '--ds-color-primary-text': primaryText,
  };

  const portalColorVars = Object.fromEntries(
    Object.entries(themeColors).map(([k, v]) => [k.replace('--ds-color-', '--ds-portal-color-'), v])
  );

  return {
    '--ds-portal-sidebar-bg': sidebarBg,
    '--ds-portal-sidebar-text': sidebarText,
    '--ds-portal-sidebar-active': sidebarActive,
    '--ds-portal-splash-bg': splashBg,
    '--ds-portal-splash-text': colorPrimary ? primaryText : (colorPrimaryText ?? '#ffffff'),
    '--ds-portal-splash-shape': splashShape,
    '--ds-portal-splash-shelf': splashShelf,
    ...portalColorVars,
    ...themeColors,
    ...STATIC_TOKENS,
    '--ds-focus-ring': `0 0 0 2px ${effectivePrimary}`,
    ...baseStyle,
  } as React.CSSProperties;
}

/**
 * Generate a CSS variable block for OnboardingLayout's Shadow DOM.
 * Variables read from `--ds-portal-*` source vars with light-theme fallbacks,
 * so they inherit portal colors when nested, and still work standalone.
 */
export function generateLayoutCssVars(): string {
  const colorLines = Object.entries(LIGHT_COLORS)
    .map(([token, fallback]) => {
      const portalVar = token.replace('--ds-color-', '--ds-portal-color-');
      return `  ${token}: var(${portalVar}, ${fallback});`;
    })
    .join('\n');

  const staticLines = Object.entries(STATIC_TOKENS)
    .map(([token, value]) => `  ${token}: ${value};`)
    .join('\n');

  return `\n.ds-onboarding-root {\n${colorLines}\n${staticLines}\n  --ds-focus-ring: 0 0 0 2px var(--ds-portal-color-primary, ${LIGHT_COLORS['--ds-color-primary']});\n}\n`;
}
