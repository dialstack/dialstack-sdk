import { DialStackPhone } from '../phone';

// A WebSocket double that completes the handshake: on `open` it sends back an
// `authenticated` frame so connect() resolves. Lets a test reach a connected
// phone and then exercise reconnect().
class AuthingWebSocket {
  static instances: AuthingWebSocket[] = [];
  static OPEN = 1;
  readyState = AuthingWebSocket.OPEN;
  url: string;
  lastAuthReqId: string | null = null;
  private handlers: Record<string, ((evt: unknown) => void)[]> = {};
  constructor(url: string) {
    this.url = url;
    AuthingWebSocket.instances.push(this);
  }
  addEventListener(event: string, handler: (evt: unknown) => void): void {
    (this.handlers[event] ??= []).push(handler);
  }
  send(data: string): void {
    try {
      const msg = JSON.parse(data) as { type?: string; req_id?: string };
      if (msg.type === 'authenticate') this.lastAuthReqId = msg.req_id ?? null;
    } catch {
      // ignore
    }
  }
  close(): void {
    this.fire('close', { code: 1000, reason: '' });
  }
  fire(event: string, evt: unknown): void {
    for (const h of this.handlers[event] ?? []) h(evt);
  }
  completeAuth(): void {
    this.fire('open', {});
    // Echo the authenticate req_id, as the real server does — the phone correlates
    // the reply against it.
    this.fire('message', {
      data: JSON.stringify({ type: 'authenticated', req_id: this.lastAuthReqId }),
    });
  }
}

