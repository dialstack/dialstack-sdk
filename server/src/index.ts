/**
 * DialStack Server SDK
 *
 * Node.js SDK for server-side DialStack API interactions.
 * Keep your API key secure - never expose it in client-side code.
 *
 * @example
 * ```typescript
 * import { DialStack } from '@dialstack/sdk-server';
 *
 * const dialstack = new DialStack(process.env.DIALSTACK_API_KEY);
 *
 * // Create an account. Owner email, contact name, address, and agreed pricing
 * // are required. The address becomes the account's main location — the default
 * // location for emergency calling and for tax and fee jurisdiction.
 * const account = await dialstack.accounts.create({
 *   email: 'test@example.com',
 *   primary_contact_name: 'Jane Doe',
 *   address: {
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
 *   components: { call_logs: { enabled: true } },
 * });
 *
 * // List with auto-pagination
 * for await (const account of dialstack.accounts.list().autoPagingEach()) {
 *   console.log(account.id);
 * }
 * ```
 */

// Injected at build time by Rollup
declare const _NPM_PACKAGE_VERSION_: string | undefined;

const PACKAGE_VERSION =
  typeof _NPM_PACKAGE_VERSION_ === 'string' ? _NPM_PACKAGE_VERSION_ : '0.0.0-dev';

import * as crypto from 'crypto';
import {
  DialStackError,
  DialStackConnectionError,
  DialStackRateLimitError,
  type RawError,
} from './errors.js';
import { createPaginatedList, type PaginatedList as SharedPaginatedList } from './pagination.js';
// Shared with the browser SDK where the shape is identical to the documented
// wire contract. Type-only imports, so they erase at build time and pull no
// runtime code into the server bundle — unlike src/types/components.ts, which
// reaches the component graph.
//
// Deliberately NOT imported: the browser SDK's Device, DeviceUserAssignment,
// TemplateButton, DeviceButtonOverride, MaterializedButton,
// ButtonCompatibilitySummary, and the device request bodies. Those carry
// deprecated `*_id` aliases (`location_id`, `base_id`, `template_id`, …) that
// exist only for older clients and appear nowhere in the OpenAPI spec. They are
// re-declared below from the spec instead, so this surface publishes only the
// documented, canonical fields.
import type {
  ButtonCompatibilityVerdict,
  ButtonParams,
  ButtonTarget,
  ButtonType,
  ButtonTemplate,
  CreateButtonTemplateRequest,
  CreateDeviceButtonOverrideRequest,
  CreateTemplateButtonRequest,
  UpdateButtonTemplateRequest,
  UpdateTemplateButtonRequest,
  CreateDeviceResponse,
  DeviceStatus,
  DeviceType,
  DeviceSettings,
} from '@dialstack/sdk-js';

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
} from './errors.js';

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
  primary_contact_name: string | null;
  config: AccountConfig;
  hold_music_clip_id: string | null;
  main_location_id: string | null;
  /** Button template inherited by newly created deskphones and DECT handsets. */
  default_button_template: string | null;
  /**
   * Subscription-agreement (SSA/TOS) coverage status. `signed` — a live account
   * whose acceptance matches the current agreement version; `unsigned` — a live
   * account not yet accepted (or accepted against a superseded version);
   * `not_required` — a non-live account, never prompted. Filter the list with
   * `tos_status`. The full agreement + evidence is on the account tos resource.
   */
  tos_status?: 'signed' | 'unsigned' | 'not_required';
  /** When the current agreement was accepted; null unless `tos_status` is `signed`. */
  tos_accepted_at?: string | null;
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
  /** Whether call audio recordings are retained (default: true) */
  recording_enabled?: boolean;
  /**
   * Whether sensitive information (PII) is redacted from transcripts and audio
   * recordings; transcription is English-only and a recording is downloadable
   * only after redaction completes (default: false)
   */
  redaction_enabled?: boolean;
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

interface AccountCreateParamsBase {
  /** Account owner email. Required — identifies the account owner. */
  email: string;
  /** Account owner's name. Required. */
  primary_contact_name: string;
  config?: AccountConfig;
  /** Agreed monthly rates, in cents. Required when creating an account. */
  pricing: AccountPricingParams;
}

/**
 * Exactly one address is required at creation and becomes the account's main
 * location — the default location for E911 and for tax and fee jurisdiction, so
 * a single-site account is immediately set up for 911 and taxes and fees. Use
 * `address`; `billing_address` is the deprecated alias, kept for backwards
 * compatibility. Modeled as a union so omitting both (or sending both) is a
 * compile error rather than a 400.
 */
type AccountCreateAddress =
  | { address: BillingAddress; billing_address?: never }
  | {
      /** @deprecated Use `address`. Accepted for backwards compatibility; no longer authoritative. */
      billing_address: BillingAddress;
      address?: never;
    };

export type AccountCreateParams = AccountCreateParamsBase & AccountCreateAddress;

export interface AccountUpdateParams {
  email?: string;
  primary_contact_name?: string;
  config?: AccountConfig;
  hold_music_clip_id?: string | null;
  main_location_id?: string;
  /** Set or clear the template inherited by newly created compatible devices. */
  default_button_template?: string | null;
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
 * What an account is billed today, and any agreed change that has not started
 * yet. Integer cents per month.
 *
 * A rate change is boundary-only: it takes effect at the start of the next
 * month. An account's `pricing` is therefore the latest agreed pricing, which
 * between agreeing a change and the 1st is next month's. Read this when you are
 * quoting a price to a customer, so the figure you show is the rate in force
 * rather than one that has not started yet.
 *
 * A rate of `0` means no rate has been agreed for that line. It is not a price —
 * an unagreed line bills at a default that is not the customer's agreed rate —
 * so show no figure for a `0` rather than "$0.00".
 */
export interface EffectivePricing {
  object: 'effective_pricing';
  per_user_rate: number;
  per_did_rate: number;
  per_voiceai_location_rate: number;
  /** The month start the rates above took effect, `YYYY-MM-DD`. */
  effective_from: string;
  /** An agreed change that has not taken effect yet; null in the steady state. */
  next: {
    per_user_rate: number;
    per_did_rate: number;
    per_voiceai_location_rate: number;
    /** The month start the change applies from, `YYYY-MM-DD`. */
    effective_from: string;
  } | null;
}

/**
 * A recorded acceptance of the subscription agreement. Captures the evidence of
 * acceptance together with a snapshot of the pricing agreed to, so consent is
 * provable against the specific price shown even if pricing later changes.
 */
export interface TosAcceptance {
  accepted_at: string;
  /**
   * IP of the client that recorded the acceptance — the account owner's browser
   * in-portal, or your backend when your platform accepts on their behalf.
   */
  ip: string;
  user_agent?: string;
  /** The rates in force at the moment of consent. */
  pricing: AccountPricing;
}

/**
 * The account's subscription-agreement resource: the agreement currently in
 * effect plus the account's acceptance state.
 */
export interface Tos {
  /**
   * Version of the agreement in effect (date-based `YYYY-MM-DD`, which is also
   * its effective date). Echo it back when accepting so the server can reject
   * acceptance of stale text.
   */
  version: string;
  /** Canonical URL of the full agreement. */
  url: string;
  /**
   * Short affirmation the customer ticks to accept — the clickwrap checkbox
   * label, including the 911/E911 acknowledgement.
   */
  content: string;
  /** Full agreement text (HTML) to render as the body. */
  body: string;
  /** The current acceptance, or null if the account has not accepted. */
  acceptance: TosAcceptance | null;
  /**
   * The account's agreed pricing. Present only when `expand: ['pricing']` is
   * requested; null when pricing has not been set.
   */
  pricing?: AccountPricing | null;
}

export type TosExpand = 'pricing';

export interface TosAcceptParams {
  /** The version being accepted; must match the current one. */
  version: string;
}

/**
 * A webhook endpoint receives event notifications. Endpoints are mode-scoped:
 * an endpoint created with a live key (and `livemode: true`) only receives
 * events from live accounts; one created with a test key only receives events
 * from sandbox accounts. The signing `secret` is returned only when the
 * endpoint is created.
 *
 * Endpoints are platform-global by default (they receive every account's events
 * for their mode). To manage a single account's scoped endpoints instead, set
 * `dialstackAccount` (the `DialStack-Account` header) on the client or request;
 * that account's events are then delivered to its scoped endpoints in addition
 * to the platform-global ones.
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
  /**
   * Whether server-side do-not-disturb is enabled: when `true`, the calling
   * path declines calls to this user. Always emitted on responses.
   */
  do_not_disturb: boolean;
  created_at: string;
  updated_at: string;
  /**
   * Extensions assigned to this user. Present only when the request includes
   * `expand: ['extensions']`.
   */
  extensions?: ListResponse<Extension>;
}

export interface UserCreateParams {
  name?: string;
  email?: string;
}

export interface UserUpdateParams {
  name?: string;
  email?: string;
  /**
   * Enable or disable server-side do-not-disturb. Omit to leave unchanged.
   */
  do_not_disturb?: boolean;
  config?: {
    mobile_push_wakeup?: boolean;
  };
}

export interface UserListParams {
  limit?: number;
  page?: string;
  /** Filter by name or email (case-insensitive partial match). */
  search?: string;
  /** Related resources to include inline. Supported values: `extensions`. */
  expand?: UserExpand[];
}

export type UserExpand = 'extensions';

/**
 * A person who can administer an account in the admin portal.
 *
 * Admin portal users are a different population from voice {@link User}s: they
 * are identified by email and need not have phone service. An account owner
 * usually has none, and so never appears in `users.list()`. Most voice users,
 * conversely, are not administrators. The two overlap only by email address,
 * which {@link AdminUser.user} resolves for you.
 */
export interface AdminUser {
  id: string;
  /** Display name, shared across every account this person administers. */
  name: string | null;
  /** Portal login address, and the only link to a voice user. */
  email: string;
  /**
   * Role granted on this account. `owner` is the account's mandatory signer and
   * a superset of `account_admin`; there is exactly one per account.
   */
  role: 'account_admin' | 'owner';
  /**
   * This person's voice user in this account, or `null` when they have no phone
   * service. The user's id by default; the full object when `expand: ['user']`
   * is requested.
   */
  user: string | User | null;
  /** When the role was granted on this account. */
  created_at: string;
}

export interface AdminUserListParams {
  limit?: number;
  page?: string;
  /** Related resources to inline. Supported values: `user`. */
  expand?: string[];
}

export interface AdminUserRetrieveParams {
  /** Related resources to inline. Supported values: `user`. */
  expand?: string[];
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
    /**
     * Lets this session record acceptance of the subscription agreement.
     *
     * This is a capability, not a UI toggle: enabling it means the holder of
     * this session can bind the account to the agreement. Enable it only for
     * someone entitled to accept on the account's behalf — doing so asserts
     * that you presented them the agreement.
     *
     * Separate from `account_onboarding` on purpose. A session with only
     * `account_onboarding` can still read the agreement and render the accept
     * screen, so someone who may not sign still learns the account is blocked;
     * submitting without this component is rejected.
     */
    agreement_acceptance?: ComponentConfig;
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
  /**
   * Sentiment derived from the transcript. Null while transcription is
   * incomplete, or when the analysis did not produce a usable result.
   */
  sentiment?: Sentiment | null;
}

export type SentimentLabel = 'positive' | 'neutral' | 'negative';

/** Sentiment for one speaker on a two-party call. */
export interface ChannelSentiment {
  sentiment: SentimentLabel;
  /** This speaker's emotional leaning, from -1.0 to +1.0. */
  score: number;
  /** How strongly this speaker expressed feeling, 0.0 to 1.0. */
  magnitude: number;
}

/**
 * AI-derived sentiment of a call or voicemail transcript.
 *
 * Two independent axes: `score` is the emotional leaning (-1.0 to +1.0, with
 * `overall` derived from it), and `magnitude` is how strongly feeling was
 * expressed at all (0.0 to 1.0, unsigned). Read them together — a call where
 * one side was angry and the other delighted scores near 0 with a *high*
 * magnitude, while a routine call scores near 0 with a low one.
 */
export interface Sentiment {
  overall: SentimentLabel;
  score: number;
  magnitude: number;
  /** Your user's side of the conversation. Absent for single-channel audio. */
  local?: ChannelSentiment;
  /** The other party's side. Absent for single-channel audio. */
  remote?: ChannelSentiment;
}

