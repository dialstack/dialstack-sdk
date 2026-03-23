/**
 * Shared design token definitions for the onboarding UI.
 *
 * Used by both OnboardingPortal (inline style) and OnboardingLayout (CSS string
 * for Shadow DOM). Defined once here to prevent drift.
 */

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
