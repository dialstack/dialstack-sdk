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
 * // Create an account (billing address and agreed pricing are required)
 * const account = await dialstack.accounts.create({
 *   email: 'test@example.com',
 *   billing_address: {
 *     street: '123 Main St',
 *     city: 'New York',
 *     state: 'NY',
 *     postal_code: '10001',
 *     country: 'US',
 *   },
 *   pricing: { per_user_rate: 1999, per_did_rate: 299, per_voiceai_location_rate: 4999 },
 * });
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
import {
  createPaginatedList,
  type PaginatedList as SharedPaginatedList,
} from '../shared/pagination';

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
  /** Account ID for multi-tenant requests (passed as DialStack-Account header) */
  dialstackAccount?: string;
}

export interface RequestEvent {
  method: string;
  path: string;
  dialstackAccount?: string;
  idempotencyKey?: string;
  requestStartTime: number;
}

export interface ResponseEvent {
  method: string;
  path: string;
  statusCode: number;
  requestId?: string;
  dialstackAccount?: string;
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
  hold_music_clip_id: string | null;
  main_location_id: string | null;
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
  /**
   * Account-level override for whether the managed AI agent is offered when
   * creating a voice app. Tri-state: null/undefined inherits the platform
   * default, `true` shows it, `false` hides it.
   */
  default_agent_visible?: boolean | null;
}

export interface BillingAddress {
  address_number?: string;
  street: string;
  unit?: string;
  city: string;
  state: string;
  postal_code: string;
  country: string;
}

export interface AccountCreateParams {
  email?: string;
  config?: AccountConfig;
  /** Billing address for the account. Required when creating an account. */
  billing_address: BillingAddress;
  /** Agreed monthly rates, in cents. Required when creating an account. */
  pricing: AccountPricingParams;
}

export interface AccountUpdateParams {
  email?: string;
  config?: AccountConfig;
  hold_music_clip_id?: string | null;
  main_location_id?: string;
}

export interface AccountListParams {
  limit?: number;
  page?: string;
}

export interface AccountPricing {
  per_user_rate: number;
  per_did_rate: number;
  per_voiceai_location_rate: number;
}

/**
 * A webhook endpoint receives event notifications. Endpoints are mode-scoped:
 * an endpoint created with a live key (and `livemode: true`) only receives
 * events from live accounts; one created with a test key only receives events
 * from sandbox accounts. The signing `secret` is returned only when the
 * endpoint is created.
 */
export interface WebhookEndpoint {
  id: string;
  url: string;
  livemode: boolean;
  /** Subscribed event types, or `["*"]` for all events. */
  enabled_events: string[];
  status: 'enabled' | 'disabled';
  description: string | null;
  /** Present only on the create response. Store it to verify signatures. */
  secret?: string;
  created_at: string;
}

export interface WebhookEndpointCreateParams {
  url: string;
  /** Defaults to `["*"]` (all events) when omitted. */
  enabled_events?: string[];
  description?: string;
}

export interface WebhookEndpointUpdateParams {
  url?: string;
  enabled_events?: string[];
  status?: 'enabled' | 'disabled';
  description?: string | null;
}

export interface WebhookEndpointListParams {
  limit?: number;
  page?: string;
}

export interface AccountPricingParams {
  per_user_rate: number;
  per_did_rate: number;
  per_voiceai_location_rate: number;
}

export type AccountPricingUpdateParams = AccountPricingParams;

export interface UserConfig {
  /**
   * Whether incoming calls are held for a wake-up window when the user has no
   * active web/mobile calling session, so a push notification can wake their
   * app to answer. Enable when your application delivers push notifications
   * for this user.
   */
  mobile_push_wakeup?: boolean;
}

