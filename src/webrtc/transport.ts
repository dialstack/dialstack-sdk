import { PhoneError } from './errors';
import { logError } from './logger';
import type { ClientMessage, ServerMessage } from './types';

/**
 * Opens the signaling WebSocket. Defaults to a bare `new WebSocket(url,
 * protocols)` (web). React Native needs a variant that attaches a `User-Agent`
 * header — the signaling ingress 403s a handshake without one, and iOS's
 * WebSocket sends none by default — so the RN softphone provider supplies its
 * own factory here. Browsers forbid overriding `User-Agent`, so web never does.
 */
export type SignalingSocketFactory = (url: string, protocols: string[]) => WebSocket;

const defaultSignalingSocket: SignalingSocketFactory = (url, protocols) =>
  new WebSocket(url, protocols);

/**
 * Subscribe to "the environment came back to the foreground / regained the
 * network" and return an unsubscribe fn. Injected like the socket factory: web
 * uses the default below (DOM lifecycle events); React Native supplies an
 * AppState-backed variant (there is no `document` on RN). The transport uses
 * this to actively re-verify a connection the browser may have silently dropped
 * while backgrounded.
 */
export type AppResumeSubscribe = (cb: () => void) => () => void;

// Web default: fire on the DOM lifecycle events that signal a resume. Every
// global is read lazily and guarded so a non-browser host (Node/tests, or the
// RN bundle before it injects its own) degrades to a no-op unsubscribe. Events
// are coalesced (one wake commonly emits several) into a single microtask-
// deferred cb.
const defaultAppResume: AppResumeSubscribe = (cb) => {
  const w = globalThis.window;
  const doc = globalThis.document;
  if (!w || typeof w.addEventListener !== 'function') return () => {};

  let scheduled = false;
  const fire = () => {
    if (scheduled) return;
    scheduled = true;
    queueMicrotask(() => {
      scheduled = false;
      cb();
    });
  };
  const onVisible = () => {
    if (!doc || doc.visibilityState === 'visible') fire();
  };

  w.addEventListener('online', fire);
  w.addEventListener('pageshow', fire);
  w.addEventListener('focus', fire);
  doc?.addEventListener('visibilitychange', onVisible);
  return () => {
    w.removeEventListener('online', fire);
    w.removeEventListener('pageshow', fire);
    w.removeEventListener('focus', fire);
    doc?.removeEventListener('visibilitychange', onVisible);
  };
};

const BACKOFF_STEPS_MS = [1000, 2000, 4000, 8000, 16000, 30000];

// How long to wait for a `pong` after a wake-probe `ping` before declaring the
// socket dead and forcing a reconnect.
const PROBE_TIMEOUT_MS = 5000;

// Fatal error codes a reconnect genuinely cannot recover: the credential is
// dead server-side. Every OTHER fatal eviction (idle_timeout, session_limit,
// slow_consumer, going_away) is transient and must still auto-reconnect.
const TERMINAL_ERROR_CODES = new Set<PhoneError['code']>(['session_revoked', 'auth_expired']);

function isTerminalErrorCode(code: string): code is PhoneError['code'] {
  return TERMINAL_ERROR_CODES.has(code as PhoneError['code']);
}

// Transport liveness has two layers. The SERVER runs the native WS ping/pong
// keepalive and reaps a silent peer — that half works. The gap this handles is
// on the CLIENT: when a tab is backgrounded, the browser throttles its event
// loop, so the socket's `close` event may never run (and a half-open network
// path never delivers the FIN) — the SDK would keep reporting a dead session as
// connected. So on resume (AppResumeSubscribe) we actively probe with an
// app-layer `ping` and force a reconnect if no `pong` comes back. Browsers
// can't send WS control-frame pings from JS, hence the app-layer `ping`.

export type TransportEvents = {
  open: () => void;
  message: (msg: ServerMessage) => void;
  closed: (reason: { fatal: boolean; error?: PhoneError }) => void;
  reconnecting: (attempt: number, delayMs: number) => void;
};

export class Transport {
  private ws: WebSocket | null = null;
  private url: string;
  private listeners: Partial<TransportEvents> = {};
  // Advanced on every scheduled reconnect and reset only when a session
  // fully authenticates (see the message handler) — never on bare socket
  // `open`, or backoff can't escalate past the first step.
  private reconnectAttempts = 0;
  private closedByUser = false;
  private autoReconnect: boolean;
  private createSocket: SignalingSocketFactory;
  private subscribeResume: AppResumeSubscribe;
  // Set when the server sends a TERMINAL fatal error (session_revoked /
  // auth_expired): the token is dead server-side, so reconnecting with it can
  // only fail or loop. Suppresses auto-reconnect (and the wake-probe's
  // force-reconnect) on the subsequent close. Other fatal evictions are
  // recoverable and deliberately do NOT set this.
  private terminalError: PhoneError | null = null;

