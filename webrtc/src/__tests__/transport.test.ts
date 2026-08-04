import { Transport, type AppResumeSubscribe } from '../transport';
import { PhoneError } from '../errors';

// Controllable app-resume seam injected into Transport (main injects platform
// differences via constructor rather than a module-mocked ./platform). A test
// drives a resume via triggerWake() and asserts unsubscribe via hasListener().
let resumeCb: (() => void) | null = null;
const subscribeResume: AppResumeSubscribe = (cb) => {
  resumeCb = cb;
  return () => {
    resumeCb = null;
  };
};
const __triggerAppResume = () => resumeCb?.();
const __hasResumeListener = () => resumeCb !== null;

// The socket factory Transport gets: new up the FakeWebSocket via the swapped
// global so instances are captured.
const fakeSocketFactory = (url: string, protocols: string[]): WebSocket => {
  const WS = (globalThis as { WebSocket: new (u: string, p: string[]) => unknown }).WebSocket;
  return new WS(url, protocols) as WebSocket;
};

// Minimal scriptable WebSocket double. Captures instances so tests can
// drive server-side events (message/close) and count reconnects.
class FakeWebSocket {
  static instances: FakeWebSocket[] = [];
  static OPEN = 1;
  static CLOSED = 3;
  readyState = FakeWebSocket.OPEN;
  url: string;
  // Captured outbound frames so a test can assert a `ping` was sent.
  sent: string[] = [];
  private handlers: Record<string, ((evt: { data?: string }) => void)[]> = {};

  constructor(url: string, _protocols?: string[]) {
    this.url = url;
    FakeWebSocket.instances.push(this);
  }

  addEventListener(event: string, handler: (evt: { data?: string }) => void): void {
    (this.handlers[event] ??= []).push(handler);
  }

  send(data: string): void {
    this.sent.push(data);
  }
  close(): void {
    // Real WS goes to CLOSED and fires close asynchronously; the transport's
    // identity guard tolerates a late fire, but tests drive close explicitly.
    this.readyState = FakeWebSocket.CLOSED;
    this.fire('close', {});
  }

