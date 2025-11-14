/**
 * Core type definitions for the DialStack SDK
 */

/**
 * Component tag names for embedded components
 */
export type ComponentTagName = 'call-logs' | 'voicemails';

/**
 * Appearance options for theming components
 */
export interface AppearanceOptions {
  /**
   * Theme variant
   */
  theme?: 'light' | 'dark' | 'auto';

  /**
   * Custom variables for styling
   */
  variables?: {
    colorPrimary?: string;
    colorBackground?: string;
    colorText?: string;
    colorDanger?: string;
    fontFamily?: string;
    spacingUnit?: string;
    borderRadius?: string;
  };
}

/**
 * Options for updating component appearance
 */
export interface UpdateOptions {
  /**
   * Appearance settings to update
   */
  appearance: AppearanceOptions;
}

/**
 * Initialization parameters for loadDialstackAndInitialize()
 */
export interface DialStackInitParams {
  /**
   * Your DialStack publishable API key (starts with pk_live_ or pk_test_)
   */
  publishableKey: string;

  /**
   * Function that fetches a client secret from your backend
   */
  fetchClientSecret: () => Promise<string>;

  /**
   * Optional appearance configuration
   */
  appearance?: AppearanceOptions;

  /**
   * Optional API endpoint URL (defaults to https://api.dialstack.ai)
   */
  apiUrl?: string;
}

/**
 * Web Component element types
 */
export interface ComponentElement {
  'call-logs': HTMLElement & {
    setInstance: (instance: DialStackInstanceImpl) => void;
  };
  'voicemails': HTMLElement & {
    setInstance: (instance: DialStackInstanceImpl) => void;
  };
}

/**
 * The DialStack SDK instance returned by loadDialstackAndInitialize()
 */
export interface DialStackInstance {
  /**
   * Create a new embedded component
   *
   * @param tagName - The component type to create
   * @returns The component element
   *
   * @example
   * ```typescript
   * const callLogs = dialstack.create('call-logs');
   * document.getElementById('container').appendChild(callLogs);
   * ```
   */
  create<T extends ComponentTagName>(tagName: T): ComponentElement[T];

  /**
   * Update appearance for all components
   *
   * @param updateOptions - The options to update
   *
   * @example
   * ```typescript
   * dialstack.update({
   *   appearance: {
   *     theme: 'dark',
   *     variables: { colorPrimary: '#6772E5' }
   *   }
   * });
   * ```
   */
  update(updateOptions: UpdateOptions): void;

  /**
   * Log out and clean up the session
   *
   * @returns Promise that resolves when logout is complete
   *
   * @example
   * ```typescript
   * await dialstack.logout();
   * ```
   */
  logout(): Promise<void>;
}

/**
 * Internal session data
 */
export interface SessionData {
  /**
   * Client secret token
   */
  clientSecret: string;

  /**
   * Session expiry timestamp
   */
  expiresAt: Date;
}

/**
 * Internal implementation of DialStackInstance (used by components)
 */
export interface DialStackInstanceImpl extends DialStackInstance {
  /**
   * Get current client secret
   */
  getClientSecret(): Promise<string>;

  /**
   * Get current appearance options
   */
  getAppearance(): AppearanceOptions | undefined;

  /**
   * Make authenticated API request
   */
  fetchApi(path: string, options?: RequestInit): Promise<Response>;
}
