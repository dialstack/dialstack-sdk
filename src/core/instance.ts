/**
 * DialStack SDK instance management
 */

import type {
  DialStackInitParams,
  DialStackInstanceImpl,
  SessionData,
  UpdateOptions,
  AppearanceOptions,
  ComponentTagName,
  ComponentElement,
  ClientSecretResponse,
} from './types';

const DEFAULT_API_URL = 'https://api.dialstack.ai';
const DEFAULT_SESSION_DURATION_MS = 60 * 60 * 1000; // 1 hour default
const SESSION_REFRESH_BUFFER_MS = 5 * 60 * 1000; // Refresh 5 minutes before expiry
const MIN_REFRESH_INTERVAL_MS = 30 * 1000; // Minimum 30 seconds between refreshes
const SESSION_RETRY_INTERVAL_MS = 1 * 60 * 1000; // 1 minute retry on error

/**
 * Internal implementation of DialStack SDK instance
 */
export class DialStackInstanceImplClass implements DialStackInstanceImpl {
  private publishableKey: string;
  private apiUrl: string;
  private fetchClientSecretFn: () => Promise<ClientSecretResponse>;
  private appearance: AppearanceOptions | undefined;
  private sessionData: SessionData | null = null;
  private sessionPromise: Promise<SessionData> | null = null;
  private refreshTimeoutId: ReturnType<typeof setTimeout> | null = null;
  private components: Set<HTMLElement> = new Set();

  constructor(params: DialStackInitParams) {
    this.publishableKey = params.publishableKey;
    this.apiUrl = params.apiUrl || DEFAULT_API_URL;
    this.fetchClientSecretFn = params.fetchClientSecret;
    this.appearance = params.appearance;

    // Validate publishable key
    if (!this.publishableKey) {
      throw new Error('DialStack: publishableKey is required');
    }
    if (
      !this.publishableKey.startsWith('pk_live_') &&
      !this.publishableKey.startsWith('pk_test_')
    ) {
      throw new Error('DialStack: publishableKey must start with pk_live_ or pk_test_');
    }
  }

  /**
   * Start session management (called by initialize)
   */
  async startSession(): Promise<void> {
    await this.refreshSession();
  }

  /**
   * Parse client secret response (handles both string and object formats)
   */
  private parseClientSecretResponse(response: ClientSecretResponse): {
    clientSecret: string;
    expiresAt: Date;
  } {
    if (typeof response === 'string') {
      // Legacy format: just a string, use default expiry
      return {
        clientSecret: response,
        expiresAt: new Date(Date.now() + DEFAULT_SESSION_DURATION_MS),
      };
    }

    // Object format with optional expiry
    const { clientSecret, expiresAt } = response;

    if (!clientSecret || typeof clientSecret !== 'string') {
      throw new Error('DialStack: clientSecret must be a valid string');
    }

    let parsedExpiresAt: Date;
    if (expiresAt) {
      parsedExpiresAt = new Date(expiresAt);
      if (isNaN(parsedExpiresAt.getTime())) {
        console.warn('DialStack: Invalid expiresAt format, using default duration');
        parsedExpiresAt = new Date(Date.now() + DEFAULT_SESSION_DURATION_MS);
      }
    } else {
      parsedExpiresAt = new Date(Date.now() + DEFAULT_SESSION_DURATION_MS);
    }

    return { clientSecret, expiresAt: parsedExpiresAt };
  }

  /**
   * Calculate optimal refresh interval based on expiry
   */
  private calculateRefreshInterval(expiresAt: Date): number {
    const now = Date.now();
    const expiryTime = expiresAt.getTime();
    const timeUntilExpiry = expiryTime - now;

    // Refresh before expiry (with buffer)
    const refreshIn = timeUntilExpiry - SESSION_REFRESH_BUFFER_MS;

    // Ensure minimum interval
    return Math.max(refreshIn, MIN_REFRESH_INTERVAL_MS);
  }

  /**
   * Refresh the session
   */
  private async refreshSession(): Promise<void> {
    try {
      const response = await this.fetchClientSecretFn();

      if (!response) {
        throw new Error('DialStack: fetchClientSecret must return a valid response');
      }

      const { clientSecret, expiresAt } = this.parseClientSecretResponse(response);

      this.sessionData = {
        clientSecret,
        expiresAt,
      };

      // Schedule next refresh based on actual expiry
      const refreshInterval = this.calculateRefreshInterval(expiresAt);
      this.scheduleRefresh(refreshInterval);
    } catch (error) {
      console.error('DialStack: Failed to refresh session, retrying in 1 minute:', error);
      // Retry in 1 minute
      this.scheduleRefresh(SESSION_RETRY_INTERVAL_MS);
    }
  }

  /**
   * Schedule session refresh
   */
  private scheduleRefresh(delayMs: number): void {
    if (this.refreshTimeoutId) {
      clearTimeout(this.refreshTimeoutId);
    }

    this.refreshTimeoutId = setTimeout(() => {
      this.refreshSession();
    }, delayMs);
  }

  /**
   * Get current client secret (waits for session if needed)
   */
  async getClientSecret(): Promise<string> {
    if (this.sessionData) {
      return this.sessionData.clientSecret;
    }

    // Wait for session to be established
    if (!this.sessionPromise) {
      this.sessionPromise = this.startSession().then(() => {
        if (!this.sessionData) {
          throw new Error('DialStack: Failed to establish session');
        }
        return this.sessionData;
      });
    }

    const session = await this.sessionPromise;
    return session.clientSecret;
  }

  /**
   * Get current appearance options
   */
  getAppearance(): AppearanceOptions | undefined {
    return this.appearance;
  }

  /**
   * Make authenticated API request
   */
  async fetchApi(path: string, options: RequestInit = {}): Promise<Response> {
    const clientSecret = await this.getClientSecret();

    const headers = new Headers(options.headers);
    headers.set('Authorization', `Bearer ${clientSecret}`);
    headers.set('Content-Type', 'application/json');

    return fetch(`${this.apiUrl}${path}`, {
      ...options,
      headers,
    });
  }

  /**
   * Create a new component
   */
  create<T extends ComponentTagName>(tagName: T): ComponentElement[T] {
    const htmlName = `dialstack-${tagName}`;
    const element = document.createElement(htmlName) as ComponentElement[T];

    // Set instance on the component (will be queued if not ready)
    if ('setInstance' in element && typeof element.setInstance === 'function') {
      // Queue the setInstance call until session is ready
      this.getClientSecret().then(() => {
        element.setInstance(this);
      });
    }

    this.components.add(element);
    return element;
  }

  /**
   * Update appearance for all components
   */
  update(updateOptions: UpdateOptions): void {
    this.appearance = updateOptions.appearance;

    // Dispatch custom event to all components
    this.components.forEach((component) => {
      component.dispatchEvent(
        new CustomEvent('dialstack-appearance-update', {
          detail: { appearance: this.appearance },
        })
      );
    });
  }

  /**
   * Log out and clean up
   */
  async logout(): Promise<void> {
    // Clear session data
    this.sessionData = null;
    this.sessionPromise = null;

    // Clear refresh timeout
    if (this.refreshTimeoutId) {
      clearTimeout(this.refreshTimeoutId);
      this.refreshTimeoutId = null;
    }

    // Dispatch logout event to all components
    this.components.forEach((component) => {
      component.dispatchEvent(new CustomEvent('dialstack-logout'));
    });

    // Clear components list
    this.components.clear();
  }
}
