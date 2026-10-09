import type { Call } from '../call.js';
import type { PhoneError } from '../errors.js';
import { DialStackPhone } from '../phone.js';

// An inbound call can end at any point while it is still being set up — the
// caller hangs up, another device in a ring group answers, the user declines —
// and most often while the mic prompt is open. Teardown closes the peer
// connection, and a closed one throws on every operation. None of that is a
// failure: the call is simply over, so the phone must stay quiet, send nothing
// for it, and leave no mic running.

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
}

class FakeTrack {
  kind = 'audio';
  readyState: 'live' | 'ended' = 'live';
  stop(): void {
    this.readyState = 'ended';
  }
}

class FakeMediaStream {
  private tracks: FakeTrack[] = [];
  addTrack(t: FakeTrack): void {
    this.tracks.push(t);
  }
  removeTrack(t: FakeTrack): void {
    this.tracks = this.tracks.filter((x) => x !== t);
  }
  getTracks(): FakeTrack[] {
    return this.tracks;
  }
  getAudioTracks(): FakeTrack[] {
    return this.tracks;
  }
}

type FakeSender = { track: FakeTrack | null; dtmf: unknown };
type PcOp = 'setRemoteDescription' | 'createOffer' | 'createAnswer' | 'setLocalDescription';

// Lets a test end the call while one peer-connection operation is in flight.
let during: Partial<Record<PcOp, () => void>> = {};
// Fails one operation on a live connection: a genuine error, not teardown.
let failing: Partial<Record<PcOp, Error>> = {};
// Set to leave ICE gathering open, so the answer waits on it.
let gatheringOpen = false;

// Models Chrome after close(): every negotiation call is refused with the
// error users actually saw.
class ClosableRTCPeerConnection {
  signalingState = 'stable';
  iceGatheringState = gatheringOpen ? 'gathering' : 'complete';
  localDescription: { type: string; sdp: string } | null = null;
  senders: FakeSender[] = [];
  addEventListener(): void {}
  removeEventListener(): void {}
  getSenders(): FakeSender[] {
    return this.senders;
  }
  close(): void {
    this.signalingState = 'closed';
  }
  private refuse(op: string): Error {
    return Object.assign(
      new Error(
        `Failed to execute '${op}' on 'RTCPeerConnection': The RTCPeerConnection's signalingState is 'closed'.`
      ),
      { name: 'InvalidStateError' }
    );
  }
  private run<T>(op: PcOp, result: () => T): Promise<T> {
    if (this.signalingState === 'closed') return Promise.reject(this.refuse(op));
    const failure = failing[op];
    if (failure) return Promise.reject(failure);
    const value = result();
    during[op]?.();
    // Teardown while the op is in flight fails it too, rather than letting it land.
    if (this.signalingState === 'closed') return Promise.reject(this.refuse(op));
    return Promise.resolve(value);
  }
  setRemoteDescription(): Promise<void> {
    return this.run('setRemoteDescription', () => {
      this.signalingState = 'have-remote-offer';
      this.senders.push({ track: null, dtmf: null });
    });
  }
  addTrack(track: FakeTrack): FakeSender {
    if (this.signalingState === 'closed') throw this.refuse('addTrack');
    const sender = this.senders.find((s) => !s.track) ?? { track: null, dtmf: null };
    sender.track = track;
    sender.dtmf = {};
    return sender;
  }
  createOffer(): Promise<RTCSessionDescriptionInit> {
    return this.run('createOffer', () => ({ type: 'offer' as const, sdp: 'offer-sdp' }));
  }
  createAnswer(): Promise<RTCSessionDescriptionInit> {
    return this.run('createAnswer', () => ({ type: 'answer' as const, sdp: 'answer-sdp' }));
  }
  setLocalDescription(d: RTCSessionDescriptionInit): Promise<void> {
    return this.run('setLocalDescription', () => {
      this.signalingState = 'stable';
      this.localDescription = { type: d.type as string, sdp: d.sdp ?? '' };
    });
  }
  addIceCandidate(): Promise<void> {
    if (this.signalingState === 'closed') return Promise.reject(this.refuse('addIceCandidate'));
    return Promise.resolve();
  }
}

// The mic prompt: every request stays open until the test grants or denies it.
let mic: {
  requests: number;
  granted: FakeTrack[];
  grant(): void;
  deny(): void;
  fail(name: string): void;
};