  // Wake-probe state. `unsubscribeResume` is the resume subscription, held for
  // the transport's lifetime and released in close(). `probeTimer`/
  // `probeInFlight` bound a single in-flight probe (one wake fires several
  // lifecycle events; we want one probe per resume).
  private unsubscribeResume: (() => void) | null = null;
  private probeTimer: ReturnType<typeof setTimeout> | null = null;
  private probeInFlight = false;
  // True between scheduling a reconnect and that reconnect opening a socket, so
  // a wake can't kick a second reconnect while a backoff one is pending.
  private reconnectPending = false;
  // Latched when a wake-probe forced a teardown but autoReconnect is off: no
  // reconnect follows, so a later wake must not re-enter and emit a duplicate
  // `closed`.
  private stopped = false;

  constructor(
    url: string,
    autoReconnect: boolean,
    createSocket?: SignalingSocketFactory,
    subscribeResume?: AppResumeSubscribe
  ) {
    this.url = url;
    this.autoReconnect = autoReconnect;
    this.createSocket = createSocket ?? defaultSignalingSocket;
    this.subscribeResume = subscribeResume ?? defaultAppResume;
  }

  on<E extends keyof TransportEvents>(event: E, handler: TransportEvents[E]): void {
    this.listeners[event] = handler;
  }

  connect(): void {
    this.closedByUser = false;
    // Subscribe once per transport lifetime — not per socket — so a reconnect
    // doesn't stack duplicate listeners. Released in close().
    if (!this.unsubscribeResume) {
      this.unsubscribeResume = this.subscribeResume(() => this.onWake());
    }
    this.openSocket();
  }

  /** True when the socket is open and a send() would succeed. */
  isOpen(): boolean {
    return !!this.ws && this.ws.readyState === WebSocket.OPEN;
  }

