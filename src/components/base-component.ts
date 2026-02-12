/**
 * Base component class for DialStack Web Components
 */

import type {
  DialStackInstanceImpl,
  AppearanceOptions,
  FormattingOptions,
  LoaderStart,
  LoadError,
  ComponentIcons,
  LayoutVariant,
  BaseComponentClasses,
} from '../types';
import { type Locale, defaultLocale } from '../locales';

// ============================================================================
// Static Base Styles (shared across all components)
// ============================================================================

/**
 * Static base styles that don't change - applied once per component
 */
const BASE_STYLES = `
  * {
    box-sizing: border-box;
    font-family: var(--ds-font-family);
  }

  :focus-visible {
    outline: none;
    box-shadow: var(--ds-focus-ring);
  }
`;

// ============================================================================
// Default Icons
// ============================================================================

/**
 * Default SVG icons used by components
 * Can be overridden via setIcons()
 */
export const defaultIcons: Required<ComponentIcons> = {
  play: `<svg viewBox="0 0 24 24" fill="currentColor"><path d="M8 5v14l11-7z"/></svg>`,
  pause: `<svg viewBox="0 0 24 24" fill="currentColor"><path d="M6 19h4V5H6v14zm8-14v14h4V5h-4z"/></svg>`,
  phone: `<svg viewBox="0 0 24 24" fill="currentColor"><path d="M6.62 10.79c1.44 2.83 3.76 5.14 6.59 6.59l2.2-2.2c.27-.27.67-.36 1.02-.24 1.12.37 2.33.57 3.57.57.55 0 1 .45 1 1V20c0 .55-.45 1-1 1-9.39 0-17-7.61-17-17 0-.55.45-1 1-1h3.5c.55 0 1 .45 1 1 0 1.25.2 2.45.57 3.57.11.35.03.74-.25 1.02l-2.2 2.2z"/></svg>`,
  trash: `<svg viewBox="0 0 24 24" fill="currentColor"><path d="M6 19c0 1.1.9 2 2 2h8c1.1 0 2-.9 2-2V7H6v12zM19 4h-3.5l-1-1h-5l-1 1H5v2h14V4z"/></svg>`,
  chevronRight: `<svg viewBox="0 0 24 24" fill="currentColor"><path d="M10 6L8.59 7.41 13.17 12l-4.58 4.59L10 18l6-6z"/></svg>`,
  chevronLeft: `<svg viewBox="0 0 24 24" fill="currentColor"><path d="M15.41 7.41L14 6l-6 6 6 6 1.41-1.41L10.83 12z"/></svg>`,
  chevronDown: `<svg viewBox="0 0 24 24" fill="currentColor"><path d="M16.59 8.59L12 13.17 7.41 8.59 6 10l6 6 6-6z"/></svg>`,
  spinner: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10" opacity="0.25"/><path d="M12 2a10 10 0 0 1 10 10" stroke-linecap="round"/></svg>`,
  inbound: `<svg viewBox="0 0 24 24" fill="currentColor"><path d="M20 5.41L18.59 4 7 15.59V9H5v10h10v-2H8.41z"/></svg>`,
  outbound: `<svg viewBox="0 0 24 24" fill="currentColor"><path d="M9 5v2h6.59L4 18.59 5.41 20 17 8.41V15h2V5z"/></svg>`,
  voicemail: `<svg viewBox="0 0 24 24" fill="currentColor"><path d="M18.5 6C15.46 6 13 8.46 13 11.5c0 1.33.47 2.55 1.26 3.5H9.74c.79-.95 1.26-2.17 1.26-3.5C11 8.46 8.54 6 5.5 6S0 8.46 0 11.5 2.46 17 5.5 17h13c3.04 0 5.5-2.46 5.5-5.5S21.54 6 18.5 6zm-13 9C3.57 15 2 13.43 2 11.5S3.57 8 5.5 8 9 9.57 9 11.5 7.43 15 5.5 15zm13 0c-1.93 0-3.5-1.57-3.5-3.5S16.57 8 18.5 8 22 9.57 22 11.5 20.43 15 18.5 15z"/></svg>`,
  sparkle: `<svg viewBox="0 0 24 24" fill="currentColor"><path d="M9.5 2l2.25 4.5L16 9.5l-4.25 3L9.5 17l-2.25-4.5L3 9.5l4.25-3L9.5 2zm9 10l1.125 2.25L22 15.5l-2.375 1.25L18.5 19l-1.125-2.25L15 15.5l2.375-1.25L18.5 12z"/></svg>`,
  document: `<svg viewBox="0 0 24 24" fill="currentColor"><path d="M14 2H6c-1.1 0-2 .9-2 2v16c0 1.1.9 2 2 2h12c1.1 0 2-.9 2-2V8l-6-6zm2 16H8v-2h8v2zm0-4H8v-2h8v2zm-3-5V3.5L18.5 9H13z"/></svg>`,
};