function installMic(): void {
  const pending: Array<{ resolve: (s: FakeMediaStream) => void; reject: (e: Error) => void }> = [];
  mic = {
    requests: 0,
    granted: [],
    grant() {
      for (const p of pending.splice(0)) {
        const track = new FakeTrack();
        mic.granted.push(track);
        const stream = new FakeMediaStream();
        stream.addTrack(track);
        p.resolve(stream);
      }
    },
    deny() {
      mic.fail('NotAllowedError');
    },
    fail(name) {
      for (const p of pending.splice(0)) {
        p.reject(Object.assign(new Error(`${name} from getUserMedia`), { name }));
      }
    },
  };
  Object.defineProperty(globalThis, 'navigator', {
    value: {
      mediaDevices: {
        getUserMedia: () => {
          mic.requests += 1;
          return new Promise<FakeMediaStream>((resolve, reject) =>
            pending.push({ resolve, reject })
          );
        },
      },
    },
    configurable: true,
  });
}

const settle = () => new Promise((r) => setTimeout(r, 0));

async function ringingCall(
  opts: { deferInboundCapture?: boolean; audioInputDeviceId?: string } = {}
) {
  const phone = new DialStackPhone({
    token: 'tok',
    iceServers: [],
    autoReconnect: false,
    deferInboundCapture: opts.deferInboundCapture ?? false,
    audioInputDeviceId: opts.audioInputDeviceId,
  });
  const errors: PhoneError[] = [];
  phone.on('error', (e) => errors.push(e));
  const connecting = phone.connect();
  await settle();
  const ws = FakeWebSocket.instances[FakeWebSocket.instances.length - 1]!;
  ws.completeAuth();
  await connecting;
  let call: Call | undefined;
  phone.on('incoming', (c) => (call ??= c));
  ws.deliver({
    type: 'call.incoming',
    call_id: 'call_1',
    from: '+1555',
    from_name: null,
    to: 'me',
  });
  return {
    phone,
    ws,
    call: call!,
    errors,
    offer: () => ws.deliver({ type: 'sdp.offer', call_id: 'call_1', sdp: 'offer-sdp' }),
    sentTypes: () => ws.sent.map((m) => m.type),
    endBy: {
      server: () =>
        ws.deliver({
          type: 'call.ended',
          call_id: 'call_1',
          reason: 'hangup',
          duration_seconds: 0,
        }),
      dispose: () => call!.dispose(),
    },
  };
}

const endings = ['server', 'dispose'] as const;

// The mic is taken when the call arrives, or with deferInboundCapture only on
// answer; both go through the same acquisition.
const captureModes = [
  ['on arrival', false],
  ['deferred to answer', true],
] as const;
const endingsByCapture = captureModes.flatMap(([mode, deferred]) =>
  endings.map((by) => [by, mode, deferred] as const)
);

// Rejections nothing handles: teardown errors that escape every reporter.
let unhandled: unknown[] = [];
const onUnhandled = (reason: unknown) => unhandled.push(reason);

let originals: Record<string, unknown>;
beforeEach(() => {
  FakeWebSocket.instances = [];
  during = {};
  failing = {};
  gatheringOpen = false;
  unhandled = [];
  process.on('unhandledRejection', onUnhandled);
  const g = globalThis as Record<string, unknown>;
  originals = {
    WebSocket: g.WebSocket,
    MediaStream: g.MediaStream,
    RTCPeerConnection: g.RTCPeerConnection,
    navigator: g.navigator,
  };
  g.WebSocket = FakeWebSocket;
  g.MediaStream = FakeMediaStream;
  g.RTCPeerConnection = ClosableRTCPeerConnection;
  installMic();
});
afterEach(() => {
  process.off('unhandledRejection', onUnhandled);
  const { navigator, ...rest } = originals;
  Object.assign(globalThis as Record<string, unknown>, rest);
  Object.defineProperty(globalThis, 'navigator', { value: navigator, configurable: true });
});

