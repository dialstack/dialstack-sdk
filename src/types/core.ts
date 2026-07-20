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
  CreateDeviceRequest,
  CreateDeviceResponse,
  UpdateDeviceRequest,
  DeviceListOptions,
  DeviceUserAssignment,
  AssignDeviceUserRequest,
  ProvisioningEvent,
  ProvisioningEventListOptions,
} from './device';
import type {
  ButtonTemplate,
  ButtonTemplateWithDetails,
  TemplateButton,
  DeviceButtonOverride,
  MaterializedButton,
  CreateButtonTemplateRequest,
  UpdateButtonTemplateRequest,
  CreateTemplateButtonRequest,
  UpdateTemplateButtonRequest,
  CreateDeviceButtonOverrideRequest,
} from './button';
import type {
  PortOrder,
  CreatePortOrderRequest,
  ApprovePortOrderRequest,
  PortEligibilityResult,
} from './number-porting';
import type { PaginatedResponse, DIDItem, UpdatePhoneNumberRequest } from './phone-numbers';
import type { AIAgent, UpdateAIAgentRequest } from './ai-agent';
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
  Tos,
  OnboardingUser,
  CreateUserRequest,
  CreateExtensionRequest,
  AddressSuggestion,
  ResolvedAddress,
  OnboardingLocation,
  CreateLocationRequest,
  UpdateLocationRequest,
  E911ValidationResult,
} from './account-onboarding';

/** A resource with an id and name, used by list endpoints. */
export interface NamedResource {
  id: string;
  name: string;
  extension_number?: string;
}

export type RoutingTargetType =
  'user' | 'dial_plan' | 'voice_app' | 'ring_group' | 'queue' | 'shared_voicemail';

/**
 * Canonical display order for routing-target types — the single source of truth
 * both `routingTargets()` (result order) and the UIs (grouping order) share, so
 * adding or reordering a type happens in exactly one place.
 */
export const ROUTING_TARGET_TYPE_ORDER: readonly RoutingTargetType[] = [
  'user',
  'dial_plan',
  'voice_app',
  'ring_group',
  'queue',
  'shared_voicemail',
];

/**
 * A selectable inbound-routing destination. Not a first-class API resource —
 * it's a synthetic union assembled from the underlying resources (users, dial
 * plans, voice apps, ring groups, queues, shared voicemail boxes), each keyed
 * by its own TypeID. `id` is that underlying resource's id, which is exactly
 * what `phoneNumbers.updateRoute` accepts.
 */
export interface RoutingTarget {
  id: string;
  name: string;
  type: RoutingTargetType;
  extension_number?: string | null;
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
  /** Retrieve a call log by ID (opaque `call_` identifier; may aggregate multiple CDR legs) */
  retrieve(callId: string): Promise<CallLog>;
  /** Call transcript sub-resource */
  transcripts: CallsTranscriptsResource;
}

