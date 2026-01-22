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

import * as crypto from 'crypto';
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
  config: AccountConfig;
  created_at: string;
  updated_at: string;
}

export interface AccountConfig {
  /** ISO 3166-1 alpha-2 country code (default: "US") */
  region?: string;
  /** Number of digits for extension numbers, 3-6 (default: 4) */
  extension_length?: number;
  /** Whether calls are recorded and transcribed (default: true) */
  transcription_enabled?: boolean;
  /** IANA timezone (default: "UTC") */
  timezone?: string;
}

export interface AccountCreateParams {
  email?: string;
  config?: AccountConfig;
}

export interface AccountUpdateParams {
  email?: string;
  config?: AccountConfig;
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

export interface PhoneNumber {
  id: string;
  phone_number: string;
  status: 'active' | 'inactive' | 'pending';
  created_at: string;
}

export interface PhoneNumberListParams {
  limit?: number;
  page?: string;
  status?: 'active' | 'inactive' | 'pending';
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

// Transcript types
export type TranscriptStatus = 'pending' | 'processing' | 'completed' | 'failed';

export interface Transcript {
  call_id: string;
  status: TranscriptStatus;
  text: string | null;
}

// Voice App types
export interface VoiceApp {
  id: string;
  name: string;
  url: string;
  status: 'active' | 'inactive';
  secret: string;
  created_at: string;
  updated_at: string;
}

export interface VoiceAppCreateParams {
  name: string;
  url: string;
}

export interface VoiceAppUpdateParams {
  name?: string;
  url?: string;
  status?: 'active' | 'inactive';
}

export interface VoiceAppListParams {
  limit?: number;
  page?: string;
}

// Schedule types
export interface TimeRange {
  /** Day of week (0=Sunday, 6=Saturday) */
  day: number;
  /** Start time in HH:MM format */
  start: string;
  /** End time in HH:MM format */
  end: string;
}

export interface DateRange {
  /** Start date in YYYY-MM-DD format */
  start: string;
  /** End date in YYYY-MM-DD format */
  end: string;
}

export interface Schedule {
  id: string;
  account_id: string;
  name: string;
  timezone: string;
  ranges: TimeRange[];
  holidays: DateRange[];
  created_at: string;
  updated_at: string;
}

export interface ScheduleCreateParams {
  name: string;
  timezone?: string;
  ranges: TimeRange[];
  holidays?: DateRange[];
}

export interface ScheduleListParams {
  limit?: number;
  page?: string;
}

// Dial Plan types
export interface DialPlanNode {
  id: string;
  type: 'schedule' | 'internal_dial';
  position?: { x: number; y: number };
  config: ScheduleNodeConfig | InternalDialNodeConfig;
}

export interface ScheduleNodeConfig {
  schedule_id: string;
  open?: string;
  closed?: string;
  holiday?: string;
}

export interface InternalDialNodeConfig {
  target_id: string;
  timeout?: number;
  next?: string;
}

export interface DialPlan {
  id: string;
  account_id: string;
  name: string;
  entry_node: string;
  nodes: DialPlanNode[];
  created_at: string;
  updated_at: string;
}

export interface DialPlanCreateParams {
  name: string;
  entry_node: string;
  nodes: DialPlanNode[];
}

export interface DialPlanListParams {
  limit?: number;
  page?: string;
}

// Extension types
export type ExtensionStatus = 'active' | 'inactive';

export interface Extension {
  number: string;
  target: string;
  status: ExtensionStatus;
  created_at: string;
  updated_at: string;
}

export interface ExtensionCreateParams {
  number: string;
  target: string;
}

export interface ExtensionUpdateParams {
  target?: string;
}

export interface ExtensionListParams {
  limit?: number;
  target?: string;
  starting_after?: string;
  ending_before?: string;
}

// Call Control types
export interface AttachAction {
  type: 'attach';
  url: string;
}

export interface TransferAction {
  type: 'transfer';
  extension: string;
}

export type CallAction = AttachAction | TransferAction;

export interface CallUpdateParams {
  actions: CallAction[];
}

// Webhook types
export interface WebhookEvent {
  call_id: string;
  account_id: string;
  from_number: string;
  from_name: string | null;
  to_number: string;
}

// Appointments Webhook types
export interface AvailabilitySearchWebhook {
  account_id: string;
  query: {
    filter: {
      start_at_range: {
        start_at: string;
        end_at: string;
      };
    };
  };
}

export interface AvailabilitySlot {
  start_at: string;
  duration_minutes: number;
}

export interface AvailabilitySearchResponse {
  availabilities: AvailabilitySlot[];
}

export type BookingStatus = 'pending' | 'accepted' | 'cancelled' | 'declined' | 'no_show';

export interface CreateBookingWebhook {
  account_id: string;
  idempotency_key: string;
  booking: {
    start_at: string;
    duration_minutes: number;
    customer: {
      phone: string;
      name: string;
      email?: string;
    };
    notes?: string;
  };
}

export interface BookingResponse {
  booking: {
    id: string;
    status: BookingStatus;
    start_at: string;
    end_at: string;
    customer?: {
      phone: string;
      name: string;
    };
    location?: {
      name: string;
      address: string;
    };
    notes?: string;
    created_at?: string;
  };
}

export interface WebhookErrorResponse {
  error: {
    code: string;
    message: string;
  };
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

