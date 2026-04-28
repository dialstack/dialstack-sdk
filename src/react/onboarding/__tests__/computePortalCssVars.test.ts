import { computePortalCssVars, LIGHT_COLORS } from '../design-tokens';

describe('computePortalCssVars', () => {
  describe('white-label override (DIA-729)', () => {
    it('propagates colorPrimary to BOTH --ds-color-primary and --ds-portal-color-primary', () => {
      const vars = computePortalCssVars({ colorPrimary: '#00A67E' }) as Record<string, string>;
      expect(vars['--ds-color-primary']).toBe('#00A67E');
      expect(vars['--ds-portal-color-primary']).toBe('#00A67E');
    });

    it('propagates colorPrimaryHover to BOTH source and portal mirror', () => {
      const vars = computePortalCssVars({
        colorPrimary: '#00A67E',
        colorPrimaryHover: '#008F6D',
      }) as Record<string, string>;
      expect(vars['--ds-color-primary-hover']).toBe('#008F6D');
      expect(vars['--ds-portal-color-primary-hover']).toBe('#008F6D');
    });

    it('derives a hover from colorPrimary when colorPrimaryHover is omitted', () => {
      const vars = computePortalCssVars({ colorPrimary: '#00A67E' }) as Record<string, string>;
      const expected = 'color-mix(in srgb, #00A67E, black 10%)';
      expect(vars['--ds-color-primary-hover']).toBe(expected);
      expect(vars['--ds-portal-color-primary-hover']).toBe(expected);
    });

    it('derives portal sidebar/splash vars from colorPrimary instead of defaults', () => {
      const vars = computePortalCssVars({ colorPrimary: '#00A67E' }) as Record<string, string>;
      expect(vars['--ds-portal-sidebar-bg']).toBe('#00A67E');
      expect(vars['--ds-portal-sidebar-active']).toBe('color-mix(in srgb, #00A67E, white 20%)');
      expect(vars['--ds-portal-splash-bg']).toBe('color-mix(in srgb, #00A67E, black 15%)');
    });

    it('writes the focus ring with the override color, not the default', () => {
      const vars = computePortalCssVars({ colorPrimary: '#00A67E' }) as Record<string, string>;
      expect(vars['--ds-focus-ring']).toBe('0 0 0 2px #00A67E');
    });
  });

  describe('defaults (no white-label)', () => {
    it('falls back to LIGHT_COLORS primary when colorPrimary is omitted', () => {
      const vars = computePortalCssVars({}) as Record<string, string>;
      expect(vars['--ds-color-primary']).toBe(LIGHT_COLORS['--ds-color-primary']);
      expect(vars['--ds-portal-color-primary']).toBe(LIGHT_COLORS['--ds-color-primary']);
    });
  });

  describe('baseStyle merge', () => {
    it('lets caller-provided style override computed vars', () => {
      const vars = computePortalCssVars({
        colorPrimary: '#00A67E',
        baseStyle: { '--ds-color-primary': '#ff0000' } as React.CSSProperties,
      }) as Record<string, string>;
      expect(vars['--ds-color-primary']).toBe('#ff0000');
    });
  });

  describe('dark theme', () => {
    it('applies dark overrides while preserving the white-label primary', () => {
      const vars = computePortalCssVars({
        colorPrimary: '#00A67E',
        isDark: true,
      }) as Record<string, string>;
      expect(vars['--ds-color-primary']).toBe('#00A67E');
      expect(vars['--ds-portal-color-primary']).toBe('#00A67E');
      expect(vars['--ds-color-background']).toBe('#1a1a1a');
      expect(vars['--ds-portal-color-background']).toBe('#1a1a1a');
      expect(vars['--ds-color-text']).toBe('#ffffff');
      expect(vars['--ds-portal-color-text']).toBe('#ffffff');
    });
  });
});
