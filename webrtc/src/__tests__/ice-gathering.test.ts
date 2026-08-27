import { Call, type CallInit } from '../call.js';

// Regression cover for the candidate-less offer bug.
//
// startOutbound used to release whatever localDescription held once a 2s cap
// fired, which on a slow gatherer meant an offer with credentials but no
// a=candidate lines. That is a legal trickle offer, but the far end reads it as
// "this peer does not do ICE", answers with no ICE block, and the browser can
// then never apply the answer — no media, and intermittent, because it is a
// race against gathering.

class FakeTrack {
  kind = 'audio';
  enabled = true;
  stop(): void {}
}

class FakeMediaStream {
  private tracks: FakeTrack[] = [];
  constructor(tracks: FakeTrack[] = []) {
    this.tracks = tracks;
  }
  getTracks(): FakeTrack[] {
    return this.tracks;
  }
  getAudioTracks(): FakeTrack[] {
    return this.tracks;
  }
  addTrack(t: FakeTrack): void {
    this.tracks.push(t);
  }
}

const OFFER_NO_CANDIDATES =
  'v=0\r\no=- 1 2 IN IP4 127.0.0.1\r\ns=-\r\nt=0 0\r\n' +
  'm=audio 9 UDP/TLS/RTP/SAVPF 111\r\nc=IN IP4 0.0.0.0\r\n' +
  'a=ice-ufrag:ikpp\r\na=ice-pwd:GLkLqeLTffrDqD47FFW947S/\r\n' +
  'a=ice-options:trickle\r\na=mid:0\r\n';

const OFFER_WITH_CANDIDATE =
  OFFER_NO_CANDIDATES + 'a=candidate:1 1 udp 2130706431 192.0.2.1 5000 typ host\r\n';

// Gathering is asynchronous and never completes on its own here, so the test
// controls exactly when a candidate appears.
class SlowGatheringPeerConnection {
  senders: Array<{ track: FakeTrack | null; dtmf: unknown }> = [];
  localDescription: { type: string; sdp: string } | null = null;
  iceGatheringState = 'gathering';
  private listeners: Record<string, Array<(evt: unknown) => void>> = {};

  addEventListener(type: string, handler: (evt: unknown) => void): void {
    (this.listeners[type] ??= []).push(handler);
  }
  removeEventListener(type: string, handler: (evt: unknown) => void): void {
    this.listeners[type] = (this.listeners[type] ?? []).filter((h) => h !== handler);
  }
  private emit(type: string, evt: unknown): void {
    [...(this.listeners[type] ?? [])].forEach((h) => h(evt));
  }

  /** A candidate arrives: it lands in the description and fires the event. */
  produceCandidate(): void {
    this.localDescription = { type: 'offer', sdp: OFFER_WITH_CANDIDATE };
    this.emit('icecandidate', {
      candidate: {
        candidate: 'candidate:1 1 udp 1 192.0.2.1 5000 typ host',
        sdpMid: '0',
        sdpMLineIndex: 0,
      },
    });
  }

  /** Gathering ends having produced nothing (no interfaces, everything blocked). */
  completeWithNothing(): void {
    this.iceGatheringState = 'complete';
    this.emit('icegatheringstatechange', {});
  }

  getSenders() {
    return this.senders;
  }
  addTrack(track: FakeTrack) {
    const s = { track, dtmf: {} };
    this.senders.push(s);
    return s;
  }
  createOffer(): Promise<RTCSessionDescriptionInit> {
    return Promise.resolve({ type: 'offer', sdp: OFFER_NO_CANDIDATES });
  }
  setLocalDescription(d: RTCSessionDescriptionInit): Promise<void> {
    this.localDescription = { type: d.type as string, sdp: d.sdp ?? '' };
    return Promise.resolve();
  }
  addTransceiver(): void {}
  close(): void {}
}

function outboundInit(): CallInit {
  return {
    id: 'call_test',
    direction: 'outbound',
    from: '+17373518737',
    fromName: null,
    to: 'user_test-wrtc',
    initialState: 'trying',
    transport: { send: jest.fn(), trySend: jest.fn() } as never,
    iceServers: [],
    startConsult: jest.fn(),
  };
}

describe('outbound offer ICE candidates', () => {
  beforeEach(() => {
    jest.useFakeTimers();
    (globalThis as Record<string, unknown>).RTCPeerConnection = SlowGatheringPeerConnection;
    (globalThis as Record<string, unknown>).MediaStream = FakeMediaStream;
    Object.defineProperty(globalThis, 'navigator', {
      value: {
        mediaDevices: { getUserMedia: async () => new FakeMediaStream([new FakeTrack()]) },
      },
      configurable: true,
    });
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('does not offer before a candidate exists, even once the cap fires', async () => {
    const call = new Call(outboundInit());
    const pc = call.peerConnection as unknown as SlowGatheringPeerConnection;

    let offer: RTCSessionDescriptionInit | undefined;
    const pending = call.startOutbound().then((o) => {
      offer = o;
    });

    // Blow well past the 2s cap with nothing gathered. The old behaviour
    // released here, producing the candidate-less offer that breaks the call.
    await jest.advanceTimersByTimeAsync(5000);
    expect(offer).toBeUndefined();

    pc.produceCandidate();
    await pending;

    expect(offer?.sdp).toContain('a=candidate:');
  });

  it('releases as soon as the first candidate arrives, without waiting for the cap', async () => {
    const call = new Call(outboundInit());
    const pc = call.peerConnection as unknown as SlowGatheringPeerConnection;

    const pending = call.startOutbound();
    await jest.advanceTimersByTimeAsync(10);
    pc.produceCandidate();

    const offer = await pending;
    expect(offer.sdp).toContain('a=candidate:');
  });

  it('rejects when the call ends before any candidate is gathered', async () => {
    // The wait past the cap is kept alive only by future ICE events, and a closed
    // peer connection fires none — so teardown has to settle it or call() hangs
    // forever with nothing to surface to the caller.
    const call = new Call(outboundInit());

    const pending = call.startOutbound();
    await jest.advanceTimersByTimeAsync(3000);
    call.handleServerMessage({ type: 'call.ended', call_id: 'call_test', reason: 'hangup' });

    await expect(pending).rejects.toThrow(/ended before any ICE candidate/);
  });

  it('rejects once the hard deadline passes with nothing gathered', async () => {
    // Neither a candidate nor a teardown ever arrives. Failing the setup beats
    // leaving the caller's promise dangling.
    const call = new Call(outboundInit());

    const pending = call.startOutbound();
    const assertion = expect(pending).rejects.toThrow(/produced no candidate/);
    await jest.advanceTimersByTimeAsync(20000);

    await assertion;
  });

  it('still returns when gathering genuinely completes empty', async () => {
    // Nothing more is coming, so continuing to wait would hang the call
    // outright — worse than an offer the far end may reject.
    const call = new Call(outboundInit());
    const pc = call.peerConnection as unknown as SlowGatheringPeerConnection;

    const pending = call.startOutbound();
    await jest.advanceTimersByTimeAsync(5000);
    pc.completeWithNothing();

    const offer = await pending;
    expect(offer.sdp).not.toContain('a=candidate:');
  });
});
