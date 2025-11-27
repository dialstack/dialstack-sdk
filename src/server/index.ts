/**
 * DialStack Server SDK
 *
 * Node.js SDK for server-side DialStack API interactions.
 * Keep your API key secure - never expose it in client-side code.
 *
 * @example
 * ```typescript
 * import { DialStack } from '@dialstack/sdk/server';
 *
 * const dialstack = new DialStack(process.env.DIALSTACK_API_KEY);
 *
 * // Create an account
 * const account = await dialstack.accounts.create({ email: 'test@example.com' });
 *
 * // Create a session for embedded components
 * const session = await dialstack.accountSessions.create({
 *   account: account.id,
 * });
 *
 * // List with auto-pagination
 * for await (const account of dialstack.accounts.list().autoPagingEach()) {
 *   console.log(account.id);
 * }
 * ```
 */

// Injected at build time by Rollup
declare const _NPM_PACKAGE_VERSION_: string;

import {
  DialStackError,
  DialStackConnectionError,
  DialStackRateLimitError,
  type RawError,
} from './errors';

// Re-export error classes for consumers
export {
  DialStackError,
  DialStackAuthenticationError,
  DialStackPermissionError,
  DialStackNotFoundError,
  DialStackConflictError,
  DialStackValidationError,
  DialStackInvalidRequestError,
  DialStackRateLimitError,
  DialStackAPIError,
  DialStackConnectionError,
} from './errors';

// ============================================================================
// Types
// ============================================================================

const DEFAULT_API_URL = 'https://api.dialstack.ai';
const DEFAULT_TIMEOUT = 80000; // 80 seconds
const MAX_NETWORK_RETRIES = 2;
const INITIAL_RETRY_DELAY_MS = 500;
const MAX_RETRY_DELAY_MS = 5000;

export interface DialStackConfig {
  /** Base URL for API requests (default: https://api.dialstack.ai) */
  apiUrl?: string;
  /** Request timeout in milliseconds (default: 80000) */
  timeout?: number;
  /** Maximum number of retries for failed requests (default: 2) */
  maxNetworkRetries?: number;
  /** Enable telemetry (default: true) */
  telemetry?: boolean;
  /** Application info for user-agent */
  appInfo?: AppInfo;
}

export interface AppInfo {
  name: string;
  version?: string;
  url?: string;
}

export interface RequestOptions {
  /** Idempotency key for safe retries */
  idempotencyKey?: string;
  /** Request timeout override in milliseconds */
  timeout?: number;
  /** Max retries override for this request */
  maxNetworkRetries?: number;
  /** Account ID for multi-tenant requests */
  accountId?: string;
}

export interface RequestEvent {
  method: string;
  path: string;
  accountId?: string;
  idempotencyKey?: string;
  requestStartTime: number;
}

export interface ResponseEvent {
  method: string;
  path: string;
  statusCode: number;
  requestId?: string;
  accountId?: string;
  elapsed: number;
}

type EventType = 'request' | 'response';
type EventCallback<T> = (event: T) => void;

// ============================================================================
// API Types
// ============================================================================

export interface Account {
  id: string;
  email: string | null;
  created_at: string;
  updated_at: string;
}

export interface AccountCreateParams {
  email?: string;
}

export interface AccountUpdateParams {
  email?: string;
}

export interface AccountListParams {
  limit?: number;
  page?: string;
}

export interface User {
  id: string;
  account_id: string;
  name: string | null;
  email: string | null;
  created_at: string;
  updated_at: string;
}

export interface UserCreateParams {
  name?: string;
  email?: string;
}

export interface UserUpdateParams {
  name?: string;
  email?: string;
}

export interface UserListParams {
  limit?: number;
  page?: string;
}

export interface AccountSessionCreateParams {
  account: string;
  /** Components to enable for this session */
  components?: {
    call_logs?: { enabled: boolean };
    voicemails?: { enabled: boolean };
  };
}