// Call log types

/** Which leg of the call a set of quality metrics describes. */
export type QualityMetricLegType = 'pstn' | 'endpoint';

/** RTP quality metrics for a single call leg. */
export interface QualityMetricLeg {
  leg: QualityMetricLegType;
  /** The endpoint id for endpoint legs; null for PSTN legs. */
  endpoint?: string | null;
  jitter_ms?: number | null;
  jitter_min_ms?: number | null;
  jitter_max_ms?: number | null;
  jitter_stddev_ms?: number | null;
  packet_loss_pct?: number | null;
  rtt_ms?: number | null;
  rtt_min_ms?: number | null;
  rtt_max_ms?: number | null;
  rtt_stddev_ms?: number | null;
  rx_count?: number | null;
  tx_count?: number | null;
  mos?: number | null;
}

/**
 * Compact phone number reference embedded in a call log or fax when
 * `expand: ['did']` is requested. Deliberately limited to identity and the
 * dialable number — the full resource is available via `phoneNumbers`.
 */
export interface DIDSummary {
  id: string;
  /** The DID in E.164 format. */
  phone_number: string;
}

export type CallDirection = 'inbound' | 'outbound' | 'internal';

export type CallStatus = 'completed' | 'no-answer' | 'busy' | 'failed' | 'voicemail';

/**
 * Record of a completed or attempted call. The `id` is an opaque call log
 * identifier — one call log may span several underlying legs, so it does not
 * correspond to any single leg.
 *
 * The record is lifecycle-spanning: it can be retrieved while the call is still
 * live, in which case it is a sparse projection. `status`, `to_label`,
 * `ended_at`, `duration_seconds`, `answered_at`, `connected_at`,
 * `hangup_cause`, `summary`, and `recording_url` are null until the call
 * completes, and `quality_metrics` is empty. `to_number` is present live for
 * outbound and internal calls but null for inbound ones, whose routed
 * destination is resolved later.
 */
export interface CallLog {
  id: string;
  user: string | null;
  endpoint: string | null;
  /**
   * The phone number associated with this call — its id by default, or a
   * compact {@link DIDSummary} when `expand: ['did']` is requested. Null for
   * calls without a DID.
   */
  did: string | DIDSummary | null;
  direction: CallDirection;
  from_number: string;
  /**
   * The caller's display name, or null when none is available. For external
   * callers this is the raw CNAM, which may be a locality ("LA MESA CA"), a
   * placeholder ("WIRELESS CALLER"), or a restatement of `from_number` —
   * check for the latter before rendering it beside the number.
   */
  from_label: string | null;
  to_number: string | null;
  to_label: string | null;
  started_at: string;
  /**
   * When the call was answered at the signalling level. A greeting, menu, or
   * voice app answering the media path counts, so for inbound calls this is
   * often the platform answer rather than when a person picked up — use
   * `connected_at` for that.
   */
  answered_at: string | null;
  /**
   * When the winning leg answered, i.e. when live conversation began. Null when
   * the call never reached a person (abandoned during the greeting or while
   * ringing, or answered by voicemail).
   */
  connected_at: string | null;
  ended_at: string | null;
  duration_seconds: number | null;
  /** Final status, derived once the call ends. Null while the call is live. */
  status: CallStatus | null;
  /** Q.850 hangup cause of the destination leg when the call couldn't connect. */
  hangup_cause: number | null;
  summary: string | null;
  sentiment?: Sentiment | null;
  /** Signed recording download URL, valid for 10 minutes. */
  recording_url: string | null;
  quality_metrics: QualityMetricLeg[];
}

export type CallExpand = 'did';

/**
 * Filters accepted by `GET /v1/calls`.
 *
 * These names mirror what the handler actually parses, which is not always what
 * the reference documents — an unrecognized filter is ignored rather than
 * rejected, so a wrong name returns a 200 with unfiltered results. Verify
 * against the handler before adding one here.
 */
export interface CallListParams {
  limit?: number;
  page?: string;
  user_id?: string;
  /** Filter by the phone number (DID) associated with the call, by its id. */
  did?: string;
  direction?: CallDirection;
  /** Caller's phone number (exact match). */
  from_number?: string;
  /** The call's destination (exact match) — as dialed or as routed. */
  to_number?: string;
  status?: CallStatus;
  /** Return calls started on or after this date (ISO 8601). */
  from_date?: string;
  /** Return calls started before this date (ISO 8601). */
  to_date?: string;
  /** Related resources to include inline. Supported values: `did`. */
  expand?: CallExpand[];
}

export interface CallCreateParams {
  /** The user whose endpoints ring first; the destination is dialed on answer. */
  user: string;
  /** Phone number, extension, or emergency number to dial after the user answers. */
  dial_string: string;
  /**
   * Which of the account's numbers to present as caller ID for this one call,
   * as a phone number id. Must be active and outbound-enabled, otherwise the
   * request is rejected. Omit to use the standing caller ID configured for the
   * user, or failing that for the account.
   *
   * Applies to legs that leave over the carrier. On a call to an internal
   * extension the two parties see the caller's extension, so this has no
   * effect there, but it is still used for any external follow-me leg the
   * call rings on the way to them.
   */
  did?: string;
}

/** Call recording metadata with a signed download URL. */
export interface Recording {
  call_id: string;
  duration_seconds?: number | null;
  file_size_bytes?: number | null;
  /** Signed download URL. Expires after 10 minutes. */
  download_url: string;
  expires_at: string;
}

/** Which audio channel(s) a listener streams. */
export type ListenerChannel = 'caller' | 'callee' | 'both';

/**
 * A listener streams real-time audio from an active call to your server over a
 * WebSocket. Audio flows one way, and the call itself is unaffected — neither
 * party is aware of it.
 */
export interface Listener {
  id: string;
  call_id: string;
  url: string;
  channel: ListenerChannel;
  created_at: string;
}

export interface ListenerCreateParams {
  /** Secure WebSocket URL to stream to. `ws://` is rejected with 422. */
  url: string;
  /** Defaults to `both`, delivered as separate tagged messages. */
  channel?: ListenerChannel;
}

export interface ListenerListParams {
  limit?: number;
  page?: string;
}

// Voicemail types

/**
 * A voicemail message with its audio recording. Each voicemail has exactly one
 * owner — either a user or a shared voicemail box.
 */
export interface Voicemail {
  id: string;
  /** The user who received the voicemail, or the shared box it was left in. */
  owner: string;
  from_number: string;
  from_name: string | null;
  duration_seconds: number;
  /** Audio format, e.g. `mp3`. */
  format: string;
  audio_url: string;
  is_read: boolean;
  created_at: string;
  read_at: string | null;
  summary: string | null;
  /**
   * Sentiment of the voicemail transcript. Voicemail audio is single-channel,
   * so this never carries the `local`/`remote` breakdown a call does.
   */
  sentiment?: Sentiment | null;
  /**
   * The call that produced this voicemail — its id by default, or the full
   * {@link CallLog} when `expand: ['call']` is requested. Always present; null
   * for voicemails with no resolvable call (a direct-to-mailbox drop, or a row
   * predating the linkage).
   */
  call: string | CallLog | null;
}

export interface VoicemailTranscript {
  voicemail: string;
  status: TranscriptStatus;
  text: string | null;
  sentiment?: Sentiment | null;
}

export type VoicemailExpand = 'call';

export interface VoicemailListParams {
  limit?: number;
  page?: string;
  /** Scope to one owner — a user id or a shared voicemail box id. */
  owner?: string;
  is_read?: boolean;
  /** Return voicemails created on or after this date (ISO 8601). */
  from_date?: string;
  /** Related resources to include inline. Supported values: `call`. */
  expand?: VoicemailExpand[];
}

export interface VoicemailUpdateParams {
  is_read?: boolean;
}

/**
 * The greeting variant. Today only `unavailable` is supported: the full custom
 * greeting that replaces the system prompts, played when the owner doesn't
 * answer.
 */
export type VoicemailGreetingType = 'unavailable';

/**
 * A custom greeting that replaces the system-default prompts for a user mailbox
 * or shared voicemail box. Each (owner, type) pair has at most one greeting.
 */
export interface VoicemailGreeting {
  /** The user whose mailbox this belongs to, or the shared voicemail box. */
  owner: string;
  greeting_type: VoicemailGreetingType;
  /** Audio format of the stored greeting. */
  format: 'wav';
  duration_seconds: number;
  /** Size of the stored audio in bytes, post-transcode. */
  size_bytes: number;
  /** Short-lived (5 minute) signed URL for downloading the audio. */
  url?: string;
  updated_at?: string;
}

// Fax types

/**
 * An uploaded file scoped to an account, returned inline when a resource that
 * references it is expanded (e.g. a fax under `expand: ['file']`).
 */
export interface FileObject {
  object: 'file';
  id: string;
  /** What the file is used for, e.g. `fax_source`. */
  purpose: string;
  filename: string | null;
  /** Short type derived from the MIME type (e.g. `pdf`), or null if unrecognized. */
  type: string | null;
  mime_type: string;
  /** Size in bytes. */
  size: number;
  /**
   * Time-limited signed URL for the file's bytes, populated at response time
   * only. Null unless the file was returned via an expand.
   */
  url: string | null;
  created_at: string;
  updated_at: string;
}

export type FaxDirection = 'inbound' | 'outbound';

export type FaxStatus = 'pending' | 'delivered' | 'failed' | 'received';

/** Transport the fax leg negotiated. */
export type FaxTransport = 't38' | 'g711';

export interface Fax {
  id: string;
  direction: FaxDirection;
  status: FaxStatus;
  /**
   * The fax document — the file's id by default, or the full
   * {@link FileObject} with a signed `url` when `expand: ['file']` is
   * requested. Null until the document exists (an inbound row before receipt,
   * or a failed fax).
   */
  file: string | FileObject | null;
  /**
   * Your own number on the fax — the source DID outbound, the terminating DID
   * inbound. Its id by default, or a {@link DIDSummary} when
   * `expand: ['did']` is requested.
   */
  did: string | DIDSummary;
  /** Sender's number in E.164. Null inbound when caller ID was withheld. */
  from_number: string | null;
  to_number: string | null;
  call_id: string | null;
  /** Pages transmitted, once known. */
  pages: number | null;
  /**
   * Page count of the source document (outbound only). Pair with `pages` to
   * show progress while sending, e.g. "15 of 30 sent".
   */
  source_pages: number | null;
  transport: FaxTransport | null;
  error_code: string | null;
  attempts: number;
  /** When the fax was marked read. Read state is the null-ness of this field. */
  read_at: string | null;
  submitted_at: string | null;
  completed_at: string | null;
  created_at: string;
  updated_at: string;
}

export type FaxExpand = 'file' | 'did';

export interface FaxListParams {
  limit?: number;
  page?: string;
  direction?: FaxDirection;
  status?: FaxStatus;
  /** Filter by your own associated phone number, by its id. */
  did?: string;
  /**
   * Substring filter on the sender or recipient number. Non-digit characters
   * are stripped, then matched anywhere in the stored E.164 value — `415`
   * returns every fax to or from a 415 number.
   */
  number?: string;
  /** Pass `false` to show only unread faxes. */
  is_read?: boolean;
  /** Related resources to include inline. Supported values: `file`, `did`. */
  expand?: FaxExpand[];
}

export interface FaxSendParams {
  /** Id of a file uploaded with purpose `fax_source`. */
  file: string;
  /** Destination fax number. Normalized to E.164. */
  to: string;
  /** Id of the phone number to send from. Must be active and fax-enabled. */
  did: string;
}

export interface FaxUpdateParams {
  is_read?: boolean;
}

// Button template types

export type { ButtonCompatibilityVerdict, ButtonParams, ButtonTarget, ButtonType, ButtonTemplate };

export type ButtonCompatibilityReason =
  'vendor_does_not_support_type' | 'position_out_of_range_for_model' | 'device_has_no_owning_user';

/** Programmable-key compatibility for a device's effective button set. */
export interface ButtonCompatibilitySummary {
  device: {
    vendor: string;
    model: string;
    kind: 'deskphone' | 'dect_base' | 'dect_handset';
    /** Highest programmable key position known for this device model. */
    max_position: number;
  };
  supported_count: number;
  unsupported: Array<{
    template_button?: string;
    override?: string;
    position: number;
    type: ButtonType;
    reason: ButtonCompatibilityReason;
  }>;
}

