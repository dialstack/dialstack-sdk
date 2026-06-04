import { createPaginatedList, type PaginatedList } from '../shared/pagination';
import { Call } from './call';
import { NotImplementedError, PhoneError } from './errors';
import { Transport } from './transport';
import type {
  EmergencyAddress,
  EmergencyAddressInput,
  IceServersResponse,
  ListResponse,
  PhoneOptions,
  PresenceEntry,
  PresenceUpdate,
  ServerMessage,
  SettablePresenceStatus,
} from './types';

const DEFAULT_API_BASE_URL = 'https://api.dialstack.ai';

// localStorage key prefix for the persisted emergency-address id (DIA-644).
// Lets a softphone re-present the same address across reconnects/sessions so a
// returning device re-binds without re-prompting the user. Namespaced by the
// user id (the token's `sub` claim) so two users sharing a browser don't
// inherit each other's saved address — the server would reject a foreign id
// anyway (user-scoped), but presenting it would trigger a spurious
// `network.changed` prompt.
const EMERGENCY_ADDRESS_STORAGE_KEY_PREFIX = 'dialstack.webrtc.emergency_address_id.';

type PhoneEventMap = {
  connected: () => void;
  disconnected: () => void;
  reconnected: () => void;
  reconnecting: (attempt: number, delayMs: number) => void;
  incoming: (call: Call) => void;
  presenceList: (entries: PresenceEntry[]) => void;
  presenceUpdate: (update: PresenceUpdate) => void;
  'network.changed': () => void;
  error: (err: PhoneError) => void;
};

type Listener<K extends keyof PhoneEventMap> = PhoneEventMap[K];

interface PendingOutbound {
  clientCallId: string;
  destination: string;
  resolve: (call: Call) => void;
  reject: (err: PhoneError) => void;
}

export class DialStackPhone {
  isConnected = false;
  readonly activeCalls: Call[] = [];

  private token: string;
  private apiBaseUrl: string;
  private autoReconnect: boolean;
  private iceServersOverride: RTCIceServer[] | null;

  private transport: Transport | null = null;
  private iceServers: RTCIceServer[] = [];
  private listeners: { [K in keyof PhoneEventMap]?: Set<Listener<K>> } = {};
  private pendingOutbound: PendingOutbound | null = null;
  private pendingCall: Call | null = null;
  private connectResolvers: { resolve: () => void; reject: (err: PhoneError) => void } | null =
    null;
  private hasConnectedOnce = false;
  private clientCallSeq = 0;
  private emergencyAddressId: string | null;
  // User id (token `sub` claim) used to namespace localStorage persistence.
  // null when the token can't be decoded — persistence is then disabled and
  // the app must supply PhoneOptions.emergencyAddressId itself.
  private storageUserId: string | null;

  constructor(options: PhoneOptions) {
    this.token = options.token;
    this.apiBaseUrl = options.apiBaseUrl ?? DEFAULT_API_BASE_URL;
    this.autoReconnect = options.autoReconnect ?? true;
    this.iceServersOverride = options.iceServers ?? null;
    this.storageUserId = userIdFromToken(options.token);
    this.emergencyAddressId =
      options.emergencyAddressId ?? loadStoredEmergencyAddressId(this.storageUserId);
    void options.onTokenExpiring; // Reserved for DIA-1267.
  }

  on<K extends keyof PhoneEventMap>(event: K, handler: Listener<K>): void {
    let set = this.listeners[event] as Set<Listener<K>> | undefined;
    if (!set) {
      set = new Set<Listener<K>>();
      (this.listeners as Record<string, Set<Listener<K>>>)[event] = set;
    }
    set.add(handler);
  }

  off<K extends keyof PhoneEventMap>(event: K, handler?: Listener<K>): void {
    if (!handler) {
      delete this.listeners[event];
      return;
    }
    (this.listeners[event] as Set<Listener<K>> | undefined)?.delete(handler);
  }

  async connect(): Promise<void> {
    if (this.transport)
      throw new PhoneError({ code: 'invalid_message', message: 'Phone is already connected' });

    this.iceServers = this.iceServersOverride ?? (await this.fetchIceServers());

    const url = this.apiBaseUrl.replace(/^http/, 'ws') + '/v1/webrtc';
    const transport = new Transport(url, this.autoReconnect);
    this.transport = transport;

    transport.on('open', () => {
      transport.send({
        type: 'authenticate',
        token: this.token,
        ...(this.emergencyAddressId ? { emergency_address_id: this.emergencyAddressId } : {}),
      });
    });

    transport.on('message', (msg) => this.handleMessage(msg));

    transport.on('reconnecting', (attempt, delayMs) => {
      this.isConnected = false;
      this.emit('reconnecting', attempt, delayMs);
    });

    transport.on('closed', () => {
      this.isConnected = false;
      this.emit('disconnected');
    });

    return new Promise<void>((resolve, reject) => {
      this.connectResolvers = { resolve, reject };
      transport.connect();
    });
  }