export interface AccountSessionCreateResponse {
  client_secret: string;
  expires_at: string;
}

interface ListResponse<T> {
  object: string;
  url: string;
  next_page_url: string | null;
  previous_page_url: string | null;
  data: T[];
}

// ============================================================================
// Auto-Pagination Iterator
// ============================================================================

export interface PaginatedList<T> extends Promise<ListResponse<T>> {
  autoPagingEach(): AsyncIterableIterator<T>;
  autoPagingToArray(options?: { limit?: number }): Promise<T[]>;
}

function createPaginatedList<T>(
  firstPagePromise: Promise<ListResponse<T>>,
  fetchNextPage: (url: string) => Promise<ListResponse<T>>
): PaginatedList<T> {
  const paginatedList = firstPagePromise as PaginatedList<T>;

  paginatedList.autoPagingEach = async function* (): AsyncIterableIterator<T> {
    let response = await firstPagePromise;

    for (const item of response.data) {
      yield item;
    }

    while (response.next_page_url) {
      response = await fetchNextPage(response.next_page_url);
      for (const item of response.data) {
        yield item;
      }
    }
  };

  paginatedList.autoPagingToArray = async function (options?: {
    limit?: number;
  }): Promise<T[]> {
    const limit = options?.limit ?? 10000;
    const results: T[] = [];

    for await (const item of this.autoPagingEach()) {
      results.push(item);
      if (results.length >= limit) {
        break;
      }
    }

    return results;
  };

  return paginatedList;
}

// ============================================================================
// DialStack Client
// ============================================================================

export class DialStack {
  private readonly _apiKey: string;
  private readonly _apiUrl: string;
  private readonly _timeout: number;
  private readonly _maxNetworkRetries: number;
  private readonly _appInfo?: AppInfo;
  private readonly _eventListeners: Map<EventType, Set<EventCallback<RequestEvent | ResponseEvent>>>;

  constructor(apiKey: string | undefined, config?: DialStackConfig) {
    if (!apiKey) {
      throw new DialStackError(
        'No API key provided. Set your API key when constructing the DialStack client.',
        { statusCode: 0, type: 'authentication_error' }
      );
    }

    this._apiKey = apiKey;
    this._apiUrl = config?.apiUrl || DEFAULT_API_URL;
    this._timeout = config?.timeout || DEFAULT_TIMEOUT;
    this._maxNetworkRetries = config?.maxNetworkRetries ?? MAX_NETWORK_RETRIES;
    this._appInfo = config?.appInfo;
    this._eventListeners = new Map();
  }

  // ==========================================================================
  // Event Emitter
  // ==========================================================================

  /**
   * Subscribe to SDK events
   *
   * @example
   * ```typescript
   * dialstack.on('request', (event) => {
   *   console.log(`${event.method} ${event.path}`);
   * });
   *
   * dialstack.on('response', (event) => {
   *   console.log(`${event.statusCode} in ${event.elapsed}ms`);
   * });
   * ```
   */
  on<E extends EventType>(
    event: E,
    callback: EventCallback<E extends 'request' ? RequestEvent : ResponseEvent>
  ): void {
    if (!this._eventListeners.has(event)) {
      this._eventListeners.set(event, new Set());
    }
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    this._eventListeners.get(event)!.add(callback as any);
  }

  /**
   * Unsubscribe from SDK events
   */
  off<E extends EventType>(
    event: E,
    callback: EventCallback<E extends 'request' ? RequestEvent : ResponseEvent>
  ): void {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    this._eventListeners.get(event)?.delete(callback as any);
  }

  private emit(event: EventType, data: RequestEvent | ResponseEvent): void {
    this._eventListeners.get(event)?.forEach((cb) => cb(data));
  }

  // ==========================================================================
  // Request Handling
  // ==========================================================================

