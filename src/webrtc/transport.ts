import { PhoneError } from './errors';
import { logError } from './logger';
import type { ClientMessage, ServerMessage } from './types';

const BACKOFF_STEPS_MS = [1000, 2000, 4000, 8000, 16000, 30000];

// Keepalive is handled by native WebSocket ping/pong control frames on
// the server side; there is no application-layer ping in this protocol
// (webrtc/internal/protocol/messages.go:17). Nothing for the SDK to do.

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
  // Set when the server sends a terminal fatal error (session_revoked):
  // the token is dead server-side, so reconnecting with it can only
  // fail. Suppresses auto-reconnect on the subsequent close.
  private terminalError: PhoneError | null = null;

  constructor(url: string, autoReconnect: boolean) {
    this.url = url;
    this.autoReconnect = autoReconnect;
  }

  on<E extends keyof TransportEvents>(event: E, handler: TransportEvents[E]): void {
    this.listeners[event] = handler;
  }

  connect(): void {
    this.closedByUser = false;
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
    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }
  }

  private openSocket(): void {
    const ws = new WebSocket(this.url, ['dialstack.webrtc.v1']);
    this.ws = ws;

    ws.addEventListener('open', () => {
      this.listeners.open?.();
    });

    ws.addEventListener('message', (evt) => {
      let parsed: ServerMessage;
      try {
        parsed = JSON.parse(evt.data) as ServerMessage;
      } catch {
        logError('WebSocket received an unparseable frame');
        return;
      }
      if (parsed.type === 'authenticated') {
        // Reset the backoff only once the session is fully established, NOT on
        // socket `open`. The socket opens (TCP + WS upgrade) before the auth
        // handshake and the server-side REGISTER; a REGISTER rejected because
        // the user's contacts are already at the cap closes the socket *after*
        // open. Resetting on open pinned every retry at the first backoff step,
        // so a client stuck against a full registration reconnected roughly
        // once per second forever instead of escalating its backoff.
        this.reconnectAttempts = 0;
      }
      if (parsed.type === 'error' && parsed.fatal && parsed.code === 'session_revoked') {
        this.terminalError = new PhoneError({
          code: 'session_revoked',
          message: parsed.message,
          fatal: true,
        });
      }
      this.listeners.message?.(parsed);
    });

    ws.addEventListener('close', () => {
      this.ws = null;
      if (this.terminalError) {
        this.listeners.closed?.({ fatal: true, error: this.terminalError });
        return;
      }
      if (this.closedByUser) {
        this.listeners.closed?.({ fatal: false });
        return;
      }
      if (!this.autoReconnect) {
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
    this.listeners.reconnecting?.(this.reconnectAttempts, delay);
    setTimeout(() => {
      if (!this.closedByUser) this.openSocket();
    }, delay);
  }
}