  send(msg: ClientMessage): void {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
      logError('WebSocket send failed: socket not open', {
        type: msg.type,
        readyState: this.ws?.readyState ?? null,
      });
      throw new PhoneError({ code: 'transport_closed', message: 'WebSocket is not open' });
    }
    this.ws.send(JSON.stringify(msg));
  }

  /**
   * Best-effort send for messages emitted on their own async timeline (ICE
   * candidates fire from the peer connection, and can arrive while the socket is
   * mid-reconnect or closed). Silently drops when the socket isn't open rather
   * than throwing an uncaught error into an event handler. Trickle ICE tolerates
   * loss, and a closed socket means the call is already tearing down.
   */
  trySend(msg: ClientMessage): void {
    if (this.isOpen()) {
      this.ws!.send(JSON.stringify(msg));
    }
  }

  close(): void {
    this.closedByUser = true;
    this.clearProbe();
    if (this.unsubscribeResume) {
      this.unsubscribeResume();
      this.unsubscribeResume = null;
    }
    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }
  }

  private openSocket(): void {
    const ws = this.createSocket(this.url, ['dialstack.webrtc.v1']);
    this.ws = ws;

    ws.addEventListener('open', () => {
      this.listeners.open?.();
    });

    ws.addEventListener('message', (evt) => {
      // Ignore a frame from a socket we've already moved on from (forceReconnect
      // nulls this.ws and opens a new one without waiting for close). A late
      // buffered frame from the dead socket must not clear the new connection's
      // probe or reset reconnectPending — same freshness guard the close handler
      // applies.
      if (this.ws !== ws) return;
      let parsed: ServerMessage;
      try {
        parsed = JSON.parse(evt.data) as ServerMessage;
      } catch {
        logError('WebSocket received an unparseable frame');
        return;
      }
      // Any inbound frame proves the socket is alive, so it settles a pending
      // wake-probe. `pong` is the probe's own reply — consume it here and do NOT
      // forward it to the phone (it's transport-internal, not an app message).
      this.clearProbe();
      if (parsed.type === 'pong') return;
      if (parsed.type === 'authenticated') {
        // Reset the backoff only once the session is fully established, NOT on
        // socket `open`. The socket opens (TCP + WS upgrade) before the auth
        // handshake and the server-side REGISTER; a REGISTER rejected because
        // the user's contacts are already at the cap closes the socket *after*
        // open. Resetting on open pinned every retry at the first backoff step,
        // so a client stuck against a full registration reconnected roughly
        // once per second forever instead of escalating its backoff.
        this.reconnectAttempts = 0;
        this.reconnectPending = false;
      }
      if (parsed.type === 'error' && parsed.fatal && isTerminalErrorCode(parsed.code)) {
        // Terminal ONLY for codes a reconnect can't recover: the token is dead
        // server-side (session_revoked) or lapsed (auth_expired), so re-auth with
        // it would just fail or loop. Every OTHER fatal eviction — idle_timeout
        // (the reap this watchdog exists to recover from), session_limit (another
        // tab freed a slot), slow_consumer, going_away (deploy/drain) — is
        // recoverable, so it must fall through to auto-reconnect.
        this.terminalError = new PhoneError({
          code: parsed.code,
          message: parsed.message,
          fatal: true,
        });
      }
      this.listeners.message?.(parsed);
    });

    ws.addEventListener('close', () => {
      // Ignore a close from a socket we've already moved on from — forceReconnect
      // nulls this.ws and opens a new socket without waiting for the OS `close`,
      // so the dead socket's late close must not fire a second reconnect (or flip
      // state) over the replacement.
      if (this.ws !== ws) return;
      this.ws = null;
      // A pending probe is moot once the socket is gone — its timer would just
      // call forceReconnect, which this close path already handles.
      this.clearProbe();
      if (this.terminalError) {
        this.listeners.closed?.({ fatal: true, error: this.terminalError });
        return;
      }
      if (this.closedByUser) {
        this.listeners.closed?.({ fatal: false });
        return;
      }
      if (!this.autoReconnect) {
        // No reconnect will follow. Latch `stopped` so a later wake can't
        // re-enter forceReconnect and emit a second `closed` (→ duplicate
        // `disconnected`) — symmetric with forceReconnect's own no-reconnect
        // branch, which sets it too.
        this.stopped = true;
        this.listeners.closed?.({ fatal: false });
        return;
      }
      this.scheduleReconnect();
    });

    ws.addEventListener('error', () => {
      // Surface via the subsequent 'close' event; nothing to do here.
    });
  }

  private scheduleReconnect(): void {
    const step = BACKOFF_STEPS_MS[Math.min(this.reconnectAttempts, BACKOFF_STEPS_MS.length - 1)]!;
    // Equal jitter (AWS "Exponential Backoff And Jitter"): hold half the step
    // as a floor and randomise the other half → delay ∈ [step/2, step]. Several
    // sessions for one user (e.g. multiple tabs) that drop in lockstep against
    // a full registration would otherwise retry in perfect sync every cycle and
    // keep re-colliding; jitter spreads them so they stop resynchronising.
    const delay = Math.round(step / 2 + Math.random() * (step / 2));
    this.reconnectAttempts += 1;
    this.reconnectPending = true;
    this.listeners.reconnecting?.(this.reconnectAttempts, delay);
    setTimeout(() => {
      this.reconnectPending = false;
      if (!this.closedByUser) this.openSocket();
    }, delay);
  }

  // Called when the environment resumes (tab foregrounded, network regained).
  // The socket may look OPEN but be dead — a backgrounded tab never ran the
  // `close` handler. Reconcile: if the socket is already gone, reconnect now; if
  // it claims to be open, probe it with a `ping` and force a reconnect only if
  // no `pong` (or any other frame) comes back in time.
  private onWake(): void {
    if (this.closedByUser || this.stopped || this.terminalError || this.reconnectPending) return;
    if (!this.isOpen()) {
      // Already-dead socket (ws null). A reconnect isn't already pending
      // (guarded above), so kick one.
      //
      // A socket still in CONNECTING (ws present, not OPEN) is deliberately left
      // alone: forcing a reconnect could kill a handshake that's about to
      // succeed. A handshake that never completes is bounded elsewhere — the
      // initial connect by phone.ts's CONNECT_TIMEOUT_MS, and a reconnect
      // attempt by the backoff cadence re-firing — so it can't wedge silently.
      if (!this.ws) this.forceReconnect();
      return;
    }
    if (this.probeInFlight) return;
    this.probeInFlight = true;
    this.probeTimer = setTimeout(() => {
      this.probeTimer = null;
      this.probeInFlight = false;
      // No reply to the probe — treat the socket as dead.
      this.forceReconnect();
    }, PROBE_TIMEOUT_MS);
    try {
      this.ws!.send(JSON.stringify({ type: 'ping' } satisfies ClientMessage));
    } catch {
      // Send threw synchronously → the socket is dead now, don't wait for the
      // probe timeout.
      this.clearProbe();
      this.forceReconnect();
    }
  }

  // Tear down a socket the wake-probe found dead and start a reconnect, WITHOUT
  // waiting for the OS `close` event (the whole point — that event may never
  // fire on a throttled/half-open connection). Idempotent and guarded so it
  // can't reconnect a user-closed, stopped, or terminally-errored transport.
  private forceReconnect(): void {
    if (this.closedByUser || this.stopped || this.terminalError || this.reconnectPending) return;
    // Close the dead socket in BOTH branches — otherwise the OS socket and its
    // attached listeners leak. Null this.ws first so the socket's own late
    // `close`/`message` (guarded on identity) is a no-op against the replacement.
    const dead = this.ws;
    this.ws = null;
    if (dead) {
      try {
        dead.close();
      } catch {
        // Already closing/closed — nothing to do.
      }
    }
    if (!this.autoReconnect) {
      // No reconnect will follow, so this is the end of the line. Latch it so a
      // later wake can't re-enter forceReconnect and emit a duplicate `closed`.
      this.stopped = true;
      this.listeners.closed?.({ fatal: false });
      return;
    }
    this.scheduleReconnect();
  }

  private clearProbe(): void {
    if (this.probeTimer !== null) {
      clearTimeout(this.probeTimer);
      this.probeTimer = null;
    }
    this.probeInFlight = false;
  }
}