export interface User {
  id: string;
  name: string | null;
  email: string | null;
  config?: UserConfig;
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
  config?: {
    mobile_push_wakeup?: boolean;
  };
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

export interface ComponentConfig {
  enabled: boolean;
}

export interface AccountSessionCreateParams {
  account: string;
  /** Components to enable for this session. At least one must be enabled. */
  components: {
    call_logs?: ComponentConfig;
    voicemails?: ComponentConfig;
    call_history?: ComponentConfig;
    phone_number_ordering?: ComponentConfig;
    phone_numbers?: ComponentConfig;
    account_onboarding?: ComponentConfig;
    dial_plan?: ComponentConfig;
    ai_agent?: ComponentConfig;
    [key: string]: ComponentConfig | undefined;
  };
}

export interface AccountSessionCreateResponse {
  account_id: string;
  client_secret: string;
  expires_at: string;
}

/**
 * Parameters for dialstack.userSessions.create().
 *
 * `user` is the DialStack user TypeID (user_…) that the resulting token
 * should authenticate as. The user must already be provisioned under an
 * account belonging to the calling platform.
 *
 * `ttl_seconds` is the requested token lifetime. Defaults server-side to
 * 86400 (24 hours). Values above 604800 (7 days) are rejected.
 */
export interface UserSessionCreateParams {
  user: string;
  ttl_seconds?: number;
}

/**
 * Response from dialstack.userSessions.create().
 *
 * `user` and `account` echo the identifiers the token was minted for, so
 * callers can log/track them without decoding the JWT body. Matches the
 * shape of dialstack.accountSessions.create() which returns `account_id`.
 *
 * `client_secret` is the signed JWT to hand to the client. Use it as the
 * Bearer token when connecting to the WebRTC signalling WebSocket and
 * when calling /v1/me/* REST endpoints.
 */
export interface UserSessionCreateResponse {
  user: string;
  account: string;
  client_secret: string;
  expires_at: string;
}

/**
 * Response from dialstack.users.revokeSessions().
 *
 * `sessions_revoked_at` is the server-side cutoff: every user-session
 * token minted before this instant is invalid, REST calls with it are
 * rejected, and active WebRTC connections are torn down at their next
 * call event.
 */
export interface UserSessionsRevokeResponse {
  user: string;
  sessions_revoked_at: string;
}

// Transcript types
export type TranscriptStatus = 'pending' | 'processing' | 'completed' | 'failed';

export interface Transcript {
  call_id: string;
  status: TranscriptStatus;
  text: string | null;
}

// AI Agent types
//
// Mirrors the API resource at /v1/ai-agents/:id. Kept inline (rather than
// imported from sdk/src/types/ai-agent.ts) because the server rollup bundle
// scopes rootDir to src/server/ — see the dial-plan inline-types comment.
export interface FAQItem {
  question: string;
  answer: string;
}

export interface SchedulingConfig {
  webhook_url?: string;
}

export interface AIAgent {
  id: string;
  name: string;
  voice_app_id: string;
  persona_name?: string | null;
  greeting_name?: string | null;
  instructions?: string | null;
  faq_responses: FAQItem[];
  scheduling?: SchedulingConfig | null;
  created_at: string;
  updated_at: string;
}

export interface AIAgentCreateParams {
  name: string;
  extension_number?: string;
  persona_name?: string | null;
  greeting_name?: string | null;
  instructions?: string | null;
  faq_responses?: FAQItem[];
  scheduling?: SchedulingConfig | null;
}

export interface AIAgentUpdateParams {
  name?: string;
  persona_name?: string | null;
  greeting_name?: string | null;
  instructions?: string | null;
  faq_responses?: FAQItem[];
  scheduling?: SchedulingConfig | null;
}

export interface AIAgentListParams {
  limit?: number;
  starting_after?: string;
  ending_before?: string;
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
// NOTE: These mirror sdk/src/types/dial-plan.ts but are declared inline because
// the server rollup bundle scopes rootDir to src/server/ — importing from
// ../types/ escapes rootDir and breaks declaration emit.

export interface ScheduleNodeConfig {
  schedule_id: string;
  open?: string;
  closed?: string;
}

export interface InternalDialNodeConfig {
  target_id: string;
  timeout?: number;
  next?: string;
}

export interface RingAllUsersNodeConfig {
  timeout: number;
  next?: string;
}

export interface ExternalDialNodeConfig {
  phone_number: string;
  timeout: number;
  next?: string;
}

interface DialPlanNodeBase {
  id: string;
  position?: { x: number; y: number };
}

export interface ScheduleNode extends DialPlanNodeBase {
  type: 'schedule';
  config: ScheduleNodeConfig;
}

export interface InternalDialNode extends DialPlanNodeBase {
  type: 'internal_dial';
  config: InternalDialNodeConfig;
}

export interface RingAllUsersNode extends DialPlanNodeBase {
  type: 'ring_all_users';
  config: RingAllUsersNodeConfig;
}

export interface ExternalDialNode extends DialPlanNodeBase {
  type: 'external_dial';
  config: ExternalDialNodeConfig;
}

export type DialPlanNode = ScheduleNode | InternalDialNode | RingAllUsersNode | ExternalDialNode;

export interface DialPlan {
  id: string;
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
  /**
   * New extension number. When provided, the extension is renamed to this
   * number. Must be unique within the account (a collision returns 409).
   */
  number?: string;
}

export interface ExtensionListParams {
  limit?: number;
  target?: string;
}

// Ring Group types
export type RingGroupTimeoutAction = 'ring_user' | 'voicemail' | 'queue';

export interface RingGroup {
  id: string;
  name: string;
  timeout_seconds: number;
  ignore_forwarding: boolean;
  confirm_external: boolean;
  /** Action when no member answers within `timeout_seconds`. */
  timeout_action?: RingGroupTimeoutAction | null;
  /**
   * Target the timeout action routes to — a user (`user_…`), shared
   * voicemail box (`svm_…`), or queue (`qu_…`) TypeID, paired with
   * `timeout_action`.
   */
  timeout_target?: string | null;
  members: RingGroupMember[];
  created_at: string;
  updated_at: string;
}

export interface RingGroupMember {
  id: string;
  ring_group_id: string;
  extension: string | null;
  phone_number: string | null;
  created_at: string;
}

export interface RingGroupCreateParams {
  name: string;
  timeout_seconds?: number;
  ignore_forwarding?: boolean;
  confirm_external?: boolean;
  timeout_action?: RingGroupTimeoutAction;
  timeout_target?: string;
}

export interface RingGroupUpdateParams {
  name?: string;
  timeout_seconds?: number;
  ignore_forwarding?: boolean;
  confirm_external?: boolean;
  /** Send `null` to clear the timeout configuration. */
  timeout_action?: RingGroupTimeoutAction | null;
  timeout_target?: string | null;
}

export interface RingGroupListParams {
  limit?: number;
  page?: string;
}

export interface RingGroupAddMemberParams {
  extension?: string;
  phone_number?: string;
}

// Queue types
//
// QueueStrategy is also exported from sdk/src/types/queue.ts for the
// embedded-component side of the SDK. It is duplicated inline here
// because rollup's `rootDir: 'sdk/src/server'` forbids imports
// reaching outside the server bundle. Keep the two unions in lockstep
// until the bundler config is widened.
export type QueueStrategy =
  | 'ringall'
  | 'linear'
  | 'rrmemory'
  | 'leastrecent'
  | 'fewestcalls'
  | 'random'
  | 'wrandom';

export type QueueTimeout =
  | { type: 'ring_user'; user: string }
  | { type: 'voicemail'; voicemail: string };

/**
 * Press-1 callback configuration on a Queue. The Queue's `callback` field is
 * `null` when callbacks are disabled. Setting a non-null value enables the
 * feature; clearing it disables.
 */
export interface QueueCallbackConfig {
  /** Seconds after queue entry before offering a press-1 callback (0-3600). */
  offer_after_seconds: number;
  /**
   * Queue-specific callback outbound caller ID DID. When null, callbacks use
   * the captured inbound DID, then the account default outbound DID.
   */
  outbound_did_id: string | null;
}

/** Request shape for setting the queue callback config. */
export interface QueueCallbackConfigInput {
  offer_after_seconds?: number;
  outbound_did_id?: string | null;
}

/**
 * Periodic position-announcement configuration on a Queue. The Queue's
 * `announcements` field is `null` when announcements are disabled. Setting a
 * non-null value enables the feature; clearing it disables.
 */
export interface QueueAnnouncementsConfig {
  /** Cadence for "you are caller number N" announcements in seconds (10-600). */
  frequency_seconds: number;
}

/** Request shape for setting the queue announcements config. */
export interface QueueAnnouncementsConfigInput {
  frequency_seconds?: number;
}

export interface Queue {
  id: string;
  name: string;
  strategy: QueueStrategy;
  timeout_seconds: number;
  /** Per-agent cooldown after each call (0-600 seconds). 0 disables wrap-up. */
  wrap_up_seconds: number;
  /** Position-announcement config; null when announcements are disabled. */
  announcements: QueueAnnouncementsConfig | null;
  /** Press-1 callback config; null when callbacks are disabled. */
  callback: QueueCallbackConfig | null;
  timeout: QueueTimeout | null;
  max_queue_length: number;
  join_empty: string;
  leave_when_empty: string;
  /** Populated only when the request includes `expand[]=members`. */
  members?: ListResponse<QueueMember>;
  /** Populated only when the request includes `expand[]=extensions`. */
  extensions?: ListResponse<Extension>;
  created_at: string;
  updated_at: string;
}

export interface QueueMember {
  id: string;
  queue_id: string;
  user_id: string;
  penalty: number;
  position: number;
  created_at: string;
}

export interface QueueCreateParams {
  name: string;
  strategy?: QueueStrategy;
  timeout_seconds?: number;
  wrap_up_seconds?: number;
  /** Provide an object to enable announcements; omit or set null to disable. */
  announcements?: QueueAnnouncementsConfigInput | null;
  /** Provide an object to enable callbacks; omit or set null to disable. */
  callback?: QueueCallbackConfigInput | null;
  timeout?: QueueTimeout | null;
  max_queue_length?: number;
  join_empty?: string;
  leave_when_empty?: string;
}

export interface QueueUpdateParams {
  name?: string;
  strategy?: QueueStrategy;
  timeout_seconds?: number;
  wrap_up_seconds?: number;
  /** Send null to disable announcements; send an object to set/replace the config. */
  announcements?: QueueAnnouncementsConfigInput | null;
  /** Send null to disable callbacks; send an object to set/replace the config. */
  callback?: QueueCallbackConfigInput | null;
  timeout?: QueueTimeout | null;
  max_queue_length?: number;
  join_empty?: string;
  leave_when_empty?: string;
}

export interface QueueListParams {
  limit?: number;
  page?: string;
}

export interface QueueAddMemberParams {
  user_id: string;
  penalty?: number;
  position?: number;
}

export interface QueueListMembersParams {
  limit?: number;
  starting_after?: string;
  ending_before?: string;
}

export type QueueAgentStatus = 'available' | 'paused' | 'logged_out';

/**
 * Discriminated by `status`: `reason` is only allowed when pausing. The
 * server returns 400 for `{status: 'available' | 'logged_out', reason: ...}`.
 */
export type QueueAgentUpdateParams =
  | { status: 'paused'; reason?: string }
  | { status: 'available'; reason?: never }
  | { status: 'logged_out'; reason?: never };

export interface QueueAgent {
  user_id: string;
  status: QueueAgentStatus;
  paused_at?: string | null;
  pause_reason?: string | null;
  logged_in_at?: string | null;
  in_call_since?: string | null;
  updated_at: string;
}

// Presence types — read whether a user is reachable / on a call right now,
// verified live from the phone system. Distinct from the user-settable status
// on /v1/me/presence.
export type PresenceState = 'available' | 'on_call' | 'offline';

export interface UserPresence {
  state: PresenceState;
  /**
   * Reachable by waking a backgrounded or parked device when not currently
   * registered. A separate axis from `state`: a user can be `offline` but
   * `notifiable`.
   */
  notifiable: boolean;
}

export interface UserPresenceItem extends UserPresence {
  /** The user this presence belongs to (carries the user id). */
  user: string;
}

export interface PresenceListParams {
  /** The bounded set of users to read presence for. Capped per request. */
  users: string[];
}

// Call Control types
export interface AttachAction {
  type: 'attach';
  url: string;
}

export interface TransferAction {
  type: 'transfer';
  target: string;
  mode?: 'blind';
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

export type QueueCallLifecycleEventType =
  | 'queue.call.queued'
  | 'queue.call.dispatched'
  | 'queue.call.answered'
  | 'queue.call.abandoned'
  | 'queue.call.timed_out'
  | 'queue.call.completed';

export interface QueueCallLifecycleEvent {
  call_id: string;
  queue_id: string;
  queue_name: string;
  from_number: string;
  from_name: string | null;
  to_number: string;
  position_at_admit?: number;
  wait_seconds?: number;
}

export interface QueueCallQueuedEvent extends QueueCallLifecycleEvent {
  queued_at: string;
}

export interface QueueCallDispatchedEvent extends QueueCallLifecycleEvent {
  wait_seconds: number;
  agents_claimed: number;
  targets_dispatched: number;
  dispatched_at: string;
}

export interface QueueCallAnsweredEvent extends QueueCallLifecycleEvent {
  wait_seconds: number;
  agent_user_id: string;
  agent_endpoint_id?: string;
  answered_at: string;
}

export interface QueueCallAbandonedEvent extends QueueCallLifecycleEvent {
  wait_seconds: number;
  abandoned_at: string;
}

export interface QueueCallTimedOutEvent extends QueueCallLifecycleEvent {
  wait_seconds: number;
  timed_out_at: string;
}

export interface QueueCallCompletedEvent extends QueueCallLifecycleEvent {
  wait_seconds: number;
  agent_user_id: string;
  agent_endpoint_id?: string;
  completed_at: string;
}

// Customer Lookup Webhook types
export interface CustomerLookupWebhook {
  account_id: string;
  customer: {
    phone: string;
  };
}

export interface CustomerLookupResponse {
  found: boolean;
  customer?: {
    name: string;
    phone: string;
    existing_appointment?: {
      start_at: string;
      end_at: string;
      status: string;
    };
  };
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

export interface ListResponse<T> {
  object: string;
  url: string;
  next_page_url: string | null;
  previous_page_url: string | null;
  data: T[];
}

// ============================================================================
// Auto-Pagination Iterator
// ============================================================================
// Implementation lives in shared/pagination.ts so the WebRTC phone SDK's list
// methods get the same auto-pagination surface. The public PaginatedList<T>
// shape (single type parameter over the item) is preserved via this alias.

export type PaginatedList<T> = SharedPaginatedList<ListResponse<T>>;

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

