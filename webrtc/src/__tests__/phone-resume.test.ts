import type { Call } from '../call.js';
import { DialStackPhone } from '../phone.js';

// A socket double that remembers the url it was opened on, records what the
// phone sends, and lets a test deliver server frames.
class FakeWebSocket {
  static instances: FakeWebSocket[] = [];
  static OPEN = 1;
  readyState = FakeWebSocket.OPEN;
  sent: Array<{ type: string; req_id?: string; call_id?: string; resume_token?: string }> = [];
  closeCode: number | undefined;
  private handlers: Record<string, ((evt: unknown) => void)[]> = {};
  constructor(readonly url: string) {
    FakeWebSocket.instances.push(this);
  }
  addEventListener(event: string, handler: (evt: unknown) => void): void {
    (this.handlers[event] ??= []).push(handler);
  }
  send(data: string): void {
    this.sent.push(JSON.parse(data));
  }
  close(code?: number): void {
    this.closeCode = code;
    this.readyState = 3;
    this.fire('close', { code: code ?? 1000, reason: '' });
  }
  fire(event: string, evt: unknown): void {
    for (const h of this.handlers[event] ?? []) h(evt);
  }
  deliver(msg: unknown): void {
    this.fire('message', { data: JSON.stringify(msg) });
  }
  // Opens the socket and answers its authenticate.
  authenticate(extra: Record<string, unknown> = {}): void {
    this.fire('open', {});
    const auth = this.sent.find((m) => m.type === 'authenticate');
    this.deliver({
      type: 'authenticated',
      req_id: auth?.req_id,
      resume_token: 'rt_1',
      resume_window_seconds: 30,
      resume_url: 'wss://webrtc-east.example/v1/webrtc',
      ...extra,
    });
  }
  // The network vanished under the socket: no close handshake.
  drop(): void {
    this.readyState = 3;
    this.fire('close', { code: 1006, reason: '' });
  }
  types(): string[] {
    return this.sent.map((m) => m.type);
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

const latest = () => FakeWebSocket.instances[FakeWebSocket.instances.length - 1]!;

async function phoneOnCall(): Promise<{ phone: DialStackPhone; ws: FakeWebSocket; call: Call }> {
  const phone = new DialStackPhone({
    token: 'tok',
    iceServers: [],
    signalingBaseUrl: 'wss://webrtc.example',
    deferInboundCapture: true,
  });
  const connecting = phone.connect();
  await drain();
  const ws = latest();
  ws.authenticate();
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

// Runs the reconnect backoff to its next attempt and returns the new socket.
async function nextAttempt(): Promise<FakeWebSocket> {
  const before = FakeWebSocket.instances.length;
  jest.advanceTimersByTime(1_000);
  await drain();
  expect(FakeWebSocket.instances.length).toBe(before + 1);
  return latest();
}

const restored = (held = false, muted = false) => ({
  type: 'call.restored',
  call_id: 'call_1',
  held,
  muted,
  from: '+1555',
  to: 'me',
  direction: 'inbound',
  answered_at: '2026-10-31T12:00:00Z',
});

let originals: Record<string, unknown>;
beforeEach(() => {
  jest.useFakeTimers();
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
  jest.useRealTimers();
  Object.assign(globalThis as Record<string, unknown>, originals);
});

describe('a dropped socket on an answered call', () => {
  it('suspends the call instead of ending it, and resumes it on the regional endpoint', async () => {
    const { phone, ws, call } = await phoneOnCall();
    const events: string[] = [];
    call.on('ended', (r) => events.push(`ended:${r}`));
    call.on('reconnecting', () => events.push('reconnecting'));
    call.on('reconnected', () => events.push('reconnected'));

    ws.drop();
    expect(call.isReconnecting).toBe(true);
    expect(phone.activeCalls).toEqual([call]);

    const ws2 = await nextAttempt();
    expect(ws2.url).toBe('wss://webrtc-east.example/v1/webrtc');
    ws2.authenticate({ resumed: true });
    expect(ws2.sent.find((m) => m.type === 'authenticate')?.resume_token).toBe('rt_1');
    ws2.deliver(restored());

    expect(events).toEqual(['reconnecting', 'reconnected']);
    expect(call.isReconnecting).toBe(false);
    expect(call.state).toBe('active');
    phone.disconnect();
  });

  it('sends a mute taken during the drop once the session resumes', async () => {
    const { phone, ws, call } = await phoneOnCall();
    ws.drop();

    call.mute();
    expect(call.isMuted).toBe(true);

    const ws2 = await nextAttempt();
    ws2.authenticate({ resumed: true });
    expect(ws2.types()).toEqual(['authenticate', 'call.mute']);
    ws2.deliver(restored());
    phone.disconnect();
  });

  it('refuses hold, resume and transfer during the drop instead of sending them late', async () => {
    const { phone, ws, call } = await phoneOnCall();
    ws.drop();

    expect(() => call.hold()).toThrow(expect.objectContaining({ code: 'transport_closed' }));
    expect(() => call.transfer('+15551234567')).toThrow(
      expect.objectContaining({ code: 'transport_closed' })
    );
    expect(() => call.completeTransfer()).toThrow(
      expect.objectContaining({ code: 'transport_closed' })
    );
    expect(() => call.attendedTransfer('+15551234567')).toThrow(
      expect.objectContaining({ code: 'transport_closed' })
    );

    const ws2 = await nextAttempt();
    ws2.authenticate({ resumed: true });
    ws2.deliver(restored(true));
    expect(ws2.types()).toEqual(['authenticate']);

    // Back on: actions go out again.
    call.resume();
    expect(ws2.types()).toEqual(['authenticate', 'call.resume']);
    phone.disconnect();
  });

  it('ends a call hung up during the drop at once, and tells the server on resume', async () => {
    const { phone, ws, call } = await phoneOnCall();
    const reasons: string[] = [];
    call.on('ended', (r) => reasons.push(r));
    ws.drop();

    call.hangup();
    expect(reasons).toEqual(['hangup']);
    expect(phone.activeCalls).toHaveLength(0);

    const ws2 = await nextAttempt();
    ws2.authenticate({ resumed: true });
    expect(ws2.types()).toContain('call.hangup');
    phone.disconnect();
  });

  it('tells the server again about a mute it lost with the old socket', async () => {
    const { phone, ws, call } = await phoneOnCall();
    call.mute(); // went out on the socket that is about to die unread
    ws.drop();

    const ws2 = await nextAttempt();
    ws2.authenticate({ resumed: true });
    ws2.deliver(restored(false, false));

    expect(call.isMuted).toBe(true);
    expect(ws2.types()).toEqual(['authenticate', 'call.mute']);

    ws2.deliver(restored(false, true));
    // Nothing to send once they agree.
    expect(ws2.types()).toEqual(['authenticate', 'call.mute']);
    phone.disconnect();
  });

  it('adopts the hold state the server reports', async () => {
    const { phone, ws, call } = await phoneOnCall();
    const held: string[] = [];
    call.on('held', (by) => held.push(by));
    ws.drop();

    const ws2 = await nextAttempt();
    ws2.authenticate({ resumed: true });
    ws2.deliver(restored(true));

    expect(call.state).toBe('held');
    expect(held).toEqual(['local']);
    phone.disconnect();
  });

  it('ends the call when the reconnect gets a fresh session instead', async () => {
    const { phone, ws, call } = await phoneOnCall();
    const reasons: string[] = [];
    call.on('ended', (r) => reasons.push(r));
    ws.drop();
    call.mute();

    const ws2 = await nextAttempt();
    ws2.authenticate({ resumed: false, resume_token: 'rt_2' });

    expect(reasons).toEqual(['failed']);
    expect(ws2.types()).toEqual(['authenticate']);
    phone.disconnect();
  });

  it('ends the call with the server when it ended during the drop', async () => {
    const { phone, ws, call } = await phoneOnCall();
    const reasons: string[] = [];
    call.on('ended', (r) => reasons.push(r));
    ws.drop();

    const ws2 = await nextAttempt();
    ws2.authenticate({ resumed: true });
    ws2.deliver({ type: 'call.ended', call_id: 'call_1', reason: 'hangup', duration_seconds: 9 });

    expect(reasons).toEqual(['hangup']);
    phone.disconnect();
  });

  it('ends the call if no resume comes within the window', async () => {
    const { phone, ws, call } = await phoneOnCall();
    const reasons: string[] = [];
    call.on('ended', (r) => reasons.push(r));
    ws.drop();

    jest.advanceTimersByTime(34_000);
    expect(reasons).toEqual([]);
    jest.advanceTimersByTime(2_000);
    expect(reasons).toEqual(['failed']);
    phone.disconnect();
  });

  it('still resumes after a 27 s outage: no backoff step outlasts the window', async () => {
    const { phone, ws, call } = await phoneOnCall();
    ws.drop();

    // Every attempt fails until the network comes back at +27 s.
    let t = 0;
    let seen = FakeWebSocket.instances.length;
    while (t < 27_000) {
      jest.advanceTimersByTime(100);
      t += 100;
      await drain();
      if (FakeWebSocket.instances.length > seen) {
        seen = FakeWebSocket.instances.length;
        latest().drop();
      }
    }
    while (FakeWebSocket.instances.length === seen) {
      jest.advanceTimersByTime(100);
      t += 100;
      await drain();
    }
    // Inside the server's 30 s window.
    expect(t).toBeLessThanOrEqual(29_000);
    expect(t - 27_000).toBeLessThanOrEqual(2_000);
    latest().authenticate({ resumed: true });
    latest().deliver(restored());
    expect(call.state).toBe('active');
    phone.disconnect();
  });

  it('falls back to the latency-routed endpoint when the regional one fails', async () => {
    const { phone, ws } = await phoneOnCall();
    ws.drop();

    const regional = await nextAttempt();
    expect(regional.url).toBe('wss://webrtc-east.example/v1/webrtc');
    regional.drop();

    jest.advanceTimersByTime(2_000);
    await drain();
    expect(latest().url).toMatch(/^wss:\/\/webrtc\.example/);
    phone.disconnect();
  });
});

describe('a dropped socket on an unanswered call', () => {
  it('ends the call: the server ends it too', async () => {
    const phone = new DialStackPhone({ token: 'tok', iceServers: [], deferInboundCapture: true });
    const connecting = phone.connect();
    await drain();
    const ws = latest();
    ws.authenticate();
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

    ws.drop();

    expect(reasons).toEqual(['failed']);
    phone.disconnect();
  });

  it('still resumes to deliver the hangup of the only call', async () => {
    const { phone, ws, call } = await phoneOnCall();
    ws.drop();
    call.hangup();
    expect(phone.activeCalls).toHaveLength(0);

    const ws2 = await nextAttempt();
    expect(ws2.url).toBe('wss://webrtc-east.example/v1/webrtc');
    ws2.authenticate({ resumed: true });
    expect(ws2.sent.find((m) => m.type === 'authenticate')?.resume_token).toBe('rt_1');
    expect(ws2.types()).toEqual(['authenticate', 'call.hangup']);
    phone.disconnect();
  });

  it('stops queueing when a fresh session comes back instead', async () => {
    const { phone, ws, call } = await phoneOnCall();
    ws.drop();
    call.hangup();

    const ws2 = await nextAttempt();
    ws2.authenticate({ resumed: false, resume_token: 'rt_2' });
    expect(ws2.types()).toEqual(['authenticate']);

    // The next call's actions go out at once, not into a dead queue.
    let next: Call | undefined;
    phone.on('incoming', (c) => (next = c));
    ws2.deliver({
      type: 'call.incoming',
      call_id: 'call_2',
      from: '+1555',
      from_name: null,
      to: 'me',
    });
    ws2.deliver({ type: 'call.answered', call_id: 'call_2' });
    next!.hold();
    expect(ws2.types()).toContain('call.hold');
    phone.disconnect();
  });
});
