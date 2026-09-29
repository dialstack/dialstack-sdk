import type { Call } from '../call.js';
import type { PhoneError } from '../errors.js';
import { DialStackPhone } from '../phone.js';

// A connected socket double: completes the handshake on demand, records what the
// phone sends, and lets a test deliver server frames.
class FakeWebSocket {
  static instances: FakeWebSocket[] = [];
  static OPEN = 1;
  readyState = FakeWebSocket.OPEN;
  sent: Array<{ type: string; req_id?: string; call_id?: string }> = [];
  private handlers: Record<string, ((evt: unknown) => void)[]> = {};
  constructor() {
    FakeWebSocket.instances.push(this);
  }
  addEventListener(event: string, handler: (evt: unknown) => void): void {
    (this.handlers[event] ??= []).push(handler);
  }
  send(data: string): void {
    this.sent.push(JSON.parse(data));
  }
  close(): void {
    this.readyState = 3;
    this.fire('close', { code: 1000, reason: '' });
  }
  fire(event: string, evt: unknown): void {
    for (const h of this.handlers[event] ?? []) h(evt);
  }
  deliver(msg: unknown): void {
    this.fire('message', { data: JSON.stringify(msg) });
  }
  completeAuth(): void {
    this.fire('open', {});
    const auth = this.sent.find((m) => m.type === 'authenticate');
    this.deliver({ type: 'authenticated', req_id: auth?.req_id });
  }
  lastOf(type: string) {
    return [...this.sent].reverse().find((m) => m.type === type);
  }
}

class FakeMediaStream {
  private tracks: unknown[] = [];
  addTrack(t: unknown): void {
    this.tracks.push(t);
  }
  getTracks(): unknown[] {
    return this.tracks;
  }
  getAudioTracks(): unknown[] {
    return this.tracks;
  }
}

class FakeRTCPeerConnection {
  localDescription = null;
  iceGatheringState = 'complete';
  addEventListener(): void {}
  removeEventListener(): void {}
  getSenders(): unknown[] {
    return [];
  }
  close(): void {}
}

const drain = async () => {
  for (let i = 0; i < 6; i++) await Promise.resolve();
};

async function connectedPhoneWithCall(): Promise<{
  phone: DialStackPhone;
  ws: FakeWebSocket;
  call: Call;
}> {
  const phone = new DialStackPhone({
    token: 'tok',
    iceServers: [],
    autoReconnect: false,
    deferInboundCapture: true,
  });
  const connecting = phone.connect();
  await drain();
  const ws = FakeWebSocket.instances[FakeWebSocket.instances.length - 1]!;
  ws.completeAuth();
  await connecting;
  let call: Call | undefined;
  phone.on('incoming', (c) => (call = c));
  ws.deliver({
    type: 'call.incoming',
    call_id: 'call_1',
    from: '+1555',
    from_name: null,
    to: 'me',
  });
  ws.deliver({ type: 'call.answered', call_id: 'call_1' });
  return { phone, ws, call: call! };
}

let originals: Record<string, unknown>;
beforeEach(() => {
  FakeWebSocket.instances = [];
  const g = globalThis as Record<string, unknown>;
  originals = {
    WebSocket: g.WebSocket,
    MediaStream: g.MediaStream,
    RTCPeerConnection: g.RTCPeerConnection,
  };
  g.WebSocket = FakeWebSocket;
  g.MediaStream = FakeMediaStream;
  g.RTCPeerConnection = FakeRTCPeerConnection;
});
afterEach(() => {
  Object.assign(globalThis as Record<string, unknown>, originals);
});

describe('server errors for call actions', () => {
  it('name the call that sent the action, matched by req_id', async () => {
    const { phone, ws } = await connectedPhoneWithCall();
    const phoneErrors: PhoneError[] = [];
    phone.on('error', (e) => phoneErrors.push(e));

    const [call] = phone.activeCalls;
    call!.hold();
    const hold = ws.lastOf('call.hold')!;
    ws.deliver({ type: 'error', code: 'internal_error', message: 'boom', req_id: hold.req_id });

    expect(phoneErrors).toHaveLength(1);
    expect(phoneErrors[0]!.callId).toBe('call_1');
    expect(call!.state).toBe('active');
  });

  it('end the call when they answer its hangup', async () => {
    const { phone, ws, call } = await connectedPhoneWithCall();
    const reasons: string[] = [];
    call.on('ended', (r) => reasons.push(r));

    call.hangup();
    const hangup = ws.lastOf('call.hangup')!;
    ws.deliver({
      type: 'error',
      code: 'internal_error',
      message: 'unknown call_id',
      req_id: hangup.req_id,
    });

    expect(reasons).toEqual(['hangup']);
    expect(phone.activeCalls).toHaveLength(0);
  });

  it('name no call for a req_id no call sent', async () => {
    const { phone, ws } = await connectedPhoneWithCall();
    const phoneErrors: PhoneError[] = [];
    phone.on('error', (e) => phoneErrors.push(e));

    ws.deliver({ type: 'error', code: 'internal_error', message: 'boom', req_id: 'req_other' });

    expect(phoneErrors[0]!.callId).toBeNull();
  });
});