/**
 * Get HTMLElement base class - returns a no-op class in SSR environments
 * This allows the SDK to be imported in Node.js without errors
 */
const getHTMLElementBase = (): typeof HTMLElement => {
  if (typeof HTMLElement !== 'undefined') {
    return HTMLElement;
  }
  // Return a minimal stub for SSR environments
  return class {} as unknown as typeof HTMLElement;
};

/**
 * Base class for all DialStack Web Components
 */
export abstract class BaseComponent extends getHTMLElementBase() {
  protected instance: DialStackInstanceImpl | null = null;
  protected isInitialized: boolean = false;
  protected appearance: AppearanceOptions | undefined;
  protected locale: Locale = defaultLocale;
  protected formatting: FormattingOptions = {};

  // Icons (can be customized)
  protected icons: Required<ComponentIcons> = { ...defaultIcons };

  // Layout variant
  protected layoutVariant: LayoutVariant = 'default';

  // CSS classes (can be customized)
  protected classes: BaseComponentClasses = {};

  // Cached CSS variables (only regenerated when appearance changes)
  private _cachedCssVariables: string = '';
  private _lastAppearanceHash: string = '';

  // Mount state tracking
  private _isMounted: boolean = false;
  private _isDestroyed: boolean = false;

  // Common callbacks
  protected _onLoaderStart?: (event: LoaderStart) => void;
  protected _onLoadError?: (event: LoadError) => void;

  constructor() {
    super();
    this.attachShadow({ mode: 'open' });

    // Listen for appearance updates
    this.addEventListener('dialstack-appearance-update', ((
      event: CustomEvent<{ appearance: AppearanceOptions }>
    ) => {
      this.appearance = event.detail.appearance;
      this.onAppearanceUpdate(event.detail.appearance);
    }) as EventListener);

    // Listen for logout
    this.addEventListener('dialstack-logout', () => {
      this.onLogout();
    });
  }

  /**
   * Called when the element is connected to the DOM
   */
  connectedCallback(): void {
    if (this.instance && !this.isInitialized) {
      this.initialize();
    }
  }

  /**
   * Called when the element is disconnected from the DOM
   */
  disconnectedCallback(): void {
    this.cleanup();
  }

  /**
   * Set the DialStack instance (called by SDK)
   */
  setInstance(instance: DialStackInstanceImpl): void {
    this.instance = instance;
    this.appearance = instance.getAppearance();

    // Initialize if already connected to DOM
    if (this.isConnected && !this.isInitialized) {
      this.initialize();
    }
  }

  /**
   * Initialize the component (implemented by subclasses)
   */
  protected abstract initialize(): void;

  /**
   * Cleanup resources when component is removed
   */
  protected cleanup(): void {
    // Override in subclasses if needed
  }

  // ============================================================================
  // Public Lifecycle API
  // ============================================================================

  /**
   * Mount the component to a container element
   *
   * @example
   * ```typescript
   * const element = dialstack.createComponent('voicemails');
   * element.mount(document.getElementById('container'));
   * ```
   */
  mount(container: HTMLElement): this {
    if (this._isDestroyed) {
      throw new Error('DialStack: Cannot mount a destroyed component');
    }

    if (this._isMounted) {
      console.warn('DialStack: Component is already mounted');
      return this;
    }

    container.appendChild(this);
    this._isMounted = true;

    return this;
  }

  /**
   * Unmount the component from its container
   * The component can be remounted later
   *
   * @example
   * ```typescript
   * element.unmount();
   * // Later...
   * element.mount(anotherContainer);
   * ```
   */
  unmount(): this {
    if (this._isDestroyed) {
      throw new Error('DialStack: Cannot unmount a destroyed component');
    }

    if (!this._isMounted) {
      console.warn('DialStack: Component is not mounted');
      return this;
    }

    if (this.parentElement) {
      this.parentElement.removeChild(this);
    }

    this._isMounted = false;
    // Keep _mountContainer reference in case we want to remount to same container

    return this;
  }