  disconnect(): void {
    for (const call of [...this.activeCalls]) {
      try {
        call.hangup();
      } catch {
        // Ignore: transport may already be closed.
      }
      call.dispose();
    }
    this.activeCalls.length = 0;
    this.transport?.close();
    this.transport = null;
    this.isConnected = false;
  }

  async call(destination: string): Promise<Call> {
    if (!this.transport || !this.isConnected) {
      throw new PhoneError({ code: 'transport_closed', message: 'Phone is not connected' });
    }
    if (this.pendingOutbound) {
      throw new PhoneError({
        code: 'rate_limited',
        message: 'Another outbound call is still being placed',
      });
    }

    const clientCallId = this.nextClientCallId();

    const call = new Call({
      id: clientCallId,
      direction: 'outbound',
      from: '',
      fromName: null,
      to: destination,
      initialState: 'trying',
      transport: this.transport,
      iceServers: this.iceServers,
    });

    // startOutbound acquires the mic (getUserMedia) internally and gathers ICE
    // before returning the offer; surface a mic-denied / no-SDP failure as a
    // PhoneError and tear the call down.
    let offer: RTCSessionDescriptionInit;
    try {
      offer = await call.startOutbound();
    } catch (e) {
      call.dispose();
      throw new PhoneError({
        code: 'call_failed',
        message: `Failed to start outbound call: ${(e as Error).message}`,
      });
    }
    if (!offer.sdp) {
      call.dispose();
      throw new PhoneError({
        code: 'call_failed',
        message: 'RTCPeerConnection.createOffer produced no SDP',
      });
    }
    const offerSdp = offer.sdp;

    return new Promise<Call>((resolve, reject) => {
      this.pendingOutbound = {
        clientCallId,
        destination,
        resolve: (placed) => {
          this.activeCalls.push(placed);
          resolve(placed);
        },
        reject: (err) => {
          call.dispose();
          reject(err);
        },
      };

      this.transport!.send({
        type: 'call.create',
        destination,
        sdp: offerSdp,
        client_call_id: clientCallId,
      });

      this.pendingCall = call;
    });
  }

  getCall(callId: string): Call | undefined {
    return this.activeCalls.find((c) => c.id === callId);
  }

  subscribePresence(_userIds?: string[]): void {
    throw new NotImplementedError('DialStackPhone.subscribePresence', 'DIA-1283');
  }

  setPresence(_status: SettablePresenceStatus, _statusText?: string): Promise<void> {
    throw new NotImplementedError('DialStackPhone.setPresence', 'DIA-1283');
  }

  /**
   * Register and validate an emergency (E911) address (DIA-644). Creates the
   * resource via the REST API (validated against the carrier MSAG), persists
   * its id, and presents it on the next connect so the server binds it to the
   * device's network. To bind a new address immediately (e.g. responding to a
   * `network.changed` event), call this then `disconnect()` + `connect()`.
   *
   * Rejects with a `PhoneError` (code `invalid_message`) when the address
   * can't be validated.
   */
  async setEmergencyAddress(address: EmergencyAddressInput): Promise<EmergencyAddress> {
    const created = await this.apiRequest<EmergencyAddress>(
      'POST',
      '/v1/me/emergency-addresses',
      address
    );
    this.emergencyAddressId = created.id;
    persistEmergencyAddressId(this.storageUserId, created.id);
    return created;
  }

  /** Fetch a saved emergency address (defaults to the one this phone uses). */
  getEmergencyAddress(id?: string): Promise<EmergencyAddress> {
    const target = id ?? this.emergencyAddressId;
    if (!target) {
      return Promise.reject(
        new PhoneError({ code: 'invalid_message', message: 'No emergency address id' })
      );
    }
    return this.apiRequest<EmergencyAddress>(
      'GET',
      `/v1/me/emergency-addresses/${encodeURIComponent(target)}`
    );
  }

  /**
   * List the user's saved emergency addresses (location profiles).
   *
   * Auto-paginating: `await` it for the first page envelope, or iterate the
   * full collection with `autoPagingEach()` / `autoPagingToArray()` —
   * subsequent pages are fetched lazily.
   */
  listEmergencyAddresses(): PaginatedList<ListResponse<EmergencyAddress>> {
    const fetchPage = (url: string) => this.apiRequest<ListResponse<EmergencyAddress>>('GET', url);
    return createPaginatedList(fetchPage('/v1/me/emergency-addresses'), fetchPage);
  }

