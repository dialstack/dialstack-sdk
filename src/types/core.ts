/**
 * Core SDK types for DialStack
 */

import type { AppearanceOptions, UpdateOptions } from './appearance';
import type { ComponentTagName, ComponentElement } from './components';
import type { CallEventMap, CallEventHandler } from './callbacks';

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

  /**
   * Make an authenticated API request to the DialStack API
   *
   * @param path - API path (e.g., '/v1/phone-numbers')
   * @param options - Optional fetch options
   * @returns Promise resolving to the Response
   *
   * @example
   * ```typescript
   * const response = await dialstack.fetchApi('/v1/phone-numbers?limit=1');
   * const data = await response.json();
   * ```
   */
  fetchApi(path: string, options?: RequestInit): Promise<Response>;

  /**
   * Initiate an outbound call from a user to a phone number
   *
   * @param userId - The user initiating the call
   * @param dialString - The phone number or SIP URI to dial
   *
   * @example
   * ```typescript
   * await dialstack.initiateCall('user_01abc...', '+15551234567');
   * ```
   */
  initiateCall(userId: string, dialString: string): Promise<void>;

  /**
   * Subscribe to real-time call events
   *
   * @param event - The event type to listen for
   * @param handler - Callback function called when the event occurs
   *
   * @example
   * ```typescript
   * dialstack.on('call.incoming', (call) => {
   *   console.log('Incoming call from:', call.from_number);
   * });
   * ```
   */
  on<K extends keyof CallEventMap>(
    event: K,
    handler: CallEventHandler<CallEventMap[K]>
  ): void;

  /**
   * Unsubscribe from real-time call events
   *
   * @param event - The event type to stop listening for
   * @param handler - The callback to remove (if omitted, removes all handlers for this event)
   *
   * @example
   * ```typescript
   * dialstack.off('call.incoming', myHandler);
   * ```
   */
  off<K extends keyof CallEventMap>(
    event: K,
    handler?: CallEventHandler<CallEventMap[K]>
  ): void;
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
}
