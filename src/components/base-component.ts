/**
 * Base component class for DialStack Web Components
 */

import type {
  DialStackInstanceImpl,
  AppearanceOptions,
  FormattingOptions,
  LoaderStart,
  LoadError,
} from '../core/types';
import { type Locale, defaultLocale } from '../locales';

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
   */
  protected applyAppearanceStyles(): string {
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

    return `
      :host {
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

      * {
        box-sizing: border-box;
        font-family: var(--ds-font-family);
      }

      :focus-visible {
        outline: none;
        box-shadow: var(--ds-focus-ring);
      }
    `;
  }
}
