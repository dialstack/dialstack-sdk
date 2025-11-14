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
} from './types';

const DEFAULT_API_URL = 'https://api.dialstack.ai';
const SESSION_REFRESH_INTERVAL_MS = 50 * 60 * 1000; // 50 minutes
const SESSION_RETRY_INTERVAL_MS = 1 * 60 * 1000; // 1 minute

/**
 * Internal implementation of DialStack SDK instance
 */
export class DialStackInstanceImplClass implements DialStackInstanceImpl {
  private publishableKey: string;
  private apiUrl: string;
  private fetchClientSecretFn: () => Promise<string>;
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
   * Refresh the session
   */
  private async refreshSession(): Promise<void> {
    try {
      const clientSecret = await this.fetchClientSecretFn();

      if (!clientSecret || typeof clientSecret !== 'string') {
        throw new Error('DialStack: fetchClientSecret must return a valid string');
      }

      // Parse expiry from client secret or set default (1 hour from now)
      const expiresAt = new Date(Date.now() + 60 * 60 * 1000);

      this.sessionData = {
        clientSecret,
        expiresAt,
      };

      // Schedule next refresh at 50 minutes
      this.scheduleRefresh(SESSION_REFRESH_INTERVAL_MS);
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