/** A button row defined on a reusable template. */
export interface TemplateButton {
  id: string;
  template: string;
  position: number;
  label: string;
  type: ButtonType;
  target: ButtonTarget;
  created_at: string;
}

export interface ButtonTemplateWithDetails extends ButtonTemplate {
  /** Present only when `expand: ['buttons']` is requested. */
  buttons?: TemplateButton[];
  /** Present only when `for_device` is supplied. */
  compatibility?: ButtonCompatibilitySummary;
}

/** A per-device button override, or a suppression tombstone. */
export interface DeviceButtonOverride {
  id: string;
  device: string;
  position: number;
  /** When true, hides any template button at this position. */
  suppressed: boolean;
  label?: string | null;
  type?: ButtonType | null;
  target?: ButtonTarget;
  created_at: string;
}

/** The effective button after template rows and per-device overrides merge. */
export interface MaterializedButton {
  position: number;
  label: string;
  type: ButtonType;
  target: ButtonTarget;
  /**
   * Where the button came from. `model_default` is one the device model gets for
   * free because its hardware has no other way to reach the function — it is
   * stored nowhere, so it carries neither `template_button` nor `override`, but
   * a device override at the same position still shadows or suppresses it.
   */
  source: 'template' | 'override' | 'template_overridden' | 'model_default';
  template_button?: string | null;
  override?: string | null;
  compatibility: ButtonCompatibilityVerdict;
}

export type ButtonTemplateCreateParams = CreateButtonTemplateRequest;
export type ButtonTemplateUpdateParams = UpdateButtonTemplateRequest;
export type TemplateButtonCreateParams = CreateTemplateButtonRequest;
export type TemplateButtonUpdateParams = UpdateTemplateButtonRequest;

export type ButtonTemplateExpand = 'buttons';

export interface ButtonTemplateListParams {
  limit?: number;
  page?: string;
}

export interface ButtonTemplateRetrieveOptions {
  /**
   * Evaluate the template against a specific device and include a
   * `compatibility` summary in the response.
   */
  for_device?: string;
  /** Related resources to include inline. Supported values: `buttons`. */
  expand?: ButtonTemplateExpand[];
}

export interface TemplateButtonListParams {
  limit?: number;
  page?: string;
}

// Device types
//
// Declared from the OpenAPI schemas rather than reused from src/types/device.ts,
// which carries deprecated `*_id` aliases for older clients. `display_name` is
// likewise omitted throughout: the spec marks it `deprecated: true` as an alias
// of `name`, and `name` is canonical for every device type.
export type { CreateDeviceResponse, DeviceSettings, DeviceStatus, DeviceType };

export type DeviceRegistrationStatus = 'registered' | 'not_registered';

export type DeviceMulticellRole = 'single' | 'data_master' | 'secondary';

/** A SIP line assignment on a deskphone, mapping a line key to an endpoint. */
export interface DeviceLine {
  id: string;
  device: string;
  endpoint: string;
  /** Physical line key number on the device (1-24). */
  line_number: number;
  created_at: string;
  updated_at: string;
}

/** A SIP line assignment on a DECT handset. */
export interface HandsetLine {
  id: string;
  handset: string;
  display_name?: string | null;
  endpoint_id: string;
  /**
   * The full endpoint object. Included on list responses; the id is always
   * available as `endpoint_id`.
   */
  endpoint?: {
    id: string;
    user?: string;
    name?: string | null;
    status?: 'online' | 'offline';
    created_at?: string;
    updated_at?: string;
  } | null;
  created_at: string;
  updated_at: string;
}

export type DECTHandsetStatus = 'unpaired' | 'pending-sync' | 'registered' | 'provisioned';

/** A DECT handset paired with a base station. */
export interface DECTHandset {
  id: string;
  /** Parent base, or null while the handset is stocked but unpaired. */
  base?: string | null;
  /** International Portable Equipment Identity. */
  ipei: string;
  status: DECTHandsetStatus;
  display_name?: string | null;
  slot_number: number;
  model?: string | null;
  firmware_version?: string | null;
  registered_at?: string | null;
  /** SIP line assignments on this handset. */
  extensions?: HandsetLine[];
  created_at: string;
  updated_at: string;
}

/** A user assigned to a device. */
export interface DeviceUserAssignment {
  user: string;
  device: string;
  /** Physical line key number assigned to this user (1-24). */
  line_number?: number;
  created_at: string;
}

/**
 * A provisioned device — desk phone, DECT base station, or DECT handset. `type`
 * indicates the kind, and type-specific fields are present only for that kind.
 */
export interface Device {
  id: string;
  type: DeviceType;
  mac_address: string;
  /** Auto-detected from the MAC address. */
  vendor: string;
  model?: string | null;
  name?: string | null;
  /**
   * Physical E911 location. Set on deskphones and DECT bases; handsets have
   * none of their own and inherit from the paired base, reporting null here.
   */
  location?: string | null;
  status: DeviceStatus;
  overrides?: DeviceSettings;
  current_ip_address?: string | null;
  last_provisioned_at?: string | null;
  /**
   * Whether the device is currently reachable, derived live from its assigned
   * lines. Distinct from `status`, which only reflects whether the device has
   * fetched its configuration. A device with no lines is `not_registered`.
   */
  registration_status: DeviceRegistrationStatus;
  last_registered_at: string | null;
  /**
   * The latest call attempt involving the device, any outcome. Null until its
   * first call: presence means it has carried a call, recency means it is
   * still in use.
   */
  last_call_at: string | null;
  created_at: string;
  updated_at: string;

  // Deskphone only
  primary_line?: string | null;
  lines?: DeviceLine[];

  // DECT base only
  multicell_role?: DeviceMulticellRole | null;
  max_handsets?: number | null;
  handsets?: DECTHandset[];

  // DECT base and handset
  firmware_version?: string | null;

  // DECT handset only
  base?: string | null;
  ipei?: string | null;
  display_name?: string | null;
  slot_number?: number | null;
  registered_at?: string | null;
  extensions?: HandsetLine[];

  /** User assignments. Present only when `expand: ['users']` is requested. */
  assignments?: DeviceUserAssignment[];
  /** Programmable-key compatibility for the current effective button set. */
  compatibility?: ButtonCompatibilitySummary;
  /** The bound template's id, or null when none is bound. */
  button_template_id?: string | null;
  /**
   * The full bound template. Present only when
   * `expand: ['button_template']` is requested; the id is always available as
   * `button_template_id`.
   */
  button_template?: ButtonTemplate | null;
}

export interface DeviceCreateParams {
  /**
   * The kind to create. Optional for MAC-addressable devices: omit it and the
   * type is detected from `mac_address` via the vendor catalog. Rejected if the
   * MAC cannot be classified, or if a supplied `type` contradicts a positive
   * catalog match. `dect_handset` is IPEI-identified and must always be given.
   */
  type?: DeviceType;
  /** Required for deskphones and DECT bases. */
  mac_address?: string;
  model?: string;
  name?: string;
  overrides?: DeviceSettings;
  /** DECT base only; defaults to `single`. */
  multicell_role?: DeviceMulticellRole;
  /** E911 location, deskphone or DECT base only. Can be set later. */
  location?: string;
  /** Parent DECT base, handset only. Omit to stock the handset unpaired. */
  base?: string;
  /** Required for DECT handsets. */
  ipei?: string;
}

/**
 * `name`, `location`, `base`, and `button_template` are tri-state: omit for no
 * change, send a value to set, or send explicit `null` to clear.
 */
export interface DeviceUpdateParams {
  model?: string;
  name?: string | null;
  /** Deskphones and DECT bases only. */
  status?: DeviceStatus;
  overrides?: DeviceSettings;
  /** DECT handset only. */
  ipei?: string;
  /** E911 location, deskphone or DECT base only. */
  location?: string | null;
  /**
   * Paired DECT base, handset only — re-pair to a different base on the same
   * account, or `null` to unpair (it stays in inventory).
   */
  base?: string | null;
  button_template?: string | null;
}

export interface DeviceAssignUserParams {
  user: string;
}

/** Expansions available on a single-device read. */
export type DeviceExpand = 'users' | 'button_template';

/**
 * Expansions available on the device *list*, which is narrower than
 * {@link DeviceExpand}: the list endpoint hydrates `users` only. Requesting
 * `button_template` there is silently ignored rather than rejected, so it is not
 * offered here — read the device individually to get the template object, or use
 * the always-present `button_template_id`.
 */
export type DeviceListExpand = 'users';

export interface DeviceListParams {
  limit?: number;
  page?: string;
  /** Return only devices of this kind. */
  type?: DeviceType;
  /**
   * Return only devices assigned to this location. DECT handsets have no
   * location of their own and are omitted.
   */
  location?: string;
  /**
   * Related resources to include inline. `users` populates `assignments`.
   */
  expand?: DeviceListExpand[];
}

/**
 * 409 body for an assignment that violates the at-most-one-device-per-user
 * rule. `code` is stable, so branch on it rather than string-matching `error`.
 */
export interface DeviceUserConflictResponse {
  error: string;
  code:
    | 'user_already_assigned'
    | 'user_already_has_device'
    | 'user_already_has_endpoint'
    | 'handset_already_assigned'
    | 'device_full'
    | 'base_full';
  /** The device the user is already on. Present on `user_already_has_device`. */
  existing_device?: string;
}

export interface DeviceCheckSyncParams {
  /**
   * Reboot the device immediately after applying config, interrupting any
   * active call. The default performs a non-disruptive in-place reload.
   */
  reboot?: boolean;
}

export type DeviceCheckSyncLineStatus = 'delivered' | 'not_registered' | 'unreachable' | 'error';

export interface DeviceCheckSyncLine {
  /** 1-indexed line identifier; `0` on the device-level entry. */
  line_number: number;
  status: DeviceCheckSyncLineStatus;
  /**
   * True on the device-level reprovision attempt, used to reach a device with
   * no assigned line yet. Paired with `line_number: 0`.
   */
  management?: boolean;
}

export interface DeviceCheckSyncResponse {
  success: boolean;
  lines_notified: number;
  /**
   * Per-line outcome. Individual lines may be `unreachable` or
   * `not_registered` even when the overall request succeeded.
   */
  lines: DeviceCheckSyncLine[];
}

export interface DeviceButtonListParams {
  limit?: number;
  page?: string;
}

export type DeviceButtonOverrideCreateParams = CreateDeviceButtonOverrideRequest;

// Hardware order types

export interface HardwareCatalogItem {
  id: string;
  manufacturer: string;
  model: string;
  sku: string | null;
  /** `accessory` never becomes a device (e.g. a power supply). */
  device_type: 'deskphone' | 'dect_base' | 'dect_handset' | 'accessory';
  /** Whether the item is available for selection. */
  active: boolean;
  created_at: string;
  updated_at: string;
}

/**
 * A single physical unit on a hardware order. Requests speak quantity;
 * responses expose one item per unit — aggregate client-side for display.
 */
export interface HardwareOrderItem {
  id: string;
  /** Pre-assignment intent: the user this unit is destined for. */
  user: string | null;
  /** Pre-staging intent: the location this unit is destined for. */
  location: string | null;
  /**
   * Pre-pairing intent (handsets only): the ordered base this handset will
   * pair with. Auto-set when the order has exactly one base.
   */
  base_item: string | null;
  /**
   * The device this unit materialized into at fulfillment — its id by default,
   * or the full {@link Device} when `expand: ['items.device']` is requested.
   * Null until fulfilled.
   */
  device: string | Device | null;
  fulfilled_at: string | null;
  hardware_catalog: HardwareCatalogItem;
  created_at: string;
  updated_at: string;
}

export type HardwareOrderStatus =
  'draft' | 'submitted' | 'approved' | 'rejected' | 'fulfilled' | 'cancelled';

export interface HardwareOrder {
  id: string;
  status: HardwareOrderStatus;
  /** Why the order was declined at review. Only set when `rejected`. */
  rejection_reason: string | null;
  items: HardwareOrderItem[];
  created_at: string;
  updated_at: string;
}

export type HardwareOrderExpand = 'items.device';

export interface HardwareOrderParams {
  /** At least one line; quantity is 1-100 per line. */
  items: Array<{ hardware_catalog: string; quantity: number }>;
}

