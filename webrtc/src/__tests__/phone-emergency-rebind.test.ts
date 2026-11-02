import { DialStackPhone } from '../phone.js';

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
  // connect() may mint (a token inside the lead window) and awaits the
  // (overridden) ICE fetch before opening the socket; let those settle.
  for (let i = 0; i < 10; i++) await Promise.resolve();
  const ws = FakeWebSocket.instances[FakeWebSocket.instances.length - 1]!;
  ws.fire('open', {});
  // Echo the authenticate req_id, as the real server does — the phone correlates
  // the reply against it.
  const authReqId = ws.lastOfType('authenticate')?.req_id as string | undefined;
  ws.fire('message', {
    data: JSON.stringify({
      type: 'authenticated',
      req_id: authReqId,
      user_id: 'user_test',
      account_id: 'acct_test',
    }),
  });
  await connectPromise;
  return ws;
}

const ADDR = 'emerg_01h2xcejqtf2nbrexx3vqjhp42';
const OTHER = 'emerg_01h2xcejqtf2nbrexx3vqjhp43';

function deliver(ws: FakeWebSocket, msg: Record<string, unknown>): void {
  ws.fire('message', { data: JSON.stringify(msg) });
}

describe('DialStackPhone.rebindEmergencyAddress', () => {
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

  function newPhone(): DialStackPhone {
    return new DialStackPhone({
      token: makeToken(nowSeconds() + 3600),
      iceServers: [],
      autoReconnect: false,
    });
  }

  it('binds on the open socket instead of reconnecting', async () => {
    const phone = newPhone();
    const ws = await connectAuthenticated(phone);

    const result = phone.rebindEmergencyAddress(ADDR);
    await Promise.resolve();
    const frame = ws.lastOfType('emergency.rebind');
    expect(frame).toMatchObject({ type: 'emergency.rebind', emergency_address_id: ADDR });
    deliver(ws, { type: 'emergency.rebound', req_id: frame!.req_id, bound: true });

    await expect(result).resolves.toEqual({ bound: true });
    expect(FakeWebSocket.instances).toHaveLength(1);
    expect(ws.closed).toBe(false);
    expect(phone.presentedEmergencyAddressId).toBe(ADDR);
  });

  it('sends anchor only when asked to', async () => {
    const phone = newPhone();
    const ws = await connectAuthenticated(phone);

    void phone.rebindEmergencyAddress(ADDR).catch(() => {});
    void phone.rebindEmergencyAddress(ADDR, { anchor: true }).catch(() => {});
    await Promise.resolve();
    const frames = ws.sentMessages().filter((m) => m.type === 'emergency.rebind');
    expect(frames[0]).not.toHaveProperty('anchor');
    expect(frames[1]).toMatchObject({ emergency_address_id: ADDR, anchor: true });
    phone.disconnect();
  });

  it('reports a denial after emitting network.changed', async () => {
    const phone = newPhone();
    const ws = await connectAuthenticated(phone);
    const order: string[] = [];
    phone.on('network.changed', () => order.push('network.changed'));

    const result = phone.rebindEmergencyAddress(ADDR).then((r) => {
      order.push('resolved');
      return r;
    });
    await Promise.resolve();
    const reqId = ws.lastOfType('emergency.rebind')!.req_id;
    deliver(ws, { type: 'network.changed' });
    deliver(ws, { type: 'emergency.rebound', req_id: reqId, bound: false });

    await expect(result).resolves.toEqual({ bound: false });
    expect(order).toEqual(['network.changed', 'resolved']);
  });

  it('answers concurrent rebinds by req_id', async () => {
    const phone = newPhone();
    const ws = await connectAuthenticated(phone);

    const first = phone.rebindEmergencyAddress(ADDR);
    const second = phone.rebindEmergencyAddress(OTHER);
    await Promise.resolve();
    const frames = ws.sentMessages().filter((m) => m.type === 'emergency.rebind');
    expect(frames).toHaveLength(2);
    deliver(ws, { type: 'emergency.rebound', req_id: frames[0]!.req_id, bound: true });
    deliver(ws, { type: 'emergency.rebound', req_id: frames[1]!.req_id, bound: false });

    await expect(first).resolves.toEqual({ bound: true });
    await expect(second).resolves.toEqual({ bound: false });
    expect(phone.presentedEmergencyAddressId).toBe(OTHER);
  });

  it('rejects with the server error that echoes its req_id', async () => {
    jest.spyOn(console, 'error').mockImplementation(() => {});
    const phone = newPhone();
    phone.on('error', () => {});
    const ws = await connectAuthenticated(phone);

    const result = phone.rebindEmergencyAddress(ADDR);
    await Promise.resolve();
    deliver(ws, {
      type: 'error',
      code: 'invalid_message',
      message: 'emergency_address_id is required',
      req_id: ws.lastOfType('emergency.rebind')!.req_id,
    });

    await expect(result).rejects.toMatchObject({ code: 'invalid_message' });
    expect(phone.isConnected).toBe(true);
  });

  it('rejects with transport_closed when the reply never comes', async () => {
    const phone = newPhone();
    await connectAuthenticated(phone);

    const result = phone.rebindEmergencyAddress(ADDR);
    const settled = expect(result).rejects.toMatchObject({ code: 'transport_closed' });
    await jest.advanceTimersByTimeAsync(16_000);
    await settled;
  });

  it('rejects with transport_closed when the socket goes away first', async () => {
    const phone = newPhone();
    await connectAuthenticated(phone);

    const result = phone.rebindEmergencyAddress(ADDR);
    await Promise.resolve();
    phone.disconnect();

    await expect(result).rejects.toMatchObject({ code: 'transport_closed' });
  });

  it('rejects and leaves nothing pending when the socket closed unannounced', async () => {
    const phone = newPhone();
    const ws = await connectAuthenticated(phone);
    ws.readyState = 3; // closed, but the close event hasn't been dispatched

    await expect(phone.rebindEmergencyAddress(ADDR)).rejects.toMatchObject({
      code: 'transport_closed',
    });
    expect(jest.getTimerCount()).toBe(0);
  });

  it('connects first when there is no session, presenting the address', async () => {
    const phone = newPhone();
    const result = phone.rebindEmergencyAddress(ADDR);
    for (let i = 0; i < 10; i++) await Promise.resolve();
    const ws = FakeWebSocket.instances[0]!;
    ws.fire('open', {});
    const auth = ws.lastOfType('authenticate')!;
    expect(auth.emergency_address_id).toBe(ADDR);
    deliver(ws, { type: 'authenticated', req_id: auth.req_id, user_id: 'u', account_id: 'a' });
    for (let i = 0; i < 10; i++) await Promise.resolve();

    // The handshake's verdict arrives as an optional trailing network.changed with
    // no end marker, so the answer comes from an in-band bind on the new session.
    const frame = ws.lastOfType('emergency.rebind');
    expect(frame).toMatchObject({ emergency_address_id: ADDR });
    deliver(ws, { type: 'emergency.rebound', req_id: frame!.req_id, bound: true });
    await expect(result).resolves.toEqual({ bound: true });
  });
});

describe('DialStackPhone.reconnectWithEmergency (deprecated)', () => {
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

  // NEXT MAJOR: reconnectWithEmergency is removed; delete this test.
  it('still reconnects and presents the address on the new authenticate', async () => {
    const phone = new DialStackPhone({
      token: makeToken(nowSeconds() + 3600),
      iceServers: [],
      autoReconnect: false,
    });
    const first = await connectAuthenticated(phone);

    const done = phone.reconnectWithEmergency(ADDR);
    for (let i = 0; i < 10; i++) await Promise.resolve();
    expect(first.closed).toBe(true);
    const ws = FakeWebSocket.instances[1]!;
    ws.fire('open', {});
    const auth = ws.lastOfType('authenticate')!;
    expect(auth.emergency_address_id).toBe(ADDR);
    deliver(ws, { type: 'authenticated', req_id: auth.req_id, user_id: 'u', account_id: 'a' });
    await done;
  });
});
