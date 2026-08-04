import { DialStackPhone } from '../phone';

// Let queued microtasks (awaited fetch → resp.json() chains) drain.
const flushMicrotasks = async (): Promise<void> => {
  for (let i = 0; i < 5; i++) await Promise.resolve();
};

// A WebSocket double that records every instance the phone opens. The whole
// point of these tests is to assert HOW MANY sockets get created, so the count
// of instances is the assertion surface.
class RecordingWebSocket {
  static instances: RecordingWebSocket[] = [];
  static OPEN = 1;
  readyState = RecordingWebSocket.OPEN;
  url: string;
  closed = false;
  // req_id of the most recent authenticate frame the phone sent on this socket.
  // The phone now correlates the authenticated reply, so the mock must echo it.
  lastAuthReqId: string | null = null;
  private handlers: Record<string, ((evt: unknown) => void)[]> = {};
  constructor(url: string) {
    this.url = url;
    RecordingWebSocket.instances.push(this);
  }
  addEventListener(event: string, handler: (evt: unknown) => void): void {
    (this.handlers[event] ??= []).push(handler);
  }
  send(data: string): void {
    try {
      const msg = JSON.parse(data) as { type?: string; req_id?: string };
      if (msg.type === 'authenticate') this.lastAuthReqId = msg.req_id ?? null;
    } catch {
      // non-JSON send in a test; ignore
    }
  }
  close(): void {
    this.closed = true;
    this.fire('close', { code: 1000, reason: '' });
  }
  fire(event: string, evt: unknown): void {
    for (const h of this.handlers[event] ?? []) h(evt);
  }
  // Drive a full successful auth: open (→ phone sends authenticate, captured
  // above), then the authenticated reply echoing that req_id. Pass an explicit
  // reqId to simulate a stale/mismatched echo.
  completeAuth(reqId?: string): void {
    this.fire('open', {});
    this.fire('message', {
      data: JSON.stringify({ type: 'authenticated', req_id: reqId ?? this.lastAuthReqId }),
    });
  }
}