describe('ending calls', () => {
  it('disconnect() ends every live call with an ended event', async () => {
    const { phone, call } = await connectedPhoneWithCall();
    const reasons: string[] = [];
    call.on('ended', (r) => reasons.push(r));

    phone.disconnect();

    expect(reasons).toEqual(['hangup']);
    expect(call.state).toBe('ended');
    expect(phone.activeCalls).toHaveLength(0);
  });

  it('a call ended locally leaves activeCalls', async () => {
    const { phone, call } = await connectedPhoneWithCall();

    call.endLocally('failed');

    expect(phone.activeCalls).toHaveLength(0);
  });

  it('a server call.ended still removes the call', async () => {
    const { phone, ws } = await connectedPhoneWithCall();

    ws.deliver({ type: 'call.ended', call_id: 'call_1', reason: 'hangup', duration_seconds: 3 });

    expect(phone.activeCalls).toHaveLength(0);
  });
});

describe('losing the socket', () => {
  it('ends the calls of the lost session when an automatic reconnect starts', async () => {
    jest.useFakeTimers();
    try {
      const phone = new DialStackPhone({ token: 'tok', iceServers: [], deferInboundCapture: true });
      const connecting = phone.connect();
      await drain();
      const ws = FakeWebSocket.instances[0]!;
      ws.completeAuth();
      await connecting;
      let call: Call | undefined;
      phone.on('incoming', (c) => (call = c));
      ws.deliver({
        type: 'call.incoming',
        call_id: 'call_1',
        from: '+1555',
        from_name: null,
        to: 'me',
      });
      const reasons: string[] = [];
      call!.on('ended', (r) => reasons.push(r));

      // The server dropped the socket (e.g. a missed heartbeat): not a user close.
      ws.fire('close', { code: 1006, reason: '' });

      expect(reasons).toEqual(['failed']);
      expect(phone.activeCalls).toHaveLength(0);
      phone.disconnect();
    } finally {
      jest.useRealTimers();
    }
  });
});

describe('connect() while an automatic reconnect is in progress', () => {
  beforeEach(() => jest.useFakeTimers());
  afterEach(() => jest.useRealTimers());

  async function droppedPhone() {
    const phone = new DialStackPhone({ token: 'tok', iceServers: [] });
    const connecting = phone.connect();
    await drain();
    FakeWebSocket.instances[0]!.completeAuth();
    await connecting;
    FakeWebSocket.instances[0]!.fire('close', { code: 1006, reason: '' });
    expect(phone.isConnected).toBe(false);
    return phone;
  }

  it('joins the reconnect and resolves when it authenticates', async () => {
    const phone = await droppedPhone();

    const joined = phone.connect();
    await jest.advanceTimersByTimeAsync(1000); // backoff elapses, new socket opens
    FakeWebSocket.instances[1]!.completeAuth();

    await expect(joined).resolves.toBeUndefined();
    expect(phone.isConnected).toBe(true);
    phone.disconnect();
  });

  it('rejects with transport_closed when the reconnect it joined never authenticates', async () => {
    const phone = await droppedPhone();

    const joined = phone.connect();
    const outcome = joined.catch((e: PhoneError) => e);
    await jest.advanceTimersByTimeAsync(20_000);

    // The socket is what's missing, not the credentials.
    expect(await outcome).toMatchObject({ code: 'transport_closed' });
    phone.disconnect();
  });

  it('lets setToken() apply to the next attempt instead of throwing', async () => {
    const phone = await droppedPhone();

    expect(() => phone.setToken('tok2')).not.toThrow();
    await jest.advanceTimersByTimeAsync(1000);
    const ws = FakeWebSocket.instances[1]!;
    ws.fire('open', {});

    expect(ws.lastOf('authenticate')).toMatchObject({ token: 'tok2' });
    phone.disconnect();
  });

  it('still refuses on a live session', async () => {
    const phone = new DialStackPhone({ token: 'tok', iceServers: [] });
    const connecting = phone.connect();
    await drain();
    FakeWebSocket.instances[0]!.completeAuth();
    await connecting;

    await expect(phone.connect()).rejects.toMatchObject({ message: 'Phone is already connected' });
    expect(() => phone.setToken('tok2')).toThrow(/connected phone/);
    phone.disconnect();
  });
});

describe('connect() after the transport has closed for good', () => {
  it('opens a fresh socket instead of waiting for a reconnect that never comes', async () => {
    const phone = new DialStackPhone({ token: 'tok', iceServers: [] });
    const connecting = phone.connect();
    await drain();
    const ws = FakeWebSocket.instances[0]!;
    ws.completeAuth();
    await connecting;

    // A terminal eviction: no automatic reconnect follows.
    ws.deliver({
      type: 'error',
      code: 'auth_expired',
      message: 'session token expired',
      fatal: true,
    });
    ws.fire('close', { code: 1008, reason: '' });
    expect(phone.isConnected).toBe(false);

    phone.setToken('tok2');
    const again = phone.connect();
    await drain();
    expect(FakeWebSocket.instances).toHaveLength(2);
    const fresh = FakeWebSocket.instances[1]!;
    fresh.completeAuth();

    await expect(again).resolves.toBeUndefined();
    expect(fresh.lastOf('authenticate')).toMatchObject({ token: 'tok2' });
    phone.disconnect();
  });
});