    if (options?.dialstackAccount) {
      headers['DialStack-Account'] = options.dialstackAccount;
    }

    const requestStartTime = Date.now();

    // Emit request event
    this.emit('request', {
      method,
      path,
      dialstackAccount: options?.dialstackAccount,
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
      dialstackAccount: options?.dialstackAccount,
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

    // Handle empty bodies (204 No Content, or 200 with no body — the latter
    // is returned by endpoints like POST /v1/calls/{id} that have no useful
    // response payload).
    if (response.status === 204) {
      return undefined as T;
    }
    const text = await response.text();
    if (text.trim().length === 0) {
      return undefined as T;
    }
    return JSON.parse(text) as T;
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
    create: (params: AccountCreateParams, options?: RequestOptions): Promise<Account> => {
      return this._request('POST', '/v1/accounts', params, options);
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

    /** Retrieve the agreed pricing singleton for an account. */
    retrievePricing: (accountId: string, options?: RequestOptions): Promise<AccountPricing> => {
      return this._request('GET', `/v1/accounts/${accountId}/pricing`, undefined, options);
    },

    /**
     * Create or replace the agreed pricing for an account. All three rates
     * are required, in cents per month.
     */
    updatePricing: (
      accountId: string,
      params: AccountPricingUpdateParams,
      options?: RequestOptions
    ): Promise<AccountPricing> => {
      return this._request('POST', `/v1/accounts/${accountId}/pricing`, params, options);
    },
  };

  /**
   * Manage webhook endpoints. The mode of the endpoint (live vs sandbox) is
   * determined by the API key used — a test key creates and lists sandbox
   * endpoints, a live key creates and lists live endpoints.
   */
  webhookEndpoints = {
    create: (
      params: WebhookEndpointCreateParams,
      options?: RequestOptions
    ): Promise<WebhookEndpoint> => {
      return this._request('POST', '/v1/webhook_endpoints', params, options);
    },

    retrieve: (webhookEndpointId: string, options?: RequestOptions): Promise<WebhookEndpoint> => {
      return this._request('GET', `/v1/webhook_endpoints/${webhookEndpointId}`, undefined, options);
    },

    update: (
      webhookEndpointId: string,
      params: WebhookEndpointUpdateParams,
      options?: RequestOptions
    ): Promise<WebhookEndpoint> => {
      return this._request('POST', `/v1/webhook_endpoints/${webhookEndpointId}`, params, options);
    },

    del: (webhookEndpointId: string, options?: RequestOptions): Promise<void> => {
      return this._request(
        'DELETE',
        `/v1/webhook_endpoints/${webhookEndpointId}`,
        undefined,
        options
      );
    },

    list: (
      params?: WebhookEndpointListParams,
      options?: RequestOptions
    ): PaginatedList<WebhookEndpoint> => {
      const queryParams = new URLSearchParams();
      if (params?.limit) queryParams.set('limit', String(params.limit));
      if (params?.page) queryParams.set('page', params.page);

      const query = queryParams.toString();
      const path = `/v1/webhook_endpoints${query ? `?${query}` : ''}`;

      const fetchPage = (url: string): Promise<ListResponse<WebhookEndpoint>> => {
        return this._request('GET', url, undefined, options);
      };

      return createPaginatedList(this._request('GET', path, undefined, options), fetchPage);
    },
  };

  users = {
    create: (
      params: UserCreateParams | undefined,
      options: RequestOptions & { dialstackAccount: string }
    ): Promise<User> => {
      return this._request('POST', '/v1/users', params || {}, options);
    },

    retrieve: (
      userId: string,
      options: RequestOptions & { dialstackAccount: string }
    ): Promise<User> => {
      return this._request('GET', `/v1/users/${userId}`, undefined, options);
    },

    update: (
      userId: string,
      params: UserUpdateParams,
      options: RequestOptions & { dialstackAccount: string }
    ): Promise<User> => {
      return this._request('POST', `/v1/users/${userId}`, params, options);
    },

    del: (
      userId: string,
      options: RequestOptions & { dialstackAccount: string }
    ): Promise<void> => {
      return this._request('DELETE', `/v1/users/${userId}`, undefined, options);
    },

    list: (
      params: UserListParams | undefined,
      options: RequestOptions & { dialstackAccount: string }
    ): PaginatedList<User> => {
      const queryParams = new URLSearchParams();
      if (params?.limit) queryParams.set('limit', String(params.limit));
      if (params?.page) queryParams.set('page', params.page);

      const query = queryParams.toString();
      const path = `/v1/users${query ? `?${query}` : ''}`;

      const fetchPage = (url: string): Promise<ListResponse<User>> => {
        return this._request('GET', url, undefined, options);
      };

      return createPaginatedList(this._request('GET', path, undefined, options), fetchPage);
    },

    /**
     * Retrieve a user's live presence — reachable / on a call right now. The
     * value is always freshly verified; a read that cannot be confirmed fails
     * with 503 rather than returning a stale or guessed value (no `unknown`).
     */
    retrievePresence: (
      userId: string,
      options: RequestOptions & { dialstackAccount: string }
    ): Promise<UserPresence> => {
      return this._request('GET', `/v1/users/${userId}/presence`, undefined, options);
    },

    /**
     * Retrieve the queue-agent singleton for a user. Throws on 404 when no
     * queue-agent state has ever been written for the user.
     */
    retrieveQueueAgent: (
      userId: string,
      options: RequestOptions & { dialstackAccount: string }
    ): Promise<QueueAgent> => {
      return this._request('GET', `/v1/users/${userId}/queue-agent`, undefined, options);
    },

    /**
     * Update the queue-agent singleton for a user. Idempotent — re-sending
     * the current status is a no-op. `reason` is only meaningful when
     * `status === "paused"`.
     */
    updateQueueAgent: (
      userId: string,
      params: QueueAgentUpdateParams,
      options: RequestOptions & { dialstackAccount: string }
    ): Promise<QueueAgent> => {
      return this._request('POST', `/v1/users/${userId}/queue-agent`, params, options);
    },

    /**
     * Revoke every outstanding user-session token for a user and tear
     * down their active WebRTC sessions (server-side kill switch).
     * Platform-level, like userSessions.create() — no account header.
     */
    revokeSessions: (
      userId: string,
      options?: RequestOptions
    ): Promise<UserSessionsRevokeResponse> => {
      return this._request('POST', `/v1/users/${userId}/revoke_sessions`, {}, options);
    },
  };

  presence = {
    /**
     * Read presence for an explicit, bounded set of users in one request — the
     * candidate set a caller already has in hand. A filtered list by id, not a
     * paginated collection: results come back in request order in the standard
     * list envelope (`next_page_url`/`previous_page_url` are always null). The
     * set is capped per request; if any user cannot be resolved or read, the
     * whole request fails rather than returning a partial result.
     */
    list: (
      params: PresenceListParams,
      options: RequestOptions & { dialstackAccount: string }
    ): Promise<ListResponse<UserPresenceItem>> => {
      const queryParams = new URLSearchParams();
      for (const user of params.users) {
        queryParams.append('user[]', user);
      }
      const path = `/v1/presence?${queryParams.toString()}`;
      return this._request('GET', path, undefined, options);
    },
  };

  phoneNumbers = {
    list: (
      params: PhoneNumberListParams | undefined,
      options: RequestOptions & { dialstackAccount: string }
    ): PaginatedList<PhoneNumber> => {
      const queryParams = new URLSearchParams();
      if (params?.limit) queryParams.set('limit', String(params.limit));
      if (params?.page) queryParams.set('page', params.page);
      if (params?.status) queryParams.set('status', params.status);

      const query = queryParams.toString();
      const path = `/v1/phone-numbers${query ? `?${query}` : ''}`;

      const fetchPage = (url: string): Promise<ListResponse<PhoneNumber>> => {
        return this._request('GET', url, undefined, options);
      };

      return createPaginatedList(this._request('GET', path, undefined, options), fetchPage);
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

  userSessions = {
    create: (
      params: UserSessionCreateParams,
      options?: RequestOptions
    ): Promise<UserSessionCreateResponse> => {
      return this._request('POST', '/v1/user_sessions', params, options);
    },
  };

  calls = {
    update: (
      callId: string,
      params: CallUpdateParams,
      options: RequestOptions & { dialstackAccount: string }
    ): Promise<void> => {
      return this._request('POST', `/v1/calls/${callId}`, params, options);
    },

    retrieveTranscript: (callId: string, options?: RequestOptions): Promise<Transcript> => {
      return this._request('GET', `/v1/calls/${callId}/transcript`, undefined, options);
    },
  };

  voiceApps = {
    create: (
      params: VoiceAppCreateParams,
      options: RequestOptions & { dialstackAccount: string }
    ): Promise<VoiceApp> => {
      return this._request('POST', '/v1/voice-apps', params, options);
    },

    retrieve: (
      voiceAppId: string,
      options: RequestOptions & { dialstackAccount: string }
    ): Promise<VoiceApp> => {
      return this._request('GET', `/v1/voice-apps/${voiceAppId}`, undefined, options);
    },

    update: (
      voiceAppId: string,
      params: VoiceAppUpdateParams,
      options: RequestOptions & { dialstackAccount: string }
    ): Promise<VoiceApp> => {
      return this._request('POST', `/v1/voice-apps/${voiceAppId}`, params, options);
    },

    del: (
      voiceAppId: string,
      options: RequestOptions & { dialstackAccount: string }
    ): Promise<void> => {
      return this._request('DELETE', `/v1/voice-apps/${voiceAppId}`, undefined, options);
    },

    list: (
      params: VoiceAppListParams | undefined,
      options: RequestOptions & { dialstackAccount: string }
    ): PaginatedList<VoiceApp> => {
      const queryParams = new URLSearchParams();
      if (params?.limit) queryParams.set('limit', String(params.limit));
      if (params?.page) queryParams.set('page', params.page);

      const query = queryParams.toString();
      const path = `/v1/voice-apps${query ? `?${query}` : ''}`;

      const fetchPage = (url: string): Promise<ListResponse<VoiceApp>> => {
        return this._request('GET', url, undefined, options);
      };

      return createPaginatedList(this._request('GET', path, undefined, options), fetchPage);
    },
  };

  aiAgents = {
    create: (
      params: AIAgentCreateParams,
      options: RequestOptions & { dialstackAccount: string }
    ): Promise<AIAgent> => {
      return this._request('POST', '/v1/ai-agents', params, options);
    },

    retrieve: (
      aiAgentId: string,
      options: RequestOptions & { dialstackAccount: string }
    ): Promise<AIAgent> => {
      return this._request('GET', `/v1/ai-agents/${aiAgentId}`, undefined, options);
    },

    update: (
      aiAgentId: string,
      params: AIAgentUpdateParams,
      options: RequestOptions & { dialstackAccount: string }
    ): Promise<AIAgent> => {
      return this._request('POST', `/v1/ai-agents/${aiAgentId}`, params, options);
    },

    del: (
      aiAgentId: string,
      options: RequestOptions & { dialstackAccount: string }
    ): Promise<void> => {
      return this._request('DELETE', `/v1/ai-agents/${aiAgentId}`, undefined, options);
    },

    list: (
      params: AIAgentListParams | undefined,
      options: RequestOptions & { dialstackAccount: string }
    ): PaginatedList<AIAgent> => {
      const queryParams = new URLSearchParams();
      if (params?.limit) queryParams.set('limit', String(params.limit));
      if (params?.starting_after) queryParams.set('starting_after', params.starting_after);
      if (params?.ending_before) queryParams.set('ending_before', params.ending_before);

      const query = queryParams.toString();
      const path = `/v1/ai-agents${query ? `?${query}` : ''}`;

      const fetchPage = (url: string): Promise<ListResponse<AIAgent>> => {
        return this._request('GET', url, undefined, options);
      };

      return createPaginatedList(this._request('GET', path, undefined, options), fetchPage);
    },
  };

  schedules = {
    create: (
      params: ScheduleCreateParams,
      options: RequestOptions & { dialstackAccount: string }
    ): Promise<Schedule> => {
      return this._request('POST', '/v1/schedules', params, options);
    },

    retrieve: (
      scheduleId: string,
      options: RequestOptions & { dialstackAccount: string }
    ): Promise<Schedule> => {
      return this._request('GET', `/v1/schedules/${scheduleId}`, undefined, options);
    },

    list: (
      params: ScheduleListParams | undefined,
      options: RequestOptions & { dialstackAccount: string }
    ): PaginatedList<Schedule> => {
      const queryParams = new URLSearchParams();
      if (params?.limit) queryParams.set('limit', String(params.limit));
      if (params?.page) queryParams.set('page', params.page);

      const query = queryParams.toString();
      const path = `/v1/schedules${query ? `?${query}` : ''}`;

      const fetchPage = (url: string): Promise<ListResponse<Schedule>> => {
        return this._request('GET', url, undefined, options);
      };

      return createPaginatedList(this._request('GET', path, undefined, options), fetchPage);
    },
  };

  dialPlans = {
    create: (
      params: DialPlanCreateParams,
      options: RequestOptions & { dialstackAccount: string }
    ): Promise<DialPlan> => {
      return this._request('POST', '/v1/dialplans', params, options);
    },

    retrieve: (
      dialPlanId: string,
      options: RequestOptions & { dialstackAccount: string }
    ): Promise<DialPlan> => {
      return this._request('GET', `/v1/dialplans/${dialPlanId}`, undefined, options);
    },

    list: (
      params: DialPlanListParams | undefined,
      options: RequestOptions & { dialstackAccount: string }
    ): PaginatedList<DialPlan> => {
      const queryParams = new URLSearchParams();
      if (params?.limit) queryParams.set('limit', String(params.limit));
      if (params?.page) queryParams.set('page', params.page);

      const query = queryParams.toString();
      const path = `/v1/dialplans${query ? `?${query}` : ''}`;

      const fetchPage = (url: string): Promise<ListResponse<DialPlan>> => {
        return this._request('GET', url, undefined, options);
      };

      return createPaginatedList(this._request('GET', path, undefined, options), fetchPage);
    },
  };

  extensions = {
    create: (
      params: ExtensionCreateParams,
      options: RequestOptions & { dialstackAccount: string }
    ): Promise<Extension> => {
      return this._request('POST', '/v1/extensions', params, options);
    },

    retrieve: (
      number: string,
      options: RequestOptions & { dialstackAccount: string }
    ): Promise<Extension> => {
      return this._request('GET', `/v1/extensions/${number}`, undefined, options);
    },

    update: (
      number: string,
      params: ExtensionUpdateParams,
      options: RequestOptions & { dialstackAccount: string }
    ): Promise<Extension> => {
      return this._request('POST', `/v1/extensions/${number}`, params, options);
    },

    del: (
      number: string,
      options: RequestOptions & { dialstackAccount: string }
    ): Promise<void> => {
      return this._request('DELETE', `/v1/extensions/${number}`, undefined, options);
    },

    list: (
      params: ExtensionListParams | undefined,
      options: RequestOptions & { dialstackAccount: string }
    ): PaginatedList<Extension> => {
      const queryParams = new URLSearchParams();
      if (params?.limit) queryParams.set('limit', String(params.limit));
      if (params?.target) queryParams.set('target', params.target);

      const query = queryParams.toString();
      const path = `/v1/extensions${query ? `?${query}` : ''}`;

      const fetchPage = (url: string): Promise<ListResponse<Extension>> => {
        return this._request('GET', url, undefined, options);
      };

      return createPaginatedList(this._request('GET', path, undefined, options), fetchPage);
    },
  };

  ringGroups = {
    create: (
      params: RingGroupCreateParams,
      options: RequestOptions & { dialstackAccount: string }
    ): Promise<RingGroup> => {
      return this._request('POST', '/v1/ring_groups', params, options);
    },

    retrieve: (
      ringGroupId: string,
      options: RequestOptions & { dialstackAccount: string }
    ): Promise<RingGroup> => {
      return this._request('GET', `/v1/ring_groups/${ringGroupId}`, undefined, options);
    },

    update: (
      ringGroupId: string,
      params: RingGroupUpdateParams,
      options: RequestOptions & { dialstackAccount: string }
    ): Promise<RingGroup> => {
      return this._request('POST', `/v1/ring_groups/${ringGroupId}`, params, options);
    },

    del: (
      ringGroupId: string,
      options: RequestOptions & { dialstackAccount: string }
    ): Promise<void> => {
      return this._request('DELETE', `/v1/ring_groups/${ringGroupId}`, undefined, options);
    },

    list: (
      params: RingGroupListParams | undefined,
      options: RequestOptions & { dialstackAccount: string }
    ): PaginatedList<RingGroup> => {
      const queryParams = new URLSearchParams();
      if (params?.limit) queryParams.set('limit', String(params.limit));
      if (params?.page) queryParams.set('page', params.page);

      const query = queryParams.toString();
      const path = `/v1/ring_groups${query ? `?${query}` : ''}`;

      const fetchPage = (url: string): Promise<ListResponse<RingGroup>> => {
        return this._request('GET', url, undefined, options);
      };

      return createPaginatedList(this._request('GET', path, undefined, options), fetchPage);
    },

    addMember: (
      ringGroupId: string,
      params: RingGroupAddMemberParams,
      options: RequestOptions & { dialstackAccount: string }
    ): Promise<RingGroupMember> => {
      return this._request('POST', `/v1/ring_groups/${ringGroupId}/members`, params, options);
    },

    removeMember: (
      ringGroupId: string,
      memberId: string,
      options: RequestOptions & { dialstackAccount: string }
    ): Promise<void> => {
      return this._request(
        'DELETE',
        `/v1/ring_groups/${ringGroupId}/members/${memberId}`,
        undefined,
        options
      );
    },
  };

  queues = {
    create: (
      params: QueueCreateParams,
      options: RequestOptions & { dialstackAccount: string }
    ): Promise<Queue> => {
      return this._request('POST', '/v1/queues', params, options);
    },

    retrieve: (
      queueId: string,
      options: RequestOptions & { dialstackAccount: string }
    ): Promise<Queue> => {
      return this._request('GET', `/v1/queues/${queueId}`, undefined, options);
    },

    update: (
      queueId: string,
      params: QueueUpdateParams,
      options: RequestOptions & { dialstackAccount: string }
    ): Promise<Queue> => {
      return this._request('POST', `/v1/queues/${queueId}`, params, options);
    },

    del: (
      queueId: string,
      options: RequestOptions & { dialstackAccount: string }
    ): Promise<void> => {
      return this._request('DELETE', `/v1/queues/${queueId}`, undefined, options);
    },

    list: (
      params: QueueListParams | undefined,
      options: RequestOptions & { dialstackAccount: string }
    ): PaginatedList<Queue> => {
      const queryParams = new URLSearchParams();
      if (params?.limit) queryParams.set('limit', String(params.limit));
      if (params?.page) queryParams.set('page', params.page);

      const query = queryParams.toString();
      const path = `/v1/queues${query ? `?${query}` : ''}`;

      const fetchPage = (url: string): Promise<ListResponse<Queue>> => {
        return this._request('GET', url, undefined, options);
      };

      return createPaginatedList(this._request('GET', path, undefined, options), fetchPage);
    },

    listMembers: (
      queueId: string,
      params: QueueListMembersParams | undefined,
      options: RequestOptions & { dialstackAccount: string }
    ): PaginatedList<QueueMember> => {
      const queryParams = new URLSearchParams();
      if (params?.limit) queryParams.set('limit', String(params.limit));
      if (params?.starting_after) queryParams.set('starting_after', params.starting_after);
      if (params?.ending_before) queryParams.set('ending_before', params.ending_before);

      const query = queryParams.toString();
      const path = `/v1/queues/${queueId}/members${query ? `?${query}` : ''}`;

      const fetchPage = (url: string): Promise<ListResponse<QueueMember>> => {
        return this._request('GET', url, undefined, options);
      };

      return createPaginatedList(this._request('GET', path, undefined, options), fetchPage);
    },

    addMember: (
      queueId: string,
      params: QueueAddMemberParams,
      options: RequestOptions & { dialstackAccount: string }
    ): Promise<QueueMember> => {
      return this._request('POST', `/v1/queues/${queueId}/members`, params, options);
    },

    removeMember: (
      queueId: string,
      memberId: string,
      options: RequestOptions & { dialstackAccount: string }
    ): Promise<void> => {
      return this._request(
        'DELETE',
        `/v1/queues/${queueId}/members/${memberId}`,
        undefined,
        options
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
