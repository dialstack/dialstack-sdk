/**
 * Core SDK types for DialStack
 */

import type { AppearanceOptions, UpdateOptions } from './appearance';
import type {
  CallLog,
  ComponentTagName,
  ComponentElement,
  Transcript,
  VoicemailTranscript,
} from './components';
import type { CallEventMap, CallEventHandler } from './callbacks';
import type { DialPlan as DialPlanData, Extension } from './dial-plan';
import type {
  AvailablePhoneNumber,
  NumberOrder,
  SearchAvailableNumbersOptions,
} from './phone-number-ordering';
import type {
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
} from './device';
import type {
  PortOrder,
  CreatePortOrderRequest,
  ApprovePortOrderRequest,
  PortEligibilityResult,
} from './number-porting';
import type { PaginatedResponse, DIDItem, UpdatePhoneNumberRequest } from './phone-numbers';
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
import type {
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
} from './account-onboarding';

/** A resource with an id and name, used by list endpoints. */
export interface NamedResource {
  id: string;
  name: string;
  extension_number?: string;
}

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
      /**
       * Account TypeID (e.g. acct_...) for account-scoped SDK methods
       */
      accountId?: string;
    }
  | {
      client_secret: string;
      /**
       * ISO 8601 datetime string when the session expires
       */
      expires_at?: string;
      /**
       * Account TypeID (e.g. acct_...) for account-scoped SDK methods
       */
      account_id?: string;
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
   *   const { client_secret, expires_at, account_id } = await res.json();
   *   return {
   *     clientSecret: client_secret,
   *     expiresAt: expires_at,
   *     accountId: account_id,
   *   };
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

// =============================================================================
// Resource Namespace Types
// =============================================================================

export interface CallsTranscriptsResource {
  /** Retrieve the transcript for a call */
  retrieve(callId: string): Promise<Transcript>;
}

export interface CallsResource {
  /** Initiate an outbound call */
  create(params: { userId: string; dialString: string }): Promise<void>;
  /** Retrieve a call log (CDR) by ID */
  retrieve(callId: string): Promise<CallLog>;
  /** Call transcript sub-resource */
  transcripts: CallsTranscriptsResource;
}

export interface VoicemailsResource {
  /** Retrieve the transcript for a voicemail */
  retrieveTranscript(userId: string, voicemailId: string): Promise<VoicemailTranscript>;
}

export interface PhoneNumbersResource {
  /** Retrieve a phone number by ID */
  retrieve(phoneNumberId: string): Promise<DIDItem>;
  /** List phone numbers for the account */
  list(options?: { limit?: number; status?: string }): Promise<PaginatedResponse<DIDItem>>;
  /** Update a phone number */
  update(phoneNumberId: string, data: UpdatePhoneNumberRequest): Promise<DIDItem>;
  /** Update just the routing target for a phone number */
  updateRoute(phoneNumberId: string, routingTarget: string | null): Promise<DIDItem>;
}

export interface AvailablePhoneNumbersResource {
  /** Search for available phone numbers to purchase */
  search(options: SearchAvailableNumbersOptions): Promise<AvailablePhoneNumber[]>;
}

export interface PhoneNumberOrdersResource {
  /** Create a phone number order */
  create(phoneNumbers: string[]): Promise<NumberOrder>;
  /** Retrieve a phone number order by ID */
  retrieve(orderId: string): Promise<NumberOrder>;
  /** List phone number orders */
  list(options?: {
    limit?: number;
    status?: string;
    order_type?: string;
  }): Promise<PaginatedResponse<NumberOrder>>;
}

export interface PortOrdersResource {
  /** Create a new port order */
  create(request: CreatePortOrderRequest): Promise<PortOrder>;
  /** Retrieve a port order by ID */
  retrieve(orderId: string): Promise<PortOrder>;
  /** List port orders */
  list(options?: { limit?: number; status?: string }): Promise<PaginatedResponse<PortOrder>>;
  /** Approve a port order */
  approve(orderId: string, request: ApprovePortOrderRequest): Promise<PortOrder>;
  /** Submit a port order for processing */
  submit(orderId: string): Promise<PortOrder>;
  /** Cancel a port order */
  cancel(orderId: string): Promise<PortOrder>;
  /** Check port-in eligibility for phone numbers */
  checkEligibility(phoneNumbers: string[]): Promise<PortEligibilityResult>;
  /** Upload a CSR document */
  uploadCSR(orderId: string, file: File): Promise<void>;
  /** Upload a bill copy */
  uploadBillCopy(orderId: string, file: File): Promise<void>;
  /** Download a CSR document */
  downloadCSR(orderId: string): Promise<Blob>;
  /** Download a bill copy */
  downloadBillCopy(orderId: string): Promise<Blob>;
}

export interface DialPlansResource {
  /** Retrieve a dial plan by ID */
  retrieve(dialPlanId: string): Promise<DialPlanData>;
  /** List dial plans */
  list(options?: { limit?: number; expand?: string[] }): Promise<NamedResource[]>;
  /** Create a dial plan */
  create(data: Record<string, unknown>): Promise<DialPlanData>;
  /** Update a dial plan */
  update(dialPlanId: string, data: Record<string, unknown>): Promise<DialPlanData>;
}

export interface SchedulesResource {
  /** Retrieve a schedule by ID */
  retrieve(scheduleId: string): Promise<NamedResource>;
  /** List schedules */
  list(options?: { limit?: number }): Promise<NamedResource[]>;
}

export interface RingGroupsResource {
  /** List ring groups */
  list(options?: { limit?: number; expand?: string[] }): Promise<NamedResource[]>;
}

export interface VoiceAppsResource {
  /** List voice apps */
  list(options?: { limit?: number; expand?: string[] }): Promise<NamedResource[]>;
}

export interface SharedVoicemailBoxesResource {
  /** List shared voicemail boxes */
  list(options?: { limit?: number }): Promise<NamedResource[]>;
}

export interface ExtensionsResource {
  /** List extensions */
  list(options?: { target?: string; limit?: number }): Promise<Extension[]>;
  /** Create an extension */
  create(request: CreateExtensionRequest): Promise<Extension>;
}

export interface DeskphoneLinesResource {
  /** Create a deskphone line */
  create(deskphoneId: string, data: CreateDeskphoneLineRequest): Promise<DeviceLine>;
  /** List lines for a deskphone */
  list(deskphoneId: string): Promise<DeviceLine[]>;
  /** Update a deskphone line */
  update(
    deskphoneId: string,
    lineId: string,
    data: UpdateDeskphoneLineRequest
  ): Promise<DeviceLine>;
  /** Delete a deskphone line */
  del(deskphoneId: string, lineId: string): Promise<void>;
}

export interface DeskphoneProvisioningEventsResource {
  /** List provisioning events for a deskphone */
  list(deskphoneId: string, options?: ProvisioningEventListOptions): Promise<ProvisioningEvent[]>;
}

export interface DeskphonesResource {
  /** Create a deskphone */
  create(data: CreateDeskphoneRequest): Promise<ProvisionedDevice>;
  /** Update a deskphone */
  update(id: string, data: UpdateDeskphoneRequest): Promise<ProvisionedDevice>;
  /** Delete a deskphone */
  del(id: string): Promise<void>;
  /** Deskphone lines sub-resource */
  lines: DeskphoneLinesResource;
  /** Provisioning events sub-resource */
  provisioningEvents: DeskphoneProvisioningEventsResource;
}

export interface DevicesResource {
  /** Retrieve a device by ID */
  retrieve(id: string): Promise<Device>;
  /** List all devices */
  list(options?: DeviceListOptions): Promise<Device[]>;
}

export interface DECTHandsetsResource {
  /** Create a DECT handset */
  create(baseId: string, data: CreateDECTHandsetRequest): Promise<DECTHandset>;
  /** Retrieve a DECT handset */
  retrieve(baseId: string, handsetId: string): Promise<DECTHandset>;
  /** List handsets for a DECT base */
  list(baseId: string): Promise<DECTHandset[]>;
  /** Update a DECT handset */
  update(baseId: string, handsetId: string, data: UpdateDECTHandsetRequest): Promise<DECTHandset>;
  /** Delete a DECT handset */
  del(baseId: string, handsetId: string): Promise<void>;
}

export interface DECTExtensionsResource {
  /** Create a DECT extension */
  create(
    baseId: string,
    handsetId: string,
    data: CreateDECTExtensionRequest
  ): Promise<DECTExtension>;
  /** List extensions for a DECT handset */
  list(baseId: string, handsetId: string): Promise<DECTExtension[]>;
  /** Delete a DECT extension */
  del(baseId: string, handsetId: string, extensionId: string): Promise<void>;
}

export interface DECTBasesResource {
  /** Create a DECT base station */
  create(data: CreateDECTBaseRequest): Promise<DECTBase>;
  /** Retrieve a DECT base */
  retrieve(id: string): Promise<DECTBase>;
  /** List DECT bases */
  list(options?: DeviceListOptions): Promise<DECTBase[]>;
  /** Update a DECT base */
  update(id: string, data: UpdateDECTBaseRequest): Promise<DECTBase>;
  /** Delete a DECT base */
  del(id: string): Promise<void>;
  /** DECT handsets sub-resource */
  handsets: DECTHandsetsResource;
  /** DECT extensions sub-resource */
  extensions: DECTExtensionsResource;
}

export interface AccountResource {
  /** Retrieve the current account */
  retrieve(): Promise<Account>;
  /** Update the current account */
  update(request: UpdateAccountRequest): Promise<Account>;
}

export interface UserEndpointsResource {
  /** Create an endpoint for a user */
  create(userId: string, request?: CreateEndpointRequest): Promise<OnboardingEndpoint>;
  /** List endpoints for a user */
  list(userId: string): Promise<OnboardingEndpoint[]>;
}

export interface UsersResource {
  /** Create a user */
  create(request: CreateUserRequest): Promise<OnboardingUser>;
  /** List users */
  list(options?: { limit?: number; expand?: string[] }): Promise<OnboardingUser[]>;
  /** Delete a user */
  del(userId: string): Promise<void>;
  /** User endpoints sub-resource */
  endpoints: UserEndpointsResource;
}

export interface LocationsResource {
  /** Create a location */
  create(request: CreateLocationRequest): Promise<OnboardingLocation>;
  /** Retrieve a location by ID */
  retrieve(locationId: string): Promise<OnboardingLocation>;
  /** List locations */
  list(): Promise<OnboardingLocation[]>;
  /** Update a location */
  update(locationId: string, request: UpdateLocationRequest): Promise<OnboardingLocation>;
  /** Validate a location for E911 */
  validateE911(locationId: string): Promise<E911ValidationResult>;
  /** Provision E911 for a location */
  provisionE911(locationId: string): Promise<OnboardingLocation>;
}

/** Address lookup (BFF-only, not a public API resource) */
export interface AddressesResource {
  /** Search for address suggestions */
  suggest(query: string, country?: string): Promise<AddressSuggestion[]>;
  /** Get detailed place information */
  getPlaceDetails(placeId: string): Promise<ResolvedAddress>;
}

// =============================================================================
// DialStack SDK Instance
// =============================================================================

/**
 * The DialStack SDK instance returned by loadDialstackAndInitialize()
 */
export interface DialStackInstance {
  // ---------------------------------------------------------------------------
  // Elements lifecycle (not resource namespaces)
  // ---------------------------------------------------------------------------

  /** Create a new embedded component */
  create<T extends ComponentTagName>(tagName: T): ComponentElement[T];
  /**
   * Register an arbitrary host element to receive `dialstack-appearance-update`
   * events when {@link DialStackInstance.update} is called. Used internally by
   * React-only SDK components (no underlying custom element) so they
   * participate in the same notification path as web components.
   *
   * @internal
   */
  addAppearanceTarget(element: HTMLElement): void;
  /** @internal Inverse of {@link DialStackInstance.addAppearanceTarget}. */
  removeAppearanceTarget(element: HTMLElement): void;
  /** Update appearance for all components */
  update(updateOptions: UpdateOptions): void;
  /** Log out and clean up the session */
  logout(): Promise<void>;
  /** Make an authenticated API request */
  fetchApi(path: string, options?: RequestInit): Promise<Response>;
  /** Fetch all pages of a paginated list endpoint */
  fetchAllPages<T>(
    fetchFn: (opts: { limit: number }) => Promise<PaginatedResponse<T>>
  ): Promise<T[]>;
  /** Subscribe to real-time call events */
  on<K extends keyof CallEventMap>(event: K, handler: CallEventHandler<CallEventMap[K]>): void;
  /** Unsubscribe from real-time call events */
  off<K extends keyof CallEventMap>(event: K, handler?: CallEventHandler<CallEventMap[K]>): void;
  /** Resolve a routing target TypeID to its type and display name */
  resolveRoutingTarget(target: string): Promise<{
    id: string;
    name: string | null;
    type: 'user' | 'dial_plan' | 'voice_app' | 'ring_group' | 'shared_voicemail';
    extension_number?: string | null;
  } | null>;
  /** Get current appearance options */
  getAppearance(): AppearanceOptions | undefined;

  // ---------------------------------------------------------------------------
  // Resource namespaces
  // ---------------------------------------------------------------------------

  calls: CallsResource;
  voicemails: VoicemailsResource;
  phoneNumbers: PhoneNumbersResource;
  availablePhoneNumbers: AvailablePhoneNumbersResource;
  phoneNumberOrders: PhoneNumberOrdersResource;
  portOrders: PortOrdersResource;
  dialPlans: DialPlansResource;
  schedules: SchedulesResource;
  ringGroups: RingGroupsResource;
  voiceApps: VoiceAppsResource;
  sharedVoicemailBoxes: SharedVoicemailBoxesResource;
  extensions: ExtensionsResource;
  deskphones: DeskphonesResource;
  devices: DevicesResource;
  dectBases: DECTBasesResource;
  account: AccountResource;
  users: UsersResource;
  locations: LocationsResource;
  addresses: AddressesResource;
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

  /**
   * Account TypeID for account-scoped methods
   */
  accountId: string | null;
}

/**
 * Internal implementation of DialStackInstance (used by components)
 */
export interface DialStackInstanceImpl extends DialStackInstance {
  /**
   * Get current client secret
   */
  getClientSecret(): Promise<string>;
}
