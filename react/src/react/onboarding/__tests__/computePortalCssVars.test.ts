import { computePortalCssVars, LIGHT_COLORS, resolvePrimaryPair } from '../design-tokens';

describe('computePortalCssVars', () => {
  describe('white-label override', () => {
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
      expect(vars['--ds-portal-sidebar-active']).toBe('color-mix(in srgb, #00A67E, #ffffff 20%)');
      expect(vars['--ds-portal-splash-bg']).toBe('color-mix(in srgb, #00A67E, black 15%)');
    });

    it('draws white text on the primary when colorPrimaryText is omitted', () => {
      const vars = computePortalCssVars({ colorPrimary: '#E5E5E5' }) as Record<string, string>;
      expect(vars['--ds-color-primary-text']).toBe('#ffffff');
      expect(vars['--ds-portal-color-primary-text']).toBe('#ffffff');
      expect(vars['--ds-portal-sidebar-text']).toBe('#ffffff');
    });

    it('uses an explicit colorPrimaryText for the sidebar and buttons', () => {
      const vars = computePortalCssVars({
        colorPrimary: '#E5E5E5',
        colorPrimaryText: '#171717',
      }) as Record<string, string>;
      expect(vars['--ds-portal-sidebar-text']).toBe('#171717');
      expect(vars['--ds-portal-color-primary-text']).toBe('#171717');
      expect(vars['--ds-portal-sidebar-active']).toBe('color-mix(in srgb, #E5E5E5, #171717 20%)');
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

describe('colorPrimaryText without a brand primary', () => {
  it('colors the default sidebar and splash text', () => {
    const vars = computePortalCssVars({ colorPrimaryText: '#000000' }) as Record<string, string>;
    expect(vars['--ds-portal-sidebar-text']).toBe('#000000');
    expect(vars['--ds-portal-splash-text']).toBe('#000000');
  });

  it('keeps the default light text when neither is set', () => {
    const vars = computePortalCssVars({}) as Record<string, string>;
    expect(vars['--ds-portal-sidebar-text']).toBe('#f0f0ff');
    expect(vars['--ds-portal-splash-text']).toBe('#ffffff');
  });
});

describe('resolvePrimaryPair', () => {
  const instance = { colorPrimary: '#18181b', colorPrimaryText: '#fafafa' };

  it("does not pair a prop's primary with the instance's text color", () => {
    expect(resolvePrimaryPair({ colorPrimary: '#E5E5E5' }, instance)).toEqual({
      colorPrimary: '#E5E5E5',
      colorPrimaryText: undefined,
    });
  });

  it('keeps a text color the prop sets with its primary', () => {
    expect(
      resolvePrimaryPair({ colorPrimary: '#E5E5E5', colorPrimaryText: '#171717' }, instance)
    ).toEqual({ colorPrimary: '#E5E5E5', colorPrimaryText: '#171717' });
  });

  it('takes both from the instance when the prop sets no primary', () => {
    expect(resolvePrimaryPair(undefined, instance)).toEqual(instance);
  });

  it("lets a prop's text color override the instance's on the instance's primary", () => {
    expect(resolvePrimaryPair({ colorPrimaryText: '#000000' }, instance)).toEqual({
      colorPrimary: '#18181b',
      colorPrimaryText: '#000000',
    });
  });
});