export interface HardwareOrderListParams {
  /**
   * Return only orders with a unit staged to this location. Useful for finding
   * which orders block a location delete.
   */
  location?: string;
  /** Related resources to include inline. Supported values: `items.device`. */
  expand?: HardwareOrderExpand[];
}

/**
 * Assignment intent for one ordered unit. Each field is tri-state: omit to
 * leave unchanged, pass a value to set, or pass `null` to clear. At least one
 * must be present.
 */
export interface HardwareOrderItemUpdateParams {
  user?: string | null;
  location?: string | null;
  base_item?: string | null;
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
  /**
   * Extensions assigned to this agent. Present only when the request includes
   * `expand: ['extensions']`.
   */
  extensions?: ListResponse<Extension>;
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
  /** Opaque cursor from a previous response's `next_page_url`. */
  page?: string;
  /**
   * @deprecated The API accepts no bare cursor parameters — `parseListParams`
   * reads only `limit` and `page`, and this value is discarded. Use `page` with
   * the cursor from the previous response's `next_page_url`.
   */
  starting_after?: string;
  /**
   * @deprecated The API accepts no bare cursor parameters — `parseListParams`
   * reads only `limit` and `page`, and this value is discarded. Use `page` with
   * the cursor from the previous response's `next_page_url`.
   */
  ending_before?: string;
  /** Related resources to include inline. Supported values: `extensions`. */
  expand?: AIAgentExpand[];
}

export type AIAgentExpand = 'extensions';

// Voice App types
export interface VoiceApp {
  id: string;
  name: string;
  url: string;
  status: 'active' | 'inactive';
  secret: string;
  created_at: string;
  updated_at: string;
  /**
   * Extensions routing to this voice app. Present only when the request
   * includes `expand: ['extensions']`.
   */
  extensions?: ListResponse<Extension>;
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
  /** Related resources to include inline. Supported values: `extensions`. */
  expand?: VoiceAppExpand[];
}

export type VoiceAppExpand = 'extensions';

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
  /**
   * Extensions routing to this dial plan. Present only when the request
   * includes `expand: ['extensions']`.
   */
  extensions?: ListResponse<Extension>;
}

export interface DialPlanCreateParams {
  name: string;
  entry_node: string;
  nodes: DialPlanNode[];
}

export interface DialPlanListParams {
  limit?: number;
  page?: string;
  /** Related resources to include inline. Supported values: `extensions`. */
  expand?: DialPlanExpand[];
}

export type DialPlanExpand = 'extensions';

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
  page?: string;
  target?: string;
}

// Ring Group types
export type RingGroupTimeoutAction = 'ring_user' | 'voicemail' | 'queue';

export interface RingGroup {
  id: string;
  name: string;
  timeout_seconds: number;
  /**
   * When `true`, a SIP 302 redirect (call forwarding) sent by a member's device
   * is ignored: that device is treated as busy and the group keeps ringing its
   * other members. Reaches only forwarding the device performs itself, and
   * applies to every leg the group dials, including devices reached through a
   * member's Find Me / Follow Me. It does not disable Find Me / Follow Me or
   * change which targets that produces.
   */
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
  /**
   * Extensions routing to this ring group. Present only when the request
   * includes `expand: ['extensions']`.
   */
  extensions?: ListResponse<Extension>;
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
  /**
   * When `true`, a SIP 302 redirect (call forwarding) sent by a member's device
   * is ignored: that device is treated as busy and the group keeps ringing its
   * other members. Reaches only forwarding the device performs itself, and
   * applies to every leg the group dials, including devices reached through a
   * member's Find Me / Follow Me. It does not disable Find Me / Follow Me or
   * change which targets that produces.
   */
  ignore_forwarding?: boolean;
  confirm_external?: boolean;
  timeout_action?: RingGroupTimeoutAction;
  timeout_target?: string;
}

export interface RingGroupUpdateParams {
  name?: string;
  timeout_seconds?: number;
  /**
   * When `true`, a SIP 302 redirect (call forwarding) sent by a member's device
   * is ignored: that device is treated as busy and the group keeps ringing its
   * other members. Reaches only forwarding the device performs itself, and
   * applies to every leg the group dials, including devices reached through a
   * member's Find Me / Follow Me. It does not disable Find Me / Follow Me or
   * change which targets that produces.
   */
  ignore_forwarding?: boolean;
  confirm_external?: boolean;
  /** Send `null` to clear the timeout configuration. */
  timeout_action?: RingGroupTimeoutAction | null;
  timeout_target?: string | null;
}

export interface RingGroupListParams {
  limit?: number;
  page?: string;
  /** Related resources to include inline. Supported values: `extensions`. */
  expand?: RingGroupExpand[];
}

export type RingGroupExpand = 'extensions';

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
  'ringall' | 'linear' | 'rrmemory' | 'leastrecent' | 'fewestcalls' | 'random' | 'wrandom';

/**
 * Where a caller goes when the Queue's `timeout_seconds` elapses. `voicemail`
 * covers both a user's personal box and a shared box; `queue` overflows the
 * caller into another Queue, which is rejected at write time if it would close
 * a routing loop.
 */
export type QueueTimeout =
  | { type: 'ring_user'; user: string }
  | { type: 'voicemail'; voicemail: string }
  | { type: 'queue'; queue: string };

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
  /** How long a caller waits for an agent to answer, 0-3600 seconds (one hour). `0` means the 3600 maximum. A ring already in progress when the wait is up finishes rather than being cut off. */
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
  /**
   * Audio clip (`aud_...`) played to callers waiting in this queue. Null means
   * the account's hold music applies.
   */
  hold_music_clip: string | null;
  /**
   * Audio clip (`aud_...`) played once to a caller joining the queue, before
   * hold music starts. Null when the queue has no entry prompt.
   */
  entry_prompt_clip: string | null;
  /**
   * Audio clip (`aud_...`) replayed to waiting callers every
   * `periodic_prompt_frequency_seconds`. Null when the queue has none.
   */
  periodic_prompt_clip: string | null;
  /** Seconds between plays of `periodic_prompt_clip` (10-600). */
  periodic_prompt_frequency_seconds: number;
  /**
   * The first members of the queue, always embedded and capped at 10. Use
   * `queues.listMembers()` for the full, paginated set.
   */
  members?: ListResponse<QueueMember>;
  /**
   * Extensions routing to this queue. Present only when the request includes
   * `expand: ['extensions']`.
   */
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
  /** How long a caller waits for an agent to answer, 0-3600 seconds (one hour). Defaults to 300. `0` means the 3600 maximum. */
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
  /** Audio clip (`aud_...`) for this queue's hold music; omit to use the account's. */
  hold_music_clip?: string | null;
  /** Audio clip (`aud_...`) played once when a caller joins, before hold music. */
  entry_prompt_clip?: string | null;
  /** Audio clip (`aud_...`) replayed to waiting callers. */
  periodic_prompt_clip?: string | null;
  /** Seconds between plays of `periodic_prompt_clip` (10-600; default 60). */
  periodic_prompt_frequency_seconds?: number;
}

export interface QueueUpdateParams {
  name?: string;
  strategy?: QueueStrategy;
  /** How long a caller waits for an agent to answer, 0-3600 seconds (one hour). `0` means the 3600 maximum. A ring already in progress when the wait is up finishes rather than being cut off. */
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
  /**
   * Audio clip (`aud_...`) for this queue's hold music. Send null to fall back
   * to the account's hold music; omit to leave unchanged.
   */
  hold_music_clip?: string | null;
  /**
   * Audio clip (`aud_...`) played once when a caller joins. Send null to remove
   * the prompt; omit to leave unchanged.
   */
  entry_prompt_clip?: string | null;
  /**
   * Audio clip (`aud_...`) replayed to waiting callers. Send null to remove the
   * prompt; omit to leave unchanged.
   */
  periodic_prompt_clip?: string | null;
  /** Seconds between plays of `periodic_prompt_clip` (10-600). */
  periodic_prompt_frequency_seconds?: number;
}

export interface QueueListParams {
  limit?: number;
  page?: string;
  /** Related resources to include inline. Supported values: `extensions`. */
  expand?: QueueExpand[];
}

export type QueueExpand = 'extensions';

export interface QueueAddMemberParams {
  user_id: string;
  penalty?: number;
  position?: number;
}