  paginatedList.autoPagingToArray = async function (options?: { limit?: number }): Promise<T[]> {
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
  private readonly _eventListeners: Map<
    EventType,
    Set<EventCallback<RequestEvent | ResponseEvent>>
  >;

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
        if (error instanceof Error && error.name === 'AbortError' && attempt < maxRetries) {
          await this.sleep(this.getRetryDelay(attempt));
          continue;
        }

        // Network errors - retry
        if (error instanceof TypeError && error.message.includes('fetch') && attempt < maxRetries) {
          await this.sleep(this.getRetryDelay(attempt));
          continue;
        }

        // Other errors - throw
        throw new DialStackConnectionError(`Network error: ${(error as Error).message}`, {
          cause: error as Error,
        });
      }
    }

    if (!response) {
      throw lastError || new DialStackConnectionError('Request failed after retries');
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

      const error = DialStackError.generate(errorMessage, response.status, rawError, requestId);

      // Add retry-after for rate limit errors
      if (error instanceof DialStackRateLimitError) {
        const retryAfter = response.headers.get('Retry-After');
        if (retryAfter) {
          (error as DialStackRateLimitError & { retryAfter: number }).retryAfter = parseInt(
            retryAfter,
            10
          );
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
    const delay = Math.min(INITIAL_RETRY_DELAY_MS * Math.pow(2, attempt), MAX_RETRY_DELAY_MS);
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
    create: (params?: AccountCreateParams, options?: RequestOptions): Promise<Account> => {
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
      return this._request('POST', `/v1/accounts/${accountId}`, params, options);
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

      return createPaginatedList(this._request('GET', path, undefined, options), fetchPage);
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

    retrieve: (accountId: string, userId: string, options?: RequestOptions): Promise<User> => {
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
      return this._request('POST', `/v1/users/${userId}`, params, {
        ...options,
        accountId,
      });
    },

    del: (accountId: string, userId: string, options?: RequestOptions): Promise<void> => {
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

  phoneNumbers = {
    list: (
      accountId: string,
      params?: PhoneNumberListParams,
      options?: RequestOptions
    ): PaginatedList<PhoneNumber> => {
      const queryParams = new URLSearchParams();
      if (params?.limit) queryParams.set('limit', String(params.limit));
      if (params?.page) queryParams.set('page', params.page);
      if (params?.status) queryParams.set('status', params.status);

      const query = queryParams.toString();
      const path = `/v1/phone-numbers${query ? `?${query}` : ''}`;

      const fetchPage = (url: string): Promise<ListResponse<PhoneNumber>> => {
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

  calls = {
    update: (
      accountId: string,
      callId: string,
      params: CallUpdateParams,
      options?: RequestOptions
    ): Promise<void> => {
      return this._request('POST', `/v1/calls/${callId}`, params, {
        ...options,
        accountId,
      });
    },

    retrieveTranscript: (callId: string, options?: RequestOptions): Promise<Transcript> => {
      return this._request('GET', `/v1/calls/${callId}/transcript`, undefined, options);
    },
  };

  voiceApps = {
    create: (
      accountId: string,
      params: VoiceAppCreateParams,
      options?: RequestOptions
    ): Promise<VoiceApp> => {
      return this._request('POST', '/v1/voice_apps', params, {
        ...options,
        accountId,
      });
    },

    retrieve: (
      accountId: string,
      voiceAppId: string,
      options?: RequestOptions
    ): Promise<VoiceApp> => {
      return this._request('GET', `/v1/voice_apps/${voiceAppId}`, undefined, {
        ...options,
        accountId,
      });
    },

    update: (
      accountId: string,
      voiceAppId: string,
      params: VoiceAppUpdateParams,
      options?: RequestOptions
    ): Promise<VoiceApp> => {
      return this._request('POST', `/v1/voice_apps/${voiceAppId}`, params, {
        ...options,
        accountId,
      });
    },

    del: (accountId: string, voiceAppId: string, options?: RequestOptions): Promise<void> => {
      return this._request('DELETE', `/v1/voice_apps/${voiceAppId}`, undefined, {
        ...options,
        accountId,
      });
    },

    list: (
      accountId: string,
      params?: VoiceAppListParams,
      options?: RequestOptions
    ): PaginatedList<VoiceApp> => {
      const queryParams = new URLSearchParams();
      if (params?.limit) queryParams.set('limit', String(params.limit));
      if (params?.page) queryParams.set('page', params.page);

      const query = queryParams.toString();
      const path = `/v1/voice_apps${query ? `?${query}` : ''}`;

      const fetchPage = (url: string): Promise<ListResponse<VoiceApp>> => {
        return this._request('GET', url, undefined, { ...options, accountId });
      };

      return createPaginatedList(
        this._request('GET', path, undefined, { ...options, accountId }),
        fetchPage
      );
    },
  };

  schedules = {
    create: (
      accountId: string,
      params: ScheduleCreateParams,
      options?: RequestOptions
    ): Promise<Schedule> => {
      return this._request('POST', '/v1/schedules', params, {
        ...options,
        accountId,
      });
    },

    retrieve: (
      accountId: string,
      scheduleId: string,
      options?: RequestOptions
    ): Promise<Schedule> => {
      return this._request('GET', `/v1/schedules/${scheduleId}`, undefined, {
        ...options,
        accountId,
      });
    },

    list: (
      accountId: string,
      params?: ScheduleListParams,
      options?: RequestOptions
    ): PaginatedList<Schedule> => {
      const queryParams = new URLSearchParams();
      if (params?.limit) queryParams.set('limit', String(params.limit));
      if (params?.page) queryParams.set('page', params.page);

      const query = queryParams.toString();
      const path = `/v1/schedules${query ? `?${query}` : ''}`;

      const fetchPage = (url: string): Promise<ListResponse<Schedule>> => {
        return this._request('GET', url, undefined, { ...options, accountId });
      };

      return createPaginatedList(
        this._request('GET', path, undefined, { ...options, accountId }),
        fetchPage
      );
    },
  };

  dialPlans = {
    create: (
      accountId: string,
      params: DialPlanCreateParams,
      options?: RequestOptions
    ): Promise<DialPlan> => {
      return this._request('POST', '/v1/dialplans', params, {
        ...options,
        accountId,
      });
    },

    retrieve: (
      accountId: string,
      dialPlanId: string,
      options?: RequestOptions
    ): Promise<DialPlan> => {
      return this._request('GET', `/v1/dialplans/${dialPlanId}`, undefined, {
        ...options,
        accountId,
      });
    },

    list: (
      accountId: string,
      params?: DialPlanListParams,
      options?: RequestOptions
    ): PaginatedList<DialPlan> => {
      const queryParams = new URLSearchParams();
      if (params?.limit) queryParams.set('limit', String(params.limit));
      if (params?.page) queryParams.set('page', params.page);

      const query = queryParams.toString();
      const path = `/v1/dialplans${query ? `?${query}` : ''}`;

      const fetchPage = (url: string): Promise<ListResponse<DialPlan>> => {
        return this._request('GET', url, undefined, { ...options, accountId });
      };

      return createPaginatedList(
        this._request('GET', path, undefined, { ...options, accountId }),
        fetchPage
      );
    },
  };

  extensions = {
    create: (
      accountId: string,
      params: ExtensionCreateParams,
      options?: RequestOptions
    ): Promise<Extension> => {
      return this._request('POST', '/v1/extensions', params, {
        ...options,
        accountId,
      });
    },

    retrieve: (accountId: string, number: string, options?: RequestOptions): Promise<Extension> => {
      return this._request('GET', `/v1/extensions/${number}`, undefined, {
        ...options,
        accountId,
      });
    },

    update: (
      accountId: string,
      number: string,
      params: ExtensionUpdateParams,
      options?: RequestOptions
    ): Promise<Extension> => {
      return this._request('POST', `/v1/extensions/${number}`, params, {
        ...options,
        accountId,
      });
    },

    del: (accountId: string, number: string, options?: RequestOptions): Promise<void> => {
      return this._request('DELETE', `/v1/extensions/${number}`, undefined, {
        ...options,
        accountId,
      });
    },

    list: (
      accountId: string,
      params?: ExtensionListParams,
      options?: RequestOptions
    ): PaginatedList<Extension> => {
      const queryParams = new URLSearchParams();
      if (params?.limit) queryParams.set('limit', String(params.limit));
      if (params?.target) queryParams.set('target', params.target);
      if (params?.starting_after) queryParams.set('starting_after', params.starting_after);
      if (params?.ending_before) queryParams.set('ending_before', params.ending_before);

      const query = queryParams.toString();
      const path = `/v1/extensions${query ? `?${query}` : ''}`;

      const fetchPage = (url: string): Promise<ListResponse<Extension>> => {
        return this._request('GET', url, undefined, { ...options, accountId });
      };

      return createPaginatedList(
        this._request('GET', path, undefined, { ...options, accountId }),
        fetchPage
      );
    },
  };

  // ==========================================================================
  // Webhooks
  // ==========================================================================

  /**
   * Verify webhook signature and construct event
   *
   * @example
   * ```typescript
   * // For call webhooks
   * const event = DialStack.webhooks.constructEvent(
   *   req.body,
   *   req.headers['x-dialstack-signature'],
   *   process.env.DIALSTACK_WEBHOOK_SECRET
   * );
   *
   * // For appointments webhooks (with type parameter)
   * const event = DialStack.webhooks.constructEvent<AvailabilitySearchWebhook>(
   *   req.body,
   *   req.headers['x-dialstack-signature'],
   *   process.env.DIALSTACK_WEBHOOK_SECRET
   * );
   * ```
   */
  static webhooks = {
    constructEvent: <T = WebhookEvent>(
      payload: string | Buffer,
      signature: string,
      secret: string,
      tolerance: number = 300
    ): T => {
      const payloadString = typeof payload === 'string' ? payload : payload.toString('utf8');

      // Parse signature header: t=timestamp,v1=signature
      const parts = signature.split(',');
      const timestampPart = parts.find((p) => p.startsWith('t='));
      const signaturePart = parts.find((p) => p.startsWith('v1='));

      if (!timestampPart || !signaturePart) {
        throw new DialStackError('Invalid signature format', {
          statusCode: 400,
          type: 'invalid_request_error',
        });
      }

      const timestamp = parseInt(timestampPart.substring(2), 10);
      const expectedSignature = signaturePart.substring(3);

      // Check timestamp tolerance
      const now = Math.floor(Date.now() / 1000);
      if (Math.abs(now - timestamp) > tolerance) {
        throw new DialStackError('Webhook timestamp outside tolerance', {
          statusCode: 400,
          type: 'invalid_request_error',
        });
      }

      // Compute expected signature
      const signedPayload = `${timestamp}.${payloadString}`;
      const computedSignature = crypto
        .createHmac('sha256', secret)
        .update(signedPayload)
        .digest('hex');

      // Constant-time comparison
      if (!crypto.timingSafeEqual(Buffer.from(computedSignature), Buffer.from(expectedSignature))) {
        throw new DialStackError('Webhook signature verification failed', {
          statusCode: 400,
          type: 'invalid_request_error',
        });
      }

      return JSON.parse(payloadString) as T;
    },
  };
}

// Re-export MediaStream for WebSocket handling
export { MediaStream } from './media-stream';
export type {
  WebSocketLike,
  AudioFormat,
  MediaStreamBeginEvent,
  MediaStreamAudioEvent,
  MediaStreamMessage,
  MediaStreamEvents,
} from './media-stream';