describe('DialStackPhone reconnect()', () => {
  let originalWebSocket: unknown;

  beforeEach(() => {
    AuthingWebSocket.instances = [];
    originalWebSocket = (globalThis as Record<string, unknown>).WebSocket;
    (globalThis as Record<string, unknown>).WebSocket = AuthingWebSocket;
  });

  afterEach(() => {
    (globalThis as Record<string, unknown>).WebSocket = originalWebSocket;
  });

  it('emits `reconnecting` on reconnect() so the connection state transitions', async () => {
    // Regression: the transport-staleness guard drops the old socket's async
    // `closed` once reconnect() nulls this.transport, so without an explicit
    // `reconnecting` the connection state never leaves `connected` across a
    // reconnect — and a consumer watching for a connected→…→connected transition
    // (the E911 binding re-check) never sees one and stays stuck.
    const phone = new DialStackPhone({ token: 'tok', iceServers: [], autoReconnect: false });

    const events: string[] = [];
    phone.on('reconnecting', () => events.push('reconnecting'));
    phone.on('reconnected', () => events.push('reconnected'));

    const connectP = phone.connect();
    await Promise.resolve();
    await Promise.resolve();
    AuthingWebSocket.instances[0]?.completeAuth();
    await connectP;

    const reconnectP = phone.reconnect();
    await Promise.resolve();
    await Promise.resolve();
    AuthingWebSocket.instances[AuthingWebSocket.instances.length - 1]?.completeAuth();
    await reconnectP;

    expect(events).toContain('reconnecting');
    expect(events).toContain('reconnected');
    expect(events.indexOf('reconnecting')).toBeLessThan(events.indexOf('reconnected'));
  });

  it('preserves the full connect/reconnect lifecycle event sequence', async () => {
    // Characterization test (behavior lock for the ConnectHandshake refactor): pins
    // the exact event sequence + isConnected across the whole lifecycle — first
    // connect, a clean reconnect (re-auth), a reconnect whose fresh connect fails at
    // the ICE fetch, and recovery. Event ordering and connected-vs-reconnected
    // dedup are precisely what a connect-state refactor is most likely to break, so
    // this asserts the sequence verbatim rather than membership.
    const seq: Array<{ ev: string; c: boolean }> = [];
    const phone = new DialStackPhone({ token: 'tok', autoReconnect: false });
    (['connected', 'reconnected', 'reconnecting', 'disconnected', 'error'] as const).forEach((ev) =>
      phone.on(ev, () => seq.push({ ev, c: phone.isConnected }))
    );

    // Each connect() calls fetchIceServers() once; queue a resolver per call so we
    // control the pre-socket window (and can make one reject).
    const iceResolvers: Array<() => void> = [];
    let failNextIce = false;
    const realFetch = (globalThis as Record<string, unknown>).fetch;
    (globalThis as Record<string, unknown>).fetch = ((): Promise<Response> => {
      if (failNextIce) return Promise.reject(new Error('offline'));
      return new Promise<Response>((resolve) => {
        iceResolvers.push(() =>
          resolve({ ok: true, json: () => Promise.resolve({ ice_servers: [] }) } as Response)
        );
      });
    }) as typeof fetch;
    const drain = async () => {
      for (let i = 0; i < 6; i++) await Promise.resolve();
    };
    const last = () => AuthingWebSocket.instances[AuthingWebSocket.instances.length - 1];

    try {
      // STEP 1 — first connect → connected.
      const c = phone.connect();
      await drain();
      iceResolvers.shift()!();
      await drain();
      last()!.completeAuth();
      await c;

      // STEP 2 — clean reconnect → reconnecting, reconnected.
      const r1 = phone.reconnect();
      await drain();
      iceResolvers.shift()!();
      await drain();
      last()!.completeAuth();
      await r1;

      // STEP 3 — reconnect whose fresh connect fails at the ICE fetch.
      failNextIce = true;
      let rejectedCode: string | null = null;
      await phone.reconnect().catch((e: { code?: string }) => {
        rejectedCode = e?.code ?? null;
      });
      failNextIce = false;

      // STEP 4 — recover with a real reconnect.
      const r2 = phone.reconnect();
      await drain();
      iceResolvers.shift()!();
      await drain();
      last()!.completeAuth();
      await r2;

      expect(rejectedCode).toBe('ice_fetch_failed');

      // Assert the observable invariants, not the exact mock-tick order: the
      // synchronous test socket surfaces extra `disconnected`s on close() that a
      // real async-closing browser socket drops, so a verbatim sequence would lock
      // in mock behavior. What must hold across the refactor:
      const names = seq.map((e) => e.ev);

      // 1. Exactly one `connected` ever (first bring-up); every later success is
      //    `reconnected` — the connected-vs-reconnected dedup.
      expect(names.filter((n) => n === 'connected')).toEqual(['connected']);
      expect(names.filter((n) => n === 'reconnected')).toHaveLength(2);
      expect(names.indexOf('connected')).toBe(0);

      // 2. Each reconnect begins with `reconnecting`.
      expect(names.filter((n) => n === 'reconnecting')).toHaveLength(3);

      // 3. The failed rebind (step 3) reaches a terminal `disconnected` and never a
      //    success in between — i.e. between the 2nd and 3rd `reconnected` there is
      //    at least one `disconnected` (the #232 no-wedge guarantee).
      const successes = names
        .map((n, i) => (n === 'connected' || n === 'reconnected' ? i : -1))
        .filter((i) => i >= 0);
      const lastSuccess = successes[successes.length - 1];
      const prevSuccess = successes[successes.length - 2];
      expect(names.slice(prevSuccess + 1, lastSuccess)).toContain('disconnected');

      // 4. No `error` emitted; final state connected; isConnected true at every
      //    success and false at every reconnecting/disconnected.
      expect(names).not.toContain('error');
      expect(names[names.length - 1]).toBe('reconnected');
      expect(phone.isConnected).toBe(true);
      seq.forEach((e) => {
        if (e.ev === 'connected' || e.ev === 'reconnected') expect(e.c).toBe(true);
        if (e.ev === 'disconnected') expect(e.c).toBe(false);
      });
    } finally {
      (globalThis as Record<string, unknown>).fetch = realFetch;
    }
  });
});
