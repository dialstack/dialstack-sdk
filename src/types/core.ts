/**
 * Core SDK types for DialStack
 */

import type { AppearanceOptions, UpdateOptions } from './appearance';
import type { ComponentTagName, ComponentElement } from './components';

/**
 * Client secret response from fetchClientSecret
 * Can be either a string (for backward compatibility) or an object with expiry info
 */
export type ClientSecretResponse =
  | string
  | {
      clientSecret: string;
      /**
       * ISO 8601 datetime string when the session expires
       */
      expiresAt?: string;
    };

/**
 * Initialization parameters for loadDialstackAndInitialize()
 */
export interface DialStackInitParams {
  /**
   * Your DialStack publishable API key (starts with pk_live_ or pk_test_)
   */
  publishableKey: string;

  /**
   * Function that fetches a client secret from your backend.
   *
   * Can return either:
   * - A string (the client secret)
   * - An object with `clientSecret` and optional `expiresAt` for optimal refresh scheduling
   *
   * @example
   * ```typescript
   * // Simple: just return the secret
   * fetchClientSecret: async () => {
   *   const res = await fetch('/api/dialstack/session');
   *   const { client_secret } = await res.json();
   *   return client_secret;
   * }
   *
   * // Recommended: return with expiry for optimal refresh
   * fetchClientSecret: async () => {
   *   const res = await fetch('/api/dialstack/session');
   *   const { client_secret, expires_at } = await res.json();
   *   return { clientSecret: client_secret, expiresAt: expires_at };
   * }
   * ```
   */
  fetchClientSecret: () => Promise<ClientSecretResponse>;

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
