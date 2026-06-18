import { Call, type CallInit } from '../call';

// Regression coverage for the inbound-answer media direction. The browser
// auto-creates a track-less sender for each offered m-line at
// setRemoteDescription(offer) time, so the local mic must still be attached
// before createAnswer — otherwise the answer is a=recvonly and the far end
// hears nothing (one-way "browser-to-phone audio does not go through").

class FakeTrack {
  kind = 'audio';
}

class FakeMediaStream {
  private tracks: FakeTrack[] = [];
  addTrack(t: FakeTrack): void {
    this.tracks.push(t);
  }
  getTracks(): FakeTrack[] {
    return this.tracks;
  }
}

type FakeSender = { track: FakeTrack | null; dtmf: unknown };

// Models the relevant slice of RTCPeerConnection: setRemoteDescription(offer)
// materializes a track-less sender (as browsers do), and addTrack reuses that
// free sender rather than appending a new one (WebRTC spec behavior).
class FakeRTCPeerConnection {
  senders: FakeSender[] = [];
  localDescription: { type: string; sdp: string } | null = null;
  iceGatheringState = 'complete';
  remoteDescriptions: { type: string; sdp: string }[] = [];
  iceAdded = 0;

  addEventListener(): void {}

  setRemoteDescription(desc: { type: string; sdp?: string }): Promise<void> {
    this.remoteDescriptions.push({ type: desc.type, sdp: desc.sdp ?? '' });
    if (desc.type === 'offer') this.senders.push({ track: null, dtmf: null });
    return Promise.resolve();
  }
  getSenders(): FakeSender[] {
    return this.senders;
  }
  addTrack(track: FakeTrack): FakeSender {
    const free = this.senders.find((s) => !s.track);
    if (free) {
      free.track = track;
      free.dtmf = {};
      return free;
    }
    const s: FakeSender = { track, dtmf: {} };
    this.senders.push(s);
    return s;
  }
  createAnswer(): Promise<RTCSessionDescriptionInit> {
    return Promise.resolve({ type: 'answer', sdp: 'fake-answer-sdp' });
  }
  setLocalDescription(d: RTCSessionDescriptionInit): Promise<void> {
    this.localDescription = { type: d.type as string, sdp: d.sdp ?? '' };
    return Promise.resolve();
  }
  addIceCandidate(): Promise<void> {
    this.iceAdded++;
    return Promise.resolve();
  }
}

function makeInit(): CallInit {
  return {
    id: 'call_test',
    direction: 'inbound',
    from: '+17373518737',
    fromName: null,
    to: 'user_test-wrtc',
    initialState: 'ringing',
    transport: { send: jest.fn() } as never,
    iceServers: [],
    startConsult: jest.fn(),
  };
}

describe('Call.prepareAnswerForOffer media direction', () => {
  beforeEach(() => {
    (globalThis as Record<string, unknown>).RTCPeerConnection = FakeRTCPeerConnection;
    (globalThis as Record<string, unknown>).MediaStream = FakeMediaStream;
    // getUserMedia must surface a real audio track for the Call to attach.
    Object.defineProperty(globalThis, 'navigator', {
      value: {
        mediaDevices: {
          getUserMedia: async () => {
            const s = new FakeMediaStream();
            s.addTrack(new FakeTrack());
            return s;
          },
        },
      },
      configurable: true,
    });
  });

  it('attaches the local mic so the answer is sendable, not recvonly', async () => {
    const call = new Call(makeInit());
    await call.prepareAnswerForOffer('fake-offer-sdp');

    const sendingAudio = (call.peerConnection as unknown as FakeRTCPeerConnection)
      .getSenders()
      .filter((s) => s.track && s.track.kind === 'audio');
    // Exactly one sender carries the mic track — the answer offers to send
    // audio. Before the fix, the track-less sender from setRemoteDescription
    // made getSenders().length !== 0, addTrack was skipped, and this was 0.
    expect(sendingAudio).toHaveLength(1);
  });
});

// Network early media: the carrier's 183 SDP is applied as a JSEP provisional
// answer (type:'pranswer'); the final 200 OK answer (type:'answer') replaces
// it. The two may differ, so the final answer must NOT be blocked or skipped.
describe('Call early-media provisional answer', () => {
  beforeEach(() => {
    (globalThis as Record<string, unknown>).RTCPeerConnection = FakeRTCPeerConnection;
    (globalThis as Record<string, unknown>).MediaStream = FakeMediaStream;
  });

  function outboundInit(): CallInit {
    return { ...makeInit(), direction: 'outbound', initialState: 'trying' };
  }

  it('applies pranswer then a superseding final answer, in order', async () => {
    const call = new Call(outboundInit());
    const pc = call.peerConnection as unknown as FakeRTCPeerConnection;

    await call.acceptRemoteProvisionalAnswer('early-media-sdp');
    await call.acceptRemoteAnswer('final-answer-sdp');

    expect(pc.remoteDescriptions).toEqual([
      { type: 'pranswer', sdp: 'early-media-sdp' },
      { type: 'answer', sdp: 'final-answer-sdp' },
    ]);
  });

  it('applies multiple pranswers then the final answer, in arrival order', async () => {
    // The server forwards every SDP-bearing 18x as its own sdp.pranswer. The
    // browser's operations chain serializes the setRemoteDescription calls, so
    // they apply FIFO in the order the WS handler dispatched them.
    const call = new Call(outboundInit());
    const pc = call.peerConnection as unknown as FakeRTCPeerConnection;

    await call.acceptRemoteProvisionalAnswer('pranswer-1');
    await call.acceptRemoteProvisionalAnswer('pranswer-2');
    await call.acceptRemoteAnswer('final');

    expect(pc.remoteDescriptions).toEqual([
      { type: 'pranswer', sdp: 'pranswer-1' },
      { type: 'pranswer', sdp: 'pranswer-2' },
      { type: 'answer', sdp: 'final' },
    ]);
  });

  it('flushes ICE candidates buffered before the provisional answer', async () => {
    const call = new Call(outboundInit());
    const pc = call.peerConnection as unknown as FakeRTCPeerConnection;

    // A candidate that arrives before any remote description is buffered.
    await call.addRemoteCandidate('candidate:1', null, 0);
    expect(pc.iceAdded).toBe(0);

    // The provisional answer is a remote description → buffered candidate flushes.
    await call.acceptRemoteProvisionalAnswer('early-media-sdp');
    expect(pc.iceAdded).toBe(1);
  });
});
