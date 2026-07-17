import type { PlatformStorage } from './platform';
import type { Ringback } from './ringback';
import type { SignalingSocketFactory } from './transport';

export type CallState = 'trying' | 'ringing' | 'active' | 'held' | 'ended';
export type CallDirection = 'inbound' | 'outbound';
export type CallEndReason = 'hangup' | 'no-answer' | 'busy' | 'failed' | 'transferred' | 'rejected';
export type RejectReason = 'busy' | 'decline';
export type HeldBy = 'local' | 'remote';
export type PresenceStatus = 'available' | 'on_call' | 'dnd' | 'away' | 'offline';
export type SettablePresenceStatus = 'available' | 'dnd' | 'away';

export interface PhoneOptions {
  token: string;
  apiBaseUrl?: string;
  /**
   * Base URL of the signaling server the phone opens its WebSocket to, e.g.
   * `wss://webrtc.dialstack.ai`. The signaling host is separate from
   * `apiBaseUrl` (the REST API) and is served by region-aware infrastructure,
   * so latency-based DNS routes each client to the nearest region
   * automatically — no client-side region selection is needed.
   *
   * When omitted, it defaults to the standard signaling host derived from
   * `apiBaseUrl` (the `api.` hostname label becomes `webrtc.`). Override only
   * for self-hosting, staging, or a proxy. `ws`/`wss` and `http`/`https` are
   * accepted; `http(s)` is upgraded to `ws(s)`. A trailing `/v1/webrtc` path
   * is appended automatically if absent.
   */
  signalingBaseUrl?: string;
  onTokenExpiring?: () => Promise<string>;
  autoReconnect?: boolean;
  iceServers?: RTCIceServer[];
  /**
   * The emergency-address resource id (emerg_…) this softphone uses for E911.
   * Presented on the authenticate handshake so the server can bind
   * it to the current network. When omitted, a previously persisted id (see
   * `setEmergencyAddress`) is loaded from `storage` if available.
   */
  emergencyAddressId?: string;
  /**
   * Synchronous key/value store used to persist the selected E911 address id
   * across launches. Optional at this layer: it defaults to the platform seam's
   * store — `localStorage` on web, an in-memory (non-persisting) store on React
   * Native. On React Native the softphone provider requires the host to supply a
   * real store (e.g. an AsyncStorage- or MMKV-backed adapter), because the SDK
   * takes no persistence dependency of its own.
   */
  storage?: PlatformStorage;
  /**
   * Outbound ringback tone. Defaults to the WebAudio `RingbackTone`. React Native
   * has no `AudioContext`, so the RN softphone provider supplies an
   * `InCallManager`-backed implementation here. One instance is shared across
   * calls (outbound ringback plays one call at a time).
   */
  ringback?: Ringback;
  /**
   * Opens the signaling WebSocket. Defaults to a bare `new WebSocket(url,
   * protocols)`. React Native supplies a variant that attaches a `User-Agent`
   * header (the signaling ingress 403s a handshake without one, and iOS's
   * WebSocket sends none by default); browsers forbid overriding it, so web uses
   * the default.
   */
  createSignalingSocket?: SignalingSocketFactory;
}

/**
 * Civic address submitted to register an emergency (E911) location. Validated
 * against the carrier MSAG; an invalid address is rejected.
 */
export interface EmergencyAddressInput {
  address_number?: string;
  street: string;
  unit?: string;
  city: string;
  state: string;
  postal_code: string;
  country?: string;
}

/** A registered emergency address resource. */
export interface EmergencyAddress {
  id: string;
  address: EmergencyAddressDetails;
  /** Network this address is bound to, or null when not yet registered. */
  registered_ip: string | null;
  created_at: string;
}

/** Normalized civic address fields returned on an EmergencyAddress. */
export interface EmergencyAddressDetails {
  address_number?: string;
  street?: string;
  unit?: string;
  city: string;
  state: string;
  postal_code: string;
  country: string;
  formatted_address?: string;
  latitude?: number;
  longitude?: number;
}

