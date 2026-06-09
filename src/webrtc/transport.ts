import { PhoneError } from './errors';
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

  send(msg: ClientMessage): void {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
      throw new PhoneError({ code: 'transport_closed', message: 'WebSocket is not open' });
    }
    this.ws.send(JSON.stringify(msg));
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
      this.reconnectAttempts = 0;
      this.listeners.open?.();
    });

    ws.addEventListener('message', (evt) => {
      let parsed: ServerMessage;
      try {
        parsed = JSON.parse(evt.data) as ServerMessage;
      } catch {
        return;
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
    const delay = BACKOFF_STEPS_MS[Math.min(this.reconnectAttempts, BACKOFF_STEPS_MS.length - 1)]!;
    this.reconnectAttempts += 1;
    this.listeners.reconnecting?.(this.reconnectAttempts, delay);
    setTimeout(() => {
      if (!this.closedByUser) this.openSocket();
    }, delay);
  }
}
