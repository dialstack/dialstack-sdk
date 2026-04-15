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
  CallEventMap,
  CallEventHandler,
  IncomingCallEvent,
  CallLog,
  Transcript,
  VoicemailTranscript,
  Extension,
  ExtensionListResponse,
  SearchAvailableNumbersOptions,
  AvailablePhoneNumber,
  NumberOrder,
  PaginatedResponse,
  DIDItem,
  UpdatePhoneNumberRequest,
  DeviceLine,
  Device,
  ProvisionedDevice,
  CreateDeskphoneRequest,
  UpdateDeskphoneRequest,
  CreateDeskphoneLineRequest,
  UpdateDeskphoneLineRequest,
  DeviceListOptions,
  ProvisioningEvent,
  ProvisioningEventListOptions,
  DECTBase,
  DECTHandset,
  DECTExtension,
  CreateDECTBaseRequest,
  UpdateDECTBaseRequest,
  CreateDECTHandsetRequest,
  UpdateDECTHandsetRequest,
  CreateDECTExtensionRequest,
  PortOrder,
  CreatePortOrderRequest,
  ApprovePortOrderRequest,
  PortEligibilityResult,
  Account,
  UpdateAccountRequest,
  OnboardingUser,
  CreateUserRequest,
  CreateExtensionRequest,
  AddressSuggestion,
  ResolvedAddress,
  OnboardingLocation,
  CreateLocationRequest,
  UpdateLocationRequest,
  OnboardingEndpoint,
  CreateEndpointRequest,
  E911ValidationResult,
  NamedResource,
} from '../types';
import type { DialPlan as DialPlanData } from '../types/dial-plan';

/**
 * Error thrown by SDK API calls, carrying the HTTP status code.
 */