  private getUserAgent(): string {
    const parts = [`dialstack-node/${_NPM_PACKAGE_VERSION_}`];
    if (this._appInfo) {
      parts.push(`${this._appInfo.name}/${this._appInfo.version || '0.0.0'}`);
    }
    return parts.join(' ');
  }

  private async _request<T = unknown>(
    method: string,
    path: string,
    body?: unknown,
    options?: RequestOptions
  ): Promise<T> {
    const url = `${this._apiUrl}${path}`;
    const timeout = options?.timeout ?? this._timeout;
    const maxRetries = options?.maxNetworkRetries ?? this._maxNetworkRetries;

    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${this._apiKey}`,
      'User-Agent': this.getUserAgent(),
    };

    if (options?.idempotencyKey) {
      headers['Idempotency-Key'] = options.idempotencyKey;
    }

    if (options?.accountId) {
      headers['DialStack-Account'] = options.accountId;
    }

    const requestStartTime = Date.now();

    // Emit request event
    this.emit('request', {
      method,
      path,
      accountId: options?.accountId,
      idempotencyKey: options?.idempotencyKey,
      requestStartTime,
    });

    let lastError: Error | null = null;
    let response: Response | null = null;

    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), timeout);

        try {
          response = await fetch(url, {
            method,
            headers,
            body: body ? JSON.stringify(body) : undefined,
            signal: controller.signal,
          });
        } finally {
          clearTimeout(timeoutId);
        }

        // Don't retry on client errors (4xx) except rate limits
        if (response.status < 500 && response.status !== 429) {
          break;
        }

        // Rate limit - check for Retry-After header
        if (response.status === 429) {
          const retryAfter = response.headers.get('Retry-After');
          if (retryAfter && attempt < maxRetries) {
            const delayMs = parseInt(retryAfter, 10) * 1000;
            await this.sleep(Math.min(delayMs, MAX_RETRY_DELAY_MS));
            continue;
          }
          break;
        }

        // Server error - retry with backoff
        if (attempt < maxRetries) {
          await this.sleep(this.getRetryDelay(attempt));
        }
      } catch (error) {
        lastError = error as Error;

        // Abort errors (timeout) - retry
        if (
          error instanceof Error &&
          error.name === 'AbortError' &&
          attempt < maxRetries
        ) {
          await this.sleep(this.getRetryDelay(attempt));
          continue;
        }

        // Network errors - retry
        if (
          error instanceof TypeError &&
          error.message.includes('fetch') &&
          attempt < maxRetries
        ) {
          await this.sleep(this.getRetryDelay(attempt));
          continue;
        }

        // Other errors - throw
        throw new DialStackConnectionError(
          `Network error: ${(error as Error).message}`,
          { cause: error as Error }
        );
      }
    }

    if (!response) {
      throw (
        lastError ||
        new DialStackConnectionError('Request failed after retries')
      );
    }

    const elapsed = Date.now() - requestStartTime;
    const requestId = response.headers.get('X-Request-Id') || undefined;

    // Emit response event
    this.emit('response', {
      method,
      path,
      statusCode: response.status,
      requestId,
      accountId: options?.accountId,
      elapsed,
    });

    // Handle errors
    if (!response.ok) {
      let rawError: RawError | undefined;
      let errorMessage = response.statusText;

      try {
        const errorData = await response.json();
        rawError = errorData.error || errorData;
        errorMessage = rawError?.message || errorMessage;
      } catch {
        // Use statusText if we can't parse error
      }

      const error = DialStackError.generate(
        errorMessage,
        response.status,
        rawError,
        requestId
      );

      // Add retry-after for rate limit errors
      if (error instanceof DialStackRateLimitError) {
        const retryAfter = response.headers.get('Retry-After');
        if (retryAfter) {
          (error as DialStackRateLimitError & { retryAfter: number }).retryAfter =
            parseInt(retryAfter, 10);
        }
      }

      throw error;
    }

    // Handle 204 No Content
    if (response.status === 204) {
      return undefined as T;
    }

    return (await response.json()) as T;
  }

  private getRetryDelay(attempt: number): number {
    // Exponential backoff with jitter
    const delay = Math.min(
      INITIAL_RETRY_DELAY_MS * Math.pow(2, attempt),
      MAX_RETRY_DELAY_MS
    );
    // Add jitter (0-25% of delay)
    return delay + Math.random() * delay * 0.25;
  }

  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  // ==========================================================================
  // Resources
  // ==========================================================================

  accounts = {
    create: (
      params?: AccountCreateParams,
      options?: RequestOptions
    ): Promise<Account> => {
      return this._request('POST', '/v1/accounts', params || {}, options);
    },

    retrieve: (accountId: string, options?: RequestOptions): Promise<Account> => {
      return this._request('GET', `/v1/accounts/${accountId}`, undefined, options);
    },

    update: (
      accountId: string,
      params: AccountUpdateParams,
      options?: RequestOptions
    ): Promise<Account> => {
      return this._request('PUT', `/v1/accounts/${accountId}`, params, options);
    },

    del: (accountId: string, options?: RequestOptions): Promise<void> => {
      return this._request('DELETE', `/v1/accounts/${accountId}`, undefined, options);
    },

    list: (params?: AccountListParams, options?: RequestOptions): PaginatedList<Account> => {
      const queryParams = new URLSearchParams();
      if (params?.limit) queryParams.set('limit', String(params.limit));
      if (params?.page) queryParams.set('page', params.page);

      const query = queryParams.toString();
      const path = `/v1/accounts${query ? `?${query}` : ''}`;

      const fetchPage = (url: string): Promise<ListResponse<Account>> => {
        return this._request('GET', url, undefined, options);
      };

      return createPaginatedList(
        this._request('GET', path, undefined, options),
        fetchPage
      );
    },
  };

  users = {
    create: (
      accountId: string,
      params?: UserCreateParams,
      options?: RequestOptions
    ): Promise<User> => {
      return this._request('POST', '/v1/users', params || {}, {
        ...options,
        accountId,
      });
    },

    retrieve: (
      accountId: string,
      userId: string,
      options?: RequestOptions
    ): Promise<User> => {
      return this._request('GET', `/v1/users/${userId}`, undefined, {
        ...options,
        accountId,
      });
    },

    update: (
      accountId: string,
      userId: string,
      params: UserUpdateParams,
      options?: RequestOptions
    ): Promise<User> => {
      return this._request('PUT', `/v1/users/${userId}`, params, {
        ...options,
        accountId,
      });
    },

    del: (
      accountId: string,
      userId: string,
      options?: RequestOptions
    ): Promise<void> => {
      return this._request('DELETE', `/v1/users/${userId}`, undefined, {
        ...options,
        accountId,
      });
    },

    list: (
      accountId: string,
      params?: UserListParams,
      options?: RequestOptions
    ): PaginatedList<User> => {
      const queryParams = new URLSearchParams();
      if (params?.limit) queryParams.set('limit', String(params.limit));
      if (params?.page) queryParams.set('page', params.page);

      const query = queryParams.toString();
      const path = `/v1/users${query ? `?${query}` : ''}`;

      const fetchPage = (url: string): Promise<ListResponse<User>> => {
        return this._request('GET', url, undefined, { ...options, accountId });
      };

      return createPaginatedList(
        this._request('GET', path, undefined, { ...options, accountId }),
        fetchPage
      );
    },
  };

  accountSessions = {
    create: (
      params: AccountSessionCreateParams,
      options?: RequestOptions
    ): Promise<AccountSessionCreateResponse> => {
      return this._request('POST', '/v1/account_sessions', params, options);
    },
  };

  /**
   * @deprecated Use `accountSessions` instead
   */
  sessions = this.accountSessions;
}