export interface QueueListMembersParams {
  limit?: number;
  /** Opaque cursor from a previous response's `next_page_url`. */
  page?: string;
  /**
   * @deprecated The API accepts no bare cursor parameters — `parseListParams`
   * reads only `limit` and `page`, and this value is discarded. Use `page` with
   * the cursor from the previous response's `next_page_url`.
   */
  starting_after?: string;
  /**
   * @deprecated The API accepts no bare cursor parameters — `parseListParams`
   * reads only `limit` and `page`, and this value is discarded. Use `page` with
   * the cursor from the previous response's `next_page_url`.
   */
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

/**
 * A user's reachability over WebRTC (a browser or in-app softphone)
 * specifically, separate from the top-level `state`, which reflects any
 * endpoint type.
 */
export interface WebRTCReachability {
  /**
   * WebRTC-only reachability, using the same values as `state` but scoped to
   * WebRTC: `available` (a live WebRTC session, ready to ring), `on_call` (on a
   * call answered in a WebRTC session), or `offline` (no live WebRTC session —
   * the user may still be reachable on another endpoint type).
   *
   * Unlike the top-level `state`, this does not carry a strict no-unknown
   * guarantee: attributing a call to WebRTC depends on a label the answering leg
   * carries, and a call answered before that label was available reads as
   * not-on-WebRTC rather than failing the request. The condition is transient
   * and clears as calls turn over.
   */
  state: PresenceState;
  /**
   * Number of live WebRTC sessions (e.g. the same user on two browser tabs
   * counts as two).
   *
   * Eventually consistent in both directions, not an exact live count. A
   * reconnecting session (network change, sleep/wake) may be counted twice for a
   * short window until the old connection times out, so this can briefly
   * over-count; a just-established session may not be counted yet, so it can
   * briefly under-count. In particular this can read `0` while `state` is
   * `available` or `on_call` — `state` is the reachability answer, and
   * `sessions` is a best-effort "how many" alongside it.
   */
  sessions: number;
}

export interface UserPresence {
  /**
   * The resource this is. Always `'user_presence'`. Present on the singleton
   * read as well as on every element of a presence list, which is what tells
   * user presence apart from the other presentity types a list can carry.
   */
  object: 'user_presence';
  state: PresenceState;
  /**
   * Reachable by waking a backgrounded or parked device when not currently
   * registered. A separate axis from `state`: a user can be `offline` but
   * `notifiable`.
   */
  notifiable: boolean;
  /**
   * Whether server-side do-not-disturb is enabled. A separate axis from
   * `state`: a user can be `available` but decline calls because
   * `do_not_disturb` is on. Always emitted on responses.
   */
  do_not_disturb: boolean;
  /** WebRTC-specific reachability, separate from the endpoint-agnostic `state`. */
  webrtc: WebRTCReachability;
}

export interface UserPresenceItem extends UserPresence {
  /** The user this presence belongs to (carries the user id). */
  user: string;
}

/** The call occupying a park slot. */
export interface ParkedCall {
  /**
   * The call this parked leg belongs to, or `null` if no call id was recorded
   * when the call was parked. A `null` here does not mean the slot is free: an
   * occupant can be present without a recorded call id. `parked_call` is what
   * says whether the slot is occupied.
   */
  call: string | null;
  /** The parked caller's number, same vocabulary as a call log's `from_number`. */
  from_number: string;
  /**
   * The parked caller's display name, same vocabulary as a call log's
   * `from_label`. Passed through as received — a locality or a placeholder like
   * `WIRELESS CALLER` are both things carriers send, and whether to filter them
   * is left to you.
   */
  from_label: string;
  /**
   * `'parked'` while the caller waits, `'ringing_back'` once the park has timed
   * out and the parker's phones are being called. Both are occupied states — the
   * caller stays on hold throughout — so `'ringing_back'` is not a slot that has
   * been released. Use this instead of comparing `rings_back_at` against the
   * clock.
   */
  status: 'parked' | 'ringing_back';
  /**
   * The user who parked the call, or `null` if no parker id was recorded, which
   * likewise does not mean the slot is free.
   */
  parked_by: string | null;
  /**
   * The extension of the user who parked the call. Carried alongside
   * `parked_by` so the parker can be identified without a second request. Absent
   * for a user with no extension.
   */
  parked_by_extension?: string;
  /** When the call was parked. */
  parked_at: string;
  /**
   * When the call rings back to whoever parked it, if nobody retrieves it first.
   * The caller is not disconnected at this moment provided somebody answers the
   * ring-back; if nobody does, the call ends there. Watch `status` for which
   * happened.
   */
  rings_back_at: string;
}

/**
 * One park slot's current state.
 *
 * Describes state rather than a transition, so it fully replaces whatever was
 * previously known about the slot, and receiving the same one twice changes
 * nothing. A slot with nobody in it arrives as `parked_call: null`, which says
 * the slot is now free rather than asserting that the slot durably exists. Slots
 * absent from a snapshot are free.
 */
export interface ParkSlotPresence {
  /** The resource this is. Always `'park_slot'`. */
  object: 'park_slot';
  /** The slot number, as dialled (`*68<slot>`). */
  slot: number;
  /**
   * The occupant, or `null` when the slot is free. This is the only signal of
   * occupancy — there is no separate boolean to agree with.
   */
  parked_call: ParkedCall | null;
}

/** Any presentity a presence response can carry, discriminated by `object`. */
export type PresenceItem = UserPresenceItem | ParkSlotPresence;

export interface PresenceListParams {
  /** The bounded set of users to read presence for. Capped per request. */
  users?: string[];
  /**
   * Set true to include every call currently parked in the account. Park slots
   * are not a configured inventory, so with this alone the response carries only
   * the occupied slots and anything absent is free.
   *
   * Ignored when `parkSlotNumbers` is given: naming slots is the more specific
   * request, and the two cannot be combined.
   */
  parkSlots?: boolean;
  /**
   * The specific slots to read. Each named slot comes back, free ones included,
   * so the response covers the full set you asked for rather than only the
   * occupied slots.
   */
  parkSlotNumbers?: number[];
}

/** Handlers for a park-slot subscription. All optional. */
export interface ParkSlotSubscriptionHandlers {
  /**
   * Every slot's current state, delivered on connect and again after every
   * reconnect. Replace whatever you had wholesale rather than merging.
   */
  onSnapshot?: (slots: ParkSlotPresence[]) => void;
  /** One slot's new state. It supersedes what you had; there is no history. */
  onSlot?: (slot: ParkSlotPresence) => void;
  /**
   * The server ended the subscription and a reconnect is needed — `reason` is
   * why. Recovery is the same in every case: reconnect and take the fresh
   * snapshot. Not called when you close the subscription yourself.
   */
  onTerminated?: (reason: string) => void;
  /** Transport or parse failure. The subscription is no longer live. */
  onError?: (error: Error) => void;
}

/** A live park-slot subscription. Call `close()` to stop it. */
export interface ParkSlotSubscription {
  close: () => void;
}

/** Options for `presence.subscribeParkSlots`. */
export interface ParkSlotSubscriptionOptions {
  /**
   * The specific slots to watch. Naming them subscribes to exactly those, and
   * every snapshot then carries each one — free slots included — so a snapshot
   * covers the full set you asked for rather than only the occupied part.
   *
   * Omit to watch every slot in the account. Park slots are not provisioned (a
   * slot exists only while a call sits in it), so with no slots named a snapshot
   * carries only the occupied ones and anything absent is free.
   */
  slots?: number[];
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
// Implementation lives in ./pagination.ts — a copy, not a shared import: this
// package publishes with no runtime dependencies, so it cannot reach into a
// sibling for it. The public PaginatedList<T> shape (single type parameter over
// the item) is preserved via this alias.

export type PaginatedList<T> = SharedPaginatedList<ListResponse<T>>;

// Test-mode helpers (sandbox only). See the "Testing your integration" guide.

export interface TestScenarioOverride {
  outcome?: 'answered' | 'no-answer' | 'busy' | 'voicemail';
  ring_seconds?: number;
  talk_seconds?: number;
  recording?: boolean;
  voicemail_seconds?: number;
}

export interface TestCallCreateParams {
  /** Target user for inbound, or originating user for outbound. Required. */
  user: string;
  /** 'inbound' (default) or 'outbound'. */
  direction?: 'inbound' | 'outbound';
  /** Caller number for inbound (E.164); ignored for outbound. */
  from_number?: string;
  /** Optional caller display name. */
  from_name?: string;
  /** Dialed number for outbound; its magic-number value selects the scenario. */
  to_number?: string;
  /** Explicit scenario override. */
  scenario?: TestScenarioOverride;
}

export interface TestCallResponse {
  id: string;
  scenario: string;
}

export interface TestEventCreateParams {
  /** Webhook event type to emit (e.g. 'queue.call.answered', 'fax.delivered'). */
  event: string;
}

export interface TestEventResponse {
  event: string;
}

/**
 * Serialize list/retrieve parameters into a query string, including the leading
 * `?`, or `''` when there is nothing to send.
 *
 * `expand` is emitted as a repeated `expand[]` parameter — one entry per value —
 * because that is the form the API parses. Joining the values into a single
 * `expand[]=a,b` is silently ignored server-side, which reads as "expand does
 * not work" rather than as an error.
 */
function buildQuery(params?: { limit?: number; page?: string; expand?: string[] }): string {
  if (!params) return '';

  const queryParams = new URLSearchParams();
  if (params.limit) queryParams.set('limit', String(params.limit));
  if (params.page) queryParams.set('page', params.page);
  for (const value of params.expand ?? []) {
    queryParams.append('expand[]', value);
  }

  const query = queryParams.toString();
  return query ? `?${query}` : '';
}

// ============================================================================
// Query-string helpers
// ============================================================================

/**
 * Append an `expand[]` pair per requested expansion.
 *
 * The API reads `expand[]` as a repeated key, so each value gets its own pair —
 * a single comma-joined value is not recognized and the expansion is silently
 * skipped.
 */
function appendExpand(queryParams: URLSearchParams, expand?: readonly string[]): void {
  for (const value of expand ?? []) {
    queryParams.append('expand[]', value);
  }
}

/**
 * Build the query string for a request whose only parameter is `expand[]`.
 * Returns an empty string when nothing is expanded.
 */
function expandQuery(expand?: readonly string[]): string {
  const queryParams = new URLSearchParams();
  appendExpand(queryParams, expand);
  const query = queryParams.toString();
  return query ? `?${query}` : '';
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
    const parts = [`dialstack-node/${PACKAGE_VERSION}`];
    if (this._appInfo) {
      parts.push(`${this._appInfo.name}/${this._appInfo.version || '0.0.0'}`);
    }
    return parts.join(' ');
  }

  /**
   * Opens the park-slot event stream and dispatches frames to the handlers,
   * reconnecting until closed.
   *
   * Uses fetch rather than EventSource because EventSource cannot set an
   * Authorization header. Every reconnect re-reads the snapshot, which is what
   * makes recovery from any gap a complete resync rather than a merge.
   */
  private _subscribeParkSlots(
    handlers: ParkSlotSubscriptionHandlers,
    options: RequestOptions & { dialstackAccount: string } & ParkSlotSubscriptionOptions
  ): ParkSlotSubscription {
    let closed = false;
    let controller: AbortController | null = null;

    // `all` and specific slots are mutually exclusive server-side (they disagree
    // about whether free slots are emitted), so send one or the other.
    const query = new URLSearchParams();
    if (options.slots?.length) {
      for (const slot of options.slots) {
        query.append('park_slot[]', String(slot));
      }
    } else {
      query.set('park_slot[]', 'all');
    }
    const url = `${this._apiUrl}/v1/presence?${query.toString()}`;

    const run = async (): Promise<void> => {
      // Reconnect delay, escalated on repeated failure so a persistent outage
      // does not become a hot loop. Reset on every successful connect.
      let backoffMs = 1000;

      while (!closed) {
        controller = new AbortController();
        try {
          const response = await fetch(url, {
            headers: {
              Authorization: `Bearer ${this._apiKey}`,
              'DialStack-Account': options.dialstackAccount,
              'User-Agent': this.getUserAgent(),
              Accept: 'text/event-stream',
            },
            signal: controller.signal,
          });

          if (response.status === 429) {
            // The server told us how long to wait; honour it rather than
            // reconnecting into the same refusal. Escalate and report anyway:
            // nothing guarantees an intermediary preserves Retry-After, and
            // without both this would retry once a second forever with the caller
            // told nothing.
            const retryAfter = Number(response.headers.get('Retry-After'));
            void response.body?.cancel();
            handlers.onError?.(
              new Error('presence stream refused: too many concurrent connections')
            );
            await delay(
              Number.isFinite(retryAfter) && retryAfter > 0 ? retryAfter * 1000 : backoffMs
            );
            backoffMs = Math.min(backoffMs * 2, 30_000);
            continue;
          }
          if (!response.ok || !response.body) {
            void response.body?.cancel();
            throw new Error(`presence stream failed with status ${response.status}`);
          }

          backoffMs = 1000;
          await this._consumeParkSlotStream(response.body, handlers);
        } catch (error) {
          if (closed || (error as Error)?.name === 'AbortError') {
            return;
          }
          handlers.onError?.(error instanceof Error ? error : new Error(String(error)));
        }

        if (closed) {
          return;
        }
        await delay(backoffMs);
        backoffMs = Math.min(backoffMs * 2, 30_000);
      }
    };

    void run();

    return {
      close: () => {
        closed = true;
        controller?.abort();
      },
    };
  }