  /** Last sent frame parsed to its `type`, or undefined. */
  lastSentType(): string | undefined {
    const last = this.sent[this.sent.length - 1];
    return last ? (JSON.parse(last) as { type: string }).type : undefined;
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
    const transport = new Transport(
      'ws://test/v1/webrtc',
      autoReconnect,
      fakeSocketFactory,
      subscribeResume
    );
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

  it('does not reconnect after a fatal session_replaced error frame', () => {
    const { closed, reconnecting } = connect(true);
    const ws = FakeWebSocket.instances[0]!;

    ws.fire('message', {
      data: JSON.stringify({
        type: 'error',
        code: 'session_replaced',
        message: 'session replaced by a newer connection',
        fatal: true,
      }),
    });
    ws.fire('close', {});
    jest.runAllTimers();

    // Reconnecting would evict the newer session in turn (a takeover war).
    expect(reconnecting).not.toHaveBeenCalled();
    expect(FakeWebSocket.instances).toHaveLength(1);
    expect(closed).toHaveBeenCalledTimes(1);
    const reason = closed.mock.calls[0]![0] as { fatal: boolean; error?: PhoneError };
    expect(reason.fatal).toBe(true);
    expect(reason.error?.code).toBe('session_replaced');
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
      const t = new Transport('ws://test/v1/webrtc', true, fakeSocketFactory, subscribeResume);
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

describe('Transport wake-probe (stale-session watchdog)', () => {
  let originalWebSocket: unknown;

  beforeEach(() => {
    FakeWebSocket.instances = [];
    resumeCb = null;
    originalWebSocket = (globalThis as Record<string, unknown>).WebSocket;
    (globalThis as Record<string, unknown>).WebSocket = FakeWebSocket;
    jest.useFakeTimers();
  });

  afterEach(() => {
    (globalThis as Record<string, unknown>).WebSocket = originalWebSocket;
    jest.useRealTimers();
  });

  function connectAuthenticated(autoReconnect = true): {
    transport: Transport;
    ws: FakeWebSocket;
    closed: jest.Mock;
    reconnecting: jest.Mock;
  } {
    const transport = new Transport(
      'ws://test/v1/webrtc',
      autoReconnect,
      fakeSocketFactory,
      subscribeResume
    );
    const closed = jest.fn();
    const reconnecting = jest.fn();
    transport.on('closed', closed);
    transport.on('reconnecting', reconnecting);
    transport.connect();
    const ws = FakeWebSocket.instances[FakeWebSocket.instances.length - 1]!;
    ws.fire('open', {});
    ws.fire('message', {
      data: JSON.stringify({ type: 'authenticated', user_id: 'u', account_id: 'a' }),
    });
    return { transport, ws, closed, reconnecting };
  }

  it('forces a reconnect when a wake finds a dead OPEN socket that never fires close', () => {
    const { ws, reconnecting } = connectAuthenticated();

    // The socket still claims OPEN (backgrounded tab never ran its close). Wake:
    // the transport should probe with a ping.
    __triggerAppResume();
    expect(ws.lastSentType()).toBe('ping');
    expect(reconnecting).not.toHaveBeenCalled();

    // No pong arrives within the probe window → force a reconnect WITHOUT any
    // close event ever firing on the dead socket.
    jest.advanceTimersByTime(5000);
    expect(reconnecting).toHaveBeenCalledTimes(1);

    // The scheduled reconnect opens a fresh socket.
    jest.runOnlyPendingTimers();
    expect(FakeWebSocket.instances).toHaveLength(2);
  });

  it('does not reconnect when the probe gets a pong (socket alive)', () => {
    const { ws, reconnecting } = connectAuthenticated();

    __triggerAppResume();
    expect(ws.lastSentType()).toBe('ping');

    // Server answers the probe before the timeout.
    ws.fire('message', { data: JSON.stringify({ type: 'pong' }) });
    jest.advanceTimersByTime(5000);

    expect(reconnecting).not.toHaveBeenCalled();
    expect(FakeWebSocket.instances).toHaveLength(1);
  });

  it('does not forward pong to the phone as an app message', () => {
    const { ws } = connectAuthenticated();
    const messages: unknown[] = [];
    // Re-wire a message spy via a fresh transport is awkward; instead assert the
    // pong never surfaces by checking the existing listener isn't invoked with it.
    // Use a dedicated transport with a message listener.
    const t = new Transport('ws://test/v1/webrtc', true, fakeSocketFactory, subscribeResume);
    t.on('message', (m) => messages.push(m));
    t.connect();
    const ws2 = FakeWebSocket.instances[FakeWebSocket.instances.length - 1]!;
    ws2.fire('open', {});
    ws2.fire('message', {
      data: JSON.stringify({ type: 'authenticated', user_id: 'u', account_id: 'a' }),
    });
    ws2.fire('message', { data: JSON.stringify({ type: 'pong' }) });

    expect(messages.some((m) => (m as { type: string }).type === 'pong')).toBe(false);
    // authenticated still came through.
    expect(messages.some((m) => (m as { type: string }).type === 'authenticated')).toBe(true);
    void ws;
  });

  // Terminal codes: token is dead, a reconnect can only loop. Both must stay
  // terminal — a wake after one must not probe or reconnect.
  it.each(['auth_expired', 'session_revoked'])(
    'treats fatal %s as terminal: no reconnect, no probe on a later wake',
    (code) => {
      const { ws, reconnecting, closed } = connectAuthenticated();

      ws.fire('message', {
        data: JSON.stringify({ type: 'error', code, message: code, fatal: true }),
      });
      ws.fire('close', {});

      __triggerAppResume();
      jest.advanceTimersByTime(5000);
      jest.runOnlyPendingTimers();

      expect(reconnecting).not.toHaveBeenCalled();
      // The original socket only; no reconnect socket was opened.
      expect(FakeWebSocket.instances).toHaveLength(1);
      const reason = closed.mock.calls[0]![0] as { fatal: boolean; error?: PhoneError };
      expect(reason.fatal).toBe(true);
      expect(reason.error?.code).toBe(code);
    }
  );

  // Recoverable fatal evictions: the server sends fatal:true for these too, but
  // the JWT is still valid, so the transport MUST auto-reconnect. This is the
  // regression the "any fatal is terminal" over-broadening would have caused —
  // idle_timeout is literally the reap this watchdog exists to recover from.
  it.each(['idle_timeout', 'session_limit', 'slow_consumer', 'going_away'])(
    'auto-reconnects after a fatal %s (recoverable eviction, not terminal)',
    (code) => {
      const { ws, reconnecting, closed } = connectAuthenticated();

      ws.fire('message', {
        data: JSON.stringify({ type: 'error', code, message: code, fatal: true }),
      });
      ws.fire('close', {});

      // Reconnect is scheduled (not suppressed as terminal), and no fatal close
      // was surfaced to the phone.
      expect(reconnecting).toHaveBeenCalledTimes(1);
      expect(closed).not.toHaveBeenCalled();
      jest.runOnlyPendingTimers();
      expect(FakeWebSocket.instances).toHaveLength(2);
    }
  );

  it('is a no-op on wake after the user closed the transport, and unsubscribes', () => {
    const { transport, reconnecting } = connectAuthenticated();

    transport.close();
    expect(__hasResumeListener()).toBe(false); // unsubscribed

    __triggerAppResume(); // the (now-detached) listener must not fire anything
    jest.advanceTimersByTime(5000);
    jest.runOnlyPendingTimers();

    expect(reconnecting).not.toHaveBeenCalled();
  });

  it('does not double-schedule a reconnect when a wake fires during a pending backoff', () => {
    const { ws, reconnecting } = connectAuthenticated();

    // The socket closed and a backoff reconnect is now pending (ws null,
    // reconnectPending true).
    ws.fire('close', {});
    expect(reconnecting).toHaveBeenCalledTimes(1);

    // A wake while that reconnect is still pending must NOT kick a second one —
    // the reconnectPending guard holds.
    __triggerAppResume();
    expect(reconnecting).toHaveBeenCalledTimes(1);
    jest.runOnlyPendingTimers();
    expect(FakeWebSocket.instances).toHaveLength(2); // exactly one reconnect socket
  });

  it('with autoReconnect off, a wake-probe timeout closes the dead socket once and does not repeat', () => {
    const transport = new Transport(
      'ws://test/v1/webrtc',
      false,
      fakeSocketFactory,
      subscribeResume
    );
    const closed = jest.fn();
    transport.on('closed', closed);
    transport.connect();
    const ws = FakeWebSocket.instances[FakeWebSocket.instances.length - 1]!;
    ws.fire('open', {});
    ws.fire('message', {
      data: JSON.stringify({ type: 'authenticated', user_id: 'u', account_id: 'a' }),
    });

    // Wake → probe → no pong → forceReconnect. autoReconnect is off, so it tears
    // down and surfaces a single non-fatal closed.
    __triggerAppResume();
    jest.advanceTimersByTime(5000);
    expect(ws.readyState).toBe(FakeWebSocket.CLOSED); // socket was closed, not leaked
    expect(closed).toHaveBeenCalledTimes(1);
    expect((closed.mock.calls[0]![0] as { fatal: boolean }).fatal).toBe(false);

    // A second wake must not emit another closed (the stopped latch holds).
    __triggerAppResume();
    jest.advanceTimersByTime(5000);
    jest.runOnlyPendingTimers();
    expect(closed).toHaveBeenCalledTimes(1);
    expect(FakeWebSocket.instances).toHaveLength(1); // no reconnect
  });

  it('with autoReconnect off, a NATURAL close then a wake emits closed only once', () => {
    // Ordering the probe-timeout test doesn't cover: the OS delivers a real
    // `close` first (close handler emits closed + must latch stopped), THEN the
    // user re-foregrounds. Without the latch in the close handler, onWake would
    // re-enter forceReconnect and emit a second closed → duplicate disconnected.
    const transport = new Transport(
      'ws://test/v1/webrtc',
      false,
      fakeSocketFactory,
      subscribeResume
    );
    const closed = jest.fn();
    transport.on('closed', closed);
    transport.connect();
    const ws = FakeWebSocket.instances[FakeWebSocket.instances.length - 1]!;
    ws.fire('open', {});
    ws.fire('message', {
      data: JSON.stringify({ type: 'authenticated', user_id: 'u', account_id: 'a' }),
    });

    // Natural close first: close handler emits one closed and latches stopped.
    ws.fire('close', {});
    expect(closed).toHaveBeenCalledTimes(1);

    // Wake afterward must be a no-op — no second closed, no reconnect.
    __triggerAppResume();
    jest.advanceTimersByTime(5000);
    jest.runOnlyPendingTimers();
    expect(closed).toHaveBeenCalledTimes(1);
    expect(FakeWebSocket.instances).toHaveLength(1);
  });
});
