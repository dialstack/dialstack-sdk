import { Call, type CallInit } from '../call.js';

class FakeMediaStream {
  getTracks(): unknown[] {
    return [];
  }
  getAudioTracks(): unknown[] {
    return [];
  }
  addTrack(): void {}
}

// A peer connection that records what an ICE restart does to it and lets a
// test move its ICE state.
class FakeRTCPeerConnection {
  static last: FakeRTCPeerConnection;
  localDescription: { type: string; sdp: string } | null = null;
  // The call was negotiated with a far end that advertises trickle, as ours do.
  remoteDescription: { type: string; sdp: string } | null = {
    type: 'answer',
    sdp: 'a=ice-options:trickle\r\n',
  };
  iceGatheringState = 'complete';
  iceConnectionState = 'connected';
  signalingState = 'stable';
  config: RTCConfiguration = { iceServers: [] };
  offers: Array<RTCOfferOptions | undefined> = [];
  remote: Array<{ type: string; sdp?: string }> = [];
  private handlers: Record<string, (() => void)[]> = {};
  constructor() {
    FakeRTCPeerConnection.last = this;
  }
  addEventListener(event: string, h: () => void): void {
    (this.handlers[event] ??= []).push(h);
  }
  removeEventListener(): void {}
  getSenders(): unknown[] {
    return [];
  }
  getConfiguration(): RTCConfiguration {
    return this.config;
  }
  setConfiguration(c: RTCConfiguration): void {
    this.config = c;
  }
  async createOffer(opts?: RTCOfferOptions): Promise<{ type: string; sdp: string }> {
    this.offers.push(opts);
    return {
      type: 'offer',
      sdp: `offer-${this.offers.length}\r\na=ice-ufrag:gen${this.offers.length}\r\n`,
    };
  }
  async setLocalDescription(d: { type: string; sdp?: string }): Promise<void> {
    if (d.type === 'rollback') {
      this.signalingState = 'stable';
      this.localDescription = null;
      return;
    }
    this.signalingState = 'have-local-offer';
    this.localDescription = { type: d.type, sdp: (d.sdp ?? '') + this.offerCandidates };
  }
  // What the new generation has gathered by the time its offer is set.
  offerCandidates = 'a=candidate:1 1 udp 1 10.0.0.2 9 typ host\r\n';
  gatherState(state: string): void {
    this.iceGatheringState = state;
    for (const h of this.handlers.icegatheringstatechange ?? []) h();
  }
  async setRemoteDescription(d: { type: string; sdp?: string }): Promise<void> {
    if (this.failNextAnswer) {
      this.failNextAnswer = false;
      throw new Error('bad answer');
    }
    this.remote.push(d);
    this.signalingState = 'stable';
  }
  setIce(state: string): void {
    this.iceConnectionState = state;
    for (const h of this.handlers.iceconnectionstatechange ?? []) h();
  }
  gathered(candidate: string | null, usernameFragment?: string): void {
    const evt = {
      candidate: candidate ? { candidate, sdpMid: '0', sdpMLineIndex: 0, usernameFragment } : null,
    };
    for (const h of (this.handlers.icecandidate ?? []) as unknown as ((e: unknown) => void)[])
      h(evt);
  }
  failNextAnswer = false;
  stats: Array<Record<string, unknown>> = [];
  async getStats(): Promise<{ forEach: (cb: (s: Record<string, unknown>) => void) => void }> {
    return { forEach: (cb) => this.stats.forEach(cb) };
  }
  close(): void {}
}

type Sent = { type: string; req_id?: string; call_id?: string; sdp?: string };

const flush = async () => {
  for (let i = 0; i < 10; i++) await Promise.resolve();
};

function makeCall(overrides: Partial<CallInit> = {}) {
  (globalThis as Record<string, unknown>).MediaStream = FakeMediaStream;
  (globalThis as Record<string, unknown>).RTCPeerConnection = FakeRTCPeerConnection;
  const sent: Sent[] = [];
  const send = jest.fn((msg: Sent) => sent.push(msg));
  let seq = 0;
  const call = new Call({
    id: 'call_1',
    // Inbound so capture can be deferred: these tests never touch the mic.
    direction: 'inbound',
    from: '',
    fromName: null,
    to: '100',
    initialState: 'active',
    transport: { send, sendOrQueue: send, trySend: send, trySendOrQueue: send } as never,
    iceServers: [],
    startConsult: jest.fn(),
    nextReqId: () => `req_${++seq}`,
    deferInboundCapture: true,
    ...overrides,
  });
  return { call, sent, pc: FakeRTCPeerConnection.last };
}

