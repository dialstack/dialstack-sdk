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

  addEventListener(): void {}

  setRemoteDescription(desc: { type: string }): Promise<void> {
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
