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
  Transcript,
  VoicemailTranscript,
  Extension,
  ExtensionListResponse,
  ProvisionedDevice,
  CreateDeviceRequest,
  UpdateDeviceRequest,
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
} from '../types';

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

  // Event handling
  private eventListeners: Map<keyof CallEventMap, Set<CallEventHandler<unknown>>> = new Map();
  private eventStreamController: AbortController | null = null;
  private reconnectTimeoutId: ReturnType<typeof setTimeout> | null = null;
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
  } {
    if (typeof response === 'string') {
      // Simple format: just the client secret string, use default expiry
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
   * Initiate an outbound call
   */
  async initiateCall(userId: string, dialString: string): Promise<void> {
    const response = await this.fetchApi('/v1/calls', {
      method: 'POST',
      body: JSON.stringify({ user_id: userId, dial_string: dialString }),
    });
    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Failed to initiate call: ${response.status} ${errorText}`);
    }
  }

  /**
   * Retrieve the transcript for a call
   */
  async getTranscript(callId: string): Promise<Transcript> {
    const response = await this.fetchApi(`/v1/calls/${callId}/transcript`);
    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Failed to get transcript: ${response.status} ${errorText}`);
    }
    return response.json();
  }

  /**
   * Retrieve the transcript for a voicemail
   */
  async getVoicemailTranscript(userId: string, voicemailId: string): Promise<VoicemailTranscript> {
    const response = await this.fetchApi(
      `/v1/users/${userId}/voicemails/${voicemailId}/transcript`
    );
    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Failed to get voicemail transcript: ${response.status} ${errorText}`);
    }
    return response.json();
  }

  /**
   * List extensions, optionally filtered by target ID
   */
  async listExtensions(options?: {
    target?: string;
    limit?: number;
    starting_after?: string;
    ending_before?: string;
  }): Promise<Extension[]> {
    const params = new URLSearchParams();
    if (options?.target) {
      params.set('target', options.target);
    }
    if (options?.limit) {
      params.set('limit', String(options.limit));
    }
    if (options?.starting_after) {
      params.set('starting_after', options.starting_after);
    }
    if (options?.ending_before) {
      params.set('ending_before', options.ending_before);
    }

    const queryString = params.toString();
    const path = queryString ? `/v1/extensions?${queryString}` : '/v1/extensions';

    const response = await this.fetchApi(path);
    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Failed to list extensions: ${response.status} ${errorText}`);
    }

    const data: ExtensionListResponse = await response.json();
    return data.data;
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
  // Device Methods
  // ===========================================================================

  /**
   * Create a new provisioned device
   */
  async createDevice(data: CreateDeviceRequest): Promise<ProvisionedDevice> {
    const response = await this.fetchApi('/v1/devices', {
      method: 'POST',
      body: JSON.stringify(data),
    });
    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Failed to create device: ${response.status} ${errorText}`);
    }
    return response.json();
  }

  /**
   * Get a device by ID
   */
  async getDevice(id: string): Promise<ProvisionedDevice> {
    const response = await this.fetchApi(`/v1/devices/${id}`);
    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Failed to get device: ${response.status} ${errorText}`);
    }
    return response.json();
  }

  /**
   * List all devices
   */
  async listDevices(options?: DeviceListOptions): Promise<ProvisionedDevice[]> {
    const params = new URLSearchParams();
    if (options?.limit) {
      params.set('limit', options.limit.toString());
    }
    if (options?.starting_after) {
      params.set('starting_after', options.starting_after);
    }
    if (options?.ending_before) {
      params.set('ending_before', options.ending_before);
    }

    const queryString = params.toString();
    const path = queryString ? `/v1/devices?${queryString}` : '/v1/devices';

    const response = await this.fetchApi(path);
    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Failed to list devices: ${response.status} ${errorText}`);
    }

    const data = await response.json();
    return data.data;
  }

  /**
   * Update a device
   */
  async updateDevice(id: string, data: UpdateDeviceRequest): Promise<ProvisionedDevice> {
    const response = await this.fetchApi(`/v1/devices/${id}`, {
      method: 'POST',
      body: JSON.stringify(data),
    });
    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Failed to update device: ${response.status} ${errorText}`);
    }
    return response.json();
  }

  /**
   * Delete a device
   */
  async deleteDevice(id: string): Promise<void> {
    const response = await this.fetchApi(`/v1/devices/${id}`, {
      method: 'DELETE',
    });
    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Failed to delete device: ${response.status} ${errorText}`);
    }
  }

  /**
   * List provisioning events for a device
   */
  async listProvisioningEvents(
    deviceId: string,
    options?: ProvisioningEventListOptions
  ): Promise<ProvisioningEvent[]> {
    const params = new URLSearchParams();
    if (options?.limit) {
      params.set('limit', options.limit.toString());
    }
    if (options?.starting_after) {
      params.set('starting_after', options.starting_after);
    }
    if (options?.ending_before) {
      params.set('ending_before', options.ending_before);
    }
    if (options?.from) {
      params.set('from', options.from);
    }
    if (options?.to) {
      params.set('to', options.to);
    }

    const queryString = params.toString();
    const path = queryString
      ? `/v1/devices/${deviceId}/events?${queryString}`
      : `/v1/devices/${deviceId}/events`;

    const response = await this.fetchApi(path);
    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Failed to list provisioning events: ${response.status} ${errorText}`);
    }

    const data = await response.json();
    return data.data;
  }

  // ===========================================================================
  // DECT Base Methods
  // ===========================================================================

  /**
   * Create a new DECT base station
   */
  async createDECTBase(data: CreateDECTBaseRequest): Promise<DECTBase> {
    const response = await this.fetchApi('/v1/dect-bases', {
      method: 'POST',
      body: JSON.stringify(data),
    });
    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Failed to create DECT base: ${response.status} ${errorText}`);
    }
    return response.json();
  }

  /**
   * Get a DECT base by ID
   */
  async getDECTBase(id: string): Promise<DECTBase> {
    const response = await this.fetchApi(`/v1/dect-bases/${id}`);
    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Failed to get DECT base: ${response.status} ${errorText}`);
    }
    return response.json();
  }

  /**
   * List all DECT bases
   */
  async listDECTBases(options?: DeviceListOptions): Promise<DECTBase[]> {
    const params = new URLSearchParams();
    if (options?.limit) {
      params.set('limit', options.limit.toString());
    }
    if (options?.starting_after) {
      params.set('starting_after', options.starting_after);
    }
    if (options?.ending_before) {
      params.set('ending_before', options.ending_before);
    }

    const queryString = params.toString();
    const path = queryString ? `/v1/dect-bases?${queryString}` : '/v1/dect-bases';

    const response = await this.fetchApi(path);
    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Failed to list DECT bases: ${response.status} ${errorText}`);
    }

    const data = await response.json();
    return data.data;
  }

  /**
   * Update a DECT base
   */
  async updateDECTBase(id: string, data: UpdateDECTBaseRequest): Promise<DECTBase> {
    const response = await this.fetchApi(`/v1/dect-bases/${id}`, {
      method: 'POST',
      body: JSON.stringify(data),
    });
    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Failed to update DECT base: ${response.status} ${errorText}`);
    }
    return response.json();
  }

  /**
   * Delete a DECT base
   */
  async deleteDECTBase(id: string): Promise<void> {
    const response = await this.fetchApi(`/v1/dect-bases/${id}`, {
      method: 'DELETE',
    });
    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Failed to delete DECT base: ${response.status} ${errorText}`);
    }
  }

  // ===========================================================================
  // DECT Handset Methods
  // ===========================================================================

  /**
   * Create a new DECT handset on a base station
   */
  async createDECTHandset(baseId: string, data: CreateDECTHandsetRequest): Promise<DECTHandset> {
    const response = await this.fetchApi(`/v1/dect-bases/${baseId}/handsets`, {
      method: 'POST',
      body: JSON.stringify(data),
    });
    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Failed to create DECT handset: ${response.status} ${errorText}`);
    }
    return response.json();
  }

  /**
   * Get a DECT handset by ID
   */
  async getDECTHandset(baseId: string, handsetId: string): Promise<DECTHandset> {
    const response = await this.fetchApi(`/v1/dect-bases/${baseId}/handsets/${handsetId}`);
    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Failed to get DECT handset: ${response.status} ${errorText}`);
    }
    return response.json();
  }

  /**
   * List all handsets for a DECT base
   */
  async listDECTHandsets(baseId: string): Promise<DECTHandset[]> {
    const response = await this.fetchApi(`/v1/dect-bases/${baseId}/handsets`);
    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Failed to list DECT handsets: ${response.status} ${errorText}`);
    }

    const data = await response.json();
    return data.data;
  }

  /**
   * Update a DECT handset
   */
  async updateDECTHandset(
    baseId: string,
    handsetId: string,
    data: UpdateDECTHandsetRequest
  ): Promise<DECTHandset> {
    const response = await this.fetchApi(`/v1/dect-bases/${baseId}/handsets/${handsetId}`, {
      method: 'POST',
      body: JSON.stringify(data),
    });
    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Failed to update DECT handset: ${response.status} ${errorText}`);
    }
    return response.json();
  }

  /**
   * Delete a DECT handset
   */
  async deleteDECTHandset(baseId: string, handsetId: string): Promise<void> {
    const response = await this.fetchApi(`/v1/dect-bases/${baseId}/handsets/${handsetId}`, {
      method: 'DELETE',
    });
    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Failed to delete DECT handset: ${response.status} ${errorText}`);
    }
  }

  // ===========================================================================
  // DECT Extension Methods
  // ===========================================================================

  /**
   * Create a DECT extension (assign a SIP line to a handset)
   */
  async createDECTExtension(
    baseId: string,
    handsetId: string,
    data: CreateDECTExtensionRequest
  ): Promise<DECTExtension> {
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
  }

  /**
   * List all extensions for a DECT handset
   */
  async listDECTExtensions(baseId: string, handsetId: string): Promise<DECTExtension[]> {
    const response = await this.fetchApi(
      `/v1/dect-bases/${baseId}/handsets/${handsetId}/extensions`
    );
    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Failed to list DECT extensions: ${response.status} ${errorText}`);
    }

    const data = await response.json();
    return data.data;
  }

  /**
   * Delete a DECT extension
   */
  async deleteDECTExtension(baseId: string, handsetId: string, extensionId: string): Promise<void> {
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
  }
}
