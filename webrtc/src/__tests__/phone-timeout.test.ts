import { DialStackPhone } from '../phone';
import { PhoneError } from '../errors';

// Minimal WebSocket double: opens on demand, never delivers an `authenticated`
// frame, so connect() can only settle via its timeout. Captures instances so the
// test can drive the `open` event.
class FakeWebSocket {
  static instances: FakeWebSocket[] = [];
  static OPEN = 1;
  readyState = FakeWebSocket.OPEN;
  url: string;
  private handlers: Record<string, ((evt: unknown) => void)[]> = {};

  constructor(url: string) {
    this.url = url;
    FakeWebSocket.instances.push(this);
  }
  addEventListener(event: string, handler: (evt: unknown) => void): void {
    (this.handlers[event] ??= []).push(handler);
  }
  send(): void {}
  close(): void {
    this.fire('close', { code: 1000, reason: '' });
  }
  fire(event: string, evt: unknown): void {
    for (const h of this.handlers[event] ?? []) h(evt);
  }
}

describe('DialStackPhone connect() timeout', () => {
  let originalWebSocket: unknown;

  beforeEach(() => {
    FakeWebSocket.instances = [];
    originalWebSocket = (globalThis as Record<string, unknown>).WebSocket;
    (globalThis as Record<string, unknown>).WebSocket = FakeWebSocket;
    jest.useFakeTimers();
  });

  afterEach(() => {
    (globalThis as Record<string, unknown>).WebSocket = originalWebSocket;
    jest.useRealTimers();
  });

  it('rejects with auth_failed when the server never sends authenticated', async () => {
    // `iceServers` override skips the network fetch, so connect() goes straight
    // to opening the transport — no media/RTCPeerConnection needed.
    const phone = new DialStackPhone({
      token: 'tok',
      iceServers: [],
      autoReconnect: false,
    });

    const connectPromise = phone.connect();
    // Attach a rejection handler synchronously so an early settle can't produce
    // an unhandled rejection while we drive the fake clock.
    const settled = connectPromise.then(
      () => ({ ok: true as const }),
      (err: PhoneError) => ({ ok: false as const, err })
    );

    // Let connect() reach the point where it opens the socket, then fire `open`
    // (the phone sends `authenticate`; the fake server stays silent).
    await Promise.resolve();
    await Promise.resolve();
    FakeWebSocket.instances[0]?.fire('open', {});

    // Advance past the connect timeout.
    await jest.advanceTimersByTimeAsync(20_000);

    const result = await settled;
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.err).toBeInstanceOf(PhoneError);
      expect(result.err.code).toBe('auth_failed');
    }
  });
});
