import { Transport } from '../transport';
import { PhoneError } from '../errors';

// Minimal scriptable WebSocket double. Captures instances so tests can
// drive server-side events (message/close) and count reconnects.
class FakeWebSocket {
  static instances: FakeWebSocket[] = [];
  static OPEN = 1;
  readyState = FakeWebSocket.OPEN;
  url: string;
  private handlers: Record<string, ((evt: { data?: string }) => void)[]> = {};

  constructor(url: string, _protocols?: string[]) {
    this.url = url;
    FakeWebSocket.instances.push(this);
  }

  addEventListener(event: string, handler: (evt: { data?: string }) => void): void {
    (this.handlers[event] ??= []).push(handler);
  }

  send(_data: string): void {}
  close(): void {
    this.fire('close', {});
  }

  fire(event: string, evt: { data?: string }): void {
    for (const h of this.handlers[event] ?? []) h(evt);
  }
}

describe('Transport session_revoked handling', () => {
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

  function connect(autoReconnect: boolean): {
    transport: Transport;
    closed: jest.Mock;
    reconnecting: jest.Mock;
  } {
    const transport = new Transport('ws://test/v1/webrtc', autoReconnect);
    const closed = jest.fn();
    const reconnecting = jest.fn();
    transport.on('closed', closed);
    transport.on('reconnecting', reconnecting);
    transport.connect();
    return { transport, closed, reconnecting };
  }

  it('does not reconnect after a fatal session_revoked error frame', () => {
    const { closed, reconnecting } = connect(true);
    const ws = FakeWebSocket.instances[0]!;

    ws.fire('message', {
      data: JSON.stringify({
        type: 'error',
        code: 'session_revoked',
        message: 'user sessions revoked',
        fatal: true,
      }),
    });
    ws.fire('close', {});
    jest.runAllTimers();

    expect(reconnecting).not.toHaveBeenCalled();
    expect(FakeWebSocket.instances).toHaveLength(1);
    expect(closed).toHaveBeenCalledTimes(1);
    const reason = closed.mock.calls[0]![0] as { fatal: boolean; error?: PhoneError };
    expect(reason.fatal).toBe(true);
    expect(reason.error?.code).toBe('session_revoked');
  });

  it('still reconnects after a non-terminal close', () => {
    const { reconnecting } = connect(true);
    const ws = FakeWebSocket.instances[0]!;

    ws.fire('close', {});
    expect(reconnecting).toHaveBeenCalledTimes(1);
    jest.runAllTimers();
    expect(FakeWebSocket.instances).toHaveLength(2);
  });

  it('non-fatal error frames do not suppress reconnect', () => {
    const { reconnecting } = connect(true);
    const ws = FakeWebSocket.instances[0]!;

    ws.fire('message', {
      data: JSON.stringify({
        type: 'error',
        code: 'call_limit',
        message: 'too many calls',
        fatal: false,
      }),
    });
    ws.fire('close', {});
    expect(reconnecting).toHaveBeenCalledTimes(1);
  });

  it('escalates backoff across failed auth cycles (does not reset on socket open)', () => {
    const { reconnecting } = connect(true);

    // Each cycle the socket opens at the transport level but never
    // authenticates, then closes — the shape of a client stuck against a full
    // registration. The attempt counter must keep climbing; before the fix the
    // `open` reset pinned every retry at the first step.
    const steps = [1000, 2000, 4000, 8000];
    steps.forEach((step, i) => {
      const ws = FakeWebSocket.instances[FakeWebSocket.instances.length - 1]!;
      ws.fire('open', {}); // socket open, but no `authenticated` frame
      ws.fire('close', {});
      const [attempt, delay] = reconnecting.mock.calls[i]! as [number, number];
      expect(attempt).toBe(i + 1);
      // Equal jitter → delay ∈ [step/2, step]. The escalating floor is the
      // proof the counter is climbing, independent of the random component.
      expect(delay).toBeGreaterThanOrEqual(step / 2);
      expect(delay).toBeLessThanOrEqual(step);
      jest.runOnlyPendingTimers(); // fire the scheduled reconnect → next socket
    });
  });

  it('resets backoff after a successful authenticated session', () => {
    const { reconnecting } = connect(true);

    // Climb a few failed cycles so the counter is well past the first step.
    for (let i = 0; i < 3; i++) {
      const ws = FakeWebSocket.instances[FakeWebSocket.instances.length - 1]!;
      ws.fire('open', {});
      ws.fire('close', {});
      jest.runOnlyPendingTimers();
    }

    // The next socket authenticates, then later drops: the retry starts over
    // from the first step rather than continuing to climb.
    const ws = FakeWebSocket.instances[FakeWebSocket.instances.length - 1]!;
    ws.fire('open', {});
    ws.fire('message', {
      data: JSON.stringify({ type: 'authenticated', user_id: 'u', account_id: 'a' }),
    });
    ws.fire('close', {});

    const calls = reconnecting.mock.calls;
    const [attempt, delay] = calls[calls.length - 1]! as [number, number];
    expect(attempt).toBe(1);
    // Back to the first step (jittered into [500, 1000]).
    expect(delay).toBeGreaterThanOrEqual(500);
    expect(delay).toBeLessThanOrEqual(1000);
  });

  it('jitters the backoff so lockstep clients de-synchronise', () => {
    // Many independent transports all at the first step should spread their
    // retry delays across [500, 1000] rather than firing at an identical time.
    const delays = new Set<number>();
    for (let i = 0; i < 20; i++) {
      const t = new Transport('ws://test/v1/webrtc', true);
      t.on('reconnecting', (_attempt, delayMs) => delays.add(delayMs));
      t.connect();
      const ws = FakeWebSocket.instances[FakeWebSocket.instances.length - 1]!;
      ws.fire('close', {});
    }
    for (const d of delays) {
      expect(d).toBeGreaterThanOrEqual(500);
      expect(d).toBeLessThanOrEqual(1000);
    }
    // All-identical across 20 draws is astronomically unlikely with jitter.
    expect(delays.size).toBeGreaterThan(1);
  });
});
