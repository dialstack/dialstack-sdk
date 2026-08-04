import { Call, type CallInit } from '../call';
import { resetPranswerSupportForTests } from '../platform';

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

// Models a remote audio MediaStreamTrack for ringback arbitration: it arrives
// `muted` (negotiated, no RTP yet) and fires `unmute` when packets start, which
// is the real-media signal the Call suppresses on. `flow()` simulates RTP start.
class FakeRemoteAudioTrack {
  kind = 'audio';
  private unmuteHandlers: Array<() => void> = [];
  constructor(public muted = true) {}
  addEventListener(type: string, handler: () => void): void {
    if (type === 'unmute') this.unmuteHandlers.push(handler);
  }
  flow(): void {
    this.muted = false;
    this.unmuteHandlers.splice(0).forEach((h) => h());
  }
}

// Build a remote 'track' event carrying an audio track (muted by default).
function trackEvent(track: FakeRemoteAudioTrack): unknown {
  return { track, streams: [new FakeMediaStream()] };
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
  private listeners: Record<string, Array<(evt: unknown) => void>> = {};

  addEventListener(type: string, handler: (evt: unknown) => void): void {
    (this.listeners[type] ??= []).push(handler);
  }
  // Test hook: fire a wired event (e.g. an inbound remote 'track').
  emit(type: string, evt: unknown): void {
    this.listeners[type]?.forEach((h) => h(evt));
  }

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
  createOffer(): Promise<RTCSessionDescriptionInit> {
    return Promise.resolve({ type: 'offer', sdp: 'fake-offer-sdp' });
  }
  addTransceiver(): void {}
  close(): void {}
  setLocalDescription(d: RTCSessionDescriptionInit): Promise<void> {
    this.localDescription = { type: d.type as string, sdp: d.sdp ?? '' };
    return Promise.resolve();
  }
  addIceCandidate(): Promise<void> {
    this.iceAdded++;
    return Promise.resolve();
  }
}

// Enforces the signaling-state precondition webrtc-pc puts on a REMOTE pranswer:
// legal only from have-local-offer (or have-remote-pranswer), NOT from
// have-remote-offer. Without this, a probe that applies the pranswer in the wrong
// state passes here while real Chrome rejects it with InvalidStateError — which is
// exactly the bug that made supportsPranswer() report false on Chrome.
class StatefulRTCPeerConnection extends FakeRTCPeerConnection {
  signalingState = 'stable';

  setLocalDescription(d: RTCSessionDescriptionInit): Promise<void> {
    if (d.type === 'offer') this.signalingState = 'have-local-offer';
    return super.setLocalDescription(d);
  }

  setRemoteDescription(desc: { type: string; sdp?: string }): Promise<void> {
    if (desc.type === 'offer') {
      this.signalingState = 'have-remote-offer';
      return super.setRemoteDescription(desc);
    }
    if (desc.type === 'pranswer' || desc.type === 'answer') {
      if (
        this.signalingState !== 'have-local-offer' &&
        this.signalingState !== 'have-remote-pranswer'
      ) {
        return Promise.reject(
          Object.assign(
            new Error(
              `Failed to set remote ${desc.type} sdp: Called in wrong state: ${this.signalingState}`
            ),
            { name: 'InvalidStateError' }
          )
        );
      }
      this.signalingState = desc.type === 'pranswer' ? 'have-remote-pranswer' : 'stable';
    }
    return super.setRemoteDescription(desc);
  }
}

// Models Firefox: a pranswer applied from a LEGAL state is still refused, because
// Firefox has never implemented it ("pranswer not yet implemented", Mozilla bug
// 1004510). Extends the stateful fake so an illegal-state probe is rejected for
// the state reason instead — letting the tests tell the two failures apart.
class FirefoxRTCPeerConnection extends StatefulRTCPeerConnection {
  setRemoteDescription(desc: { type: string; sdp?: string }): Promise<void> {
    if (desc.type === 'pranswer' && this.signalingState === 'have-local-offer') {
      return Promise.reject(
        Object.assign(new Error('pranswer not yet implemented'), { name: 'NotSupportedError' })
      );
    }
    return super.setRemoteDescription(desc);
  }
}

