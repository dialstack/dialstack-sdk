import { createPaginatedList, type PaginatedList } from '../shared/pagination';
import { Call } from './call';
import { NotImplementedError, PhoneError } from './errors';
import { logError } from './logger';
import { storage } from './platform';
import type { RTCIceServer, RTCSessionDescriptionInit } from './platform';
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

// How long to wait for the server's call.trying (or an error) after sending
// call.create before giving up on an outbound call. Generous — it covers a real
// PSTN setup round-trip — but finite, so a wedged session surfaces as a failure
// instead of a promise that never settles.
const OUTBOUND_CALL_TIMEOUT_MS = 30_000;

// How long to wait for the server's `authenticated` frame after the socket opens
// before failing connect(). A dead/half-open socket otherwise leaves connect()
// pending forever.
const CONNECT_TIMEOUT_MS = 20_000;

/**
 * A one-shot timeout for a request awaiting a server reply. `onExpire` runs once
 * if nothing settles within `ms`; `settle()` (called from the resolve/reject
 * paths) cancels the timer and blocks a later expiry. Centralizes the
 * settled-flag + setTimeout/clearTimeout bookkeeping shared by connect() and the
 * outbound-call promise so the two can't drift.
 */
function armTimeout(ms: number, onExpire: () => void): { settle: () => void } {
  let settled = false;
  const timer = setTimeout(() => {
    if (settled) return;
    settled = true;
    onExpire();
  }, ms);
  return {
    settle: () => {
      settled = true;
      clearTimeout(timer);
    },
  };
}

// localStorage key prefix for the persisted emergency-address id.
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
  // The creating frame's req_id. call.trying (the direct reply to a
  // call-creating frame — call.create or the consult step of
  // call.transfer.attended) echoes it, as does an error reply; it is the
  // sole match key for resolving or rejecting this pending call.
  reqId: string;
  destination: string;
  resolve: (call: Call) => void;
  reject: (err: PhoneError) => void;
}

export class DialStackPhone {
  isConnected = false;
  readonly activeCalls: Call[] = [];

  private token: string;
  private apiBaseUrl: string;
  private signalingUrl: string;
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
  private reqSeq = 0;
  private emergencyAddressId: string | null;
  // User id (token `sub` claim) used to namespace localStorage persistence.
  // null when the token can't be decoded — persistence is then disabled and
  // the app must supply PhoneOptions.emergencyAddressId itself.
  private storageUserId: string | null;

  constructor(options: PhoneOptions) {
    this.token = options.token;
    this.apiBaseUrl = options.apiBaseUrl ?? DEFAULT_API_BASE_URL;
    this.signalingUrl = resolveSignalingUrl(options.signalingBaseUrl, this.apiBaseUrl);
    this.autoReconnect = options.autoReconnect ?? true;
    this.iceServersOverride = options.iceServers ?? null;
    this.storageUserId = userIdFromToken(options.token);
    this.emergencyAddressId =
      options.emergencyAddressId ?? loadStoredEmergencyAddressId(this.storageUserId);
    void options.onTokenExpiring; // Reserved for a future release.
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

    const transport = new Transport(this.signalingUrl, this.autoReconnect);
    this.transport = transport;

    // A superseded transport (after disconnect()/reconnect() swapped in a new
    // one) can still fire async callbacks — its `closed` in particular. Ignore
    // any callback from a transport that is no longer the current one, or a late
    // close from the old socket would flip `isConnected`/emit `disconnected`
    // over a freshly-authenticated new socket.
    const isCurrent = () => this.transport === transport;

    transport.on('open', () => {
      if (!isCurrent()) return;
      transport.send({
        type: 'authenticate',
        token: this.token,
        ...(this.emergencyAddressId ? { emergency_address_id: this.emergencyAddressId } : {}),
      });
    });

    transport.on('message', (msg) => {
      if (!isCurrent()) return;
      this.handleMessage(msg);
    });

    transport.on('reconnecting', (attempt, delayMs) => {
      if (!isCurrent()) return;
      this.isConnected = false;
      this.emit('reconnecting', attempt, delayMs);
    });

    transport.on('closed', () => {
      if (!isCurrent()) return;
      this.isConnected = false;
      this.emit('disconnected');
    });

    return new Promise<void>((resolve, reject) => {
      // Bound the wait for `authenticated`. A dead/half-open socket (or a server
      // that accepts the TCP connection but never completes the handshake) would
      // otherwise leave connect() pending forever with no rejection.
      const timeout = armTimeout(CONNECT_TIMEOUT_MS, () => {
        logError('Timed out connecting to the softphone', { timeoutMs: CONNECT_TIMEOUT_MS });
        this.connectResolvers = null;
        this.disconnect();
        reject(
          new PhoneError({ code: 'auth_failed', message: 'Timed out connecting to the softphone' })
        );
      });

      this.connectResolvers = {
        resolve: () => {
          timeout.settle();
          resolve();
        },
        reject: (err) => {
          timeout.settle();
          reject(err);
        },
      };
      transport.connect();
    });
  }