  /**
   * Destroy the component and clean up all resources
   * After calling destroy(), the component cannot be used again
   *
   * @example
   * ```typescript
   * element.destroy();
   * // Component is now unusable
   * ```
   */
  destroy(): void {
    if (this._isDestroyed) {
      return; // Already destroyed, no-op
    }

    // Unmount if mounted
    if (this._isMounted) {
      this.unmount();
    }

    // Run cleanup hook
    this.cleanup();

    // Clear shadow DOM
    if (this.shadowRoot) {
      this.shadowRoot.innerHTML = '';
    }

    // Clear all state
    this.instance = null;
    this._cachedCssVariables = '';
    this._onLoaderStart = undefined;
    this._onLoadError = undefined;
    this.isInitialized = false;
    this._isDestroyed = true;
  }

  /**
   * Check if the component is currently mounted
   */
  isMounted(): boolean {
    return this._isMounted;
  }

  /**
   * Check if the component has been destroyed
   */
  isDestroyed(): boolean {
    return this._isDestroyed;
  }

  // ============================================================================
  // Configuration Setters
  // ============================================================================

  /**
   * Set the locale for UI strings
   */
  setLocale(locale: Locale): void {
    this.locale = locale;
    if (this.isInitialized) {
      this.render();
    }
  }

  /**
   * Set formatting options
   */
  setFormatting(formatting: FormattingOptions): void {
    this.formatting = { ...this.formatting, ...formatting };
    if (this.isInitialized) {
      this.render();
    }
  }

  /**
   * Set custom icons (partial override)
   */
  setIcons(icons: ComponentIcons): void {
    this.icons = { ...this.icons, ...icons };
    if (this.isInitialized) {
      this.render();
    }
  }

  /**
   * Set layout variant (compact, comfortable, default)
   */
  setLayoutVariant(variant: LayoutVariant): void {
    this.layoutVariant = variant;
    if (this.isInitialized) {
      this.render();
    }
  }

  /**
   * Set custom CSS classes for styling integration
   *
   * These classes are applied to the component's container and internal elements,
   * allowing integration with external CSS frameworks (Tailwind, Bootstrap, etc.)
   *
   * @example
   * ```typescript
   * component.setClasses({
   *   base: 'rounded-lg border',
   *   loading: 'animate-pulse',
   *   error: 'border-red-500',
   *   empty: 'text-gray-400'
   * });
   * ```
   */
  setClasses(classes: BaseComponentClasses): void {
    this.classes = { ...this.classes, ...classes };
    if (this.isInitialized) {
      this.render();
    }
  }

  /**
   * Escape HTML special characters to prevent XSS when interpolating
   * server-provided strings into innerHTML templates.
   */
  protected escapeHtml(str: string): string {
    return str
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  /**
   * Get combined class names for a given state
   */
  protected getClassNames(...states: (keyof BaseComponentClasses)[]): string {
    const classNames: string[] = [];

    // Always include base class
    if (this.classes.base) {
      classNames.push(this.classes.base);
    }

    // Add state-specific classes
    for (const state of states) {
      const className = this.classes[state];
      if (className) {
        classNames.push(className);
      }
    }

    return classNames.join(' ');
  }

  /**
   * Set callback for loader start events
   */
  setOnLoaderStart(callback: (event: LoaderStart) => void): void {
    this._onLoaderStart = callback;
  }

  /**
   * Set callback for load error events
   */
  setOnLoadError(callback: (event: LoadError) => void): void {
    this._onLoadError = callback;
  }

  // ============================================================================
  // Internationalization
  // ============================================================================

  /**
   * Translate a key to a localized string
   * Supports nested keys like 'voicemails.loading' and parameter interpolation
   *
   * @param key - Dot-separated key path
   * @param params - Optional parameters to interpolate
   * @returns Translated string or the key if not found
   */
  protected t(key: string, params?: Record<string, string | number>): string {
    const keys = key.split('.');
    let value: unknown = this.locale;

    for (const k of keys) {
      if (value && typeof value === 'object' && k in value) {
        value = (value as Record<string, unknown>)[k];
      } else {
        return key; // Key not found, return as-is
      }
    }

    if (typeof value !== 'string') {
      return key;
    }

    // Replace {param} placeholders
    if (params) {
      return value.replace(/\{(\w+)\}/g, (_, k) => String(params[k] ?? ''));
    }

    return value;
  }

  /**
   * Handle appearance updates
   */
  protected onAppearanceUpdate(_appearance: AppearanceOptions): void {
    // Override in subclasses to handle appearance changes
    // Default: re-render the component
    if (this.isInitialized) {
      this.render();
    }
  }

  /**
   * Handle logout
   */
  protected onLogout(): void {
    // Override in subclasses if needed
    // Default: clear the component
    if (this.shadowRoot) {
      this.shadowRoot.innerHTML = '';
    }
    this.isInitialized = false;
  }

  /**
   * Render the component (implemented by subclasses)
   */
  protected abstract render(): void;

  /**
   * Fetch data from DialStack API
   */
  protected async fetchComponentData<T>(path: string): Promise<T> {
    if (!this.instance) {
      throw new Error('DialStack: Component not initialized with instance');
    }

    const response = await this.instance.fetchApi(path);

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`DialStack API error: ${response.status} ${errorText}`);
    }