describe('an inbound call that ends before its answer is built', () => {
  it.each(endings)('is quiet when ended (%s) while the mic prompt is open', async (by) => {
    const h = await ringingCall();
    h.call.answer();
    h.offer();
    await settle();

    h.endBy[by]();
    mic.grant();
    await settle();

    expect(h.errors).toEqual([]);
    expect(h.sentTypes()).not.toContain('sdp.answer');
  });

  it.each(endings)(
    'is quiet when ended (%s) while a deferred mic is being taken on answer',
    async (by) => {
      const h = await ringingCall({ deferInboundCapture: true });
      h.offer();
      await settle();
      h.call.answer();

      h.endBy[by]();
      mic.grant();
      await settle();

      expect(h.errors).toEqual([]);
      expect(h.sentTypes()).not.toContain('sdp.answer');
    }
  );

  it.each(endings)('is quiet when ended (%s) while the offer is being applied', async (by) => {
    const h = await ringingCall();
    during.setRemoteDescription = () => h.endBy[by]();
    h.call.answer();
    h.offer();
    mic.grant();
    await settle();

    expect(h.errors).toEqual([]);
    expect(h.sentTypes()).not.toContain('sdp.answer');
  });

  it.each(endings)(
    'is quiet when ended (%s) between createAnswer and setLocalDescription',
    async (by) => {
      const h = await ringingCall();
      during.createAnswer = () => h.endBy[by]();
      h.call.answer();
      mic.grant();
      h.offer();
      await settle();

      expect(h.errors).toEqual([]);
      expect(h.sentTypes()).not.toContain('sdp.answer');
    }
  );

  it.each(endings)('is quiet when ended (%s) while ICE is still gathering', async (by) => {
    gatheringOpen = true;
    const h = await ringingCall();
    h.call.answer();
    mic.grant();
    h.offer();
    await settle();

    h.endBy[by]();
    await settle();

    expect(h.errors).toEqual([]);
    expect(h.sentTypes()).not.toContain('sdp.answer');
  });

  it.each(endingsByCapture)(
    'releases a mic granted after the call ended (%s, mic %s)',
    async (by, _mode, deferInboundCapture) => {
      const h = await ringingCall({ deferInboundCapture });
      h.offer();
      await settle();
      if (deferInboundCapture) h.call.answer();

      h.endBy[by]();
      mic.grant();
      await settle();

      // Teardown already ran and could not see this track; left live, the
      // browser's mic indicator stays lit until the page unloads.
      expect(mic.granted.map((t) => t.readyState)).toEqual(['ended']);
    }
  );

  it.each(endings)('reports no mic failure for a prompt denied after it ended (%s)', async (by) => {
    const h = await ringingCall();

    h.endBy[by]();
    mic.deny();
    await settle();

    expect(h.errors).toEqual([]);
  });

  it.each(endingsByCapture)(
    'does not retry the mic for a call that ended (%s, mic %s)',
    async (by, _mode, deferInboundCapture) => {
      // A saved device that no longer resolves is normally retried unconstrained;
      // for a call that is over, that retry is a second prompt for nothing.
      const h = await ringingCall({ audioInputDeviceId: 'mic-gone', deferInboundCapture });
      if (deferInboundCapture) h.call.answer();

      h.endBy[by]();
      mic.fail('NotFoundError');
      await settle();

      expect(mic.requests).toBe(1);
      expect(h.errors).toEqual([]);
    }
  );

  it.each(endings)(
    'reports no mic failure for a deferred prompt denied after it ended (%s)',
    async (by) => {
      const h = await ringingCall({ deferInboundCapture: true });
      h.call.answer();

      h.endBy[by]();
      mic.deny();
      await settle();

      expect(h.errors).toEqual([]);
    }
  );

  it.each(endings)('sends no answer when answered after it ended (%s)', async (by) => {
    const h = await ringingCall();
    mic.grant();
    h.offer();
    await settle();

    h.endBy[by]();
    h.call.answer();

    expect(h.sentTypes()).not.toContain('call.answer');
    expect(h.sentTypes()).not.toContain('sdp.answer');
  });

  it.each(endings)('takes no deferred mic when answered after it ended (%s)', async (by) => {
    const h = await ringingCall({ deferInboundCapture: true });
    h.offer();
    await settle();

    h.endBy[by]();
    h.call.answer();
    await settle();

    // A stale answer tap (an OS call screen that has not caught up) would open a
    // mic prompt, or activate the OS audio session, for a call that is over.
    expect(mic.requests).toBe(0);
  });
});

// The other side of the same guard: on a call that is still live, a failed
// answer is a real failure and must reach the app, whichever path built it.
describe('an inbound answer that fails on a live call', () => {
  it.each([
    ['the offer lands', false],
    ['a deferred mic is taken on answer', true],
  ])('is reported when built as %s', async (_, deferInboundCapture) => {
    failing.createAnswer = new Error('createAnswer failed');
    const h = await ringingCall({ deferInboundCapture });
    h.offer();
    await settle();
    h.call.answer();
    mic.grant();
    await settle();

    expect(h.errors.map((e) => [e.code, e.callId])).toEqual([['call_failed', 'call_1']]);
    expect(h.errors[0]!.message).toContain('createAnswer failed');
  });
});