  disconnect(): void {
    // Settle an in-flight outbound (awaiting call.trying) that isn't in
    // activeCalls yet — otherwise its promise hangs forever and its timeout
    // timer + Call leak until it fires. reject() clears the timer, disposes the
    // Call, and nulls pendingOutbound/pendingCall.
    this.pendingOutbound?.reject(
      new PhoneError({
        code: 'transport_closed',
        message: 'Disconnected before the call connected',
      })
    );
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

  /**
   * Tear down and reconnect, re-running the `authenticate` handshake. The new
   * session presents the current `emergencyAddressId`, which is where the server
   * binds the emergency address to the connection's network — so this is how an
   * app applies a just-selected/created address (or re-binds after a network
   * move). Safe to call while idle; any live calls are torn down.
   */
  async reconnect(): Promise<void> {
    // Emit an explicit `reconnecting` before tearing down. The old transport's
    // async `closed` no longer surfaces `disconnected` (the transport-staleness
    // guard drops it once disconnect() nulls this.transport), so without this the
    // connection state would never leave `connected` across a reconnect — and a
    // consumer watching for a connected→…→connected transition (e.g. the E911
    // binding re-check) would never see one. This drives the observable
    // transition that the subsequent `authenticated` (→ `reconnected`) completes.
    this.emit('reconnecting', 0, 0);
    this.isConnected = false;
    this.disconnect();
    await this.connect();
  }

  call(destination: string): Promise<Call> {
    const reqId = this.nextReqId();
    return this.placeOutbound(destination, reqId, (offerSdp) => {
      this.transport!.send({
        type: 'call.create',
        req_id: reqId,
        destination,
        sdp: offerSdp,
      });
    });
  }

  // startConsult dials the consult leg of an attended transfer:
  // same outbound machinery as call(), but signalled via
  // call.transfer.attended{step:consult} so the server holds the parent
  // first. The consult's call.trying is the direct reply to the consult
  // frame and echoes its req_id, so it resolves exactly like a normal
  // outbound call.
  private startConsult(parent: Call, destination: string): Promise<Call> {
    const reqId = this.nextReqId();
    return this.placeOutbound(destination, reqId, (offerSdp) => {
      this.transport!.send({
        type: 'call.transfer.attended',
        req_id: reqId,
        call_id: parent.id,
        step: 'consult',
        destination,
        sdp: offerSdp,
      });
    });
  }

  private async placeOutbound(
    destination: string,
    reqId: string,
    sendCreate: (offerSdp: string) => void
  ): Promise<Call> {
    if (!this.transport || !this.isConnected) {
      throw new PhoneError({ code: 'transport_closed', message: 'Phone is not connected' });
    }
    if (this.pendingOutbound) {
      throw new PhoneError({
        code: 'rate_limited',
        message: 'Another outbound call is still being placed',
      });
    }

    const call = new Call({
      // Provisional id until call.trying delivers the server-assigned one.
      id: reqId,
      direction: 'outbound',
      from: '',
      fromName: null,
      to: destination,
      initialState: 'trying',
      transport: this.transport,
      iceServers: this.iceServers,
      startConsult: (p, d) => this.startConsult(p, d),
    });

    // startOutbound acquires the mic (getUserMedia) internally and gathers ICE
    // before returning the offer; surface a mic-denied / no-SDP failure as a
    // PhoneError and tear the call down.
    let offer: RTCSessionDescriptionInit;
    try {
      offer = await call.startOutbound();
    } catch (e) {
      call.dispose();
      // A denied mic permission (getUserMedia throws NotAllowedError/SecurityError)
      // is user-remediable and distinct from a generic call failure — give it its
      // own code so the UI can prompt the user to grant access.
      const name = (e as { name?: string }).name;
      if (name === 'NotAllowedError' || name === 'SecurityError') {
        throw new PhoneError({
          code: 'mic_permission_denied',
          message: 'Microphone permission is required to place a call',
        });
      }
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
      // Bound the wait for the server's call.trying (or an error) reply. Without
      // this, a wedged/half-open session (socket open, server silent) leaves the
      // promise pending forever — placeCall's caller never learns the dial failed
      // and the UI silently no-ops. On expiry we reject so the failure surfaces.
      const timeout = armTimeout(OUTBOUND_CALL_TIMEOUT_MS, () => {
        // Only fire if THIS outbound is still the pending one (a later dial may
        // have replaced it).
        if (this.pendingOutbound?.reqId !== reqId) return;
        logError('Timed out waiting for the server to accept the call', {
          timeoutMs: OUTBOUND_CALL_TIMEOUT_MS,
        });
        this.pendingOutbound.reject(
          new PhoneError({
            code: 'call_failed',
            message: 'Timed out waiting for the server to accept the call',
          })
        );
      });

      this.pendingOutbound = {
        reqId,
        destination,
        resolve: (placed) => {
          timeout.settle();
          this.pendingOutbound = null;
          this.pendingCall = null;
          this.activeCalls.push(placed);
          resolve(placed);
        },
        reject: (err) => {
          timeout.settle();
          this.pendingOutbound = null;
          this.pendingCall = null;
          call.dispose();
          reject(err);
        },
      };

      sendCreate(offerSdp);

      this.pendingCall = call;
    });
  }