    return response.json();
  }

  /**
   * Apply appearance styling to shadow DOM
   * Uses caching to avoid regenerating CSS variables on every render
   */
  protected applyAppearanceStyles(): string {
    // Create a hash of the current appearance + layout variant
    const currentHash = this.computeAppearanceHash();

    // Return cached CSS if nothing has changed
    if (currentHash === this._lastAppearanceHash && this._cachedCssVariables) {
      return this._cachedCssVariables + BASE_STYLES;
    }

    // Regenerate CSS variables
    this._cachedCssVariables = this.generateCssVariables();
    this._lastAppearanceHash = currentHash;

    return this._cachedCssVariables + BASE_STYLES;
  }

  /**
   * Compute a hash string for current appearance settings
   * Used to detect when CSS variables need to be regenerated
   */
  private computeAppearanceHash(): string {
    const vars = this.appearance?.variables || {};
    const theme = this.appearance?.theme || 'light';
    return `${theme}:${this.layoutVariant}:${JSON.stringify(vars)}`;
  }

  /**
   * Generate CSS variables string based on current appearance
   */
  private generateCssVariables(): string {
    const vars = this.appearance?.variables || {};
    const theme = this.appearance?.theme || 'light';
    const isDark = theme === 'dark';

    // Colors with theme-aware defaults
    const colorPrimary = vars.colorPrimary || '#6772E5';
    const colorPrimaryHover = vars.colorPrimaryHover || '#5469d4';
    const colorBackground = vars.colorBackground || (isDark ? '#1a1a1a' : '#ffffff');
    const colorText = vars.colorText || (isDark ? '#ffffff' : '#1a1a1a');
    const colorTextSecondary =
      vars.colorTextSecondary || (isDark ? 'rgba(255,255,255,0.6)' : 'rgba(0,0,0,0.6)');
    const colorDanger = vars.colorDanger || '#e5484d';
    const colorSuccess = vars.colorSuccess || '#30a46c';
    const colorWarning = vars.colorWarning || '#f5a623';
    const colorSurfaceSubtle =
      vars.colorSurfaceSubtle || (isDark ? 'rgba(255,255,255,0.02)' : 'rgba(0,0,0,0.02)');
    const colorBorder = vars.colorBorder || (isDark ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.1)');
    const colorBorderSubtle =
      vars.colorBorderSubtle || (isDark ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.05)');

    // Typography
    const fontFamily =
      vars.fontFamily || '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif';
    const fontSizeBase = vars.fontSizeBase || '14px';
    const fontSizeSmall = vars.fontSizeSmall || '12px';
    const fontSizeLarge = vars.fontSizeLarge || '16px';
    const fontSizeXLarge = vars.fontSizeXLarge || '18px';
    const fontWeightNormal = vars.fontWeightNormal || '400';
    const fontWeightMedium = vars.fontWeightMedium || '500';
    const fontWeightBold = vars.fontWeightBold || '600';
    const lineHeight = vars.lineHeight || '1.5';

    // Spacing
    const spacingUnit = vars.spacingUnit || '8px';
    const spacingXs = vars.spacingXs || '4px';
    const spacingSm = vars.spacingSm || '8px';
    const spacingMd = vars.spacingMd || '12px';
    const spacingLg = vars.spacingLg || '16px';
    const spacingXl = vars.spacingXl || '24px';

    // Border
    const borderRadius = vars.borderRadius || '4px';
    const borderRadiusSmall = vars.borderRadiusSmall || '2px';
    const borderRadiusLarge = vars.borderRadiusLarge || '8px';

    // Effects
    const transitionDuration = vars.transitionDuration || '0.15s';
    const focusRingColor = vars.focusRingColor || colorPrimary;
    const focusRingWidth = vars.focusRingWidth || '2px';

    // Icon sizes
    const iconSize = vars.iconSize || '24px';
    const iconSizeSmall = vars.iconSizeSmall || '20px';

    // Player/media controls
    const playerButtonSize = vars.playerButtonSize || '44px';
    const playerProgressHeight = vars.playerProgressHeight || '4px';
    const playerProgressHandleSize = vars.playerProgressHandleSize || '14px';

    // Indicators
    const unreadIndicatorSize = vars.unreadIndicatorSize || '10px';

    // Spinner
    const spinnerSize = vars.spinnerSize || '24px';

    // Time display
    const timeDisplayWidth = vars.timeDisplayWidth || '36px';

    // Layout variant spacing multipliers
    const layoutMultiplier =
      this.layoutVariant === 'compact' ? 0.75 : this.layoutVariant === 'comfortable' ? 1.25 : 1;
    const layoutSpacingXs = `${Math.round(4 * layoutMultiplier)}px`;
    const layoutSpacingSm = `${Math.round(8 * layoutMultiplier)}px`;
    const layoutSpacingMd = `${Math.round(12 * layoutMultiplier)}px`;
    const layoutSpacingLg = `${Math.round(16 * layoutMultiplier)}px`;
    const layoutSpacingXl = `${Math.round(24 * layoutMultiplier)}px`;

    return `
      :host {
        /* Layout variant */
        --ds-layout-variant: ${this.layoutVariant};
        --ds-layout-spacing-xs: ${layoutSpacingXs};
        --ds-layout-spacing-sm: ${layoutSpacingSm};
        --ds-layout-spacing-md: ${layoutSpacingMd};
        --ds-layout-spacing-lg: ${layoutSpacingLg};
        --ds-layout-spacing-xl: ${layoutSpacingXl};

        /* Colors - Primary */
        --ds-color-primary: ${colorPrimary};
        --ds-color-primary-hover: ${colorPrimaryHover};

        /* Colors - Semantic */
        --ds-color-background: ${colorBackground};
        --ds-color-text: ${colorText};
        --ds-color-text-secondary: ${colorTextSecondary};
        --ds-color-danger: ${colorDanger};
        --ds-color-success: ${colorSuccess};
        --ds-color-warning: ${colorWarning};

        /* Colors - Surface */
        --ds-color-surface-subtle: ${colorSurfaceSubtle};
        --ds-color-border: ${colorBorder};
        --ds-color-border-subtle: ${colorBorderSubtle};

        /* Typography */
        --ds-font-family: ${fontFamily};
        --ds-font-size-base: ${fontSizeBase};
        --ds-font-size-small: ${fontSizeSmall};
        --ds-font-size-large: ${fontSizeLarge};
        --ds-font-size-xlarge: ${fontSizeXLarge};
        --ds-font-weight-normal: ${fontWeightNormal};
        --ds-font-weight-medium: ${fontWeightMedium};
        --ds-font-weight-bold: ${fontWeightBold};
        --ds-line-height: ${lineHeight};

        /* Spacing */
        --ds-spacing-unit: ${spacingUnit};
        --ds-spacing-xs: ${spacingXs};
        --ds-spacing-sm: ${spacingSm};
        --ds-spacing-md: ${spacingMd};
        --ds-spacing-lg: ${spacingLg};
        --ds-spacing-xl: ${spacingXl};

        /* Border */
        --ds-border-radius: ${borderRadius};
        --ds-border-radius-small: ${borderRadiusSmall};
        --ds-border-radius-large: ${borderRadiusLarge};
        --ds-border-radius-round: 50%;

        /* Effects */
        --ds-transition-duration: ${transitionDuration};
        --ds-focus-ring: 0 0 0 ${focusRingWidth} ${focusRingColor};

        /* Icon sizes */
        --ds-icon-size: ${iconSize};
        --ds-icon-size-small: ${iconSizeSmall};

        /* Player/media controls */
        --ds-player-button-size: ${playerButtonSize};
        --ds-player-progress-height: ${playerProgressHeight};
        --ds-player-progress-handle-size: ${playerProgressHandleSize};

        /* Indicators */
        --ds-unread-indicator-size: ${unreadIndicatorSize};

        /* Spinner */
        --ds-spinner-size: ${spinnerSize};

        /* Time display */
        --ds-time-display-width: ${timeDisplayWidth};
      }
    `;
  }
}
