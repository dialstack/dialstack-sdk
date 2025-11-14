/**
 * Base component class for DialStack Web Components
 */

import type { DialStackInstanceImpl, AppearanceOptions } from '../core/types';

/**
 * Base class for all DialStack Web Components
 */
export abstract class BaseComponent extends HTMLElement {
  protected instance: DialStackInstanceImpl | null = null;
  protected isInitialized: boolean = false;
  protected appearance: AppearanceOptions | undefined;

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

    // Base colors
    const colors = {
      primary: vars.colorPrimary || '#6772E5',
      background: vars.colorBackground || (theme === 'dark' ? '#1a1a1a' : '#ffffff'),
      text: vars.colorText || (theme === 'dark' ? '#ffffff' : '#1a1a1a'),
      danger: vars.colorDanger || '#e5484d',
    };

    return `
      :host {
        --ds-color-primary: ${colors.primary};
        --ds-color-background: ${colors.background};
        --ds-color-text: ${colors.text};
        --ds-color-danger: ${colors.danger};
        --ds-font-family: ${vars.fontFamily || '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif'};
        --ds-spacing-unit: ${vars.spacingUnit || '8px'};
        --ds-border-radius: ${vars.borderRadius || '4px'};
      }

      * {
        box-sizing: border-box;
        font-family: var(--ds-font-family);
      }
    `;
  }
}