describe('DialStackPhone connect() aborted by an in-prelude disconnect()', () => {
  let originalWebSocket: unknown;
  let originalFetch: unknown;
  // Each connect() calls fetch() once (fetchIceServers). We queue a resolver per
  // call so a test can let each ICE fetch resolve on demand — the window where
  // this.transport is still null and the old code could not cancel the connect.
  let iceFetchResolvers: Array<() => void>;
  const resolveNextIceFetch = () => {
    const next = iceFetchResolvers.shift();
    if (!next) throw new Error('no pending ICE fetch to resolve');
    next();
  };

  beforeEach(() => {
    RecordingWebSocket.instances = [];
    originalWebSocket = (globalThis as Record<string, unknown>).WebSocket;
    (globalThis as Record<string, unknown>).WebSocket = RecordingWebSocket;

    originalFetch = (globalThis as Record<string, unknown>).fetch;
    iceFetchResolvers = [];
    (globalThis as Record<string, unknown>).fetch = jest.fn(
      () =>
        new Promise((resolve) => {
          iceFetchResolvers.push(() =>
            resolve({
              ok: true,
              json: () => Promise.resolve({ ice_servers: [] }),
            } as Response)
          );
        })
    );
  });

  afterEach(() => {
    (globalThis as Record<string, unknown>).WebSocket = originalWebSocket;
    (globalThis as Record<string, unknown>).fetch = originalFetch;
  });

  it('opens no socket when disconnect() lands while fetchIceServers() is in flight', async () => {
    // Reproduces the duplicate-registration bug that surfaced as two incoming-call
    // cards for a single call: React StrictMode (and any fast unmount / credential
    // change) runs the connect effect as mount → cleanup → mount. The cleanup's
    // disconnect() lands while the first connect() is still awaiting
    // fetchIceServers(), where this.transport is null — so before the fix that
    // disconnect couldn't cancel the connect, and when the ICE fetch resolved the
    // phone opened a socket nothing ever closed: a leaked second registration that
    // double-rings every inbound call.
    const phone = new DialStackPhone({ token: 'tok', autoReconnect: false });

    // Start connecting — parks in `await fetchIceServers()` (fetch is pending).
    const connectP = phone.connect();
    await Promise.resolve();
    expect(RecordingWebSocket.instances).toHaveLength(0); // no socket yet — still fetching ICE

    // Tear down while the ICE fetch is still in flight (the StrictMode cleanup).
    phone.disconnect();

    // Now let the ICE fetch resolve. The resumed connect() must see it was
    // disconnected and abort WITHOUT opening a socket.
    resolveNextIceFetch();
    await expect(connectP).rejects.toMatchObject({ code: 'transport_closed' });

    expect(RecordingWebSocket.instances).toHaveLength(0);
    expect(phone.isConnected).toBe(false);
  });

  it('rejects promptly with transport_closed when disconnect() lands during the authenticate wait', async () => {
    // The window AFTER the epoch check: connect() has opened the socket and is
    // awaiting the server's `authenticated` frame. disconnect() closes the socket,
    // but the pending connect() promise must be rejected here — otherwise it hangs
    // until CONNECT_TIMEOUT_MS (~20s) and then rejects with a misleading auth_failed.
    const phone = new DialStackPhone({ token: 'tok', autoReconnect: false });
    const connectP = phone.connect();
    resolveNextIceFetch();
    await flushMicrotasks();
    // Socket is open; we're now parked awaiting `authenticated` (never sent).
    expect(RecordingWebSocket.instances).toHaveLength(1);

    phone.disconnect();

    await expect(connectP).rejects.toMatchObject({ code: 'transport_closed' });
    expect(RecordingWebSocket.instances[0].closed).toBe(true);
    expect(phone.isConnected).toBe(false);
  });

  it('rejects a second concurrent connect() instead of opening a parallel socket', async () => {
    // Two connect() calls with no disconnect() between them: nothing bumps the
    // generation, so that guard alone wouldn't catch it. The `connecting` flag must
    // reject the second so it can't open a socket that orphans the first.
    const phone = new DialStackPhone({ token: 'tok', autoReconnect: false });
    const firstP = phone.connect(); // parks in fetchIceServers()
    await Promise.resolve();

    await expect(phone.connect()).rejects.toMatchObject({ code: 'invalid_message' });

    // Let the first finish and confirm exactly one socket ever opened.
    resolveNextIceFetch();
    await flushMicrotasks();
    expect(RecordingWebSocket.instances).toHaveLength(1);
    RecordingWebSocket.instances[0].completeAuth();
    await firstP;
    expect(phone.isConnected).toBe(true);
  });

  it('rejects with auth_failed (not transport_closed) when the authenticate wait times out', async () => {
    // Guards the timeout path's code integrity: the CONNECT_TIMEOUT handler tears
    // the socket down via disconnect() (which itself rejects connectResolvers with
    // transport_closed), but the connect() promise must still surface the timeout's
    // auth_failed — the settle-through-connectResolvers ordering must not let the
    // disconnect's transport_closed win.
    // Fake timers must be armed BEFORE connect() so armTimeout's setTimeout is the
    // fake one we later advance. The ICE fetch resolves via our manual resolver
    // (a real promise), so microtask flushes still work under fake timers.
    jest.useFakeTimers();
    try {
      const phone = new DialStackPhone({ token: 'tok', autoReconnect: false });
      const connectP = phone.connect();
      // Attach a catch immediately so the eventual rejection is never unhandled.
      const settled = connectP.then(
        () => ({ ok: true as const }),
        (e: unknown) => ({ ok: false as const, e })
      );
      resolveNextIceFetch();
      await flushMicrotasks();
      // Socket open, parked awaiting `authenticated` (never sent). Trip the timeout.
      expect(RecordingWebSocket.instances).toHaveLength(1);

      jest.advanceTimersByTime(20_000); // CONNECT_TIMEOUT_MS
      await flushMicrotasks();

      const outcome = await settled;
      expect(outcome.ok).toBe(false);
      expect(outcome).toMatchObject({ e: { code: 'auth_failed' } });
      expect(RecordingWebSocket.instances[0].closed).toBe(true);
      expect(phone.isConnected).toBe(false);
    } finally {
      jest.useRealTimers();
    }
  });

  it('is re-connectable after a failed connect() (no wedged connecting flag)', async () => {
    // A connect() that fails at the ICE fetch must release the in-flight marker so
    // a subsequent connect() is not spuriously rejected as "already connecting".
    const phone = new DialStackPhone({ token: 'tok', autoReconnect: false });

    // First connect: ICE fetch rejects.
    const rejectingFetch = jest.fn(() => Promise.reject(new Error('network down')));
    const savedFetch = (globalThis as Record<string, unknown>).fetch;
    (globalThis as Record<string, unknown>).fetch = rejectingFetch;
    await expect(phone.connect()).rejects.toMatchObject({ code: 'ice_fetch_failed' });
    (globalThis as Record<string, unknown>).fetch = savedFetch;

    // Second connect must proceed (not throw invalid_message) and open a socket.
    const connectP = phone.connect();
    await Promise.resolve();
    resolveNextIceFetch();
    await flushMicrotasks();
    expect(RecordingWebSocket.instances).toHaveLength(1);
    RecordingWebSocket.instances[0].completeAuth();
    await connectP;
    expect(phone.isConnected).toBe(true);
  });

  it('aborts a stalled ICE fetch after ICE_FETCH_TIMEOUT_MS (rejects ice_fetch_failed)', async () => {
    // Guards the AbortSignal.timeout on fetchIceServers: a fetch that never settles
    // on its own must be aborted by the signal so connect() fails instead of hanging.
    // Install a fetch that only rejects when its AbortSignal fires.
    const savedFetch = (globalThis as Record<string, unknown>).fetch;
    (globalThis as Record<string, unknown>).fetch = jest.fn(
      (_url: string, init?: { signal?: AbortSignal }) =>
        new Promise((_resolve, reject) => {
          init?.signal?.addEventListener('abort', () =>
            reject(new DOMException('aborted', 'AbortError'))
          );
        })
    );

    jest.useFakeTimers();
    try {
      const phone = new DialStackPhone({ token: 'tok', autoReconnect: false });
      const outcome = phone.connect().then(
        () => ({ ok: true as const }),
        (e: unknown) => ({ ok: false as const, e })
      );
      // The fetch is pending; advancing past the ICE timeout must fire the abort.
      await jest.advanceTimersByTimeAsync(10_000); // ICE_FETCH_TIMEOUT_MS
      const res = await outcome;
      expect(res.ok).toBe(false);
      expect(res).toMatchObject({ e: { code: 'ice_fetch_failed' } });
      // No socket was ever opened.
      expect(RecordingWebSocket.instances).toHaveLength(0);
    } finally {
      jest.useRealTimers();
      (globalThis as Record<string, unknown>).fetch = savedFetch;
    }
  });

  it('connects when AbortSignal.timeout is missing (React Native fallback)', async () => {
    // Some React Native runtimes lack the static AbortSignal.timeout; calling it
    // throws synchronously and would fail every connect() with ice_fetch_failed.
    // With it removed, connect() must still succeed via the AbortController fallback.
    const savedTimeout = AbortSignal.timeout;
    // @ts-expect-error simulate a runtime without the static method
    delete AbortSignal.timeout;
    let sawSignal = false;
    const savedFetch = (globalThis as Record<string, unknown>).fetch;
    (globalThis as Record<string, unknown>).fetch = jest.fn(
      (_url: string, init?: { signal?: AbortSignal }) => {
        sawSignal = init?.signal instanceof AbortSignal;
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve({ ice_servers: [] }),
        } as Response);
      }
    );
    try {
      const phone = new DialStackPhone({ token: 'tok', autoReconnect: false });
      const connectP = phone.connect();
      await flushMicrotasks();
      RecordingWebSocket.instances[0].completeAuth();
      await connectP;
      expect(phone.isConnected).toBe(true);
      // The fallback still passed a real AbortSignal to fetch (the 10s bound holds).
      expect(sawSignal).toBe(true);
    } finally {
      (globalThis as Record<string, unknown>).fetch = savedFetch;
      AbortSignal.timeout = savedTimeout;
    }
  });

  it('is left retryable after a rebind whose fresh connect fails', async () => {
    // reconnectWithEmergency tears down the working socket, then the fresh connect
    // fails (ICE down). We surface the error (reject) and do NOT auto-recover — but
    // the phone must be left retryable, not wedged, so the app can reconnect.
    const phone = new DialStackPhone({ token: 'tok', autoReconnect: false });
    const connectP = phone.connect();
    resolveNextIceFetch();
    await flushMicrotasks();
    RecordingWebSocket.instances[0].completeAuth();
    await connectP;
    expect(phone.isConnected).toBe(true);

    // Rebind: disconnect() closes the socket, then the fresh connect's ICE rejects.
    const rejectingFetch = jest.fn(() => Promise.reject(new Error('network down')));
    const savedFetch = (globalThis as Record<string, unknown>).fetch;
    (globalThis as Record<string, unknown>).fetch = rejectingFetch;
    await expect(phone.reconnectWithEmergency('ea_1')).rejects.toMatchObject({
      code: 'ice_fetch_failed',
    });
    (globalThis as Record<string, unknown>).fetch = savedFetch;
    expect(phone.isConnected).toBe(false);

    // Retryable: a plain connect() now succeeds (state wasn't left wedged).
    const retryP = phone.connect();
    await Promise.resolve();
    resolveNextIceFetch();
    await flushMicrotasks();
    RecordingWebSocket.instances[RecordingWebSocket.instances.length - 1].completeAuth();
    await retryP;
    expect(phone.isConnected).toBe(true);
  });

  it('is left retryable after a rebind whose fresh connect times out on authenticate', async () => {
    // The other rebind-failure mode: the fresh connect opens a socket but the server
    // never sends `authenticated`, so CONNECT_TIMEOUT fires (auth_failed). State is
    // settled via the timeout path (not the ICE path); the phone must still retry.
    const phone = new DialStackPhone({ token: 'tok', autoReconnect: false });
    const connectP = phone.connect();
    resolveNextIceFetch();
    await flushMicrotasks();
    RecordingWebSocket.instances[0].completeAuth();
    await connectP;
    expect(phone.isConnected).toBe(true);

    // Rebind: fresh socket opens, but no `authenticated` arrives → CONNECT_TIMEOUT.
    jest.useFakeTimers();
    let rebindOutcome: { ok: boolean; e?: unknown };
    try {
      const rebindP = phone.reconnectWithEmergency('ea_1').then(
        () => ({ ok: true }),
        (e: unknown) => ({ ok: false, e })
      );
      resolveNextIceFetch();
      await flushMicrotasks();
      jest.advanceTimersByTime(20_000); // CONNECT_TIMEOUT_MS
      await flushMicrotasks();
      rebindOutcome = await rebindP;
    } finally {
      jest.useRealTimers();
    }
    expect(rebindOutcome.ok).toBe(false);
    expect(rebindOutcome).toMatchObject({ e: { code: 'auth_failed' } });
    expect(phone.isConnected).toBe(false);

    // Retryable after the auth-timeout failure.
    const retryP = phone.connect();
    await Promise.resolve();
    resolveNextIceFetch();
    await flushMicrotasks();
    RecordingWebSocket.instances[RecordingWebSocket.instances.length - 1].completeAuth();
    await retryP;
    expect(phone.isConnected).toBe(true);
  });

  it('a superseded reconnect() rejects transport_closed and leaks no socket', async () => {
    // Phone connected; reconnect() tears down and starts a fresh connect. A
    // disconnect() landing before that connect authenticates must reject reconnect()
    // with transport_closed and leave no orphaned socket.
    const phone = new DialStackPhone({ token: 'tok', autoReconnect: false });
    const connectP = phone.connect();
    resolveNextIceFetch();
    await flushMicrotasks();
    RecordingWebSocket.instances[0].completeAuth();
    await connectP;
    expect(phone.isConnected).toBe(true);

    // reconnect(): disconnect() closes socket #1, then a fresh connect() begins.
    const reconnectP = phone.reconnect();
    resolveNextIceFetch(); // let the fresh connect's ICE resolve
    await flushMicrotasks();
    // Socket #2 is open, awaiting `authenticated`. Tear down before it arrives.
    phone.disconnect();

    await expect(reconnectP).rejects.toMatchObject({ code: 'transport_closed' });
    // Both sockets closed; none left open.
    expect(RecordingWebSocket.instances.every((s) => s.closed)).toBe(true);
    expect(phone.isConnected).toBe(false);
  });

  it('a fresh connect() after the aborted one still opens exactly one socket', async () => {
    // The mount → cleanup → mount sequence in full: the second mount constructs a
    // NEW phone and connects it. That connect must succeed and be the only live
    // socket — the aborted first connect must not have left one behind.
    const first = new DialStackPhone({ token: 'tok', autoReconnect: false });
    const abortedP = first.connect();
    await Promise.resolve();
    first.disconnect();
    resolveNextIceFetch();
    await expect(abortedP).rejects.toMatchObject({ code: 'transport_closed' });

    // Second mount: a brand-new phone (as useCalls builds per effect run).
    const second = new DialStackPhone({ token: 'tok', autoReconnect: false });
    const connectP = second.connect();
    await Promise.resolve();
    resolveNextIceFetch(); // resolve this connect's ICE fetch
    // Flush the fetchIceServers() await chain (fetch → resp.json()) so connect()
    // reaches the point where it opens the socket.
    await flushMicrotasks();
    // Exactly one socket total across both phones — the aborted first connect
    // left none behind.
    expect(RecordingWebSocket.instances).toHaveLength(1);
    RecordingWebSocket.instances[0].completeAuth();
    await connectP;
    expect(second.isConnected).toBe(true);
  });

  it('ignores an authenticated frame that echoes a stale req_id', async () => {
    // A frame not echoing our most-recent authenticate id is a stale reply from a
    // superseded socket — it must not resolve the pending connect.
    const phone = new DialStackPhone({ token: 'tok', autoReconnect: false });
    const connectP = phone.connect();
    let settled = false;
    void connectP.then(
      () => {
        settled = true;
      },
      () => {
        settled = true;
      }
    );
    resolveNextIceFetch();
    await flushMicrotasks();
    const ws = RecordingWebSocket.instances[0];

    // Reply with a WRONG req_id — must be ignored.
    ws.completeAuth('some-stale-id');
    await flushMicrotasks();
    expect(settled).toBe(false);
    expect(phone.isConnected).toBe(false);

    // The correct id resolves it.
    ws.fire('message', {
      data: JSON.stringify({ type: 'authenticated', req_id: ws.lastAuthReqId }),
    });
    await connectP;
    expect(phone.isConnected).toBe(true);
  });

  it('accepts an authenticated frame that omits req_id (does not hang connect)', async () => {
    // The server echoes req_id on authenticated only "when present" (it is optional
    // on the wire). A frame that omits it must NOT be treated as a stale echo —
    // dropping an unattributed authenticated would hang connect() to its ~20s
    // timeout. Only a frame carrying a DIFFERENT id is stale.
    const phone = new DialStackPhone({ token: 'tok', autoReconnect: false });
    const connectP = phone.connect();
    resolveNextIceFetch();
    await flushMicrotasks();
    const ws = RecordingWebSocket.instances[0];

    // Open the socket so the phone sends its authenticate (stamps expectedAuthReqId),
    // then reply with an authenticated that carries NO req_id — must still resolve.
    ws.fire('open', {});
    ws.fire('message', { data: JSON.stringify({ type: 'authenticated' }) });
    await connectP;
    expect(phone.isConnected).toBe(true);
  });

  it('emits reconnected (not a second connected) on a re-auth with its own id', async () => {
    // After the first connect, a fresh authenticate/authenticated cycle on the same
    // socket (an auto-reconnect re-auth) drives `reconnected`, not `connected`, and
    // never rejects — it correlates to its own fresh req_id, no pending connect.
    const phone = new DialStackPhone({ token: 'tok', autoReconnect: false });
    const events: string[] = [];
    phone.on('connected', () => events.push('connected'));
    phone.on('reconnected', () => events.push('reconnected'));

    const connectP = phone.connect();
    resolveNextIceFetch();
    await flushMicrotasks();
    const ws = RecordingWebSocket.instances[0];
    ws.completeAuth();
    await connectP;
    expect(events).toEqual(['connected']);

    // A re-auth on the same socket: fresh open → phone sends a new authenticate
    // (new id), matching authenticated → reconnected.
    ws.completeAuth();
    await flushMicrotasks();
    expect(events).toEqual(['connected', 'reconnected']);
  });

  it('a req_id-matched error rejects connect and ignores a later stray authenticated', async () => {
    // A non-fatal server error echoing the authenticate's req_id rejects connect().
    // A subsequent `authenticated` for that same handshake must NOT flip the phone
    // to connected — expectedAuthReqId is cleared on the error-reject.
    const phone = new DialStackPhone({ token: 'tok', autoReconnect: false });
    const events: string[] = [];
    phone.on('connected', () => events.push('connected'));
    const connectP = phone.connect();
    resolveNextIceFetch();
    await flushMicrotasks();
    const ws = RecordingWebSocket.instances[0];
    ws.fire('open', {});
    const reqId = ws.lastAuthReqId;

    // Server rejects the authenticate (non-fatal) echoing its req_id.
    ws.fire('message', {
      data: JSON.stringify({
        type: 'error',
        code: 'invalid_message',
        message: 'bad address',
        req_id: reqId,
      }),
    });
    await expect(connectP).rejects.toMatchObject({ code: 'invalid_message' });

    // A stray authenticated for the same handshake must be ignored.
    ws.fire('message', { data: JSON.stringify({ type: 'authenticated', req_id: reqId }) });
    await flushMicrotasks();
    expect(phone.isConnected).toBe(false);
    expect(events).toEqual([]);
  });

  it('reconnect() emits disconnected when the fresh connect fails before a transport exists', async () => {
    // Phone connected, then reconnect() tears down and the fresh connect()'s ICE
    // fetch rejects — no transport `closed` fires, so reconnect() must emit
    // `disconnected` itself so the connection state leaves 'reconnecting' limbo.
    const phone = new DialStackPhone({ token: 'tok', autoReconnect: false });
    const connectP = phone.connect();
    resolveNextIceFetch();
    await flushMicrotasks();
    RecordingWebSocket.instances[0].completeAuth();
    await connectP;

    const events: string[] = [];
    phone.on('reconnecting', () => events.push('reconnecting'));
    phone.on('disconnected', () => events.push('disconnected'));

    // Fresh connect's ICE fetch rejects.
    const rejectingFetch = jest.fn(() => Promise.reject(new Error('offline')));
    const savedFetch = (globalThis as Record<string, unknown>).fetch;
    (globalThis as Record<string, unknown>).fetch = rejectingFetch;
    await expect(phone.reconnect()).rejects.toMatchObject({ code: 'ice_fetch_failed' });
    (globalThis as Record<string, unknown>).fetch = savedFetch;

    // The connection state must leave 'reconnecting' limbo: reconnecting fires
    // first, and the final observed event is disconnected (not stranded at
    // reconnecting). We assert first/last rather than the exact sequence because
    // the synchronous test socket's close() also surfaces a disconnected that a
    // real (async-closing) browser socket drops — the invariant is the transition,
    // not the emit count.
    expect(events[0]).toBe('reconnecting');
    expect(events[events.length - 1]).toBe('disconnected');
    expect(phone.isConnected).toBe(false);
  });
});