export class ApiError extends Error {
  constructor(
    message: string,
    public readonly status: number
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

const DEFAULT_API_URL = 'https://api.dialstack.ai';
const DEFAULT_SESSION_DURATION_MS = 60 * 60 * 1000; // 1 hour default
const SESSION_REFRESH_BUFFER_MS = 5 * 60 * 1000; // Refresh 5 minutes before expiry
const MIN_REFRESH_INTERVAL_MS = 30 * 1000; // Minimum 30 seconds between refreshes
const SESSION_RETRY_INTERVAL_MS = 1 * 60 * 1000; // 1 minute retry on error

export type RoutingTargetType =
  | 'user'
  | 'dial_plan'
  | 'voice_app'
  | 'ring_group'
  | 'shared_voicemail';

/** Canonical mapping from TypeID prefix to API path and routing target type. */
export const ROUTING_TARGET_TYPES: Record<string, { path: string; type: RoutingTargetType }> = {
  user: { path: '/v1/users', type: 'user' },
  dp: { path: '/v1/dialplans', type: 'dial_plan' },
  va: { path: '/v1/voice-apps', type: 'voice_app' },
  rg: { path: '/v1/ring_groups', type: 'ring_group' },
  svm: { path: '/v1/shared_voicemail_boxes', type: 'shared_voicemail' },
} as const;

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
  private cachedAccountId: string | null = null;
  private refreshTimeoutId: ReturnType<typeof setTimeout> | null = null;
  private components: Set<HTMLElement> = new Set();

  // Event handling
  private eventListeners: Map<keyof CallEventMap, Set<CallEventHandler<unknown>>> = new Map();
  private eventStreamController: AbortController | null = null;
  private reconnectTimeoutId: ReturnType<typeof setTimeout> | null = null;
  private routingTargetCache = new Map<
    string,
    Promise<{
      id: string;
      name: string | null;
      type: RoutingTargetType;
    } | null>
  >();
  private reconnectAttempts = 0;

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
    accountId: string | null;
  } {
    if (typeof response === 'string') {
      // Simple format: just the client secret string, use default expiry
      return {
        clientSecret: response,
        expiresAt: new Date(Date.now() + DEFAULT_SESSION_DURATION_MS),
        accountId: null,
      };
    }

    const responseObj = response as Record<string, unknown>;
    const clientSecret = responseObj.clientSecret ?? responseObj.client_secret;
    const expiresAtRaw =
      typeof responseObj.expiresAt === 'string'
        ? responseObj.expiresAt
        : typeof responseObj.expires_at === 'string'
          ? responseObj.expires_at
          : undefined;
    const accountIdRaw =
      typeof responseObj.accountId === 'string'
        ? responseObj.accountId
        : typeof responseObj.account_id === 'string'
          ? responseObj.account_id
          : undefined;

    // nosemgrep: javascript.node.crypto.timeable-secret-comparison -- typeof/truthy check, not a secret comparison
    if (!clientSecret || typeof clientSecret !== 'string') {
      throw new Error('DialStack: clientSecret must be a valid string');
    }

    let parsedExpiresAt: Date;
    if (expiresAtRaw) {
      parsedExpiresAt = new Date(expiresAtRaw);
      if (isNaN(parsedExpiresAt.getTime())) {
        console.warn('DialStack: Invalid expiresAt format, using default duration');
        parsedExpiresAt = new Date(Date.now() + DEFAULT_SESSION_DURATION_MS);
      }
    } else {
      parsedExpiresAt = new Date(Date.now() + DEFAULT_SESSION_DURATION_MS);
    }

    if (
      (responseObj.accountId != null || responseObj.account_id != null) &&
      (!accountIdRaw || accountIdRaw.trim().length === 0)
    ) {
      throw new Error('DialStack: accountId must be a non-empty string when provided');
    }

    return {
      clientSecret,
      expiresAt: parsedExpiresAt,
      accountId: accountIdRaw ? accountIdRaw.trim() : null,
    };
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

      const { clientSecret, expiresAt, accountId } = this.parseClientSecretResponse(response);

      this.sessionData = {
        clientSecret,
        expiresAt,
        accountId,
      };
      this.cachedAccountId = accountId;

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
   * Get the account ID for account-scoped endpoints
   */
  private async getAccountId(): Promise<string> {
    if (this.cachedAccountId) return this.cachedAccountId;

    if (!this.sessionData) {
      await this.getClientSecret();
    }

    const accountId = this.sessionData?.accountId;
    if (!accountId) {
      throw new Error(
        'DialStack: accountId is required for account-scoped methods. Return { clientSecret, accountId } from fetchClientSecret.'
      );
    }

    this.cachedAccountId = accountId;
    return accountId;
  }

  /**
   * Make authenticated API request
   */
  async fetchApi(path: string, options: RequestInit = {}): Promise<Response> {
    const clientSecret = await this.getClientSecret();

    const headers = new Headers(options.headers);
    headers.set('Authorization', `Bearer ${clientSecret}`);
    if (!(options.body instanceof FormData)) {
      headers.set('Content-Type', 'application/json');
    }

    return fetch(`${this.apiUrl}${path}`, {
      ...options,
      headers,
    });
  }

  // ===========================================================================
  // Resource Namespaces
  // ===========================================================================

  calls = {
    create: async (params: { userId: string; dialString: string }): Promise<void> => {
      const response = await this.fetchApi('/v1/calls', {
        method: 'POST',
        body: JSON.stringify({ user_id: params.userId, dial_string: params.dialString }),
      });
      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Failed to initiate call: ${response.status} ${errorText}`);
      }
    },
    retrieve: async (callId: string): Promise<CallLog> => {
      const response = await this.fetchApi(`/v1/calls/${callId}`);
      if (!response.ok) {
        const errorText = await response.text();
        throw new ApiError(
          `Failed to get call log: ${response.status} ${errorText}`,
          response.status
        );
      }
      return response.json();
    },
    transcripts: {
      retrieve: async (callId: string): Promise<Transcript> => {
        const response = await this.fetchApi(`/v1/calls/${callId}/transcript`);
        if (!response.ok) {
          const errorText = await response.text();
          throw new Error(`Failed to get transcript: ${response.status} ${errorText}`);
        }
        return response.json();
      },
    },
  };

  voicemails = {
    retrieveTranscript: async (voicemailId: string): Promise<VoicemailTranscript> => {
      const response = await this.fetchApi(`/v1/voicemails/${voicemailId}/transcript`);
      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Failed to get voicemail transcript: ${response.status} ${errorText}`);
      }
      return response.json();
    },
    markAsRead: async (voicemailId: string): Promise<void> => {
      const response = await this.fetchApi(`/v1/voicemails/${voicemailId}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ is_read: true }),
      });
      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Failed to mark voicemail as read: ${response.status} ${errorText}`);
      }
    },
    delete: async (voicemailId: string): Promise<void> => {
      const response = await this.fetchApi(`/v1/voicemails/${voicemailId}`, {
        method: 'DELETE',
      });
      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Failed to delete voicemail: ${response.status} ${errorText}`);
      }
    },
  };

  phoneNumbers = {
    retrieve: async (phoneNumberId: string): Promise<DIDItem> => {
      const response = await this.fetchApi(`/v1/phone-numbers/${phoneNumberId}`);
      if (!response.ok) {
        const errorText = await response.text();
        throw new ApiError(
          `Failed to get phone number: ${response.status} ${errorText}`,
          response.status
        );
      }
      return response.json();
    },
    list: async (options?: {
      limit?: number;
      status?: string;
    }): Promise<PaginatedResponse<DIDItem>> => {
      const params = new URLSearchParams();
      if (options?.limit) params.set('limit', String(options.limit));
      if (options?.status) params.set('status', options.status);

      const queryString = params.toString();
      const path = queryString ? `/v1/phone-numbers?${queryString}` : '/v1/phone-numbers';

      const response = await this.fetchApi(path);
      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Failed to list phone numbers: ${response.status} ${errorText}`);
      }
      return response.json();
    },
    update: async (phoneNumberId: string, data: UpdatePhoneNumberRequest): Promise<DIDItem> => {
      const response = await this.fetchApi(`/v1/phone-numbers/${phoneNumberId}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      });
      if (!response.ok) {
        const errorText = await response.text();
        throw new ApiError(
          `Failed to update phone number: ${response.status} ${errorText}`,
          response.status
        );
      }
      return response.json();
    },
    updateRoute: async (phoneNumberId: string, routingTarget: string | null): Promise<DIDItem> => {
      const response = await this.fetchApi(`/v1/phone-numbers/${phoneNumberId}/route`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ routing_target: routingTarget }),
      });
      if (!response.ok) {
        const errorText = await response.text();
        throw new ApiError(
          `Failed to update routing target: ${response.status} ${errorText}`,
          response.status
        );
      }
      return response.json();
    },
  };

  availablePhoneNumbers = {
    search: async (options: SearchAvailableNumbersOptions): Promise<AvailablePhoneNumber[]> => {
      const params = new URLSearchParams();
      if (options.areaCode) params.set('area_code', options.areaCode);
      if (options.zip) params.set('zip', options.zip);
      if (options.quantity) params.set('quantity', String(options.quantity));

      const response = await this.fetchApi(`/v1/available-phone-numbers?${params}`);
      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Failed to search available numbers: ${response.status} ${errorText}`);
      }

      const body = await response.json();
      return body.data;
    },
  };

  phoneNumberOrders = {
    create: async (phoneNumbers: string[]): Promise<NumberOrder> => {
      const response = await this.fetchApi('/v1/phone-number-orders', {
        method: 'POST',
        body: JSON.stringify({ phone_numbers: phoneNumbers }),
      });
      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Failed to create phone number order: ${response.status} ${errorText}`);
      }
      return response.json();
    },
    retrieve: async (orderId: string): Promise<NumberOrder> => {
      const response = await this.fetchApi(`/v1/phone-number-orders/${orderId}`);
      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Failed to get phone number order: ${response.status} ${errorText}`);
      }
      return response.json();
    },
    list: async (options?: {
      limit?: number;
      status?: string;
      order_type?: string;
    }): Promise<PaginatedResponse<NumberOrder>> => {
      const params = new URLSearchParams();
      if (options?.limit) params.set('limit', String(options.limit));
      if (options?.status) params.set('status', options.status);
      if (options?.order_type) params.set('order_type', options.order_type);

      const queryString = params.toString();
      const path = queryString
        ? `/v1/phone-number-orders?${queryString}`
        : '/v1/phone-number-orders';

      const response = await this.fetchApi(path);
      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Failed to list number orders: ${response.status} ${errorText}`);
      }
      return response.json();
    },
  };

  portOrders = {
    create: async (request: CreatePortOrderRequest): Promise<PortOrder> => {
      const response = await this.fetchApi('/v1/port-orders', {
        method: 'POST',
        body: JSON.stringify(request),
      });
      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Failed to create port order: ${response.status} ${errorText}`);
      }
      return response.json();
    },
    retrieve: async (orderId: string): Promise<PortOrder> => {
      const response = await this.fetchApi(`/v1/port-orders/${orderId}`);
      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Failed to get port order: ${response.status} ${errorText}`);
      }
      return response.json();
    },
    list: async (options?: {
      limit?: number;
      status?: string;
    }): Promise<PaginatedResponse<PortOrder>> => {
      const params = new URLSearchParams();
      if (options?.limit) params.set('limit', String(options.limit));
      if (options?.status) params.set('status', options.status);

      const queryString = params.toString();
      const path = queryString ? `/v1/port-orders?${queryString}` : '/v1/port-orders';

      const response = await this.fetchApi(path);
      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Failed to list port orders: ${response.status} ${errorText}`);
      }
      return response.json();
    },
    approve: async (orderId: string, request: ApprovePortOrderRequest): Promise<PortOrder> => {
      const response = await this.fetchApi(`/v1/port-orders/${orderId}/approve`, {
        method: 'POST',
        body: JSON.stringify(request),
      });
      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Failed to approve port order: ${response.status} ${errorText}`);
      }
      return response.json();
    },
    submit: async (orderId: string): Promise<PortOrder> => {
      const response = await this.fetchApi(`/v1/port-orders/${orderId}/submit`, {
        method: 'POST',
      });
      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Failed to submit port order: ${response.status} ${errorText}`);
      }
      return response.json();
    },
    cancel: async (orderId: string): Promise<PortOrder> => {
      const response = await this.fetchApi(`/v1/port-orders/${orderId}/cancel`, {
        method: 'POST',
      });
      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Failed to cancel port order: ${response.status} ${errorText}`);
      }
      return response.json();
    },
    checkEligibility: async (phoneNumbers: string[]): Promise<PortEligibilityResult> => {
      const response = await this.fetchApi('/v1/port-in-eligibility', {
        method: 'POST',
        body: JSON.stringify({ phone_numbers: phoneNumbers }),
      });
      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Failed to check port eligibility: ${response.status} ${errorText}`);
      }
      return response.json();
    },
    uploadCSR: async (orderId: string, file: File): Promise<void> => {
      const formData = new FormData();
      formData.append('file', file);
      const response = await this.fetchApi(`/v1/port-orders/${orderId}/csr`, {
        method: 'POST',
        body: formData,
      });
      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Failed to upload CSR: ${response.status} ${errorText}`);
      }
    },
    uploadBillCopy: async (orderId: string, file: File): Promise<void> => {
      const formData = new FormData();
      formData.append('file', file);
      const response = await this.fetchApi(`/v1/port-orders/${orderId}/bill-copy`, {
        method: 'POST',
        body: formData,
      });
      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Failed to upload bill copy: ${response.status} ${errorText}`);
      }
    },
    downloadCSR: async (orderId: string): Promise<Blob> => {
      const response = await this.fetchApi(`/v1/port-orders/${orderId}/csr`, {
        method: 'GET',
      });
      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Failed to download CSR: ${response.status} ${errorText}`);
      }
      return response.blob();
    },
    downloadBillCopy: async (orderId: string): Promise<Blob> => {
      const response = await this.fetchApi(`/v1/port-orders/${orderId}/bill-copy`, {
        method: 'GET',
      });
      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Failed to download bill copy: ${response.status} ${errorText}`);
      }
      return response.blob();
    },
  };

  dialPlans = {
    retrieve: async (dialPlanId: string): Promise<DialPlanData> => {
      const response = await this.fetchApi(`/v1/dialplans/${dialPlanId}`);
      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Failed to get dial plan: ${response.status} ${errorText}`);
      }
      return response.json();
    },
    list: async (options?: { limit?: number; expand?: string[] }): Promise<NamedResource[]> => {
      const params = new URLSearchParams();
      if (options?.limit) params.set('limit', String(options.limit));
      for (const e of options?.expand ?? []) params.append('expand[]', e);
      const queryString = params.toString();
      const path = queryString ? `/v1/dialplans?${queryString}` : '/v1/dialplans';
      const response = await this.fetchApi(path);
      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Failed to list dial plans: ${response.status} ${errorText}`);
      }
      const data = await response.json();
      return (data.data ?? []).map((r: Record<string, unknown>) => ({
        id: r.id as string,
        name: r.name as string,
        extension_number: (r.extensions as { data?: Array<{ number?: string }> })?.data?.[0]
          ?.number,
      }));
    },
    create: async (data: Record<string, unknown>): Promise<DialPlanData> => {
      const response = await this.fetchApi('/v1/dialplans', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      });
      if (!response.ok) {
        const errorData = (await response.json().catch(() => ({}))) as { error?: string };
        throw new Error(errorData.error ?? `Failed to create dial plan: ${response.status}`);
      }
      return response.json();
    },
    update: async (dialPlanId: string, data: Record<string, unknown>): Promise<DialPlanData> => {
      const response = await this.fetchApi(`/v1/dialplans/${dialPlanId}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      });
      if (!response.ok) {
        const errorData = (await response.json().catch(() => ({}))) as { error?: string };
        throw new Error(errorData.error ?? `Failed to update dial plan: ${response.status}`);
      }
      return response.json();
    },
  };

  schedules = {
    retrieve: async (scheduleId: string): Promise<NamedResource> => {
      const response = await this.fetchApi(`/v1/schedules/${scheduleId}`);
      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Failed to get schedule: ${response.status} ${errorText}`);
      }
      const data = await response.json();
      return { id: data.id, name: data.name };
    },
    list: async (options?: { limit?: number }): Promise<NamedResource[]> => {
      const params = new URLSearchParams();
      if (options?.limit) params.set('limit', String(options.limit));
      const queryString = params.toString();
      const path = queryString ? `/v1/schedules?${queryString}` : '/v1/schedules';
      const response = await this.fetchApi(path);
      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Failed to list schedules: ${response.status} ${errorText}`);
      }
      const data = await response.json();
      return (data.data ?? []).map((r: NamedResource) => ({ id: r.id, name: r.name }));
    },
  };

  ringGroups = {
    list: async (options?: { limit?: number; expand?: string[] }): Promise<NamedResource[]> => {
      const params = new URLSearchParams();
      if (options?.limit) params.set('limit', String(options.limit));
      for (const e of options?.expand ?? []) params.append('expand[]', e);
      const queryString = params.toString();
      const path = queryString ? `/v1/ring_groups?${queryString}` : '/v1/ring_groups';
      const response = await this.fetchApi(path);
      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Failed to list ring groups: ${response.status} ${errorText}`);
      }
      const data = await response.json();
      return (data.data ?? []).map((r: Record<string, unknown>) => ({
        id: r.id as string,
        name: r.name as string,
        extension_number: (r.extensions as { data?: Array<{ number?: string }> })?.data?.[0]
          ?.number,
      }));
    },
  };

  voiceApps = {
    list: async (options?: { limit?: number; expand?: string[] }): Promise<NamedResource[]> => {
      const params = new URLSearchParams();
      if (options?.limit) params.set('limit', String(options.limit));
      for (const e of options?.expand ?? []) params.append('expand[]', e);
      const queryString = params.toString();
      const path = queryString ? `/v1/voice-apps?${queryString}` : '/v1/voice-apps';
      const response = await this.fetchApi(path);
      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Failed to list voice apps: ${response.status} ${errorText}`);
      }
      const data = await response.json();
      return (data.data ?? []).map((r: Record<string, unknown>) => ({
        id: r.id as string,
        name: r.name as string,
        extension_number: (r.extensions as { data?: Array<{ number?: string }> })?.data?.[0]
          ?.number,
      }));
    },
  };

  sharedVoicemailBoxes = {
    list: async (options?: { limit?: number }): Promise<NamedResource[]> => {
      const params = new URLSearchParams();
      if (options?.limit) params.set('limit', String(options.limit));
      const queryString = params.toString();
      const path = queryString
        ? `/v1/shared_voicemail_boxes?${queryString}`
        : '/v1/shared_voicemail_boxes';
      const response = await this.fetchApi(path);
      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Failed to list shared voicemail boxes: ${response.status} ${errorText}`);
      }
      const data = await response.json();
      return (data.data ?? []).map((r: NamedResource) => ({ id: r.id, name: r.name }));
    },
  };

  extensions = {
    list: async (options?: { target?: string; limit?: number }): Promise<Extension[]> => {
      const params = new URLSearchParams();
      params.set('limit', String(options?.limit ?? 100));
      if (options?.target) {
        params.set('target', options.target);
      }

      const path = `/v1/extensions?${params.toString()}`;

      const response = await this.fetchApi(path);
      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Failed to list extensions: ${response.status} ${errorText}`);
      }

      const data: ExtensionListResponse = await response.json();
      return data.data ?? [];
    },
    create: async (request: CreateExtensionRequest): Promise<Extension> => {
      const response = await this.fetchApi('/v1/extensions', {
        method: 'POST',
        body: JSON.stringify(request),
      });
      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Failed to create extension: ${response.status} ${errorText}`);
      }
      return response.json();
    },
  };

  deskphones = {
    create: async (data: CreateDeskphoneRequest): Promise<ProvisionedDevice> => {
      const response = await this.fetchApi('/v1/deskphones', {
        method: 'POST',
        body: JSON.stringify(data),
      });
      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Failed to create deskphone: ${response.status} ${errorText}`);
      }
      return response.json();
    },
    update: async (id: string, data: UpdateDeskphoneRequest): Promise<ProvisionedDevice> => {
      const response = await this.fetchApi(`/v1/deskphones/${id}`, {
        method: 'POST',
        body: JSON.stringify(data),
      });
      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Failed to update deskphone: ${response.status} ${errorText}`);
      }
      return response.json();
    },
    del: async (id: string): Promise<void> => {
      const response = await this.fetchApi(`/v1/deskphones/${id}`, {
        method: 'DELETE',
      });
      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Failed to delete deskphone: ${response.status} ${errorText}`);
      }
    },
    lines: {
      create: async (
        deskphoneId: string,
        data: CreateDeskphoneLineRequest
      ): Promise<DeviceLine> => {
        const response = await this.fetchApi(`/v1/deskphones/${deskphoneId}/lines`, {
          method: 'POST',
          body: JSON.stringify(data),
        });
        if (!response.ok) {
          const errorText = await response.text();
          throw new Error(`Failed to create deskphone line: ${response.status} ${errorText}`);
        }
        return response.json();
      },
      list: async (deskphoneId: string): Promise<DeviceLine[]> => {
        const response = await this.fetchApi(`/v1/deskphones/${deskphoneId}/lines`);
        if (!response.ok) {
          const errorText = await response.text();
          throw new Error(`Failed to list deskphone lines: ${response.status} ${errorText}`);
        }
        const data = await response.json();
        return data.data ?? [];
      },
      update: async (
        deskphoneId: string,
        lineId: string,
        data: UpdateDeskphoneLineRequest
      ): Promise<DeviceLine> => {
        const response = await this.fetchApi(`/v1/deskphones/${deskphoneId}/lines/${lineId}`, {
          method: 'POST',
          body: JSON.stringify(data),
        });
        if (!response.ok) {
          const errorText = await response.text();
          throw new Error(`Failed to update deskphone line: ${response.status} ${errorText}`);
        }
        return response.json();
      },
      del: async (deskphoneId: string, lineId: string): Promise<void> => {
        const response = await this.fetchApi(`/v1/deskphones/${deskphoneId}/lines/${lineId}`, {
          method: 'DELETE',
        });
        if (!response.ok) {
          const errorText = await response.text();
          throw new Error(`Failed to delete deskphone line: ${response.status} ${errorText}`);
        }
      },
    },
    provisioningEvents: {
      list: async (
        deskphoneId: string,
        options?: ProvisioningEventListOptions
      ): Promise<ProvisioningEvent[]> => {
        const params = new URLSearchParams();
        if (options?.limit) {
          params.set('limit', options.limit.toString());
        }
        if (options?.from) {
          params.set('from', options.from);
        }
        if (options?.to) {
          params.set('to', options.to);
        }

        const queryString = params.toString();
        const path = queryString
          ? `/v1/deskphones/${deskphoneId}/events?${queryString}`
          : `/v1/deskphones/${deskphoneId}/events`;

        const response = await this.fetchApi(path);
        if (!response.ok) {
          const errorText = await response.text();
          throw new Error(`Failed to list provisioning events: ${response.status} ${errorText}`);
        }

        const data = await response.json();
        return data.data ?? [];
      },
    },
  };

  devices = {
    retrieve: async (id: string): Promise<Device> => {
      const response = await this.fetchApi(`/v1/devices/${id}`);
      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Failed to get device: ${response.status} ${errorText}`);
      }
      return response.json();
    },
    list: async (options?: DeviceListOptions): Promise<Device[]> => {
      const params = new URLSearchParams();
      if (options?.limit) {
        params.set('limit', options.limit.toString());
      }
      if (options?.type) {
        params.set('type', options.type);
      }

      const queryString = params.toString();
      const path = queryString ? `/v1/devices?${queryString}` : '/v1/devices';

      const response = await this.fetchApi(path);
      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Failed to list devices: ${response.status} ${errorText}`);
      }

      const data = await response.json();
      return data.data ?? [];
    },
  };

  dectBases = {
    create: async (data: CreateDECTBaseRequest): Promise<DECTBase> => {
      const response = await this.fetchApi('/v1/dect-bases', {
        method: 'POST',
        body: JSON.stringify(data),
      });
      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Failed to create DECT base: ${response.status} ${errorText}`);
      }
      return response.json();
    },
    retrieve: async (id: string): Promise<DECTBase> => {
      const response = await this.fetchApi(`/v1/dect-bases/${id}`);
      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Failed to get DECT base: ${response.status} ${errorText}`);
      }
      return response.json();
    },
    list: async (options?: DeviceListOptions): Promise<DECTBase[]> => {
      const params = new URLSearchParams();
      if (options?.limit) {
        params.set('limit', options.limit.toString());
      }
      const queryString = params.toString();
      const path = queryString ? `/v1/dect-bases?${queryString}` : '/v1/dect-bases';

      const response = await this.fetchApi(path);
      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Failed to list DECT bases: ${response.status} ${errorText}`);
      }

      const data = await response.json();
      return data.data ?? [];
    },
    update: async (id: string, data: UpdateDECTBaseRequest): Promise<DECTBase> => {
      const response = await this.fetchApi(`/v1/dect-bases/${id}`, {
        method: 'POST',
        body: JSON.stringify(data),
      });
      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Failed to update DECT base: ${response.status} ${errorText}`);
      }
      return response.json();
    },
    del: async (id: string): Promise<void> => {
      const response = await this.fetchApi(`/v1/dect-bases/${id}`, {
        method: 'DELETE',
      });
      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Failed to delete DECT base: ${response.status} ${errorText}`);
      }
    },
    handsets: {
      create: async (baseId: string, data: CreateDECTHandsetRequest): Promise<DECTHandset> => {
        const response = await this.fetchApi(`/v1/dect-bases/${baseId}/handsets`, {
          method: 'POST',
          body: JSON.stringify(data),
        });
        if (!response.ok) {
          const errorText = await response.text();
          throw new Error(`Failed to create DECT handset: ${response.status} ${errorText}`);
        }
        return response.json();
      },
      retrieve: async (baseId: string, handsetId: string): Promise<DECTHandset> => {
        const response = await this.fetchApi(`/v1/dect-bases/${baseId}/handsets/${handsetId}`);
        if (!response.ok) {
          const errorText = await response.text();
          throw new Error(`Failed to get DECT handset: ${response.status} ${errorText}`);
        }
        return response.json();
      },
      list: async (baseId: string): Promise<DECTHandset[]> => {
        const response = await this.fetchApi(`/v1/dect-bases/${baseId}/handsets`);
        if (!response.ok) {
          const errorText = await response.text();
          throw new Error(`Failed to list DECT handsets: ${response.status} ${errorText}`);
        }

        const data = await response.json();
        return data.data ?? [];
      },
      update: async (
        baseId: string,
        handsetId: string,
        data: UpdateDECTHandsetRequest
      ): Promise<DECTHandset> => {
        const response = await this.fetchApi(`/v1/dect-bases/${baseId}/handsets/${handsetId}`, {
          method: 'POST',
          body: JSON.stringify(data),
        });
        if (!response.ok) {
          const errorText = await response.text();
          throw new Error(`Failed to update DECT handset: ${response.status} ${errorText}`);
        }
        return response.json();
      },
      del: async (baseId: string, handsetId: string): Promise<void> => {
        const response = await this.fetchApi(`/v1/dect-bases/${baseId}/handsets/${handsetId}`, {
          method: 'DELETE',
        });
        if (!response.ok) {
          const errorText = await response.text();
          throw new Error(`Failed to delete DECT handset: ${response.status} ${errorText}`);
        }
      },
    },
    extensions: {
      create: async (
        baseId: string,
        handsetId: string,
        data: CreateDECTExtensionRequest
      ): Promise<DECTExtension> => {
        const response = await this.fetchApi(
          `/v1/dect-bases/${baseId}/handsets/${handsetId}/extensions`,
          {
            method: 'POST',
            body: JSON.stringify(data),
          }
        );
        if (!response.ok) {
          const errorText = await response.text();
          throw new Error(`Failed to create DECT extension: ${response.status} ${errorText}`);
        }
        return response.json();
      },
      list: async (baseId: string, handsetId: string): Promise<DECTExtension[]> => {
        const response = await this.fetchApi(
          `/v1/dect-bases/${baseId}/handsets/${handsetId}/extensions`
        );
        if (!response.ok) {
          const errorText = await response.text();
          throw new Error(`Failed to list DECT extensions: ${response.status} ${errorText}`);
        }

        const data = await response.json();
        return data.data ?? [];
      },
      del: async (baseId: string, handsetId: string, extensionId: string): Promise<void> => {
        const response = await this.fetchApi(
          `/v1/dect-bases/${baseId}/handsets/${handsetId}/extensions/${extensionId}`,
          {
            method: 'DELETE',
          }
        );
        if (!response.ok) {
          const errorText = await response.text();
          throw new Error(`Failed to delete DECT extension: ${response.status} ${errorText}`);
        }
      },
    },
  };

  account = {
    retrieve: async (): Promise<Account> => {
      const accountId = await this.getAccountId();
      const response = await this.fetchApi(`/v1/accounts/${accountId}`);
      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Failed to get account: ${response.status} ${errorText}`);
      }
      return response.json();
    },
    update: async (request: UpdateAccountRequest): Promise<Account> => {
      const accountId = await this.getAccountId();
      const response = await this.fetchApi(`/v1/accounts/${accountId}`, {
        method: 'POST',
        body: JSON.stringify(request),
      });
      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Failed to update account: ${response.status} ${errorText}`);
      }
      return response.json();
    },
  };

  users = {
    create: async (request: CreateUserRequest): Promise<OnboardingUser> => {
      const response = await this.fetchApi('/v1/users', {
        method: 'POST',
        body: JSON.stringify(request),
      });
      if (!response.ok) {
        if (response.status === 409) {
          throw new Error('A user with this email already exists');
        }
        const errorText = await response.text();
        throw new Error(`Failed to create user: ${response.status} ${errorText}`);
      }
      return response.json();
    },
    list: async (options?: { limit?: number; expand?: string[] }): Promise<OnboardingUser[]> => {
      const params = new URLSearchParams();
      params.set('limit', String(options?.limit ?? 100));
      for (const e of options?.expand ?? []) params.append('expand[]', e);

      const path = `/v1/users?${params.toString()}`;

      const response = await this.fetchApi(path);
      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Failed to list users: ${response.status} ${errorText}`);
      }

      const data = await response.json();
      return data.data ?? [];
    },
    del: async (userId: string): Promise<void> => {
      const response = await this.fetchApi(`/v1/users/${userId}`, {
        method: 'DELETE',
      });
      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Failed to delete user: ${response.status} ${errorText}`);
      }
    },
    endpoints: {
      create: async (
        userId: string,
        request?: CreateEndpointRequest
      ): Promise<OnboardingEndpoint> => {
        const response = await this.fetchApi(`/v1/users/${userId}/endpoints`, {
          method: 'POST',
          body: JSON.stringify(request ?? {}),
        });
        if (!response.ok) {
          const errorText = await response.text();
          throw new Error(`Failed to create endpoint: ${response.status} ${errorText}`);
        }
        return response.json();
      },
      list: async (userId: string): Promise<OnboardingEndpoint[]> => {
        const response = await this.fetchApi(`/v1/users/${userId}/endpoints`);
        if (!response.ok) {
          const errorText = await response.text();
          throw new Error(`Failed to list endpoints: ${response.status} ${errorText}`);
        }

        const data = await response.json();
        return data.data ?? [];
      },
    },
  };

  locations = {
    create: async (request: CreateLocationRequest): Promise<OnboardingLocation> => {
      const response = await this.fetchApi('/v1/locations', {
        method: 'POST',
        body: JSON.stringify(request),
      });
      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Failed to create location: ${response.status} ${errorText}`);
      }
      return response.json();
    },
    retrieve: async (locationId: string): Promise<OnboardingLocation> => {
      const response = await this.fetchApi(`/v1/locations/${locationId}`);
      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Failed to get location: ${response.status} ${errorText}`);
      }
      return response.json();
    },
    list: async (): Promise<OnboardingLocation[]> => {
      const response = await this.fetchApi('/v1/locations?limit=100');
      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Failed to list locations: ${response.status} ${errorText}`);
      }

      const data = await response.json();
      return data.data ?? [];
    },
    update: async (
      locationId: string,
      request: UpdateLocationRequest
    ): Promise<OnboardingLocation> => {
      const response = await this.fetchApi(`/v1/locations/${locationId}`, {
        method: 'POST',
        body: JSON.stringify(request),
      });
      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Failed to update location: ${response.status} ${errorText}`);
      }
      return response.json();
    },
    validateE911: async (locationId: string): Promise<E911ValidationResult> => {
      const response = await this.fetchApi(`/v1/locations/${locationId}/validate-e911`, {
        method: 'POST',
      });
      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Failed to validate E911 address: ${response.status} ${errorText}`);
      }
      return response.json();
    },
    provisionE911: async (locationId: string): Promise<OnboardingLocation> => {
      const response = await this.fetchApi(`/v1/locations/${locationId}/provision-e911`, {
        method: 'POST',
      });
      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Failed to provision E911: ${response.status} ${errorText}`);
      }
      return response.json();
    },
  };

  addresses = {
    suggest: async (query: string, country?: string): Promise<AddressSuggestion[]> => {
      const params = new URLSearchParams({ query });
      if (country) params.set('country', country);

      const response = await this.fetchBffApi(`/bff/v1/address-suggestions?${params}`);
      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Failed to suggest addresses: ${response.status} ${errorText}`);
      }

      const data = await response.json();
      return data.suggestions;
    },
    getPlaceDetails: async (placeId: string): Promise<ResolvedAddress> => {
      const response = await this.fetchBffApi(
        `/bff/v1/address-suggestions/${encodeURIComponent(placeId)}`
      );
      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Failed to get place details: ${response.status} ${errorText}`);
      }
      return response.json();
    },
  };

  // ===========================================================================
  // Non-resource methods
  // ===========================================================================

  /**
   * Resolve a routing target TypeID to its type and display name
   */
  async resolveRoutingTarget(target: string): Promise<{
    id: string;
    name: string | null;
    type: RoutingTargetType;
    extension_number?: string | null;
  } | null> {
    const cached = this.routingTargetCache.get(target);
    if (cached) return cached;

    const promise = this._fetchRoutingTarget(target);
    this.routingTargetCache.set(target, promise);
    return promise;
  }

  private async _fetchRoutingTarget(target: string): Promise<{
    id: string;
    name: string | null;
    type: RoutingTargetType;
    extension_number?: string | null;
  } | null> {
    const prefixMap = ROUTING_TARGET_TYPES;

    const lastUnderscore = target.lastIndexOf('_');
    if (lastUnderscore < 1) return null;

    const prefix = target.substring(0, lastUnderscore);
    const config = prefixMap[prefix];
    if (!config) return null;

    try {
      const response = await this.fetchApi(`${config.path}/${target}?expand[]=extensions`);
      if (!response.ok) return null;
      const data = await response.json();
      const ext = data.extensions?.data?.[0]?.number ?? null;
      return { id: target, name: data.name ?? null, type: config.type, extension_number: ext };
    } catch {
      return null;
    }
  }

  /**
   * Fetch all pages of a paginated list endpoint, following next_page_url links.
   */
  async fetchAllPages<T>(
    fetchFn: (opts: { limit: number }) => Promise<PaginatedResponse<T>>
  ): Promise<T[]> {
    const allData: T[] = [];
    const MAX_PAGES = 100;
    let pages = 0;
    let response = await fetchFn({ limit: 100 });
    allData.push(...response.data);

    while (response.next_page_url && ++pages < MAX_PAGES) {
      const nextResponse = await this.fetchApi(response.next_page_url);
      if (!nextResponse.ok) break;
      response = await nextResponse.json();
      allData.push(...response.data);
    }

    return allData;
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
   * Register an arbitrary host element to receive appearance-update events.
   * Used by React-only SDK components (e.g. DialPlan, OnboardingPortal) that
   * aren't backed by a custom element created via `create()`.
   *
   * Note: the element joins the same `this.components` set that custom
   * elements use, so it will also receive `dialstack-logout` events and be
   * cleared on logout (see `logout()`). Detached targets created by
   * `useAppearance` ignore logout, so this is harmless today — but anything
   * dispatched to `this.components` in the future will reach these targets
   * too.
   */
  addAppearanceTarget(element: HTMLElement): void {
    this.components.add(element);
  }

  /**
   * Unregister a host element previously passed to addAppearanceTarget().
   */
  removeAppearanceTarget(element: HTMLElement): void {
    this.components.delete(element);
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
   * Subscribe to call events
   */
  on<K extends keyof CallEventMap>(event: K, handler: CallEventHandler<CallEventMap[K]>): void {
    if (!this.eventListeners.has(event)) {
      this.eventListeners.set(event, new Set());
    }
    this.eventListeners.get(event)!.add(handler as CallEventHandler<unknown>);

    // Lazy connect: start SSE on first listener
    if (!this.eventStreamController) {
      this.connectEventStream();
    }
  }

  /**
   * Unsubscribe from call events
   */
  off<K extends keyof CallEventMap>(event: K, handler?: CallEventHandler<CallEventMap[K]>): void {
    const listeners = this.eventListeners.get(event);
    if (!listeners) return;

    if (handler) {
      listeners.delete(handler as CallEventHandler<unknown>);
    } else {
      listeners.clear();
    }

    // Disconnect SSE if no listeners remain
    if (this.hasNoListeners()) {
      this.disconnectEventStream();
    }
  }

  /**
   * Check if there are any event listeners
   */
  private hasNoListeners(): boolean {
    for (const listeners of this.eventListeners.values()) {
      if (listeners.size > 0) return false;
    }
    return true;
  }

  /**
   * Emit an event to all registered handlers
   */
  private emit<K extends keyof CallEventMap>(event: K, data: CallEventMap[K]): void {
    const listeners = this.eventListeners.get(event);
    if (!listeners) return;

    listeners.forEach((handler) => {
      try {
        handler(data);
      } catch (error) {
        console.error(`DialStack: Error in ${event} handler:`, error);
      }
    });
  }

  /**
   * Connect to SSE endpoint for real-time events using fetch + ReadableStream
   * This allows proper Authorization headers (EventSource doesn't support custom headers)
   */
  private async connectEventStream(): Promise<void> {
    // Cancel any pending reconnect
    if (this.reconnectTimeoutId) {
      clearTimeout(this.reconnectTimeoutId);
      this.reconnectTimeoutId = null;
    }

    try {
      const clientSecret = await this.getClientSecret();
      const url = `${this.apiUrl}/v1/events`;

      this.eventStreamController = new AbortController();

      const response = await fetch(url, {
        headers: {
          Authorization: `Bearer ${clientSecret}`,
          Accept: 'text/event-stream',
        },
        signal: this.eventStreamController.signal,
      });

      if (!response.ok) {
        throw new Error(`SSE connection failed: ${response.status}`);
      }

      // Reset reconnect attempts on successful connection
      this.reconnectAttempts = 0;

      const reader = response.body?.getReader();
      if (!reader) {
        throw new Error('No response body');
      }

      const decoder = new TextDecoder();
      let buffer = '';

      // Read the stream until done or aborted
      let done = false;
      while (!done) {
        const result = await reader.read();
        done = result.done;
        const value = result.value;

        if (done) {
          // Stream closed by server, reconnect
          this.scheduleReconnect();
          continue;
        }

        buffer += decoder.decode(value, { stream: true });

        // Process complete events (separated by double newlines)
        const events = buffer.split('\n\n');
        buffer = events.pop() || ''; // Keep incomplete event in buffer

        for (const eventText of events) {
          this.parseAndEmitEvent(eventText);
        }
      }
    } catch (error) {
      if (error instanceof Error && error.name === 'AbortError') {
        // Intentional disconnect, don't reconnect
        return;
      }
      console.error('DialStack: SSE connection error:', error);
      this.scheduleReconnect();
    }
  }

  /**
   * Parse SSE event text and emit to listeners
   */
  private parseAndEmitEvent(eventText: string): void {
    const lines = eventText.split('\n');
    let eventType = '';
    let data = '';

    for (const line of lines) {
      if (line.startsWith('event: ')) {
        eventType = line.slice(7);
      } else if (line.startsWith('data: ')) {
        data = line.slice(6);
      }
    }

    if (eventType === 'call.incoming' && data) {
      try {
        const rawData = JSON.parse(data);
        const event: IncomingCallEvent = {
          from_number: rawData.from_number,
          from_name: rawData.from_name ?? null,
          to_number: rawData.to_number,
          timestamp: new Date(rawData.timestamp),
        };
        this.emit('call.incoming', event);
      } catch (error) {
        console.error('DialStack: Failed to parse call.incoming event:', error);
      }
    }
    // Ignore 'connected' and other events
  }

  /**
   * Schedule reconnection with exponential backoff
   */
  private scheduleReconnect(): void {
    if (this.hasNoListeners()) {
      // No listeners, don't reconnect
      return;
    }

    // Exponential backoff: 1s, 2s, 4s, 8s, max 30s
    const delay = Math.min(1000 * Math.pow(2, this.reconnectAttempts), 30000);
    this.reconnectAttempts++;

    console.log(`DialStack: Reconnecting in ${delay}ms (attempt ${this.reconnectAttempts})`);

    this.reconnectTimeoutId = setTimeout(() => {
      this.connectEventStream();
    }, delay);
  }

  /**
   * Disconnect event stream
   */
  private disconnectEventStream(): void {
    if (this.reconnectTimeoutId) {
      clearTimeout(this.reconnectTimeoutId);
      this.reconnectTimeoutId = null;
    }

    if (this.eventStreamController) {
      this.eventStreamController.abort();
      this.eventStreamController = null;
    }

    this.reconnectAttempts = 0;
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

    // Disconnect SSE and clear event listeners
    this.disconnectEventStream();
    this.eventListeners.clear();

    // Dispatch logout event to all components
    this.components.forEach((component) => {
      component.dispatchEvent(new CustomEvent('dialstack-logout'));
    });

    // Clear components list
    this.components.clear();
  }

  // ===========================================================================
  // BFF Methods (publishable key auth)
  // ===========================================================================

  /**
   * Make an authenticated BFF API request using the publishable key
   */
  private async fetchBffApi(path: string, options: RequestInit = {}): Promise<Response> {
    const headers = new Headers(options.headers);
    headers.set('Authorization', `Bearer ${this.publishableKey}`);
    headers.set('Content-Type', 'application/json');

    return fetch(`${this.apiUrl}${path}`, {
      ...options,
      headers,
    });
  }
}