  getCall(callId: string): Call | undefined {
    return this.activeCalls.find((c) => c.id === callId);
  }

  subscribePresence(_userIds?: string[]): void {
    throw new NotImplementedError('DialStackPhone.subscribePresence');
  }

  setPresence(_status: SettablePresenceStatus, _statusText?: string): Promise<void> {
    throw new NotImplementedError('DialStackPhone.setPresence');
  }

  /**
   * Register and validate an emergency (E911) address. Creates the
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

  /**
   * Select an already-saved emergency address to present on the next
   * (re)connect (sets + persists it). The server binds it at the authenticate
   * handshake, so call `reconnect()` afterwards for it to take effect.
   */
  selectEmergencyAddress(id: string): void {
    this.emergencyAddressId = id;
    persistEmergencyAddressId(this.storageUserId, id);
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

  private nextReqId(): string {
    this.reqSeq += 1;
    return `req_${Date.now().toString(36)}_${this.reqSeq}`;
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
        // network. The session stays usable — 911/933 still go out —
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
        logError('Softphone server error', {
          code: err.code,
          message: err.message,
          fatal: err.fatal,
        });
        if (this.connectResolvers && err.fatal) {
          this.connectResolvers.reject(err);
          this.connectResolvers = null;
        }
        // A pending outbound is rejected by an error echoing the creating
        // frame's req_id (the server echoes it on every immediate create /
        // consult failure), or by any fatal error — the connection is dying
        // and call.trying will never arrive.
        if (this.pendingOutbound && (msg.req_id === this.pendingOutbound.reqId || err.fatal)) {
          // reject() clears the timer and nulls pendingOutbound/pendingCall.
          this.pendingOutbound.reject(err);
        }
        this.emit('error', err);
        return;
      }
      case 'call.trying': {
        // call.trying is the direct reply to the call-creating frame
        // (call.create or the consult step of call.transfer.attended) and
        // echoes its req_id.
        if (this.pendingOutbound && msg.req_id === this.pendingOutbound.reqId && this.pendingCall) {
          const placed = this.pendingCall;
          placed.id = msg.call_id;
          // resolve() clears the timer and nulls pendingOutbound/pendingCall.
          this.pendingOutbound.resolve(placed);
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
        // Not yet implemented. Surface a non-fatal error so consumers know.
        this.emit(
          'error',
          new PhoneError({
            code: 'internal_error',
            message: 'call.restored received but reconnect/restore is not yet implemented',
            callId: msg.call_id,
          })
        );
        return;
      }
      case 'sdp.offer': {
        const call = this.getCall(msg.call_id);
        // Surface non-mic prepare failures (e.g. createAnswer error) via the
        // error event — otherwise the rejection is unhandled. The mic-permission
        // failure is owned by handleIncoming (whenLocalMediaReady().catch) and
        // is swallowed inside prepareAnswerForOffer, so it is not double-emitted
        // here.
        if (call) {
          void call.prepareAnswerForOffer(msg.sdp).catch((e) =>
            this.emit(
              'error',
              new PhoneError({
                code: 'call_failed',
                message: `Failed to prepare answer for incoming call: ${(e as Error).message}`,
                callId: msg.call_id,
              })
            )
          );
        }
        return;
      }
      case 'sdp.pranswer': {
        // Network early media (carrier 183): apply it as a provisional answer
        // so audio plays during ringing. The final sdp.answer replaces it at
        // pickup. Opaque to the app — no separate event.
        const call = this.getCall(msg.call_id);
        if (call) {
          void call.acceptRemoteProvisionalAnswer(msg.sdp).catch((e) =>
            this.emit(
              'error',
              new PhoneError({
                code: 'call_failed',
                message: `Failed to apply provisional answer: ${(e as Error).message}`,
                callId: msg.call_id,
              })
            )
          );
        }
        return;
      }
      case 'sdp.answer': {
        const call = this.getCall(msg.call_id);
        if (call) {
          // Surface a failed setRemoteDescription(answer) instead of a silent
          // unhandled rejection — the browser may reject or ICE-restart on a
          // final answer that's incompatible with the applied provisional.
          void call.acceptRemoteAnswer(msg.sdp).catch((e) =>
            this.emit(
              'error',
              new PhoneError({
                code: 'call_failed',
                message: `Failed to apply answer: ${(e as Error).message}`,
                callId: msg.call_id,
              })
            )
          );
        }
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
      startConsult: (p, d) => this.startConsult(p, d),
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
// Resolves the WebSocket signaling URL the phone connects to.
//
// Precedence: a non-empty `signalingBaseUrl` wins; otherwise the default is
// derived from `apiBaseUrl` by swapping the leading `api.` host label for
// `webrtc.` (the signaling host is a separate, region-aware hostname). Hosts
// that don't start with `api.` (self-host, proxies) are left unchanged. The
// base is upgraded http(s)→ws(s) (case-insensitive) and gets the `/v1/webrtc`
// path appended if it isn't already present.
//
// `||` (not `??`) so an explicit empty string falls back to the derived
// default rather than producing a scheme-less relative URL.
export function resolveSignalingUrl(
  signalingBaseUrl: string | undefined,
  apiBaseUrl: string
): string {
  const base = signalingBaseUrl || deriveDefaultSignalingBaseUrl(apiBaseUrl);
  // Normalize the scheme token case-insensitively: http(s)->ws(s), lowercased.
  // (A naive /^http/i would turn "HTTPS://" into the invalid "wsS://".)
  let url = base
    .replace(/^(https?|wss?):/i, (m) => {
      const s = m.toLowerCase();
      return s === 'http:' ? 'ws:' : s === 'https:' ? 'wss:' : s;
    })
    .replace(/\/+$/, '');
  if (!url.endsWith('/v1/webrtc')) url += '/v1/webrtc';
  return url;
}

function deriveDefaultSignalingBaseUrl(apiBaseUrl: string): string {
  try {
    const u = new URL(apiBaseUrl);
    if (u.hostname.startsWith('api.')) {
      u.hostname = 'webrtc.' + u.hostname.slice('api.'.length);
    }
    // Preserve any path prefix (e.g. a proxied `https://gw.example.com/api`)
    // so the WS path matches where REST calls go; `.origin` would drop it.
    // Trailing slashes are trimmed by resolveSignalingUrl.
    return `${u.protocol}//${u.host}${u.pathname}`;
  } catch {
    // Not a parseable absolute URL (e.g. a relative base in a test harness) —
    // fall back to the raw value; resolveSignalingUrl still normalises it.
    return apiBaseUrl;
  }
}

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

// Persistence helpers for the emergency-address id, namespaced per user so
// shared browsers don't leak one user's saved address into another's session.
// Backed by the platform storage shim (localStorage on web, AsyncStorage-backed
// cache on native), which is itself guarded so the SDK works in non-browser
// hosts where storage is absent — there (or when the token can't be decoded)
// the id must be supplied via PhoneOptions.emergencyAddressId.
function loadStoredEmergencyAddressId(userId: string | null): string | null {
  if (!userId) return null;
  return storage.getItem(EMERGENCY_ADDRESS_STORAGE_KEY_PREFIX + userId);
}

function persistEmergencyAddressId(userId: string | null, id: string | null): void {
  if (!userId) return;
  const key = EMERGENCY_ADDRESS_STORAGE_KEY_PREFIX + userId;
  if (id) storage.setItem(key, id);
  else storage.removeItem(key);
}