  /** Reads SSE frames off a response body until it ends. */
  private async _consumeParkSlotStream(
    body: ReadableStream<Uint8Array>,
    handlers: ParkSlotSubscriptionHandlers
  ): Promise<void> {
    const reader = body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';

    for (;;) {
      const { done, value } = await reader.read();
      if (done) {
        return;
      }
      buffer += decoder.decode(value, { stream: true });

      const frames = buffer.split('\n\n');
      // The trailing element is an incomplete frame; keep it for the next read.
      buffer = frames.pop() ?? '';
      for (const frame of frames) {
        dispatchParkSlotFrame(frame, handlers);
      }
    }
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

    // A FormData body is passed through untouched and without a Content-Type,
    // so fetch can set multipart/form-data with its own boundary. Used by the
    // file-upload endpoints.
    const isMultipart = typeof FormData !== 'undefined' && body instanceof FormData;

    const headers: Record<string, string> = {
      Authorization: `Bearer ${this._apiKey}`,
      'User-Agent': this.getUserAgent(),
    };

    if (!isMultipart) {
      headers['Content-Type'] = 'application/json';
    }

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
          let requestBody: BodyInit | undefined;
          if (isMultipart) {
            requestBody = body as FormData;
          } else if (body) {
            requestBody = JSON.stringify(body);
          }

          response = await fetch(url, {
            method,
            headers,
            body: requestBody,
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

        // Two body shapes are in play. Most handlers return the message as a
        // *string* under `error`, alongside siblings like `code` and
        // `existing_device` — so the envelope itself is the raw error. A few
        // (via echo.NewHTTPError) return `{ message }`, and some nest an object
        // under `error`. Treating a string `error` as the raw object would drop
        // `code` and every sibling field, and lose the message.
        const nested =
          typeof errorData?.error === 'object' && errorData.error !== null
            ? errorData.error
            : undefined;
        rawError = nested ?? errorData;
        errorMessage =
          rawError?.message ??
          (typeof errorData?.error === 'string' ? errorData.error : undefined) ??
          errorMessage;
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
      if (params?.limit !== undefined) queryParams.set('limit', String(params.limit));
      if (params?.page) queryParams.set('page', params.page);

      const query = queryParams.toString();
      const path = `/v1/accounts${query ? `?${query}` : ''}`;

      const fetchPage = (url: string): Promise<ListResponse<Account>> => {
        return this._request('GET', url, undefined, options);
      };

      return createPaginatedList(this._request('GET', path, undefined, options), fetchPage);
    },

    /**
     * Retrieve the agreed pricing singleton for an account. These are the
     * latest agreed rates; see `retrieveEffectivePricing` for what is billed
     * today.
     */
    retrievePricing: (accountId: string, options?: RequestOptions): Promise<AccountPricing> => {
      return this._request('GET', `/v1/accounts/${accountId}/pricing`, undefined, options);
    },

    /**
     * Retrieve what an account is billed today, plus any agreed change that has
     * not started yet. Use this rather than `retrievePricing` when quoting a
     * price to a customer: rate changes take effect at the start of the next
     * month, so the agreed pricing is not always what is being charged.
     */
    retrieveEffectivePricing: (
      accountId: string,
      options?: RequestOptions
    ): Promise<EffectivePricing> => {
      return this._request(
        'GET',
        `/v1/accounts/${accountId}/effective-pricing`,
        undefined,
        options
      );
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

    /**
     * Retrieve the account's subscription agreement and its acceptance state.
     * Pass `expand: ['pricing']` to include the pricing the customer is
     * accepting.
     */
    retrieveTos: (
      accountId: string,
      options?: RequestOptions & { expand?: TosExpand[] }
    ): Promise<Tos> => {
      const path = `/v1/accounts/${accountId}/tos${expandQuery(options?.expand)}`;
      return this._request('GET', path, undefined, options);
    },

    /**
     * Record the account owner's acceptance of the agreement. Calling this with
     * your secret key asserts that you presented the agreement to the owner and
     * they accepted; the evidence (timestamp, IP, user agent) is derived from
     * the request, never taken from the body.
     *
     * `version` must match the current agreement (409 otherwise), and the
     * account's pricing must already be set since the agreement embeds it (422
     * otherwise). Re-accepting the same version is idempotent.
     */
    acceptTos: (
      accountId: string,
      params: TosAcceptParams,
      options?: RequestOptions
    ): Promise<Tos> => {
      return this._request('POST', `/v1/accounts/${accountId}/tos`, params, options);
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
      if (params?.limit !== undefined) queryParams.set('limit', String(params.limit));
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
      options: RequestOptions & { dialstackAccount: string; expand?: UserExpand[] }
    ): Promise<User> => {
      const path = `/v1/users/${userId}${expandQuery(options.expand)}`;
      return this._request('GET', path, undefined, options);
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
      if (params?.limit !== undefined) queryParams.set('limit', String(params.limit));
      if (params?.page) queryParams.set('page', params.page);
      if (params?.search) queryParams.set('search', params.search);
      appendExpand(queryParams, params?.expand);

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
    ): Promise<ListResponse<PresenceItem>> => {
      const path = `/v1/presence?${presenceQuery(params).toString()}`;
      return this._request('GET', path, undefined, options);
    },

    /**
     * Subscribe to the account's park slots.
     *
     * Every slot's current state arrives immediately via `onSnapshot`, then one
     * `onSlot` call per change. Frames carry state, not transitions: a slot
     * being freed arrives as `parked_call: null`. A frame
     * always says what the slot is now, so there is no log of parks and unparks
     * to reconcile.
     *
     * Reconnects automatically, and every reconnect delivers a fresh snapshot —
     * a complete resync, so there is no sequence number to track. If the server
     * can no longer verify slot state it ends the subscription rather than let it
     * drift silently; `onTerminated` reports why, and the reconnect that follows
     * repairs it.
     *
     * Users cannot be subscribed to — read their presence with `list` instead.
     */
    subscribeParkSlots: (
      handlers: ParkSlotSubscriptionHandlers,
      options: RequestOptions & { dialstackAccount: string } & ParkSlotSubscriptionOptions
    ): ParkSlotSubscription => this._subscribeParkSlots(handlers, options),
  };

  phoneNumbers = {
    list: (
      params: PhoneNumberListParams | undefined,
      options: RequestOptions & { dialstackAccount: string }
    ): PaginatedList<PhoneNumber> => {
      const queryParams = new URLSearchParams();
      if (params?.limit !== undefined) queryParams.set('limit', String(params.limit));
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
    /**
     * Place an outbound call. The user's endpoints ring first; when the user
     * answers, `dial_string` is dialed. Accepted asynchronously — the call
     * progresses over webhooks, so there is no response body.
     */
    create: (
      params: CallCreateParams,
      options: RequestOptions & { dialstackAccount: string }
    ): Promise<void> => {
      return this._request('POST', '/v1/calls', params, options);
    },

    list: (
      params: CallListParams | undefined,
      options: RequestOptions & { dialstackAccount: string }
    ): PaginatedList<CallLog> => {
      const queryParams = new URLSearchParams();
      if (params?.limit !== undefined) queryParams.set('limit', String(params.limit));
      if (params?.page) queryParams.set('page', params.page);
      if (params?.user_id) queryParams.set('user_id', params.user_id);
      if (params?.did) queryParams.set('did', params.did);
      if (params?.direction) queryParams.set('direction', params.direction);
      if (params?.from_number) queryParams.set('from_number', params.from_number);
      if (params?.to_number) queryParams.set('to_number', params.to_number);
      if (params?.status) queryParams.set('status', params.status);
      if (params?.from_date) queryParams.set('from_date', params.from_date);
      if (params?.to_date) queryParams.set('to_date', params.to_date);
      appendExpand(queryParams, params?.expand);

      const query = queryParams.toString();
      const path = `/v1/calls${query ? `?${query}` : ''}`;

      const fetchPage = (url: string): Promise<ListResponse<CallLog>> => {
        return this._request('GET', url, undefined, options);
      };

      return createPaginatedList(this._request('GET', path, undefined, options), fetchPage);
    },

    /**
     * Retrieve a call log. Safe to call while the call is still live, in which
     * case the completion-only fields are null — see {@link CallLog}.
     */
    retrieve: (
      callId: string,
      options: RequestOptions & { dialstackAccount: string; expand?: CallExpand[] }
    ): Promise<CallLog> => {
      const path = `/v1/calls/${callId}${expandQuery(options.expand)}`;
      return this._request('GET', path, undefined, options);
    },

    update: (
      callId: string,
      params: CallUpdateParams,
      options: RequestOptions & { dialstackAccount: string }
    ): Promise<void> => {
      return this._request('POST', `/v1/calls/${callId}`, params, options);
    },

    retrieveTranscript: (
      callId: string,
      options: RequestOptions & { dialstackAccount: string }
    ): Promise<Transcript> => {
      return this._request('GET', `/v1/calls/${callId}/transcript`, undefined, options);
    },

    /**
     * Retrieve recording metadata with a signed download URL. The URL expires
     * after 10 minutes, so fetch it when you are ready to download.
     */
    retrieveRecording: (
      callId: string,
      options: RequestOptions & { dialstackAccount: string }
    ): Promise<Recording> => {
      return this._request('GET', `/v1/calls/${callId}/recording`, undefined, options);
    },

    /**
     * Start streaming live audio from an active call to your WebSocket server.
     * Neither party is aware of the listener.
     */
    createListener: (
      callId: string,
      params: ListenerCreateParams,
      options: RequestOptions & { dialstackAccount: string }
    ): Promise<Listener> => {
      return this._request('POST', `/v1/calls/${callId}/listeners`, params, options);
    },

    listListeners: (
      callId: string,
      params: ListenerListParams | undefined,
      options: RequestOptions & { dialstackAccount: string }
    ): PaginatedList<Listener> => {
      const queryParams = new URLSearchParams();
      if (params?.limit !== undefined) queryParams.set('limit', String(params.limit));
      if (params?.page) queryParams.set('page', params.page);

      const query = queryParams.toString();
      const path = `/v1/calls/${callId}/listeners${query ? `?${query}` : ''}`;

      const fetchPage = (url: string): Promise<ListResponse<Listener>> => {
        return this._request('GET', url, undefined, options);
      };

      return createPaginatedList(this._request('GET', path, undefined, options), fetchPage);
    },

    retrieveListener: (
      callId: string,
      listenerId: string,
      options: RequestOptions & { dialstackAccount: string }
    ): Promise<Listener> => {
      return this._request(
        'GET',
        `/v1/calls/${callId}/listeners/${listenerId}`,
        undefined,
        options
      );
    },

    /** Stop a listener and close its WebSocket. */
    delListener: (
      callId: string,
      listenerId: string,
      options: RequestOptions & { dialstackAccount: string }
    ): Promise<void> => {
      return this._request(
        'DELETE',
        `/v1/calls/${callId}/listeners/${listenerId}`,
        undefined,
        options
      );
    },

    /**
     * Pause recording on an active call — e.g. while an agent collects a
     * customer's payment card number so the sensitive audio is never captured.
     * Recording stays paused until {@link resumeRecording} or the call ends;
     * both parties hear a short confirmation tone.
     */
    pauseRecording: (
      callId: string,
      options: RequestOptions & { dialstackAccount: string }
    ): Promise<void> => {
      return this._request('POST', `/v1/calls/${callId}/recording/pause`, undefined, options);
    },

    /**
     * Resume a recording previously paused with {@link pauseRecording}. Both
     * parties hear a short confirmation tone.
     */
    resumeRecording: (
      callId: string,
      options: RequestOptions & { dialstackAccount: string }
    ): Promise<void> => {
      return this._request('POST', `/v1/calls/${callId}/recording/resume`, undefined, options);
    },
  };

  voicemails = {
    list: (
      params: VoicemailListParams | undefined,
      options: RequestOptions & { dialstackAccount: string }
    ): PaginatedList<Voicemail> => {
      const queryParams = new URLSearchParams();
      if (params?.limit !== undefined) queryParams.set('limit', String(params.limit));
      if (params?.page) queryParams.set('page', params.page);
      if (params?.owner) queryParams.set('owner', params.owner);
      if (params?.is_read !== undefined) queryParams.set('is_read', String(params.is_read));
      if (params?.from_date) queryParams.set('from_date', params.from_date);
      appendExpand(queryParams, params?.expand);

      const query = queryParams.toString();
      const path = `/v1/voicemails${query ? `?${query}` : ''}`;

      const fetchPage = (url: string): Promise<ListResponse<Voicemail>> => {
        return this._request('GET', url, undefined, options);
      };

      return createPaginatedList(this._request('GET', path, undefined, options), fetchPage);
    },

    retrieve: (
      voicemailId: string,
      options: RequestOptions & { dialstackAccount: string; expand?: VoicemailExpand[] }
    ): Promise<Voicemail> => {
      const path = `/v1/voicemails/${voicemailId}${expandQuery(options.expand)}`;
      return this._request('GET', path, undefined, options);
    },

    /** Mark a voicemail read or unread. */
    update: (
      voicemailId: string,
      params: VoicemailUpdateParams,
      options: RequestOptions & { dialstackAccount: string }
    ): Promise<Voicemail> => {
      return this._request('POST', `/v1/voicemails/${voicemailId}`, params, options);
    },

    del: (
      voicemailId: string,
      options: RequestOptions & { dialstackAccount: string }
    ): Promise<void> => {
      return this._request('DELETE', `/v1/voicemails/${voicemailId}`, undefined, options);
    },

    retrieveTranscript: (
      voicemailId: string,
      options: RequestOptions & { dialstackAccount: string }
    ): Promise<VoicemailTranscript> => {
      return this._request('GET', `/v1/voicemails/${voicemailId}/transcript`, undefined, options);
    },
  };

  /**
   * Custom greetings that replace the system-default prompts for a user mailbox
   * or a shared voicemail box, keyed by owner and greeting type.
   */
  voicemailGreetings = {
    /**
     * Upload (or replace) the greeting for an owner. Audio is validated and
     * transcoded server-side to mono µ-law 8 kHz WAV. Limits: 5 MB and 90
     * seconds; accepts WAV (PCM s16 / µ-law / A-law), MP3, AAC, Ogg Vorbis, and
     * Opus. Re-uploading overwrites.
     */
    upload: (
      owner: string,
      greetingType: VoicemailGreetingType,
      file: Blob,
      options: RequestOptions & { dialstackAccount: string; filename?: string }
    ): Promise<VoicemailGreeting> => {
      const form = new FormData();
      form.append('file', file, options.filename ?? 'greeting');
      return this._request(
        'POST',
        `/v1/voicemail_greetings/${owner}/${greetingType}`,
        form,
        options
      );
    },

    /** Throws 404 when no custom greeting is set for this owner and type. */
    retrieve: (
      owner: string,
      greetingType: VoicemailGreetingType,
      options: RequestOptions & { dialstackAccount: string }
    ): Promise<VoicemailGreeting> => {
      return this._request(
        'GET',
        `/v1/voicemail_greetings/${owner}/${greetingType}`,
        undefined,
        options
      );
    },

    /**
     * Remove the custom greeting, reverting the mailbox to the system-default
     * prompts. Idempotent — succeeds whether or not a greeting was set.
     */
    del: (
      owner: string,
      greetingType: VoicemailGreetingType,
      options: RequestOptions & { dialstackAccount: string }
    ): Promise<void> => {
      return this._request(
        'DELETE',
        `/v1/voicemail_greetings/${owner}/${greetingType}`,
        undefined,
        options
      );
    },
  };

  faxes = {
    /**
     * Send an outbound fax. Upload the document first to the dedicated files
     * host (`POST https://files.dialstack.ai/v1/files`, purpose `fax_source`),
     * then reference the resulting file id here. The fax is created `pending`
     * and progresses to `delivered` or `failed`; sends are rate-limited per
     * account over a rolling hour.
     */
    send: (
      params: FaxSendParams,
      options: RequestOptions & { dialstackAccount: string }
    ): Promise<Fax> => {
      return this._request('POST', '/v1/faxes', params, options);
    },

    list: (
      params: FaxListParams | undefined,
      options: RequestOptions & { dialstackAccount: string }
    ): PaginatedList<Fax> => {
      const queryParams = new URLSearchParams();
      if (params?.limit !== undefined) queryParams.set('limit', String(params.limit));
      if (params?.page) queryParams.set('page', params.page);
      if (params?.direction) queryParams.set('direction', params.direction);
      if (params?.status) queryParams.set('status', params.status);
      if (params?.did) queryParams.set('did', params.did);
      if (params?.number) queryParams.set('number', params.number);
      if (params?.is_read !== undefined) queryParams.set('is_read', String(params.is_read));
      appendExpand(queryParams, params?.expand);

      const query = queryParams.toString();
      const path = `/v1/faxes${query ? `?${query}` : ''}`;

      const fetchPage = (url: string): Promise<ListResponse<Fax>> => {
        return this._request('GET', url, undefined, options);
      };

      return createPaginatedList(this._request('GET', path, undefined, options), fetchPage);
    },

    retrieve: (
      faxId: string,
      options: RequestOptions & { dialstackAccount: string; expand?: FaxExpand[] }
    ): Promise<Fax> => {
      const path = `/v1/faxes/${faxId}${expandQuery(options.expand)}`;
      return this._request('GET', path, undefined, options);
    },

    /** Mark a received fax read or unread. */
    update: (
      faxId: string,
      params: FaxUpdateParams,
      options: RequestOptions & { dialstackAccount: string }
    ): Promise<Fax> => {
      return this._request('POST', `/v1/faxes/${faxId}`, params, options);
    },

    /** Delete the fax record. The referenced file keeps its own lifecycle. */
    del: (faxId: string, options: RequestOptions & { dialstackAccount: string }): Promise<void> => {
      return this._request('DELETE', `/v1/faxes/${faxId}`, undefined, options);
    },
  };

  /**
   * Reusable sets of programmable buttons for desk phones. A template is
   * assigned to devices; per-device deviations live in the device's button
   * overrides.
   */
  buttonTemplates = {
    create: (
      params: ButtonTemplateCreateParams,
      options: RequestOptions & { dialstackAccount: string }
    ): Promise<ButtonTemplate> => {
      return this._request('POST', '/v1/button_templates', params, options);
    },

    list: (
      params: ButtonTemplateListParams | undefined,
      options: RequestOptions & { dialstackAccount: string }
    ): PaginatedList<ButtonTemplate> => {
      const queryParams = new URLSearchParams();
      if (params?.limit !== undefined) queryParams.set('limit', String(params.limit));
      if (params?.page) queryParams.set('page', params.page);

      const query = queryParams.toString();
      const path = `/v1/button_templates${query ? `?${query}` : ''}`;

      const fetchPage = (url: string): Promise<ListResponse<ButtonTemplate>> => {
        return this._request('GET', url, undefined, options);
      };

      return createPaginatedList(this._request('GET', path, undefined, options), fetchPage);
    },

    /**
     * Retrieve a template. Pass `expand: ['buttons']` to embed its buttons, and
     * `for_device` to have the response carry a compatibility summary for that
     * device's vendor, model, and position range.
     */
    retrieve: (
      buttonTemplateId: string,
      options: RequestOptions & { dialstackAccount: string } & ButtonTemplateRetrieveOptions
    ): Promise<ButtonTemplateWithDetails> => {
      const queryParams = new URLSearchParams();
      if (options.for_device) queryParams.set('for_device', options.for_device);
      appendExpand(queryParams, options.expand);

      const query = queryParams.toString();
      const path = `/v1/button_templates/${buttonTemplateId}${query ? `?${query}` : ''}`;
      return this._request('GET', path, undefined, options);
    },

    update: (
      buttonTemplateId: string,
      params: ButtonTemplateUpdateParams,
      options: RequestOptions & { dialstackAccount: string }
    ): Promise<ButtonTemplate> => {
      return this._request('POST', `/v1/button_templates/${buttonTemplateId}`, params, options);
    },

    del: (
      buttonTemplateId: string,
      options: RequestOptions & { dialstackAccount: string }
    ): Promise<void> => {
      return this._request(
        'DELETE',
        `/v1/button_templates/${buttonTemplateId}`,
        undefined,
        options
      );
    },

    listButtons: (
      buttonTemplateId: string,
      params: TemplateButtonListParams | undefined,
      options: RequestOptions & { dialstackAccount: string }
    ): PaginatedList<TemplateButton> => {
      const queryParams = new URLSearchParams();
      if (params?.limit !== undefined) queryParams.set('limit', String(params.limit));
      if (params?.page) queryParams.set('page', params.page);

      const query = queryParams.toString();
      const path = `/v1/button_templates/${buttonTemplateId}/buttons${query ? `?${query}` : ''}`;

      const fetchPage = (url: string): Promise<ListResponse<TemplateButton>> => {
        return this._request('GET', url, undefined, options);
      };

      return createPaginatedList(this._request('GET', path, undefined, options), fetchPage);
    },

    /**
     * Add a button to a template. `type` narrows the required `target` shape, so
     * a mismatched payload is a compile-time error.
     */
    createButton: (
      buttonTemplateId: string,
      params: TemplateButtonCreateParams,
      options: RequestOptions & { dialstackAccount: string }
    ): Promise<TemplateButton> => {
      return this._request(
        'POST',
        `/v1/button_templates/${buttonTemplateId}/buttons`,
        params,
        options
      );
    },

    /** Move a button. Position is the only updatable field. */
    updateButton: (
      buttonTemplateId: string,
      buttonId: string,
      params: TemplateButtonUpdateParams,
      options: RequestOptions & { dialstackAccount: string }
    ): Promise<TemplateButton> => {
      return this._request(
        'POST',
        `/v1/button_templates/${buttonTemplateId}/buttons/${buttonId}`,
        params,
        options
      );
    },

    delButton: (
      buttonTemplateId: string,
      buttonId: string,
      options: RequestOptions & { dialstackAccount: string }
    ): Promise<void> => {
      return this._request(
        'DELETE',
        `/v1/button_templates/${buttonTemplateId}/buttons/${buttonId}`,
        undefined,
        options
      );
    },
  };

  /**
   * Deskphones, DECT bases, and DECT handsets. This is the unified device
   * surface — prefer it over the per-kind endpoints.
   */
  devices = {
    /**
     * Register a device. `type` is optional for MAC-addressable devices: omit
     * it and the kind is detected from `mac_address` via the vendor catalog.
     * Returns only the new id and type — call {@link retrieve} for the rest.
     */
    create: (
      params: DeviceCreateParams,
      options: RequestOptions & { dialstackAccount: string }
    ): Promise<CreateDeviceResponse> => {
      return this._request('POST', '/v1/devices', params, options);
    },

    list: (
      params: DeviceListParams | undefined,
      options: RequestOptions & { dialstackAccount: string }
    ): PaginatedList<Device> => {
      const queryParams = new URLSearchParams();
      if (params?.limit !== undefined) queryParams.set('limit', String(params.limit));
      if (params?.page) queryParams.set('page', params.page);
      if (params?.type) queryParams.set('type', params.type);
      if (params?.location) queryParams.set('location', params.location);
      appendExpand(queryParams, params?.expand);

      const query = queryParams.toString();
      const path = `/v1/devices${query ? `?${query}` : ''}`;

      const fetchPage = (url: string): Promise<ListResponse<Device>> => {
        return this._request('GET', url, undefined, options);
      };

      return createPaginatedList(this._request('GET', path, undefined, options), fetchPage);
    },

    retrieve: (
      deviceId: string,
      options: RequestOptions & { dialstackAccount: string; expand?: DeviceExpand[] }
    ): Promise<Device> => {
      const path = `/v1/devices/${deviceId}${expandQuery(options.expand)}`;
      return this._request('GET', path, undefined, options);
    },

    /**
     * Update a device. `name`, `location`, `base`, and `button_template` are
     * tri-state: omit to leave unchanged, pass a string to set, or pass `null`
     * to clear. Throws with a {@link DeviceUserConflictResponse} body on 409.
     */
    update: (
      deviceId: string,
      params: DeviceUpdateParams,
      options: RequestOptions & { dialstackAccount: string }
    ): Promise<Device> => {
      return this._request('POST', `/v1/devices/${deviceId}`, params, options);
    },

    del: (
      deviceId: string,
      options: RequestOptions & { dialstackAccount: string }
    ): Promise<void> => {
      return this._request('DELETE', `/v1/devices/${deviceId}`, undefined, options);
    },

    /** Button templates whose buttons all fit this device's vendor and model. */
    listCompatibleButtonTemplates: (
      deviceId: string,
      params: ButtonTemplateListParams | undefined,
      options: RequestOptions & { dialstackAccount: string }
    ): PaginatedList<ButtonTemplate> => {
      const queryParams = new URLSearchParams();
      if (params?.limit !== undefined) queryParams.set('limit', String(params.limit));
      if (params?.page) queryParams.set('page', params.page);

      const query = queryParams.toString();
      const path = `/v1/devices/${deviceId}/compatible_button_templates${query ? `?${query}` : ''}`;

      const fetchPage = (url: string): Promise<ListResponse<ButtonTemplate>> => {
        return this._request('GET', url, undefined, options);
      };

      return createPaginatedList(this._request('GET', path, undefined, options), fetchPage);
    },

    /**
     * The device's effective buttons — the bound template's buttons with this
     * device's overrides applied, plus any model defaults. Not paginated.
     */
    listButtons: (
      deviceId: string,
      options: RequestOptions & { dialstackAccount: string }
    ): Promise<ListResponse<MaterializedButton>> => {
      return this._request('GET', `/v1/devices/${deviceId}/buttons`, undefined, options);
    },

    listButtonOverrides: (
      deviceId: string,
      params: DeviceButtonListParams | undefined,
      options: RequestOptions & { dialstackAccount: string }
    ): PaginatedList<DeviceButtonOverride> => {
      const queryParams = new URLSearchParams();
      if (params?.limit !== undefined) queryParams.set('limit', String(params.limit));
      if (params?.page) queryParams.set('page', params.page);

      const query = queryParams.toString();
      const path = `/v1/devices/${deviceId}/button_overrides${query ? `?${query}` : ''}`;

      const fetchPage = (url: string): Promise<ListResponse<DeviceButtonOverride>> => {
        return this._request('GET', url, undefined, options);
      };

      return createPaginatedList(this._request('GET', path, undefined, options), fetchPage);
    },

    /**
     * Override one position on this device: either suppress the template's
     * button there, or replace it with a different one.
     */
    createButtonOverride: (
      deviceId: string,
      params: DeviceButtonOverrideCreateParams,
      options: RequestOptions & { dialstackAccount: string }
    ): Promise<DeviceButtonOverride> => {
      return this._request('POST', `/v1/devices/${deviceId}/button_overrides`, params, options);
    },

    /** Drop an override, restoring the template's button at that position. */
    delButtonOverride: (
      deviceId: string,
      overrideId: string,
      options: RequestOptions & { dialstackAccount: string }
    ): Promise<void> => {
      return this._request(
        'DELETE',
        `/v1/devices/${deviceId}/button_overrides/${overrideId}`,
        undefined,
        options
      );
    },

    /**
     * Assign a user to the device. This provisions the endpoint's SIP
     * credentials and the device line/extension server-side. Throws with a
     * {@link DeviceUserConflictResponse} body on 409.
     */
    assignUser: (
      deviceId: string,
      params: DeviceAssignUserParams,
      options: RequestOptions & { dialstackAccount: string }
    ): Promise<DeviceUserAssignment> => {
      return this._request('POST', `/v1/devices/${deviceId}/users`, params, options);
    },

    listUsers: (
      deviceId: string,
      options: RequestOptions & { dialstackAccount: string }
    ): Promise<ListResponse<DeviceUserAssignment>> => {
      return this._request('GET', `/v1/devices/${deviceId}/users`, undefined, options);
    },

    removeUser: (
      deviceId: string,
      userId: string,
      options: RequestOptions & { dialstackAccount: string }
    ): Promise<void> => {
      return this._request('DELETE', `/v1/devices/${deviceId}/users/${userId}`, undefined, options);
    },

    /**
     * Tell the device to fetch and apply its latest configuration. On a DECT
     * system one request reaches every handset paired with the base.
     *
     * Call this when configuration actually changed, not on every admin
     * interaction. With `reboot: true` the device drops active calls and goes
     * offline for roughly 30–90 seconds.
     */
    checkSync: (
      deviceId: string,
      params: DeviceCheckSyncParams | undefined,
      options: RequestOptions & { dialstackAccount: string }
    ): Promise<DeviceCheckSyncResponse> => {
      return this._request(
        'POST',
        `/v1/devices/${deviceId}/status/check-sync`,
        params ?? {},
        options
      );
    },
  };

  /**
   * Orders for physical hardware. An order is placed with quantities and comes
   * back as one item per unit, each of which can be pre-assigned to a user,
   * location, or base before it is fulfilled into a device.
   */
  hardwareOrders = {
    create: (
      params: HardwareOrderParams,
      options: RequestOptions & { dialstackAccount: string }
    ): Promise<HardwareOrder> => {
      return this._request('POST', '/v1/hardware-orders', params, options);
    },

    /**
     * List the account's orders with their items embedded.
     *
     * Not paginated: the API returns every order in one envelope with no page
     * URLs, so this is a plain {@link ListResponse} rather than a
     * `PaginatedList`.
     */
    list: (
      params: HardwareOrderListParams | undefined,
      options: RequestOptions & { dialstackAccount: string }
    ): Promise<ListResponse<HardwareOrder>> => {
      const queryParams = new URLSearchParams();
      if (params?.location) queryParams.set('location', params.location);
      appendExpand(queryParams, params?.expand);

      const query = queryParams.toString();
      const path = `/v1/hardware-orders${query ? `?${query}` : ''}`;
      return this._request('GET', path, undefined, options);
    },

    retrieve: (
      hardwareOrderId: string,
      options: RequestOptions & { dialstackAccount: string; expand?: HardwareOrderExpand[] }
    ): Promise<HardwareOrder> => {
      const path = `/v1/hardware-orders/${hardwareOrderId}${expandQuery(options.expand)}`;
      return this._request('GET', path, undefined, options);
    },

    /**
     * Replace the order's line items.
     *
     * Only a `draft` order can be changed; anything else returns 409. Note that
     * orders are currently created as `submitted` and no endpoint moves one back
     * to `draft`, so this returns 409 in practice until the editable-cart flow
     * exists. Bound here because the endpoint is published, not because it is
     * usable yet.
     */
    update: (
      hardwareOrderId: string,
      params: HardwareOrderParams,
      options: RequestOptions & { dialstackAccount: string }
    ): Promise<HardwareOrder> => {
      return this._request('POST', `/v1/hardware-orders/${hardwareOrderId}`, params, options);
    },

    /** Set or clear a single unit's user, location, or base pre-assignment. */
    updateItem: (
      hardwareOrderId: string,
      itemId: string,
      params: HardwareOrderItemUpdateParams,
      options: RequestOptions & { dialstackAccount: string }
    ): Promise<HardwareOrderItem> => {
      return this._request(
        'POST',
        `/v1/hardware-orders/${hardwareOrderId}/items/${itemId}`,
        params,
        options
      );
    },
  };

  /**
   * Test-mode helpers (sandbox only). Trigger simulated calls and emit canned
   * webhook events to exercise your integration end to end without real
   * telephony. Requires a test key (`sk_test_...`); a live key receives a 400.
   * See the "Testing your integration" guide.
   */
  testHelpers = {
    calls: {
      /**
       * Trigger a simulated call — inbound (screen pop) or outbound — and drive
       * its full event lifecycle on timers. This is the way to exercise your
       * webhook handling: `calls.create` places a real click-to-call in every
       * mode, so it rings the user's actual devices rather than simulating.
       * Returns the started call's id + scenario so a test can assert on it.
       */
      create: (
        params: TestCallCreateParams,
        options: RequestOptions & { dialstackAccount: string }
      ): Promise<TestCallResponse> => {
        return this._request('POST', '/v1/test_helpers/calls', params, options);
      },
    },
    events: {
      /**
       * Emit a single canned webhook event (fax.*, queue.*, recording.failed,
       * call.mobile_push_wakeup) for events the call simulator does not drive
       * behaviorally.
       */
      create: (
        params: TestEventCreateParams,
        options: RequestOptions & { dialstackAccount: string }
      ): Promise<TestEventResponse> => {
        return this._request('POST', '/v1/test_helpers/events', params, options);
      },
    },
  };

  /**
   * Admin portal resources.
   *
   * Distinct from the voice platform resources above: these describe who can
   * administer an account in the portal, not who has phone service. Read-only —
   * roles are granted in the portal itself.
   */
  admin = {
    users: {
      /**
       * List the people who can administer this account.
       *
       * This is not a subset of `users.list()` — it is a different population.
       * Someone listed here may have no voice user at all (an account owner
       * typically does not), and most voice users are not administrators. Read
       * both collections to cover everyone on the account, and use each admin
       * user's `user` field to link them rather than matching on email.
       *
       * Only explicit grants on this account are listed; platform-wide access
       * does not appear. A role can be granted before its invitation is
       * accepted, so someone listed may not yet have signed in.
       *
       * Pass `expand: ['user']` to inline the full voice user.
       */
      list: (
        params: AdminUserListParams | undefined,
        options: RequestOptions & { dialstackAccount: string }
      ): PaginatedList<AdminUser> => {
        const path = `/v1/admin/users${buildQuery(params)}`;

        const fetchPage = (url: string): Promise<ListResponse<AdminUser>> => {
          return this._request('GET', url, undefined, options);
        };

        return createPaginatedList(this._request('GET', path, undefined, options), fetchPage);
      },

      /**
       * Retrieve one of this account's admin portal users.
       *
       * Rejects with a 404 when no such person administers this account —
       * including when they administer a different one.
       */
      retrieve: (
        adminUserId: string,
        params: AdminUserRetrieveParams | undefined,
        options: RequestOptions & { dialstackAccount: string }
      ): Promise<AdminUser> => {
        const path = `/v1/admin/users/${adminUserId}${buildQuery(params)}`;
        return this._request('GET', path, undefined, options);
      },
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
      options: RequestOptions & { dialstackAccount: string; expand?: VoiceAppExpand[] }
    ): Promise<VoiceApp> => {
      const path = `/v1/voice-apps/${voiceAppId}${expandQuery(options.expand)}`;
      return this._request('GET', path, undefined, options);
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
      if (params?.limit !== undefined) queryParams.set('limit', String(params.limit));
      if (params?.page) queryParams.set('page', params.page);
      appendExpand(queryParams, params?.expand);

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
      options: RequestOptions & { dialstackAccount: string; expand?: AIAgentExpand[] }
    ): Promise<AIAgent> => {
      const path = `/v1/ai-agents/${aiAgentId}${expandQuery(options.expand)}`;
      return this._request('GET', path, undefined, options);
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
      if (params?.limit !== undefined) queryParams.set('limit', String(params.limit));
      if (params?.page) queryParams.set('page', params.page);
      // Forwarded for compatibility only; the API discards bare cursor params.
      if (params?.starting_after) queryParams.set('starting_after', params.starting_after);
      if (params?.ending_before) queryParams.set('ending_before', params.ending_before);
      appendExpand(queryParams, params?.expand);

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
      if (params?.limit !== undefined) queryParams.set('limit', String(params.limit));
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
      options: RequestOptions & { dialstackAccount: string; expand?: DialPlanExpand[] }
    ): Promise<DialPlan> => {
      const path = `/v1/dialplans/${dialPlanId}${expandQuery(options.expand)}`;
      return this._request('GET', path, undefined, options);
    },

    list: (
      params: DialPlanListParams | undefined,
      options: RequestOptions & { dialstackAccount: string }
    ): PaginatedList<DialPlan> => {
      const queryParams = new URLSearchParams();
      if (params?.limit !== undefined) queryParams.set('limit', String(params.limit));
      if (params?.page) queryParams.set('page', params.page);
      appendExpand(queryParams, params?.expand);

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
      if (params?.limit !== undefined) queryParams.set('limit', String(params.limit));
      if (params?.page) queryParams.set('page', params.page);
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
      options: RequestOptions & { dialstackAccount: string; expand?: RingGroupExpand[] }
    ): Promise<RingGroup> => {
      const path = `/v1/ring_groups/${ringGroupId}${expandQuery(options.expand)}`;
      return this._request('GET', path, undefined, options);
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
      if (params?.limit !== undefined) queryParams.set('limit', String(params.limit));
      if (params?.page) queryParams.set('page', params.page);
      appendExpand(queryParams, params?.expand);

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
      options: RequestOptions & { dialstackAccount: string; expand?: QueueExpand[] }
    ): Promise<Queue> => {
      const path = `/v1/queues/${queueId}${expandQuery(options.expand)}`;
      return this._request('GET', path, undefined, options);
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
      if (params?.limit !== undefined) queryParams.set('limit', String(params.limit));
      if (params?.page) queryParams.set('page', params.page);
      appendExpand(queryParams, params?.expand);

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
      if (params?.limit !== undefined) queryParams.set('limit', String(params.limit));
      if (params?.page) queryParams.set('page', params.page);
      // Forwarded for compatibility only; the API discards bare cursor params.
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
export { MediaStream } from './media-stream.js';
export type {
  WebSocketLike,
  AudioFormat,
  MediaStreamBeginEvent,
  MediaStreamAudioEvent,
  MediaStreamMessage,
  MediaStreamEvents,
} from './media-stream.js';

/** Builds the /v1/presence query string from the per-type selectors. */
function presenceQuery(params: PresenceListParams): URLSearchParams {
  const query = new URLSearchParams();
  for (const user of params.users ?? []) {
    query.append('user[]', user);
  }
  // Named slots win over `parkSlots`. The two are mutually exclusive server-side
  // — they disagree about whether free slots are emitted — so sending both would
  // be a 400; prefer the more specific request rather than surfacing that.
  if (params.parkSlotNumbers?.length) {
    for (const slot of params.parkSlotNumbers) {
      query.append('park_slot[]', String(slot));
    }
  } else if (params.parkSlots) {
    query.append('park_slot[]', 'all');
  }
  return query;
}

/** Parses one SSE frame and calls the matching handler. */
function dispatchParkSlotFrame(frame: string, handlers: ParkSlotSubscriptionHandlers): void {
  let event = '';
  let data = '';
  for (const line of frame.split('\n')) {
    if (line.startsWith('event: ')) {
      event = line.slice(7).trim();
    } else if (line.startsWith('data: ')) {
      data = line.slice(6);
    }
    // ':' comment lines (heartbeats) and 'retry:' are ignored.
  }
  if (!event || !data) {
    return;
  }

  try {
    const parsed = JSON.parse(data);
    switch (event) {
      case 'snapshot':
        handlers.onSnapshot?.((parsed.data ?? []) as ParkSlotPresence[]);
        break;
      case 'park_slot':
        handlers.onSlot?.(parsed as ParkSlotPresence);
        break;
      case 'terminated':
        handlers.onTerminated?.(String(parsed.reason ?? ''));
        break;
      // 'connected' carries no state and needs no handler.
    }
  } catch (error) {
    handlers.onError?.(error instanceof Error ? error : new Error(String(error)));
  }
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
