import { DialStackPhone } from '../phone';
import { PhoneError } from '../errors';

// Scriptable WebSocket double. Captures instances so tests can drive server
// events, and records every frame the SDK sends so we can assert on
// authenticate / auth.refresh payloads.
class FakeWebSocket {
  static instances: FakeWebSocket[] = [];
  static OPEN = 1;
  readyState = FakeWebSocket.OPEN;
  url: string;
  sent: string[] = [];
  closed = false;
  private handlers: Record<string, ((evt: unknown) => void)[]> = {};

  constructor(url: string) {
    this.url = url;
    FakeWebSocket.instances.push(this);
  }
  addEventListener(event: string, handler: (evt: unknown) => void): void {
    (this.handlers[event] ??= []).push(handler);
  }
  send(data: string): void {
    this.sent.push(data);
  }
  close(): void {
    this.closed = true;
    this.readyState = 3;
    this.fire('close', { code: 1000, reason: '' });
  }
  fire(event: string, evt: unknown): void {
    for (const h of this.handlers[event] ?? []) h(evt);
  }
  /** Parsed frames the SDK sent, in order. */
  sentMessages(): Array<Record<string, unknown>> {
    return this.sent.map((s) => JSON.parse(s) as Record<string, unknown>);
  }
  lastOfType(type: string): Record<string, unknown> | undefined {
    return [...this.sentMessages()].reverse().find((m) => m.type === type);
  }
}