const offers = (sent: Sent[]) => sent.filter((m) => m.type === 'sdp.offer');

beforeEach(() => jest.useFakeTimers());
afterEach(() => jest.useRealTimers());

describe('ICE restart', () => {
  it('restarts with fresh ICE servers when ICE fails, and applies the answer', async () => {
    const turn = [{ urls: 'turn:new.example', username: 'u', credential: 'c' }];
    const { call, sent, pc } = makeCall({ refreshIceServers: async () => turn });

    pc.setIce('failed');
    await flush();

    expect(pc.config.iceServers).toEqual(turn);
    expect(pc.offers).toEqual([{ iceRestart: true }]);
    expect(offers(sent)).toEqual([
      {
        type: 'sdp.offer',
        req_id: 'req_1',
        call_id: 'call_1',
        sdp: 'offer-1\r\na=ice-ufrag:gen1\r\na=candidate:1 1 udp 1 10.0.0.2 9 typ host\r\n',
      },
    ]);

    await call.acceptRemoteAnswer('answer-1');
    expect(pc.remote).toEqual([{ type: 'answer', sdp: 'answer-1' }]);
    expect(call.state).toBe('active');
  });

  it('waits out a short disconnect, then restarts and probes the socket', async () => {
    const onIceTrouble = jest.fn();
    const { sent, pc } = makeCall({ onIceTrouble });

    pc.setIce('disconnected');
    expect(onIceTrouble).toHaveBeenCalledTimes(1);
    jest.advanceTimersByTime(1_000);
    pc.setIce('connected');
    jest.advanceTimersByTime(5_000);
    await flush();
    expect(offers(sent)).toHaveLength(0);

    pc.setIce('disconnected');
    jest.advanceTimersByTime(2_000);
    await flush();
    expect(offers(sent)).toHaveLength(1);
  });

  it('runs one restart at a time', async () => {
    const { call, sent, pc } = makeCall();
    pc.setIce('failed');
    await flush();
    call.restartIce();
    await flush();
    expect(offers(sent)).toHaveLength(1);
  });

  it('rolls back when the server refuses the restart, so a later one can run', async () => {
    const { call, sent, pc } = makeCall();
    call.restartIce();
    await flush();
    call.handleActionError(offers(sent)[0]!.req_id!);
    await flush();
    expect(pc.signalingState).toBe('stable');

    call.restartIce();
    await flush();
    expect(offers(sent)).toHaveLength(2);
  });

  it('waits for the resume while the call is suspended', async () => {
    const { call, sent, pc } = makeCall();
    call.suspend();
    pc.setIce('failed');
    await flush();
    expect(offers(sent)).toHaveLength(0);

    call.restore({
      type: 'call.restored',
      call_id: 'call_1',
      state: 'active',
      muted: false,
      from: '',
      to: '100',
      direction: 'inbound',
      answered_at: '2026-10-31T12:00:00Z',
    });
    await flush();
    expect(offers(sent)).toHaveLength(1);
  });

  it('does nothing for a call that is not connected', async () => {
    const { call, sent } = makeCall({ initialState: 'ringing' });
    call.restartIce();
    await flush();
    expect(offers(sent)).toHaveLength(0);
  });

  it("keeps the restart's candidates out of the way until its offer has gone", async () => {
    const { call, sent } = makeCall();
    const pc = FakeRTCPeerConnection.last;
    pc.iceGatheringState = 'gathering';
    call.restartIce();
    await flush();
    // Gathered before the offer is sent: they are in the offer.
    pc.gathered('candidate:1 1 udp 1 10.0.0.2 9 typ host');
    pc.gathered(null);
    pc.gatherState('complete');
    await flush();

    expect(sent.map((m) => m.type)).toEqual(['sdp.offer', 'ice.done']);

    // After the offer, candidates trickle as usual.
    pc.gathered('candidate:2 1 udp 1 10.0.0.3 9 typ srflx');
    expect(sent[sent.length - 1]!.type).toBe('ice.candidate');
  });

  it('does not end the new generation on the end of candidates of the one it replaces', async () => {
    let refreshed!: (s: RTCIceServer[]) => void;
    const { call, sent, pc } = makeCall({
      refreshIceServers: () => new Promise((r) => (refreshed = r)),
    });
    pc.iceGatheringState = 'gathering';
    call.restartIce();
    // The old generation (or setConfiguration) finishes while the TURN
    // credentials are being fetched.
    pc.gathered(null);
    refreshed([]);
    await flush();
    pc.gathered('candidate:1 1 udp 1 10.0.0.2 9 typ host');
    await flush();
    expect(sent.map((m) => m.type)).toEqual(['sdp.offer']);

    // The rest of the new generation still reaches the gateway, and only then
    // the end of candidates.
    pc.gathered('candidate:2 1 udp 1 203.0.113.9 9 typ srflx');
    pc.gathered('candidate:3 1 udp 1 198.51.100.4 9 typ relay');
    pc.gathered(null);
    expect(sent.map((m) => m.type)).toEqual([
      'sdp.offer',
      'ice.candidate',
      'ice.candidate',
      'ice.done',
    ]);
  });

  it("ignores the old generation's events delivered after the restart offer is set", async () => {
    const { call, sent, pc } = makeCall();
    pc.iceGatheringState = 'gathering';
    call.restartIce();
    await flush();

    // Late from the generation being replaced: neither its end of candidates
    // nor its candidates may reach the gateway as the new one's.
    pc.gathered(null);
    pc.gathered('candidate:9 1 udp 1 192.0.2.1 9 typ relay', 'gen0');
    pc.gathered('candidate:1 1 udp 1 10.0.0.2 9 typ host', 'gen1');
    await flush();
    expect(sent.map((m) => m.type)).toEqual(['sdp.offer']);

    pc.gathered('candidate:8 1 udp 1 192.0.2.1 9 typ relay', 'gen0');
    pc.gathered(null);
    expect(sent.map((m) => m.type)).toEqual(['sdp.offer', 'ice.done']);
  });

  it("holds the offer when gathering still reads the old generation's complete", async () => {
    const { call, sent, pc } = makeCall();
    pc.offerCandidates = '';
    call.restartIce();
    await flush();
    jest.advanceTimersByTime(2_000);
    await flush();
    expect(offers(sent)).toHaveLength(0);

    pc.localDescription!.sdp += 'a=candidate:1 1 udp 1 10.0.0.2 9 typ host\r\n';
    pc.gathered('candidate:1 1 udp 1 10.0.0.2 9 typ host');
    await flush();
    expect(offers(sent)).toHaveLength(1);
    expect(offers(sent)[0]!.sdp).toContain('a=candidate:');
  });

  it('waits for a complete set when the far end has not advertised trickle', async () => {
    const { call, sent, pc } = makeCall();
    pc.remoteDescription = { type: 'answer', sdp: '' };
    pc.iceGatheringState = 'gathering';
    call.restartIce();
    await flush();
    pc.gathered('candidate:1 1 udp 1 10.0.0.2 9 typ host', 'gen1');
    await flush();
    expect(offers(sent)).toHaveLength(0);

    pc.gatherState('complete');
    await flush();
    expect(offers(sent)).toHaveLength(1);
  });

  it("holds the offer through the old generation's complete delivered late", async () => {
    const { call, sent, pc } = makeCall();
    pc.offerCandidates = '';
    pc.iceGatheringState = 'gathering';
    call.restartIce();
    await flush();
    pc.gatherState('complete');
    await flush();
    expect(offers(sent)).toHaveLength(0);

    pc.localDescription!.sdp += 'a=candidate:1 1 udp 1 10.0.0.2 9 typ host\r\n';
    pc.gathered('candidate:1 1 udp 1 10.0.0.2 9 typ host');
    await flush();
    expect(offers(sent)).toHaveLength(1);
  });

  it('fails a restart whose new generation never gathers a candidate', async () => {
    const { call, sent, pc } = makeCall();
    pc.offerCandidates = '';
    pc.iceGatheringState = 'gathering';
    call.restartIce();
    await flush();
    pc.gatherState('complete');
    jest.advanceTimersByTime(15_000);
    await flush();
    expect(offers(sent)).toHaveLength(0);
    // Rolled back for a retry rather than left half-done.
    expect(pc.signalingState).toBe('stable');
  });

  it('starts over when the session resumes with a restart unanswered', async () => {
    const { call, sent, pc } = makeCall();
    call.restartIce();
    await flush();
    call.suspend();
    pc.setIce('failed');

    call.restore({
      type: 'call.restored',
      call_id: 'call_1',
      state: 'active',
      muted: false,
      from: '',
      to: '100',
      direction: 'inbound',
      answered_at: '2026-10-31T12:00:00Z',
    });
    await flush();

    const restartOffers = offers(sent);
    expect(restartOffers).toHaveLength(2);
    expect(restartOffers[1]!.req_id).not.toBe(restartOffers[0]!.req_id);
  });

  it('gives up on an unanswered restart and retries while media is down', async () => {
    const { sent, pc } = makeCall();
    pc.setIce('failed');
    await flush();
    expect(offers(sent)).toHaveLength(1);

    jest.advanceTimersByTime(15_000);
    expect(pc.signalingState).toBe('stable');
    jest.advanceTimersByTime(2_000);
    await flush();
    expect(offers(sent)).toHaveLength(2);
  });

  it('rolls back and retries when the answer cannot be applied', async () => {
    const { call, sent, pc } = makeCall();
    pc.setIce('failed');
    await flush();
    pc.failNextAnswer = true;

    await expect(call.acceptRemoteAnswer('bad')).rejects.toThrow('bad answer');
    expect(pc.signalingState).toBe('stable');

    jest.advanceTimersByTime(2_000);
    await flush();
    expect(offers(sent)).toHaveLength(2);
  });

  it('stops retrying after three attempts', async () => {
    const { sent, pc } = makeCall();
    pc.setIce('failed');
    await flush();
    for (let i = 0; i < 6; i++) {
      jest.advanceTimersByTime(15_000);
      await flush();
      jest.advanceTimersByTime(20_000);
      await flush();
    }
    expect(offers(sent)).toHaveLength(4);
  });

  it('reports the nominated pair once ICE connects, and again after a restart', async () => {
    const { call, sent, pc } = makeCall();
    pc.localDescription = { type: 'answer', sdp: 'v=0\r\na=ice-ufrag:gen0\r\n' };
    pc.stats = [
      { id: 'T', type: 'transport', selectedCandidatePairId: 'P' },
      { id: 'P', type: 'candidate-pair', localCandidateId: 'L', remoteCandidateId: 'R' },
      {
        id: 'L',
        type: 'local-candidate',
        foundation: '2',
        protocol: 'udp',
        priority: 1686052607,
        address: '203.0.113.7',
        port: 50001,
        candidateType: 'srflx',
      },
      {
        id: 'R',
        type: 'remote-candidate',
        foundation: '9',
        protocol: 'udp',
        priority: 2130706431,
        address: '198.51.100.4',
        port: 10000,
        candidateType: 'host',
      },
    ];
    pc.setIce('connected');
    await flush();
    pc.setIce('completed');
    await flush();

    // A restart onto a new network: nothing is reported while it is in
    // flight, then the new generation's pair is.
    pc.setIce('failed');
    await flush();
    const local = pc.stats.find((st) => st.id === 'L')!;
    Object.assign(local, { address: '198.51.100.20', port: 40000, candidateType: 'host' });
    pc.setIce('connected');
    await flush();
    await call.acceptRemoteAnswer('answer');
    pc.setIce('completed');
    await flush();

    const reports = sent.filter((m) => m.type === 'ice.selected');
    expect(reports).toEqual([
      {
        type: 'ice.selected',
        call_id: 'call_1',
        local: 'candidate:2 1 udp 1686052607 203.0.113.7 50001 typ srflx',
        remote: 'candidate:9 1 udp 2130706431 198.51.100.4 10000 typ host',
        ufrag: 'gen0',
      },
      {
        type: 'ice.selected',
        call_id: 'call_1',
        local: 'candidate:2 1 udp 1686052607 198.51.100.20 40000 typ host',
        remote: 'candidate:9 1 udp 2130706431 198.51.100.4 10000 typ host',
        ufrag: 'gen1',
      },
    ]);
  });
});