// Ending one call must not touch another: every guard above keys on the call
// that ended, and each call owns its own peer connection and mic tracks.
describe('another call while one ends', () => {
  async function twoCalls() {
    const h = await ringingCall();
    h.ws.deliver({
      type: 'call.incoming',
      call_id: 'call_2',
      from: '+1666',
      from_name: null,
      to: 'me',
    });
    const other = h.phone.getCall('call_2')!;
    const answersFor = (id: string) =>
      h.ws.sent.filter((m) => m.type === 'sdp.answer' && m.call_id === id);
    return { h, other, answersFor };
  }

  it.each(endings)(
    'still answers the other ringing call when one ends (%s) mid-prompt',
    async (by) => {
      const { h, other, answersFor } = await twoCalls();
      h.offer();
      h.ws.deliver({ type: 'sdp.offer', call_id: 'call_2', sdp: 'offer-sdp' });
      await settle();

      h.endBy[by]();
      mic.grant();
      await settle();
      other.answer();
      await settle();

      expect(h.errors).toEqual([]);
      expect(answersFor('call_1')).toHaveLength(0);
      expect(answersFor('call_2')).toHaveLength(1);
      // One track per call: the ended call's is stopped, the live call's keeps sending.
      expect(mic.granted.map((t) => t.readyState).sort()).toEqual(['ended', 'live']);
      expect(other.isFinished).toBe(false);
    }
  );

  it.each(endings)('keeps the other established call live when one ends (%s)', async (by) => {
    const { h, other, answersFor } = await twoCalls();
    h.offer();
    h.ws.deliver({ type: 'sdp.offer', call_id: 'call_2', sdp: 'offer-sdp' });
    mic.grant();
    await settle();
    h.call.answer();
    other.answer();
    await settle();
    expect(answersFor('call_1')).toHaveLength(1);
    expect(answersFor('call_2')).toHaveLength(1);

    h.endBy[by]();
    await settle();

    expect(h.errors).toEqual([]);
    expect(other.isFinished).toBe(false);
    expect(other.peerConnection.signalingState).not.toBe('closed');
    expect(mic.granted.map((t) => t.readyState).sort()).toEqual(['ended', 'live']);
  });
});

describe('frames for a call that already ended', () => {
  it('ignores a trickled ICE candidate for a disposed call', async () => {
    const h = await ringingCall();
    h.offer();
    await settle();

    // A disposed call stays routable, so its trickled candidates still arrive.
    h.call.dispose();
    h.ws.deliver({
      type: 'ice.candidate',
      call_id: 'call_1',
      candidate: 'candidate:1 1 udp 1 192.0.2.1 5000 typ host',
      sdp_mid: '0',
      sdp_m_line_index: 0,
    });
    await settle();
    await settle();

    expect(unhandled).toEqual([]);
    expect(h.errors).toEqual([]);
  });

  it.each(endings)(
    'reports nothing for an outbound answer applied as the call ends (%s)',
    async (by) => {
      const h = await ringingCall();
      const placing = h.phone.call('+15550001111');
      await settle();
      mic.grant();
      await settle();
      const create = h.ws.sent.find((m) => m.type === 'call.create')!;
      h.ws.deliver({ type: 'call.trying', call_id: 'call_out', req_id: create.req_id });
      const out = await placing;

      during.setRemoteDescription =
        by === 'server'
          ? () =>
              h.ws.deliver({
                type: 'call.ended',
                call_id: 'call_out',
                reason: 'hangup',
                duration_seconds: 0,
              })
          : () => out.dispose();
      h.ws.deliver({ type: 'sdp.answer', call_id: 'call_out', sdp: 'answer-sdp' });
      await settle();

      expect(h.errors).toEqual([]);
    }
  );
});

// A denied mic is recovered by picking another device, which rebuilds the answer.
// The call ending during that rebuild must fail neither the switch nor the call.
describe('a recovered mic rebuilding the answer as the call ends', () => {
  async function deniedThenSwitching() {
    const h = await ringingCall();
    h.offer();
    await settle();
    mic.deny();
    await settle();
    // The denial itself is a genuine failure on a live call; only what follows matters.
    h.errors.length = 0;
    return h;
  }

  async function switchOutcome(
    h: Awaited<ReturnType<typeof ringingCall>>,
    switching: Promise<void>
  ) {
    let rejected: unknown = null;
    await switching.catch((e) => (rejected = e));
    await settle();
    expect(rejected).toBeNull();
    expect(h.errors).toEqual([]);
    expect(h.sentTypes()).not.toContain('sdp.answer');
    expect(unhandled).toEqual([]);
  }

  it.each(endings)('ended (%s) while the answer is being created', async (by) => {
    const h = await deniedThenSwitching();
    during.createAnswer = h.endBy[by];
    const switching = h.phone.setAudioInputDevice('mic-2');
    await settle();
    mic.grant();

    await switchOutcome(h, switching);
  });

  it.each(endings)('ended (%s) while ICE is still gathering', async (by) => {
    gatheringOpen = true;
    const h = await deniedThenSwitching();
    const switching = h.phone.setAudioInputDevice('mic-2');
    await settle();
    mic.grant();
    await settle();
    await settle();
    h.endBy[by]();

    await switchOutcome(h, switching);
  });
});