// Build a JWT-shaped token whose payload segment base64url-decodes to
// { sub, exp }. Only the payload segment needs to be decodable; the header and
// signature are opaque filler (the SDK does an unverified payload decode).
function makeToken(expSeconds: number, sub = 'user_test'): string {
  const b64url = (obj: unknown) =>
    btoa(JSON.stringify(obj)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  return `header.${b64url({ sub, exp: expSeconds })}.sig`;
}

function nowSeconds(): number {
  return Math.floor(Date.now() / 1000);
}

// Drive connect() to an authenticated session over a fresh FakeWebSocket.
// Returns the socket so the test can inspect sends and deliver server frames.
async function connectAuthenticated(phone: DialStackPhone): Promise<FakeWebSocket> {
  const connectPromise = phone.connect();
  // connect() awaits the (overridden) ICE fetch and opens the socket across a
  // couple of microtask turns; let those settle before firing `open`.
  await Promise.resolve();
  await Promise.resolve();
  const ws = FakeWebSocket.instances[FakeWebSocket.instances.length - 1]!;
  ws.fire('open', {});
  ws.fire('message', {
    data: JSON.stringify({ type: 'authenticated', user_id: 'user_test', account_id: 'acct_test' }),
  });
  await connectPromise;
  return ws;
}

describe('DialStackPhone in-band token refresh', () => {
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

  it('refreshes in-band before exp and reschedules off the new token', async () => {
    const firstToken = makeToken(nowSeconds() + 120); // exp 2 min out
    const secondToken = makeToken(nowSeconds() + 3600); // exp 1 h out
    const onTokenExpiring = jest.fn().mockResolvedValue(secondToken);

    const phone = new DialStackPhone({
      token: firstToken,
      iceServers: [],
      autoReconnect: false,
      onTokenExpiring,
    });

    const ws = await connectAuthenticated(phone);

    // Lead time is 60s; exp is 120s out → refresh fires ~60s in. Advance there.
    await jest.advanceTimersByTimeAsync(65_000);

    expect(onTokenExpiring).toHaveBeenCalledTimes(1);
    const refresh = ws.lastOfType('auth.refresh');
    expect(refresh).toBeDefined();
    expect(refresh!.token).toBe(secondToken);
    expect(typeof refresh!.req_id).toBe('string');

    // Server accepts it.
    ws.fire('message', {
      data: JSON.stringify({ type: 'auth.refreshed', req_id: refresh!.req_id }),
    });

    // Connection stays open, phone still connected.
    expect(ws.closed).toBe(false);
    expect(phone.isConnected).toBe(true);

    // Next refresh is scheduled off the NEW token (exp 1h out → ~59 min lead).
    // Advancing to just past the first token's original exp does NOT fire again.
    await jest.advanceTimersByTimeAsync(120_000);
    expect(onTokenExpiring).toHaveBeenCalledTimes(1);

    // Advancing to just past the new token's scheduled fire (~3540s out) DOES
    // fire a second refresh — but stop before its reply-timeout would re-fire
    // (no auth.refreshed is delivered for this one).
    await jest.advanceTimersByTimeAsync(3_360_000);
    expect(onTokenExpiring).toHaveBeenCalledTimes(2);
  });

  it('keeps the connection open and surfaces an error on a non-fatal refresh rejection', async () => {
    const firstToken = makeToken(nowSeconds() + 120);
    const rejectedToken = makeToken(nowSeconds() + 3600, 'user_other');
    const onTokenExpiring = jest.fn().mockResolvedValue(rejectedToken);

    const phone = new DialStackPhone({
      token: firstToken,
      iceServers: [],
      autoReconnect: false,
      onTokenExpiring,
    });
    const errors: PhoneError[] = [];
    phone.on('error', (e) => errors.push(e));

    const ws = await connectAuthenticated(phone);
    await jest.advanceTimersByTimeAsync(65_000);

    const refresh = ws.lastOfType('auth.refresh');
    expect(refresh).toBeDefined();

    // Server rejects the refresh non-fatally (e.g. cross-identity token).
    ws.fire('message', {
      data: JSON.stringify({
        type: 'error',
        code: 'auth_failed',
        message: 'refresh token identity mismatch',
        fatal: false,
        req_id: refresh!.req_id,
      }),
    });

    // Connection stays open; the error is surfaced.
    expect(ws.closed).toBe(false);
    expect(phone.isConnected).toBe(true);
    expect(errors.some((e) => e.code === 'auth_failed' && !e.fatal)).toBe(true);

    // A late auth.refreshed for the same (rejected) req_id must NOT adopt the
    // token: the pending state was cleared, so nothing reschedules off it. The
    // original exp still governs — advancing near it fires a fresh refresh.
    ws.fire('message', {
      data: JSON.stringify({ type: 'auth.refreshed', req_id: refresh!.req_id }),
    });
    await jest.advanceTimersByTimeAsync(120_000);
    // The original 2-min token expired without adoption; onTokenExpiring is only
    // re-invoked if a new timer was armed off the original exp. It was not
    // (the refresh already fired once and the reply was a rejection), so the
    // count stays at 1 — the connection is now past exp and the server would
    // evict it via the normal path.
    expect(onTokenExpiring).toHaveBeenCalledTimes(1);
  });

  it('surfaces an error and keeps the connection when onTokenExpiring rejects', async () => {
    const firstToken = makeToken(nowSeconds() + 120);
    const onTokenExpiring = jest.fn().mockRejectedValue(new Error('IdP session ended'));

    const phone = new DialStackPhone({
      token: firstToken,
      iceServers: [],
      autoReconnect: false,
      onTokenExpiring,
    });
    const errors: PhoneError[] = [];
    phone.on('error', (e) => errors.push(e));

    const ws = await connectAuthenticated(phone);
    await jest.advanceTimersByTimeAsync(65_000);

    expect(onTokenExpiring).toHaveBeenCalledTimes(1);
    // No auth.refresh sent (the hook never produced a token).
    expect(ws.lastOfType('auth.refresh')).toBeUndefined();
    // Error surfaced, connection not torn down preemptively.
    expect(errors.length).toBeGreaterThan(0);
    expect(ws.closed).toBe(false);
    expect(phone.isConnected).toBe(true);
  });

  it('schedules nothing and never sends auth.refresh when onTokenExpiring is absent', async () => {
    const firstToken = makeToken(nowSeconds() + 120);
    const phone = new DialStackPhone({
      token: firstToken,
      iceServers: [],
      autoReconnect: false,
    });

    const ws = await connectAuthenticated(phone);

    // Advance well past the token's exp; nothing should fire.
    await jest.advanceTimersByTimeAsync(300_000);
    expect(ws.lastOfType('auth.refresh')).toBeUndefined();
  });

  it('surfaces a fatal auth_expired to the app without any silent recovery', async () => {
    // Missed-window expiry: the token was never refreshed in time and the server
    // evicts with a fatal auth_expired. The SDK does NOT try to re-mint on
    // reconnect — it surfaces the fatal error and lets the app re-authenticate.
    const firstToken = makeToken(nowSeconds() + 3600);
    const onTokenExpiring = jest.fn().mockResolvedValue(makeToken(nowSeconds() + 7200));

    const phone = new DialStackPhone({
      token: firstToken,
      iceServers: [],
      autoReconnect: true,
      onTokenExpiring,
    });
    const errors: PhoneError[] = [];
    phone.on('error', (e) => errors.push(e));

    const ws = await connectAuthenticated(phone);

    ws.fire('message', {
      data: JSON.stringify({
        type: 'error',
        code: 'auth_expired',
        message: 'expired',
        fatal: true,
      }),
    });

    // The fatal error reaches the app immediately — no suppression, no re-mint.
    expect(errors.some((e) => e.code === 'auth_expired' && e.fatal)).toBe(true);
    // onTokenExpiring is NOT called as part of handling the eviction.
    expect(onTokenExpiring).not.toHaveBeenCalled();
  });

  it('does not send a stale auth.refresh on a transport swapped in during the onTokenExpiring await', async () => {
    const firstToken = makeToken(nowSeconds() + 120);
    let resolveMint: (t: string) => void = () => {};
    const onTokenExpiring = jest.fn().mockImplementation(
      () =>
        new Promise<string>((res) => {
          resolveMint = res;
        })
    );

    const phone = new DialStackPhone({
      token: firstToken,
      iceServers: [],
      autoReconnect: false,
      onTokenExpiring,
    });

    const ws1 = await connectAuthenticated(phone);
    // Fire the refresh timer; onTokenExpiring is now pending (unresolved).
    await jest.advanceTimersByTimeAsync(65_000);
    expect(onTokenExpiring).toHaveBeenCalledTimes(1);

    // A reconnect swaps in a new transport while the mint is still in flight.
    const reconnectPromise = phone.reconnect();
    await Promise.resolve();
    await Promise.resolve();
    const ws2 = FakeWebSocket.instances[FakeWebSocket.instances.length - 1]!;
    ws2.fire('open', {});
    ws2.fire('message', {
      data: JSON.stringify({
        type: 'authenticated',
        user_id: 'user_test',
        account_id: 'acct_test',
      }),
    });
    await reconnectPromise;

    // Now the original mint resolves — its auth.refresh must NOT be sent, on
    // either socket, because the transport it was captured against is gone.
    resolveMint(makeToken(nowSeconds() + 3600));
    await Promise.resolve();
    await Promise.resolve();
    expect(ws1.lastOfType('auth.refresh')).toBeUndefined();
    expect(ws2.lastOfType('auth.refresh')).toBeUndefined();
  });

  it('recovers the refresh cadence when auth.refreshed is never received (lost reply)', async () => {
    const firstToken = makeToken(nowSeconds() + 120);
    const secondToken = makeToken(nowSeconds() + 3600);
    const onTokenExpiring = jest.fn().mockResolvedValue(secondToken);

    const phone = new DialStackPhone({
      token: firstToken,
      iceServers: [],
      autoReconnect: false,
      onTokenExpiring,
    });
    const errors: PhoneError[] = [];
    phone.on('error', (e) => errors.push(e));

    const ws = await connectAuthenticated(phone);

    // Refresh fires and auth.refresh is sent, but the server never replies.
    await jest.advanceTimersByTimeAsync(65_000);
    expect(onTokenExpiring).toHaveBeenCalledTimes(1);
    expect(ws.lastOfType('auth.refresh')).toBeDefined();

    // Advance past the reply timeout: a lost reply must NOT wedge the cadence —
    // an error surfaces and the refresh re-arms off the still-current token.
    await jest.advanceTimersByTimeAsync(20_000);
    expect(errors.some((e) => e.code === 'auth_failed' && !e.fatal)).toBe(true);
    expect(ws.closed).toBe(false);

    // The re-armed refresh fires again off the original (unchanged) token.
    await jest.advanceTimersByTimeAsync(10_000);
    expect(onTokenExpiring).toHaveBeenCalledTimes(2);
  });

  it('does not spin when refreshed tokens keep arriving with a sub-lead lifetime', async () => {
    // Every minted token expires 30s out — inside the 60s lead — so each refresh
    // would schedule at 0 without a floor. Assert the floor spaces them out
    // instead of a tight loop: no second refresh before the min-delay elapses.
    const shortLived = () => makeToken(nowSeconds() + 30);
    const onTokenExpiring = jest.fn().mockImplementation(() => Promise.resolve(shortLived()));

    const phone = new DialStackPhone({
      token: makeToken(nowSeconds() + 30),
      iceServers: [],
      autoReconnect: false,
      onTokenExpiring,
    });

    const ws = await connectAuthenticated(phone);

    // First refresh fires after the min-delay floor (the token is inside the lead
    // window, so the delay was floored rather than scheduled at 0).
    await jest.advanceTimersByTimeAsync(5_000);
    expect(onTokenExpiring).toHaveBeenCalledTimes(1);
    const refresh1 = ws.lastOfType('auth.refresh')!;
    ws.fire('message', {
      data: JSON.stringify({ type: 'auth.refreshed', req_id: refresh1.req_id }),
    });

    // Immediately after adopting the (still short-lived) token, the next refresh
    // must NOT have fired — the floor holds it off.
    await jest.advanceTimersByTimeAsync(0);
    expect(onTokenExpiring).toHaveBeenCalledTimes(1);

    // It fires once the min-delay floor elapses — spaced, not spinning.
    await jest.advanceTimersByTimeAsync(5_000);
    expect(onTokenExpiring).toHaveBeenCalledTimes(2);
  });

  it('schedules nothing when the token has no decodable exp', async () => {
    // Opaque, non-JWT token: decodes to no exp. With onTokenExpiring set, the SDK
    // must skip scheduling rather than crash or fire immediately.
    const phone = new DialStackPhone({
      token: 'opaque-not-a-jwt',
      iceServers: [],
      autoReconnect: false,
      onTokenExpiring: jest.fn().mockResolvedValue(makeToken(nowSeconds() + 3600)),
    });

    const ws = await connectAuthenticated(phone);

    await jest.advanceTimersByTimeAsync(300_000);
    expect(ws.lastOfType('auth.refresh')).toBeUndefined();
  });
});