  /** Delete a saved emergency address. Clears the local selection if it matched. */
  async deleteEmergencyAddress(id: string): Promise<void> {
    await this.apiRequest<void>('DELETE', `/v1/me/emergency-addresses/${encodeURIComponent(id)}`);
    if (this.emergencyAddressId === id) {
      this.emergencyAddressId = null;
      persistEmergencyAddressId(this.storageUserId, null);
    }
  }

  /**
   * Clear an address's network binding (registered_ip) via the REST API. The
   * next connect re-registers the current network. Useful after a move so the
   * address re-binds where the device now is.
   */
  clearEmergencyAddressRegisteredIp(id: string): Promise<void> {
    return this.apiRequest<void>(
      'DELETE',
      `/v1/me/emergency-addresses/${encodeURIComponent(id)}/registered_ip`
    );
  }

  private nextClientCallId(): string {
    this.clientCallSeq += 1;
    return `c_${Date.now().toString(36)}_${this.clientCallSeq}`;
  }

  // apiRequest is the shared REST helper for the /v1/me/emergency-addresses
  // surface (Bearer auth, JSON). A 422 (carrier MSAG validation failure)
  // surfaces as invalid_message carrying the server detail; 204 returns void.
  private async apiRequest<T>(method: string, path: string, body?: unknown): Promise<T> {
    let resp: Response;
    try {
      resp = await fetch(`${this.apiBaseUrl}${path}`, {
        method,
        headers: {
          Authorization: `Bearer ${this.token}`,
          ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}),
        },
        body: body !== undefined ? JSON.stringify(body) : undefined,
      });
    } catch (e) {
      throw new PhoneError({
        code: 'internal_error',
        message: `request failed: ${(e as Error).message}`,
      });
    }
    if (resp.status === 422) {
      const detail = await resp.text().catch(() => '');
      throw new PhoneError({
        code: 'invalid_message',
        message: `emergency address validation failed: ${detail || resp.statusText}`,
      });
    }
    if (!resp.ok) {
      throw new PhoneError({
        code: 'internal_error',
        message: `request failed: status ${resp.status}`,
      });
    }
    if (resp.status === 204) return undefined as T;
    return (await resp.json()) as T;
  }

  private async fetchIceServers(): Promise<RTCIceServer[]> {
    try {
      const resp = await fetch(`${this.apiBaseUrl}/v1/webrtc/ice-servers`, {
        headers: { Authorization: `Bearer ${this.token}` },
      });
      if (!resp.ok) throw new Error(`status ${resp.status}`);
      const body = (await resp.json()) as IceServersResponse;
      return body.ice_servers;
    } catch (e) {
      throw new PhoneError({
        code: 'ice_fetch_failed',
        message: `Failed to fetch ICE servers: ${(e as Error).message}`,
      });
    }
  }

  private handleMessage(msg: ServerMessage): void {
    switch (msg.type) {
      case 'authenticated': {
        this.isConnected = true;
        if (this.connectResolvers) {
          this.connectResolvers.resolve();
          this.connectResolvers = null;
        }
        if (this.hasConnectedOnce) this.emit('reconnected');
        else this.emit('connected');
        this.hasConnectedOnce = true;
        return;
      }
      case 'network.changed': {
        // The emergency address bound at connect no longer applies on this
        // network (DIA-644). The session stays usable — 911/933 still go out —
        // but non-emergency PSTN is gated until the app confirms/registers an
        // address valid here. Surfaced as an event for the app to prompt on.
        this.emit('network.changed');
        return;
      }
      case 'error': {
        const err = new PhoneError({
          code: (msg.code as PhoneError['code']) ?? 'internal_error',
          message: msg.message,
          callId: msg.call_id ?? null,
          fatal: msg.fatal ?? false,
        });
        if (this.connectResolvers && err.fatal) {
          this.connectResolvers.reject(err);
          this.connectResolvers = null;
        }
        if (
          this.pendingOutbound &&
          (msg.call_id === this.pendingOutbound.clientCallId || msg.call_id == null)
        ) {
          const p = this.pendingOutbound;
          this.pendingOutbound = null;
          this.pendingCall = null;
          p.reject(err);
        }
        this.emit('error', err);
        return;
      }
      case 'call.trying': {
        if (
          this.pendingOutbound &&
          msg.client_call_id === this.pendingOutbound.clientCallId &&
          this.pendingCall
        ) {
          this.pendingCall.id = msg.call_id;
          const placed = this.pendingCall;
          this.pendingOutbound.resolve(placed);
          this.pendingOutbound = null;
          this.pendingCall = null;
          placed.handleServerMessage(msg);
        } else {
          this.getCall(msg.call_id)?.handleServerMessage(msg);
        }
        return;
      }
      case 'call.incoming': {
        this.handleIncoming(msg);
        return;
      }
      case 'call.restored': {
        // Implementation lights up with DIA-1284. Surface a non-fatal error so consumers know.
        this.emit(
          'error',
          new PhoneError({
            code: 'internal_error',
            message:
              'call.restored received but reconnect/restore is not yet implemented (DIA-1284)',
            callId: msg.call_id,
          })
        );
        return;
      }
      case 'sdp.offer': {
        const call = this.getCall(msg.call_id);
        if (call) void call.prepareAnswerForOffer(msg.sdp);
        return;
      }
      case 'sdp.answer': {
        const call = this.getCall(msg.call_id);
        if (call) void call.acceptRemoteAnswer(msg.sdp);
        return;
      }
      case 'ice.candidate': {
        const call = this.getCall(msg.call_id);
        if (call) void call.addRemoteCandidate(msg.candidate, msg.sdp_mid, msg.sdp_m_line_index);
        return;
      }
      case 'ice.done':
        return;
      case 'call.ringing':
      case 'call.answered':
      case 'call.held':
      case 'call.resumed':
      case 'call.ended': {
        const call = this.getCall(msg.call_id);
        if (!call) return;
        call.handleServerMessage(msg);
        if (msg.type === 'call.ended') {
          const idx = this.activeCalls.indexOf(call);
          if (idx >= 0) this.activeCalls.splice(idx, 1);
        }
        return;
      }
      default:
        return;
    }
  }

  private handleIncoming(msg: Extract<ServerMessage, { type: 'call.incoming' }>): void {
    const call = new Call({
      id: msg.call_id,
      direction: 'inbound',
      from: msg.from,
      fromName: msg.from_name,
      to: msg.to,
      initialState: 'ringing',
      transport: this.transport!,
      iceServers: this.iceServers,
    });
    // Register the Call synchronously so the sdp.offer + ICE the server sends
    // immediately after call.incoming are routed to it, not dropped via
    // getCall() → undefined while the mic permission prompt is open. The Call
    // acquires the mic itself and gates answer creation on it.
    this.activeCalls.push(call);
    this.emit('incoming', call);
    call.whenLocalMediaReady().catch((e) => {
      this.emit(
        'error',
        new PhoneError({
          code: 'call_failed',
          message: `Microphone unavailable for incoming call: ${(e as Error).message}`,
          callId: msg.call_id,
        })
      );
    });
  }

  private emit<K extends keyof PhoneEventMap>(
    event: K,
    ...args: Parameters<PhoneEventMap[K]>
  ): void {
    this.listeners[event]?.forEach((h) => {
      (h as (...a: unknown[]) => void)(...(args as unknown[]));
    });
  }
}