/** ListResponse envelope (the only place `object: "list"` appears). */
export interface ListResponse<T> {
  object: 'list';
  url: string;
  next_page_url: string | null;
  previous_page_url: string | null;
  data: T[];
}

export interface CallOptions {
  // Reserved for future use; caller-ID is currently fixed at the
  // billing layer (see webrtc CallCreateMessage doc comment).
  _reserved?: never;
}

export interface PresenceEntry {
  userId: string;
  name: string;
  status: PresenceStatus;
  statusText: string | null;
  updatedAt: string;
}

export interface PresenceUpdate {
  userId: string;
  status: PresenceStatus;
  statusText: string | null;
  updatedAt: string;
}

export interface IceServersResponse {
  ice_servers: RTCIceServer[];
  expires_at: string;
}

export type ClientMessage =
  | { type: 'authenticate'; token: string; emergency_address_id?: string }
  | { type: 'auth.refresh'; req_id?: string; token: string }
  | { type: 'call.create'; req_id?: string; destination: string; sdp: string }
  | { type: 'call.answer'; call_id: string }
  | { type: 'call.reject'; call_id: string; reason?: RejectReason }
  | { type: 'call.hangup'; call_id: string }
  | { type: 'call.hold'; call_id: string }
  | { type: 'call.resume'; call_id: string }
  | { type: 'call.mute'; call_id: string }
  | { type: 'call.transfer'; call_id: string; destination: string }
  | {
      type: 'call.transfer.attended';
      req_id?: string;
      call_id: string;
      step: 'consult' | 'complete';
      destination?: string;
      sdp?: string;
    }
  | { type: 'call.unmute'; call_id: string }
  | { type: 'sdp.offer'; call_id: string; sdp: string }
  | { type: 'sdp.answer'; call_id: string; sdp: string }
  | {
      type: 'ice.candidate';
      call_id: string;
      candidate: string;
      sdp_mid: string | null;
      sdp_m_line_index: number | null;
    }
  | { type: 'ice.done'; call_id: string };

export type ServerMessage =
  | { type: 'authenticated'; user_id: string; account_id: string; reconnected?: boolean }
  | { type: 'auth.refreshed'; req_id?: string | null }
  | { type: 'network.changed' }
  | {
      type: 'error';
      code: string;
      message: string;
      req_id?: string | null;
      call_id?: string | null;
      fatal?: boolean;
      // Optional per-concern detail; which fields are present depends on `code`.
      // For `presence_unavailable`, `context.users` names the requested users
      // whose presence subscription could not be established.
      context?: { users?: string[] };
    }
  | { type: 'call.trying'; call_id: string; req_id?: string | null }
  | { type: 'call.ringing'; call_id: string }
  | { type: 'call.incoming'; call_id: string; from: string; from_name: string | null; to: string }
  | { type: 'call.answered'; call_id: string; answered_at?: string }
  | { type: 'call.ended'; call_id: string; reason: CallEndReason; duration_seconds: number | null }
  | {
      type: 'call.restored';
      call_id: string;
      state: 'ringing' | 'active' | 'held';
      from: string;
      from_name: string | null;
      to: string;
      direction: CallDirection;
      answered_at: string | null;
    }
  | { type: 'call.held'; call_id: string; held_by: HeldBy }
  | { type: 'call.resumed'; call_id: string }
  | { type: 'sdp.offer'; call_id: string; sdp: string }
  | { type: 'sdp.pranswer'; call_id: string; sdp: string }
  | { type: 'sdp.answer'; call_id: string; sdp: string }
  | {
      type: 'ice.candidate';
      call_id: string;
      candidate: string;
      sdp_mid: string | null;
      sdp_m_line_index: number | null;
    }
  | { type: 'ice.done'; call_id: string };
