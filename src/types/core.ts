/**
 * Core SDK types for DialStack
 */

import type { AppearanceOptions, UpdateOptions } from './appearance';
import type {
  ComponentTagName,
  ComponentElement,
  Transcript,
  VoicemailTranscript,
} from './components';
import type { CallEventMap, CallEventHandler } from './callbacks';
import type { Extension } from './dial-plan';
import type {
  AvailablePhoneNumber,
  NumberOrder,
  SearchAvailableNumbersOptions,
} from './phone-number-ordering';
import type {
  ProvisionedDevice,
  CreateDeviceRequest,
  UpdateDeviceRequest,
  DeviceListOptions,
  ProvisioningEvent,
  ProvisioningEventListOptions,
} from './device';
import type {
  DECTBase,
  DECTHandset,
  DECTExtension,
  CreateDECTBaseRequest,
  UpdateDECTBaseRequest,
  CreateDECTHandsetRequest,
  UpdateDECTHandsetRequest,
  CreateDECTExtensionRequest,
} from './dect';

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
   * Retrieve the transcript for a call
   *
   * @param callId - The ID of the call to get transcript for
   * @returns Promise resolving to the transcript object
   *
   * @example
   * ```typescript
   * const transcript = await dialstack.getTranscript('cdr_01abc...');
   * if (transcript.status === 'completed') {
   *   console.log(transcript.text);
   * }
   * ```
   */
  getTranscript(callId: string): Promise<Transcript>;

  /**
   * Retrieve the transcript for a voicemail
   *
   * @param userId - The ID of the user who owns the voicemail
   * @param voicemailId - The ID of the voicemail to get transcript for
   * @returns Promise resolving to the voicemail transcript object
   *
   * @example
   * ```typescript
   * const transcript = await dialstack.getVoicemailTranscript('user_01abc...', 'vm_01xyz...');
   * if (transcript.status === 'completed') {
   *   console.log(transcript.text);
   * }
   * ```
   */
  getVoicemailTranscript(userId: string, voicemailId: string): Promise<VoicemailTranscript>;

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
  on<K extends keyof CallEventMap>(event: K, handler: CallEventHandler<CallEventMap[K]>): void;

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
  off<K extends keyof CallEventMap>(event: K, handler?: CallEventHandler<CallEventMap[K]>): void;

  /**
   * List extensions, optionally filtered by target ID
   *
   * @param options - Optional filter options
   * @returns Promise resolving to an array of extensions
   *
   * @example
   * ```typescript
   * // List all extensions
   * const extensions = await dialstack.listExtensions();
   *
   * // List extensions for a specific user
   * const userExtensions = await dialstack.listExtensions({ target: 'user_01abc...' });
   * ```
   */
  listExtensions(options?: { target?: string; limit?: number }): Promise<Extension[]>;

  // ===========================================================================
  // Phone Number Ordering Methods
  // ===========================================================================

  /**
   * Search for available phone numbers to purchase
   *
   * @param options - Search criteria (at least one of areaCode, zip, or city+state is required)
   * @returns Promise resolving to an array of available phone numbers
   *
   * @example
   * ```typescript
   * const numbers = await dialstack.searchAvailableNumbers({ areaCode: '212', quantity: 5 });
   * ```
   */
  searchAvailableNumbers(options: SearchAvailableNumbersOptions): Promise<AvailablePhoneNumber[]>;

  /**
   * Create a phone number order to purchase one or more numbers
   *
   * @param phoneNumbers - Array of E.164 phone numbers to order
   * @returns Promise resolving to the created order
   *
   * @example
   * ```typescript
   * const order = await dialstack.createPhoneNumberOrder(['+12125551001']);
   * ```
   */
  createPhoneNumberOrder(phoneNumbers: string[]): Promise<NumberOrder>;

  /**
   * Get the current status of a phone number order
   *
   * @param orderId - The order ID
   * @returns Promise resolving to the order
   *
   * @example
   * ```typescript
   * const order = await dialstack.getPhoneNumberOrder('ord_abc123');
   * ```
   */
  getPhoneNumberOrder(orderId: string): Promise<NumberOrder>;

  // ===========================================================================
  // Device Methods
  // ===========================================================================

  /**
   * Create a new provisioned device
   *
   * @param data - Device creation data
   * @returns Promise resolving to the created device
   *
   * @example
   * ```typescript
   * const device = await dialstack.createDevice({
   *   mac_address: '00:04:13:aa:bb:cc',
   *   model: 'D785',
   * });
   * ```
   */
  createDevice(data: CreateDeviceRequest): Promise<ProvisionedDevice>;

  /**
   * Get a device by ID
   *
   * @param id - Device ID (e.g., 'dev_01abc...')
   * @returns Promise resolving to the device
   */
  getDevice(id: string): Promise<ProvisionedDevice>;

  /**
   * List all devices
   *
   * @param options - Optional pagination options
   * @returns Promise resolving to an array of devices
   */
  listDevices(options?: DeviceListOptions): Promise<ProvisionedDevice[]>;

  /**
   * Update a device
   *
   * @param id - Device ID
   * @param data - Update data
   * @returns Promise resolving to the updated device
   */
  updateDevice(id: string, data: UpdateDeviceRequest): Promise<ProvisionedDevice>;

  /**
   * Delete a device
   *
   * @param id - Device ID
   */
  deleteDevice(id: string): Promise<void>;

  /**
   * List provisioning events for a device
   *
   * @param deviceId - Device ID
   * @param options - Optional pagination and filter options
   * @returns Promise resolving to an array of provisioning events
   */
  listProvisioningEvents(
    deviceId: string,
    options?: ProvisioningEventListOptions
  ): Promise<ProvisioningEvent[]>;

  // ===========================================================================
  // DECT Base Methods
  // ===========================================================================

  /**
   * Create a new DECT base station
   *
   * @param data - DECT base creation data
   * @returns Promise resolving to the created base
   *
   * @example
   * ```typescript
   * const base = await dialstack.createDECTBase({
   *   mac_address: '00:04:13:aa:bb:cc',
   *   model: 'M700',
   * });
   * ```
   */
  createDECTBase(data: CreateDECTBaseRequest): Promise<DECTBase>;

  /**
   * Get a DECT base by ID
   *
   * @param id - DECT base ID (e.g., 'dectb_01abc...')
   * @returns Promise resolving to the base
   */
  getDECTBase(id: string): Promise<DECTBase>;

  /**
   * List all DECT bases
   *
   * @param options - Optional pagination options
   * @returns Promise resolving to an array of bases
   */
  listDECTBases(options?: DeviceListOptions): Promise<DECTBase[]>;

  /**
   * Update a DECT base
   *
   * @param id - DECT base ID
   * @param data - Update data
   * @returns Promise resolving to the updated base
   */
  updateDECTBase(id: string, data: UpdateDECTBaseRequest): Promise<DECTBase>;

  /**
   * Delete a DECT base
   *
   * @param id - DECT base ID
   */
  deleteDECTBase(id: string): Promise<void>;

  // ===========================================================================
  // DECT Handset Methods
  // ===========================================================================

  /**
   * Create a new DECT handset on a base station
   *
   * @param baseId - DECT base ID
   * @param data - Handset creation data
   * @returns Promise resolving to the created handset
   */
  createDECTHandset(baseId: string, data: CreateDECTHandsetRequest): Promise<DECTHandset>;

  /**
   * Get a DECT handset by ID
   *
   * @param baseId - DECT base ID
   * @param handsetId - Handset ID (e.g., 'decth_01abc...')
   * @returns Promise resolving to the handset
   */
  getDECTHandset(baseId: string, handsetId: string): Promise<DECTHandset>;

  /**
   * List all handsets for a DECT base
   *
   * @param baseId - DECT base ID
   * @returns Promise resolving to an array of handsets
   */
  listDECTHandsets(baseId: string): Promise<DECTHandset[]>;

  /**
   * Update a DECT handset
   *
   * @param baseId - DECT base ID
   * @param handsetId - Handset ID
   * @param data - Update data
   * @returns Promise resolving to the updated handset
   */
  updateDECTHandset(
    baseId: string,
    handsetId: string,
    data: UpdateDECTHandsetRequest
  ): Promise<DECTHandset>;

  /**
   * Delete a DECT handset
   *
   * @param baseId - DECT base ID
   * @param handsetId - Handset ID
   */
  deleteDECTHandset(baseId: string, handsetId: string): Promise<void>;

  // ===========================================================================
  // DECT Extension Methods
  // ===========================================================================

  /**
   * Create a DECT extension (assign a SIP line to a handset)
   *
   * @param baseId - DECT base ID
   * @param handsetId - Handset ID
   * @param data - Extension creation data
   * @returns Promise resolving to the created extension
   *
   * @example
   * ```typescript
   * const extension = await dialstack.createDECTExtension(
   *   'dectb_01abc...',
   *   'decth_01xyz...',
   *   { endpoint_id: 'ep_01def...', display_name: 'Line 1' }
   * );
   * ```
   */
  createDECTExtension(
    baseId: string,
    handsetId: string,
    data: CreateDECTExtensionRequest
  ): Promise<DECTExtension>;

  /**
   * List all extensions for a DECT handset
   *
   * @param baseId - DECT base ID
   * @param handsetId - Handset ID
   * @returns Promise resolving to an array of extensions
   */
  listDECTExtensions(baseId: string, handsetId: string): Promise<DECTExtension[]>;

  /**
   * Delete a DECT extension
   *
   * @param baseId - DECT base ID
   * @param handsetId - Handset ID
   * @param extensionId - Extension ID
   */
  deleteDECTExtension(baseId: string, handsetId: string, extensionId: string): Promise<void>;
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
