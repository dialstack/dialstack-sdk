import { DialStackPhone } from '../phone.js';
import { PhoneError } from '../errors.js';

// A suspended mobile app runs no timers, so the refresh timer can't be what
// keeps a token fresh. These tests move the clock with setSystemTime, which
// advances Date.now() without firing a single timer, and check that an expired
// token is never sent anyway.

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
    if (this.closed) return;
    this.closed = true;
    this.readyState = 3;
    this.fire('close', { code: 1000, reason: '' });
  }
  fire(event: string, evt: unknown): void {
    for (const h of this.handlers[event] ?? []) h(evt);
  }
  sentMessages(): Array<Record<string, unknown>> {
    return this.sent.map((s) => JSON.parse(s) as Record<string, unknown>);
  }
  lastOfType(type: string): Record<string, unknown> | undefined {
    return [...this.sentMessages()].reverse().find((m) => m.type === type);
  }
}

function makeToken(expSeconds: number, sub = 'user_test'): string {
  const b64url = (obj: unknown) =>
    btoa(JSON.stringify(obj)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  return `header.${b64url({ sub, exp: expSeconds })}.sig`;
}

const nowSeconds = () => Math.floor(Date.now() / 1000);

async function flush(): Promise<void> {
  for (let i = 0; i < 12; i++) await Promise.resolve();
}

function lastSocket(): FakeWebSocket {
  return FakeWebSocket.instances[FakeWebSocket.instances.length - 1]!;
}

function authenticate(ws: FakeWebSocket): void {
  ws.fire('message', {
    data: JSON.stringify({
      type: 'authenticated',
      req_id: ws.lastOfType('authenticate')?.req_id,
      user_id: 'user_test',
      account_id: 'acct_test',
    }),
  });
}

function deferred<T>(): {
  promise: Promise<T>;
  resolve: (v: T) => void;
  reject: (e: unknown) => void;
} {
  let resolve!: (v: T) => void;
  let reject!: (e: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

describe('DialStackPhone never sends an expired token', () => {
  let originalWebSocket: unknown;
  let originalFetch: unknown;
  let fetchMock: jest.Mock;
  let validTokens: Set<string>;

  beforeEach(() => {
    FakeWebSocket.instances = [];
    originalWebSocket = (globalThis as Record<string, unknown>).WebSocket;
    (globalThis as Record<string, unknown>).WebSocket = FakeWebSocket;
    originalFetch = (globalThis as Record<string, unknown>).fetch;
    validTokens = new Set();
    // The ICE endpoint answers like the API: 401 for a token it doesn't accept.
    fetchMock = jest.fn(async (_url: string, init: { headers: Record<string, string> }) => {
      const token = (init.headers.Authorization ?? '').replace('Bearer ', '');
      if (!validTokens.has(token)) return { ok: false, status: 401, json: async () => ({}) };
      return { ok: true, status: 200, json: async () => ({ ice_servers: [] }) };
    });
    (globalThis as Record<string, unknown>).fetch = fetchMock;
    jest.useFakeTimers();
  });

  afterEach(() => {
    (globalThis as Record<string, unknown>).WebSocket = originalWebSocket;
    (globalThis as Record<string, unknown>).fetch = originalFetch;
    jest.useRealTimers();
  });

  const fetchedTokens = () =>
    fetchMock.mock.calls.map(([, init]) =>
      ((init as { headers: Record<string, string> }).headers.Authorization ?? '').replace(
        'Bearer ',
        ''
      )
    );

  it('mints before connecting with an expired token, and a second connect joins the first', async () => {
    const expired = makeToken(nowSeconds() - 600);
    const fresh = makeToken(nowSeconds() + 3600);
    validTokens.add(fresh);
    const mint = deferred<string>();
    const onTokenExpiring = jest.fn(() => mint.promise);

    const phone = new DialStackPhone({ token: expired, autoReconnect: true, onTokenExpiring });

    // The wake path and the UI both connect the same phone.
    const first = phone.connect();
    await flush();
    // Mid-mint the phone must read as connecting, so an adopter doesn't start
    // its own connect.
    expect(phone.isConnecting).toBe(true);
    const second = phone.connect();

    mint.resolve(fresh);
    await flush();
    const ws = lastSocket();
    ws.fire('open', {});
    await flush();
    authenticate(ws);
    await expect(Promise.all([first, second])).resolves.toBeDefined();

    expect(onTokenExpiring).toHaveBeenCalledTimes(1);
    expect(fetchedTokens()).toEqual([fresh]);
    expect(ws.lastOfType('authenticate')?.token).toBe(fresh);
    expect(FakeWebSocket.instances).toHaveLength(1);
  });

  it('mints before an automatic reconnect when the token expired while the app was frozen', async () => {
    const original = makeToken(nowSeconds() + 3600);
    validTokens.add(original);
    const fresh = makeToken(nowSeconds() + 3 * 24 * 3600);
    const onTokenExpiring = jest.fn().mockResolvedValue(fresh);

    const phone = new DialStackPhone({ token: original, autoReconnect: true, onTokenExpiring });
    const connected = phone.connect();
    await flush();
    lastSocket().fire('open', {});
    await flush();
    authenticate(lastSocket());
    await connected;

    // Two days suspended: the clock moves, no timer runs.
    jest.setSystemTime(Date.now() + 2 * 24 * 3600 * 1000);
    expect(onTokenExpiring).not.toHaveBeenCalled();

    // On resume the socket is found dead and the transport reconnects.
    lastSocket().close();
    await jest.advanceTimersByTimeAsync(35_000);
    const ws2 = lastSocket();
    ws2.fire('open', {});
    await flush();

    expect(onTokenExpiring).toHaveBeenCalledTimes(1);
    expect(ws2.lastOfType('authenticate')?.token).toBe(fresh);
  });

  it('refreshes on resume when the token went stale while the app was frozen', async () => {
    const original = makeToken(nowSeconds() + 3600);
    validTokens.add(original);
    const fresh = makeToken(nowSeconds() + 7200);
    const onTokenExpiring = jest.fn().mockResolvedValue(fresh);
    let resume: () => void = () => {};

    const phone = new DialStackPhone({
      token: original,
      autoReconnect: true,
      onTokenExpiring,
      onAppResume: (cb) => {
        resume = cb;
        return () => {};
      },
    });
    const connected = phone.connect();
    await flush();
    const ws = lastSocket();
    ws.fire('open', {});
    await flush();
    authenticate(ws);
    await connected;

    // Frozen until 30s before exp: the refresh timer (due 60s before) never ran.
    jest.setSystemTime(Date.now() + (3600 - 30) * 1000);
    resume();
    await flush();

    expect(onTokenExpiring).toHaveBeenCalledTimes(1);
    expect(ws.lastOfType('auth.refresh')?.token).toBe(fresh);
  });

  it('does not re-mint a sub-lead token it just adopted from an in-band refresh', async () => {
    const original = makeToken(nowSeconds() + 120);
    validTokens.add(original);
    // Every minted token is inside the refresh lead window.
    const onTokenExpiring = jest.fn(() => Promise.resolve(makeToken(nowSeconds() + 30)));
    const phone = new DialStackPhone({ token: original, autoReconnect: true, onTokenExpiring });
    const connected = phone.connect();
    await flush();
    const ws = lastSocket();
    ws.fire('open', {});
    await flush();
    authenticate(ws);
    await connected;

    await jest.advanceTimersByTimeAsync(65_000); // the refresh timer fires
    const refresh = ws.lastOfType('auth.refresh')!;
    ws.fire('message', {
      data: JSON.stringify({ type: 'auth.refreshed', req_id: refresh.req_id }),
    });
    expect(onTokenExpiring).toHaveBeenCalledTimes(1);

    // The socket drops right after; the reconnect uses the token just adopted.
    ws.close();
    await jest.advanceTimersByTimeAsync(1_500);
    lastSocket().fire('open', {});
    await flush();

    expect(onTokenExpiring).toHaveBeenCalledTimes(1);
    expect(lastSocket().lastOfType('authenticate')?.token).toBe(refresh.token);
  });

  it('sends nothing when the token is expired and the mint fails, and recovers on the next attempt', async () => {
    const original = makeToken(nowSeconds() + 3600);
    validTokens.add(original);
    const fresh = makeToken(nowSeconds() + 3 * 24 * 3600);
    const onTokenExpiring = jest
      .fn()
      .mockRejectedValueOnce(new Error('mint down'))
      .mockResolvedValue(fresh);

    const phone = new DialStackPhone({ token: original, autoReconnect: true, onTokenExpiring });
    const errors: PhoneError[] = [];
    phone.on('error', (e) => errors.push(e));
    const connected = phone.connect();
    await flush();
    lastSocket().fire('open', {});
    await flush();
    authenticate(lastSocket());
    await connected;

    jest.setSystemTime(Date.now() + 2 * 24 * 3600 * 1000);
    lastSocket().close();
    await jest.advanceTimersByTimeAsync(35_000);
    const ws2 = lastSocket();
    ws2.fire('open', {});
    await flush();

    // The expired token never goes out; the attempt is abandoned as retryable.
    expect(ws2.lastOfType('authenticate')).toBeUndefined();
    expect(errors.some((e) => e.code === 'token_refresh_failed' && !e.fatal)).toBe(true);
    expect(ws2.closed).toBe(true);

    // The next backoff attempt mints and authenticates.
    await jest.advanceTimersByTimeAsync(35_000);
    const ws3 = lastSocket();
    expect(ws3).not.toBe(ws2);
    ws3.fire('open', {});
    await flush();
    expect(ws3.lastOfType('authenticate')?.token).toBe(fresh);
  });

  it('rejects connect() with a failed mint and an expired token, without fetching or opening a socket', async () => {
    const expired = makeToken(nowSeconds() - 600);
    const onTokenExpiring = jest.fn().mockRejectedValue(new Error('mint down'));
    const phone = new DialStackPhone({ token: expired, autoReconnect: true, onTokenExpiring });

    await expect(phone.connect()).rejects.toMatchObject({ code: 'token_refresh_failed' });
    expect(fetchMock).not.toHaveBeenCalled();
    expect(FakeWebSocket.instances).toHaveLength(0);
    expect(phone.isConnecting).toBe(false);
  });

  it('mints before connecting when it has no token yet', async () => {
    // A fresh install: nothing stored and nothing bundled.
    const fresh = makeToken(nowSeconds() + 3600);
    validTokens.add(fresh);
    const onTokenExpiring = jest.fn().mockResolvedValue(fresh);
    const phone = new DialStackPhone({ token: '', autoReconnect: true, onTokenExpiring });

    const connected = phone.connect();
    await flush();
    const ws = lastSocket();
    ws.fire('open', {});
    await flush();
    authenticate(ws);
    await connected;

    expect(onTokenExpiring).toHaveBeenCalledTimes(1);
    expect(fetchedTokens()).toEqual([fresh]);
    expect(ws.lastOfType('authenticate')?.token).toBe(fresh);
  });

  it('sends the token as it is when nothing can refresh it, and lets the server judge it', async () => {
    const expired = makeToken(nowSeconds() - 600);
    const phone = new DialStackPhone({ token: expired, autoReconnect: true });

    // The API refuses it, as on a server with the same view of the clock.
    await expect(phone.connect()).rejects.toMatchObject({ code: 'ice_fetch_failed' });
    expect(fetchedTokens()).toEqual([expired]);
  });
});