// userIdFromToken extracts the user id (`sub` claim, a user_… id) from the
// user-session JWT with an UNVERIFIED payload decode. This is safe here: the
// id is used only to namespace localStorage persistence, never for trust —
// the server independently verifies the token and scopes every address by
// the authenticated user. Returns null for undecodable/opaque tokens.
function userIdFromToken(token: string): string | null {
  try {
    const payload = token.split('.')[1];
    if (!payload) return null;
    const json = atob(payload.replace(/-/g, '+').replace(/_/g, '/'));
    const sub = (JSON.parse(json) as { sub?: string }).sub;
    return typeof sub === 'string' && sub.startsWith('user_') ? sub : null;
  } catch {
    return null;
  }
}

// localStorage helpers for the persisted emergency-address id, namespaced per
// user so shared browsers don't leak one user's saved address into another's
// session. Guarded so the SDK works in non-browser hosts (Node, native shells)
// where localStorage is absent — there (or when the token can't be decoded)
// the id must be supplied via PhoneOptions.emergencyAddressId.
function loadStoredEmergencyAddressId(userId: string | null): string | null {
  if (!userId) return null;
  try {
    return globalThis.localStorage?.getItem(EMERGENCY_ADDRESS_STORAGE_KEY_PREFIX + userId) ?? null;
  } catch {
    return null;
  }
}

function persistEmergencyAddressId(userId: string | null, id: string | null): void {
  if (!userId) return;
  const key = EMERGENCY_ADDRESS_STORAGE_KEY_PREFIX + userId;
  try {
    if (id) globalThis.localStorage?.setItem(key, id);
    else globalThis.localStorage?.removeItem(key);
  } catch {
    // No localStorage (Node / native) — persistence is a browser nicety.
  }
}