export interface VoicemailsResource {
  /** Retrieve the transcript for a voicemail */
  retrieveTranscript(voicemailId: string): Promise<VoicemailTranscript>;
  /** Mark a voicemail as read */
  markAsRead(voicemailId: string): Promise<void>;
  /** Delete a voicemail */
  delete(voicemailId: string): Promise<void>;
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

export interface QueuesResource {
  /** List call queues */
  list(options?: { limit?: number; expand?: string[] }): Promise<NamedResource[]>;
}

export interface VoiceAppsResource {
  /** List voice apps */
  list(options?: { limit?: number; expand?: string[] }): Promise<NamedResource[]>;
}

export interface AIAgentsResource {
  /** List AI agents for the account. */
  list(options?: { limit?: number }): Promise<AIAgent[]>;
  /** Retrieve an AI agent by ID. */
  retrieve(aiAgentId: string): Promise<AIAgent>;
  /**
   * Update an AI agent. Fields omitted from `data` are preserved server-side;
   * passing `faq_responses` replaces the full list. Privileged host surfaces
   * handle scheduling through `AIAgentHostSubmitPayload`, not this SDK-owned
   * update request.
   */
  update(aiAgentId: string, data: UpdateAIAgentRequest): Promise<AIAgent>;
}

export interface SharedVoicemailBoxesResource {
  /** List shared voicemail boxes */
  list(options?: { limit?: number }): Promise<NamedResource[]>;
}

export interface AudioClipsResource {
  /** List audio clips */
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
  /**
   * Create a device (deskphone, DECT base, or DECT handset). Returns the
   * minimal `{id, type}` payload from `POST /v1/devices`; call
   * `retrieve(id)` afterward if you need the full device.
   */
  create(request: CreateDeviceRequest): Promise<CreateDeviceResponse>;
  /** Retrieve a device by ID */
  retrieve(id: string): Promise<Device>;
  /** List all devices */
  list(options?: DeviceListOptions): Promise<Device[]>;
  /** Update a device */
  update(id: string, request: UpdateDeviceRequest): Promise<Device>;
  /** List effective programmable buttons for a device (compatibility is on the parent Device retrieve) */
  listButtons(id: string): Promise<PaginatedResponse<MaterializedButton>>;
  /** List button templates that render at least one supported button on this device */
  listCompatibleButtonTemplates(
    id: string,
    options?: { limit?: number; starting_after?: string; ending_before?: string }
  ): Promise<PaginatedResponse<ButtonTemplate>>;
  /** List per-device button overrides */
  listButtonOverrides(
    id: string,
    options?: { limit?: number; starting_after?: string; ending_before?: string }
  ): Promise<PaginatedResponse<DeviceButtonOverride>>;
  /** Create a per-device button override */
  createButtonOverride(
    id: string,
    request: CreateDeviceButtonOverrideRequest
  ): Promise<DeviceButtonOverride>;
  /** Delete a per-device button override */
  deleteButtonOverride(id: string, overrideId: string): Promise<void>;
  /** User assignments on a device (provisions the endpoint + line/extension) */
  users: DeviceUsersResource;
}

export interface DeviceUsersResource {
  /** Assign a user to a device, provisioning the endpoint + line/extension */
  create(deviceId: string, request: AssignDeviceUserRequest): Promise<DeviceUserAssignment>;
  /** List user assignments on a device */
  list(deviceId: string): Promise<DeviceUserAssignment[]>;
  /** Remove a user assignment from a device */
  del(deviceId: string, userId: string): Promise<void>;
}

export interface ButtonTemplateButtonsResource {
  /** List buttons on a template */
  list(
    templateId: string,
    options?: { limit?: number; starting_after?: string; ending_before?: string }
  ): Promise<PaginatedResponse<TemplateButton>>;
  /** Add a button to a template */
  create(templateId: string, request: CreateTemplateButtonRequest): Promise<TemplateButton>;
  /** Update a template button (position move) */
  update(
    templateId: string,
    buttonId: string,
    request: UpdateTemplateButtonRequest
  ): Promise<TemplateButton>;
  /** Delete a button from a template */
  del(templateId: string, buttonId: string): Promise<void>;
}

export interface ButtonTemplatesResource {
  /** Create a button template */
  create(request: CreateButtonTemplateRequest): Promise<ButtonTemplate>;
  /** Retrieve a button template, optionally with per-device compatibility and embedded buttons */
  retrieve(
    templateId: string,
    options?: { for_device?: string; expand?: Array<'buttons'> }
  ): Promise<ButtonTemplateWithDetails>;
  /** List button templates */
  list(options?: {
    limit?: number;
    starting_after?: string;
    ending_before?: string;
  }): Promise<PaginatedResponse<ButtonTemplate>>;
  /** Update a button template */
  update(templateId: string, request: UpdateButtonTemplateRequest): Promise<ButtonTemplate>;
  /** Delete a button template */
  del(templateId: string): Promise<void>;
  /** Template buttons sub-resource */
  buttons: ButtonTemplateButtonsResource;
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

export interface AccountTosResource {
  /**
   * Retrieve the current subscription agreement and this account's acceptance
   * state. Pass `expand: ['pricing']` to include the agreed pricing.
   */
  retrieve(options?: { expand?: string[] }): Promise<Tos>;
  /**
   * Record acceptance of the agreement at `version`. The variant is resolved
   * server-side from the account's platform.
   */
  accept(version: string): Promise<Tos>;
}

export interface AccountResource {
  /** Retrieve the current account */
  retrieve(): Promise<Account>;
  /** Update the current account */
  update(request: UpdateAccountRequest): Promise<Account>;
  /** Subscription-agreement acceptance sub-resource */
  tos: AccountTosResource;
}

export interface UsersResource {
  /** Create a user */
  create(request: CreateUserRequest): Promise<OnboardingUser>;
  /** List users */
  list(options?: { limit?: number; expand?: string[] }): Promise<OnboardingUser[]>;
  /** Delete a user */
  del(userId: string): Promise<void>;
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
    type: 'user' | 'dial_plan' | 'voice_app' | 'ring_group' | 'queue' | 'shared_voicemail';
    extension_number?: string | null;
  } | null>;
  /**
   * List all selectable inbound-routing targets for the current account by
   * fanning out over the underlying resource lists and merging the results.
   * Convenience aggregation over existing list endpoints — there is no
   * dedicated routing-targets endpoint.
   */
  routingTargets(): Promise<RoutingTarget[]>;
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
  audioClips: AudioClipsResource;
  dialPlans: DialPlansResource;
  schedules: SchedulesResource;
  ringGroups: RingGroupsResource;
  queues: QueuesResource;
  voiceApps: VoiceAppsResource;
  aiAgents: AIAgentsResource;
  sharedVoicemailBoxes: SharedVoicemailBoxesResource;
  extensions: ExtensionsResource;
  deskphones: DeskphonesResource;
  devices: DevicesResource;
  buttonTemplates: ButtonTemplatesResource;
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