// Puts the Call's peer connection into have-local-offer, the state a real
// outbound call is in when a pranswer/answer arrives (startOutbound has done
// createOffer + setLocalDescription). Required by StatefulRTCPeerConnection, which
// enforces that precondition; harmless on the permissive fake.
async function withLocalOffer(call: Call): Promise<void> {
  const pc = call.peerConnection;
  await pc.setLocalDescription(await pc.createOffer());
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

// canSendDtmf reflects whether the audio sender exposes an RTCDTMFSender.
// Browsers do; on React Native the app resolves react-native-webrtc to a fork
// that adds `RTCRtpSender.dtmf`, so it does there too. A sender with no `.dtmf`
// (attachDtmfSender collapses `sender?.dtmf ?? null` to null) makes it false.
// The softphone UI gates its in-call keypad on this.
describe('Call.canSendDtmf', () => {
  beforeEach(() => {
    (globalThis as Record<string, unknown>).MediaStream = FakeMediaStream;
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

  it('is false before negotiation (no sender attached yet)', () => {
    (globalThis as Record<string, unknown>).RTCPeerConnection = FakeRTCPeerConnection;
    const call = new Call(makeInit());
    expect(call.canSendDtmf).toBe(false);
  });

  it('is true once active when the audio sender has a DTMF sender (browser)', async () => {
    (globalThis as Record<string, unknown>).RTCPeerConnection = FakeRTCPeerConnection;
    const call = new Call(makeInit());
    await call.prepareAnswerForOffer('fake-offer-sdp');
    expect(call.canSendDtmf).toBe(true);
  });

  it('is false when the audio sender exposes no .dtmf', async () => {
    // Model a sender whose `.dtmf` is undefined (e.g. stock react-native-webrtc
    // without the DTMF-bridge fork), which attachDtmfSender's `sender?.dtmf ??
    // null` collapses to null → keypad hidden rather than throwing on every tap.
    class NoDtmfPeerConnection extends FakeRTCPeerConnection {
      addTrack(track: FakeTrack): FakeSender {
        const s = super.addTrack(track);
        s.dtmf = undefined;
        return s;
      }
    }
    (globalThis as Record<string, unknown>).RTCPeerConnection = NoDtmfPeerConnection;
    const call = new Call(makeInit());
    await call.prepareAnswerForOffer('fake-offer-sdp');
    expect(call.canSendDtmf).toBe(false);
  });
});

// Network early media: the carrier's 183 SDP is applied as a JSEP provisional
// answer (type:'pranswer'); the final 200 OK answer (type:'answer') replaces
// it. The two may differ, so the final answer must NOT be blocked or skipped.
describe('Call early-media provisional answer', () => {
  beforeEach(() => {
    (globalThis as Record<string, unknown>).RTCPeerConnection = FakeRTCPeerConnection;
    (globalThis as Record<string, unknown>).MediaStream = FakeMediaStream;
    resetPranswerSupportForTests();
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

  it('reports the provisional answer as applied on a supporting stack', async () => {
    const call = new Call(outboundInit());
    await expect(call.acceptRemoteProvisionalAnswer('early-media-sdp')).resolves.toBe(true);
  });

  // Regression: the probe must apply its test pranswer from have-local-offer.
  // An earlier version fed its own offer back as the REMOTE description, landing
  // in have-remote-offer where a remote pranswer is an illegal transition — real
  // Chrome rejected it with InvalidStateError and the probe misread that as "no
  // pranswer support", silently disabling early media on every supporting browser.
  // StatefulRTCPeerConnection enforces that precondition, so a regression here
  // makes this assertion fail rather than passing against a permissive fake.
  it('detects support on a spec-accurate stack that enforces signaling state', async () => {
    (globalThis as Record<string, unknown>).RTCPeerConnection = StatefulRTCPeerConnection;
    resetPranswerSupportForTests();

    const call = new Call(outboundInit());
    const pc = call.peerConnection as unknown as FakeRTCPeerConnection;
    await withLocalOffer(call);

    await expect(call.acceptRemoteProvisionalAnswer('early-media-sdp')).resolves.toBe(true);
    expect(pc.remoteDescriptions).toEqual([{ type: 'pranswer', sdp: 'early-media-sdp' }]);
  });
});

// Firefox has never implemented JSEP provisional answers (Mozilla bug 1004510):
// setRemoteDescription({type:'pranswer'}) rejects with "pranswer not yet
// implemented". Network early media is therefore unavailable there, but the CALL
// must still work — it proceeds on the 200 OK's final answer. Before the fix, the
// rejection surfaced as a 'call_failed' error and painted "Call failed" over a
// perfectly healthy connecting call.
describe('Call early-media on a stack without pranswer support (Firefox)', () => {
  beforeEach(() => {
    (globalThis as Record<string, unknown>).RTCPeerConnection = FirefoxRTCPeerConnection;
    (globalThis as Record<string, unknown>).MediaStream = FakeMediaStream;
    resetPranswerSupportForTests();
  });

  function outboundInit(): CallInit {
    return { ...makeInit(), direction: 'outbound', initialState: 'trying' };
  }

  it('skips the provisional answer instead of rejecting', async () => {
    const call = new Call(outboundInit());
    // Resolves false (skipped) rather than throwing — the caller must not treat
    // this as a call failure.
    await expect(call.acceptRemoteProvisionalAnswer('early-media-sdp')).resolves.toBe(false);
  });

  it('never applies a pranswer description to the peer connection', async () => {
    const call = new Call(outboundInit());
    const pc = call.peerConnection as unknown as FakeRTCPeerConnection;

    await call.acceptRemoteProvisionalAnswer('early-media-sdp');

    expect(pc.remoteDescriptions).toEqual([]);
  });

  it('still applies the final answer after a skipped provisional', async () => {
    // The whole point: the call connects normally on the 200 OK.
    const call = new Call(outboundInit());
    const pc = call.peerConnection as unknown as FakeRTCPeerConnection;
    await withLocalOffer(call);

    await call.acceptRemoteProvisionalAnswer('early-media-sdp');
    await call.acceptRemoteAnswer('final-answer-sdp');

    expect(pc.remoteDescriptions).toEqual([{ type: 'answer', sdp: 'final-answer-sdp' }]);
  });

  it('keeps ICE candidates buffered until the final answer, not lost', async () => {
    // A skipped pranswer sets no remote description, so candidates must stay
    // buffered — flushing them early would throw inside addIceCandidate.
    const call = new Call(outboundInit());
    const pc = call.peerConnection as unknown as FakeRTCPeerConnection;
    await withLocalOffer(call);

    await call.addRemoteCandidate('candidate:1', null, 0);
    await call.acceptRemoteProvisionalAnswer('early-media-sdp');
    expect(pc.iceAdded).toBe(0);

    // The final answer IS a remote description → the buffered candidate flushes.
    await call.acceptRemoteAnswer('final-answer-sdp');
    expect(pc.iceAdded).toBe(1);
  });

  it('substitutes local ringback for the early media it cannot render', async () => {
    // A 183-only call emits no call.ringing (no 180), so without this the caller
    // would hear dead air from dial to pickup on Firefox.
    const call = new Call(outboundInit());
    const ringback = withRingbackStub(call);

    await call.acceptRemoteProvisionalAnswer('early-media-sdp');

    expect(ringback.starts).toBe(1);
    expect(ringback.isPlaying).toBe(true);
  });

  it('does not start ringback once real remote audio is already flowing', async () => {
    const call = new Call(outboundInit());
    const ringback = withRingbackStub(call);
    const pc = call.peerConnection as unknown as FakeRTCPeerConnection;

    pc.emit('track', trackEvent(new FakeRemoteAudioTrack(false)));
    await call.acceptRemoteProvisionalAnswer('early-media-sdp');

    expect(ringback.starts).toBe(0);
  });

  it('does not start ringback after the call has ended', async () => {
    const call = new Call(outboundInit());
    const ringback = withRingbackStub(call);

    call.handleServerMessage({
      type: 'call.ended',
      call_id: call.id,
      reason: 'no-answer',
      duration_seconds: null,
    });
    await call.acceptRemoteProvisionalAnswer('early-media-sdp');

    expect(ringback.starts).toBe(0);
    expect(ringback.isPlaying).toBe(false);
  });
});

// Stubs only the audio boundary; Call's start/stop arbitration is the code
// under test. Idempotent to mirror the real RingbackTone.
class RingbackStub {
  starts = 0;
  stops = 0;
  playing = false;
  start(): void {
    if (this.playing) return;
    this.starts += 1;
    this.playing = true;
  }
  stop(): void {
    if (this.playing) this.stops += 1;
    this.playing = false;
  }
  get isPlaying(): boolean {
    return this.playing;
  }
}

function makeOutboundInit(): CallInit {
  return { ...makeInit(), direction: 'outbound', initialState: 'trying' };
}

function withRingbackStub(call: Call): RingbackStub {
  const stub = new RingbackStub();
  (call as unknown as { ringback: RingbackStub }).ringback = stub;
  return stub;
}

describe('Call local ringback arbitration', () => {
  beforeEach(() => {
    (globalThis as Record<string, unknown>).RTCPeerConnection = FakeRTCPeerConnection;
    (globalThis as Record<string, unknown>).MediaStream = FakeMediaStream;
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

  it('starts the tone on ringing when no early media is present', () => {
    const call = new Call(makeOutboundInit());
    const ringback = withRingbackStub(call);

    call.handleServerMessage({ type: 'call.ringing', call_id: call.id });

    expect(ringback.starts).toBe(1);
    expect(ringback.isPlaying).toBe(true);
  });

  it('does not start the tone for inbound calls', () => {
    const call = new Call(makeInit());
    const ringback = withRingbackStub(call);

    call.handleServerMessage({ type: 'call.ringing', call_id: call.id });

    expect(ringback.starts).toBe(0);
    expect(ringback.isPlaying).toBe(false);
  });

  it('starts the tone once across duplicate ringing frames', () => {
    const call = new Call(makeOutboundInit());
    const ringback = withRingbackStub(call);

    call.handleServerMessage({ type: 'call.ringing', call_id: call.id });
    call.handleServerMessage({ type: 'call.ringing', call_id: call.id });

    expect(ringback.starts).toBe(1);
    expect(ringback.isPlaying).toBe(true);
  });

  it('stops the tone on answered', () => {
    const call = new Call(makeOutboundInit());
    const ringback = withRingbackStub(call);

    call.handleServerMessage({ type: 'call.ringing', call_id: call.id });
    call.handleServerMessage({ type: 'call.answered', call_id: call.id });

    expect(ringback.isPlaying).toBe(false);
    expect(ringback.stops).toBe(1);
  });

  it('stops the tone on ended', () => {
    const call = new Call(makeOutboundInit());
    const ringback = withRingbackStub(call);

    call.handleServerMessage({ type: 'call.ringing', call_id: call.id });
    call.handleServerMessage({
      type: 'call.ended',
      call_id: call.id,
      reason: 'no-answer',
      duration_seconds: null,
    });

    expect(ringback.isPlaying).toBe(false);
    expect(ringback.stops).toBe(1);
  });

  it('keeps ringing while early media is only negotiated (track muted, no RTP)', () => {
    // The carrier negotiated early media (track arrives) but sends no packets —
    // the track stays muted. Suppressing here would be dead air during alerting,
    // so the synthetic tone must keep playing.
    const call = new Call(makeOutboundInit());
    const ringback = withRingbackStub(call);
    const pc = call.peerConnection as unknown as FakeRTCPeerConnection;

    pc.emit('track', trackEvent(new FakeRemoteAudioTrack(true)));
    call.handleServerMessage({ type: 'call.ringing', call_id: call.id });

    expect(ringback.isPlaying).toBe(true);
  });

  it('stops the tone when the remote audio track unmutes (RTP starts) mid-ring', () => {
    const call = new Call(makeOutboundInit());
    const ringback = withRingbackStub(call);
    const pc = call.peerConnection as unknown as FakeRTCPeerConnection;

    const track = new FakeRemoteAudioTrack(true);
    pc.emit('track', trackEvent(track));
    call.handleServerMessage({ type: 'call.ringing', call_id: call.id });
    expect(ringback.isPlaying).toBe(true);

    track.flow(); // RTP starts → unmute

    expect(ringback.isPlaying).toBe(false);
    expect(ringback.stops).toBe(1);
  });

  it('does not start the tone when remote audio is already flowing before ringing', () => {
    const call = new Call(makeOutboundInit());
    const ringback = withRingbackStub(call);
    const pc = call.peerConnection as unknown as FakeRTCPeerConnection;

    // Track already unmuted at attach — media is flowing before the 180.
    pc.emit('track', trackEvent(new FakeRemoteAudioTrack(false)));
    call.handleServerMessage({ type: 'call.ringing', call_id: call.id });

    expect(ringback.starts).toBe(0);
    expect(ringback.isPlaying).toBe(false);
  });

  it('does not suppress on a provisional answer alone (no media yet)', async () => {
    // sdp.pranswer is signaling, not media. Applying it must NOT suppress — only
    // real received audio does.
    const call = new Call(makeOutboundInit());
    const ringback = withRingbackStub(call);

    await call.acceptRemoteProvisionalAnswer('early-media-sdp');
    call.handleServerMessage({ type: 'call.ringing', call_id: call.id });

    expect(ringback.isPlaying).toBe(true);
  });

  it('never starts a tone for a 183-only call (early media, no call.ringing)', async () => {
    // No alerting (180), so no call.ringing is emitted and no synthetic tone
    // starts — the forwarded early media is what's audible. Awaited rather than
    // fire-and-forget: acceptRemoteProvisionalAnswer awaits the capability probe,
    // so `void` would defer its work past these assertions and pass on timing
    // alone rather than on behaviour.
    const call = new Call(makeOutboundInit());
    const ringback = withRingbackStub(call);
    const pc = call.peerConnection as unknown as FakeRTCPeerConnection;

    await call.acceptRemoteProvisionalAnswer('early-media-sdp');
    pc.emit('track', trackEvent(new FakeRemoteAudioTrack(true)));

    expect(ringback.starts).toBe(0);
    expect(ringback.isPlaying).toBe(false);
  });

  it('does not restart the tone on a rogue ringing after answered', () => {
    const call = new Call(makeOutboundInit());
    const ringback = withRingbackStub(call);

    call.handleServerMessage({ type: 'call.ringing', call_id: call.id });
    call.handleServerMessage({ type: 'call.answered', call_id: call.id });
    // A late/duplicate 180 after the 200 OK must not bring the tone back.
    call.handleServerMessage({ type: 'call.ringing', call_id: call.id });

    expect(ringback.isPlaying).toBe(false);
    expect(ringback.starts).toBe(1);
  });

  it('does not restart the tone on a rogue ringing after ended', () => {
    const call = new Call(makeOutboundInit());
    const ringback = withRingbackStub(call);

    call.handleServerMessage({ type: 'call.ringing', call_id: call.id });
    call.handleServerMessage({
      type: 'call.ended',
      call_id: call.id,
      reason: 'no-answer',
      duration_seconds: null,
    });
    call.handleServerMessage({ type: 'call.ringing', call_id: call.id });

    expect(ringback.isPlaying).toBe(false);
    expect(ringback.starts).toBe(1);
  });

  it('stops the tone on dispose', () => {
    const call = new Call(makeOutboundInit());
    const ringback = withRingbackStub(call);

    call.handleServerMessage({ type: 'call.ringing', call_id: call.id });
    expect(ringback.isPlaying).toBe(true);

    call.dispose();

    expect(ringback.isPlaying).toBe(false);
    expect(ringback.stops).toBe(1);
  });
});

describe('Call transfer preconditions', () => {
  beforeEach(() => {
    (globalThis as Record<string, unknown>).MediaStream = FakeMediaStream;
    (globalThis as Record<string, unknown>).RTCPeerConnection = FakeRTCPeerConnection;
  });

  function makeCall(): Call {
    const send = jest.fn();
    const startConsult = jest.fn().mockResolvedValue({} as never);
    const call = new Call({ ...makeInit(), transport: { send } as never, startConsult });
    return call;
  }

  // A held call is a live, connected call — hold is a media modifier, not a
  // different lifecycle. Both active and held are transferable; the server keeps
  // a held call StateActive and re-asserts hold as step 1 of the attended flow.
  it('allows transfer + attendedTransfer on an active call', async () => {
    const call = makeCall();
    call.state = 'active';
    expect(() => call.transfer('+15550001111')).not.toThrow();
    await expect(call.attendedTransfer('+15550001111')).resolves.toBeDefined();
  });

  it('allows transfer + attendedTransfer on a HELD call', async () => {
    const call = makeCall();
    call.state = 'held';
    expect(() => call.transfer('+15550001111')).not.toThrow();
    await expect(call.attendedTransfer('+15550001111')).resolves.toBeDefined();
  });

  it('rejects transfer on a not-yet-connected or ended call', () => {
    for (const state of ['trying', 'ringing', 'ended'] as const) {
      const call = makeCall();
      call.state = state;
      expect(() => call.transfer('+15550001111')).toThrow(/connected call can be transferred/);
      expect(() => call.attendedTransfer('+15550001111')).toThrow(
        /connected call can be transferred/
      );
    }
  });

  // completeTransfer() is called on the ORIGINAL leg. It's usually held (you're
  // talking to the consult), but with switchable focus the user can switch BACK
  // to the original — making it active and the consult held — and still Complete.
  function makeCallCapturingSend() {
    const send = jest.fn();
    const call = new Call({
      ...makeInit(),
      transport: { send } as never,
      startConsult: jest.fn().mockResolvedValue({} as never),
    });
    return { call, send };
  }

  it('completeTransfer sends the complete frame when the original is HELD', () => {
    const { call, send } = makeCallCapturingSend();
    call.state = 'held';
    expect(() => call.completeTransfer()).not.toThrow();
    expect(send).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'call.transfer.attended', step: 'complete' })
    );
  });

  it('completeTransfer sends the complete frame when the original is ACTIVE (user switched back to it)', () => {
    const { call, send } = makeCallCapturingSend();
    call.state = 'active';
    expect(() => call.completeTransfer()).not.toThrow();
    expect(send).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'call.transfer.attended', step: 'complete' })
    );
  });

  it('completeTransfer rejects on a not-connected call', () => {
    for (const state of ['trying', 'ringing', 'ended'] as const) {
      const { call } = makeCallCapturingSend();
      call.state = state;
      expect(() => call.completeTransfer()).toThrow(/connected call/);
    }
  });

  // hold()/resume() are state-guarded so the multi-call auto-hold (which holds
  // the current call when the user answers a second one) can't send a frame for a
  // still-ringing outbound — the server would reject that with
  // `invalid_message: call is not active`, surfacing as a spurious "Call failed".
  it('hold() sends only when the call is active', () => {
    const { call, send } = makeCallCapturingSend();
    for (const state of ['trying', 'ringing', 'held', 'ended'] as const) {
      call.state = state;
      call.hold();
    }
    expect(send).not.toHaveBeenCalled();

    call.state = 'active';
    call.hold();
    expect(send).toHaveBeenCalledWith(expect.objectContaining({ type: 'call.hold' }));
    expect(send).toHaveBeenCalledTimes(1);
  });

  it('resume() sends only when the call is held', () => {
    const { call, send } = makeCallCapturingSend();
    for (const state of ['trying', 'ringing', 'active', 'ended'] as const) {
      call.state = state;
      call.resume();
    }
    expect(send).not.toHaveBeenCalled();

    call.state = 'held';
    call.resume();
    expect(send).toHaveBeenCalledWith(expect.objectContaining({ type: 'call.resume' }));
    expect(send).toHaveBeenCalledTimes(1);
  });
});
