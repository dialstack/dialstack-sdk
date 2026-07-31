import { Call, type CallInit } from '../call';

class FakeTrack {
  kind = 'audio';
  enabled = true;
  stopped = false;
  readyState: 'live' | 'ended' = 'live';
  private endedHandlers: Array<() => void> = [];

  constructor(readonly deviceId: string | null = null) {}

  stop(): void {
    this.stopped = true;
    this.readyState = 'ended';
  }
  getSettings(): { deviceId?: string } {
    return this.deviceId ? { deviceId: this.deviceId } : {};
  }
  addEventListener(type: string, handler: () => void): void {
    if (type === 'ended') this.endedHandlers.push(handler);
  }
  /** Test hook: the device vanished out from under us. */
  end(): void {
    this.readyState = 'ended';
    this.endedHandlers.forEach((h) => h());
  }
}

class FakeMediaStream {
  private tracks: FakeTrack[] = [];
  addTrack(t: FakeTrack): void {
    this.tracks.push(t);
  }
  removeTrack(t: FakeTrack): void {
    const i = this.tracks.indexOf(t);
    if (i >= 0) this.tracks.splice(i, 1);
  }
  getTracks(): FakeTrack[] {
    return this.tracks;
  }
  getAudioTracks(): FakeTrack[] {
    return this.tracks.filter((t) => t.kind === 'audio');
  }
}

type FakeSender = {
  track: FakeTrack | null;
  dtmf: unknown;
  replaceTrack: (t: FakeTrack | null) => Promise<void>;
  /** Suspends replaceTrack until `gate` settles, to model the real await window. */
  blockReplaceTrack: (gate: Promise<void>) => void;
};

function makeSender(track: FakeTrack | null, dtmf: unknown): FakeSender {
  let gate: Promise<void> | null = null;
  const sender: FakeSender = {
    track,
    dtmf,
    replaceTrack: async (t) => {
      if (gate) await gate;
      sender.track = t;
    },
    blockReplaceTrack: (g) => {
      gate = g;
    },
  };
  return sender;
}

class FakeRTCPeerConnection {
  senders: FakeSender[] = [];
  localDescription: { type: string; sdp: string } | null = null;
  iceGatheringState = 'complete';
  closed = false;
  offersCreated = 0;
  answersCreated = 0;
  localDescriptionsSet = 0;
  private listeners: Record<string, Array<(evt: unknown) => void>> = {};

  addEventListener(type: string, handler: (evt: unknown) => void): void {
    (this.listeners[type] ??= []).push(handler);
  }
  setRemoteDescription(desc: { type: string }): Promise<void> {
    if (desc.type === 'offer') this.senders.push(makeSender(null, null));
    return Promise.resolve();
  }
  getSenders(): FakeSender[] {
    return this.senders;
  }
  addTrack(track: FakeTrack): FakeSender {
    const free = this.senders.find((s) => !s.track);
    if (free) {
      free.track = track;
      free.dtmf = { insertDTMF: jest.fn() };
      return free;
    }
    const s = makeSender(track, {});
    this.senders.push(s);
    return s;
  }
  createOffer(): Promise<RTCSessionDescriptionInit> {
    this.offersCreated++;
    return Promise.resolve({ type: 'offer', sdp: 'fake-offer-sdp' });
  }
  createAnswer(): Promise<RTCSessionDescriptionInit> {
    this.answersCreated++;
    return Promise.resolve({ type: 'answer', sdp: 'fake-answer-sdp' });
  }
  setLocalDescription(d: RTCSessionDescriptionInit): Promise<void> {
    this.localDescriptionsSet++;
    this.localDescription = { type: d.type as string, sdp: d.sdp ?? '' };
    return Promise.resolve();
  }
  addIceCandidate(): Promise<void> {
    return Promise.resolve();
  }
  close(): void {
    this.closed = true;
  }
  audioSender(): FakeSender | undefined {
    return this.senders.find((s) => s.track?.kind === 'audio');
  }
}

/**
 * Installs a scriptable `navigator.mediaDevices`. Records the constraints each
 * getUserMedia received (so a test can assert which device was requested) and can
 * make the next call reject with a DOMException-shaped `name`.
 *
 * Note `mediaDevices` stays a PLAIN OBJECT with no addEventListener — that's the
 * shape the production feature-guards must tolerate, so keeping it that way here is
 * deliberate coverage, not laziness.
 */
function installMediaDevices() {
  const constraintsSeen: unknown[] = [];
  let failNext: { name: string; message: string } | null = null;
  let gate: Promise<void> | null = null;

  const mediaDevices = {
    getUserMedia: async (constraints: unknown) => {
      constraintsSeen.push(constraints);
      if (gate) await gate;
      if (failNext) {
        const spec = failNext;
        failNext = null;
        throw Object.assign(new Error(spec.message), { name: spec.name });
      }
      const stream = new FakeMediaStream();
      const requested = (
        constraints as { audio?: { deviceId?: { ideal?: string; exact?: string } } }
      )?.audio;
      const asked = requested?.deviceId?.exact ?? null;
      stream.addTrack(new FakeTrack(asked));
      return stream;
    },
  };

  Object.defineProperty(globalThis, 'navigator', { value: { mediaDevices }, configurable: true });

  return {
    constraintsSeen,
    get callCount(): number {
      return constraintsSeen.length;
    },
    failWith(name: string, message = 'gum failed'): void {
      failNext = { name, message };
    },
    /** Holds every subsequent getUserMedia until the returned release() runs. */
    block(): () => void {
      let release!: () => void;
      gate = new Promise<void>((r) => {
        release = r;
      });
      return () => {
        gate = null;
        release();
      };
    },
  };
}

function makeInit(overrides: Partial<CallInit> = {}): CallInit {
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
    // No WebAudio under jsdom; the real RingbackTone would no-op, but an explicit
    // stub keeps these tests about media only.
    ringback: { isPlaying: false, start: jest.fn(), stop: jest.fn(), setSinkId: jest.fn() },
    ...overrides,
  };
}

/** A Call taken through the inbound answer path, so a real audio sender exists. */
async function answeredCall(overrides: Partial<CallInit> = {}) {
  const call = new Call(makeInit(overrides));
  await call.prepareAnswerForOffer('fake-offer-sdp');
  return call;
}

function pc(call: Call): FakeRTCPeerConnection {
  return call.peerConnection as unknown as FakeRTCPeerConnection;
}

function sent(call: Call): Array<{ type: string }> {
  const send = (call as unknown as { transport: { send: jest.Mock } }).transport.send;
  return send.mock.calls.map((c: unknown[]) => c[0] as { type: string });
}

function localTracks(call: Call): FakeTrack[] {
  return (call as unknown as { localStream: FakeMediaStream }).localStream.getAudioTracks();
}

describe('Call.setAudioInputDevice', () => {
  let media: ReturnType<typeof installMediaDevices>;

  beforeEach(() => {
    (globalThis as Record<string, unknown>).RTCPeerConnection = FakeRTCPeerConnection;
    (globalThis as Record<string, unknown>).MediaStream = FakeMediaStream;
    media = installMediaDevices();
  });

  it('puts the newly acquired track on the audio sender', async () => {
    const call = await answeredCall();
    await call.setAudioInputDevice('mic-b');

    expect(pc(call).audioSender()?.track?.deviceId).toBe('mic-b');
    expect(call.audioInputDeviceId).toBe('mic-b');
  });

  it('keeps a muted call muted — the replacement track must not go live', async () => {
    const call = await answeredCall();
    call.mute();

    await call.setAudioInputDevice('mic-b');

    const live = pc(call).audioSender()?.track;
    expect(call.isMuted).toBe(true);
    expect(live?.enabled).toBe(false);
  });

  it('leaves an unmuted call transmitting after a switch', async () => {
    const call = await answeredCall();
    await call.setAudioInputDevice('mic-b');
    expect(pc(call).audioSender()?.track?.enabled).toBe(true);
  });

  it('stops the displaced track but not the live one', async () => {
    const call = await answeredCall();
    const original = pc(call).audioSender()?.track as FakeTrack;

    await call.setAudioInputDevice('mic-b');

    expect(original.stopped).toBe(true);
    expect(pc(call).audioSender()?.track?.stopped).toBe(false);
  });

  it('keeps exactly one audio track in the stable localStream container', async () => {
    const call = await answeredCall();
    const streamBefore = (call as unknown as { localStream: FakeMediaStream }).localStream;

    await call.setAudioInputDevice('mic-b');

    const streamAfter = (call as unknown as { localStream: FakeMediaStream }).localStream;
    // Identity must hold: the peer connection holds a reference from addTrack, and
    // mute()/releaseMedia() iterate this exact container.
    expect(streamAfter).toBe(streamBefore);
    expect(localTracks(call)).toHaveLength(1);
    expect(localTracks(call)[0]?.deviceId).toBe('mic-b');
  });

  it('does not renegotiate', async () => {
    const call = await answeredCall();
    const before = {
      offers: pc(call).offersCreated,
      answers: pc(call).answersCreated,
      locals: pc(call).localDescriptionsSet,
    };

    await call.setAudioInputDevice('mic-b');

    expect(pc(call).offersCreated).toBe(before.offers);
    expect(pc(call).answersCreated).toBe(before.answers);
    expect(pc(call).localDescriptionsSet).toBe(before.locals);
  });

  it('keeps DTMF available across a switch', async () => {
    const call = await answeredCall();
    expect(call.canSendDtmf).toBe(true);

    await call.setAudioInputDevice('mic-b');

    expect(call.canSendDtmf).toBe(true);
    expect(() => call.sendDtmf('5')).not.toThrow();
  });

  it('emits audioInputChanged with the new device', async () => {
    const call = await answeredCall();
    const seen: (string | null)[] = [];
    call.on('audioInputChanged', (id) => seen.push(id));

    await call.setAudioInputDevice('mic-b');
    await call.setAudioInputDevice(null);

    expect(seen).toEqual(['mic-b', null]);
  });

  it('requests an explicit switch as `exact`, not `ideal`', async () => {
    const call = await answeredCall();
    await call.setAudioInputDevice('mic-b');

    // Verified in Chrome: with a track already open, `ideal` is silently ignored and
    // getUserMedia returns the device already in use, so `ideal` can never switch a live
    // call. `exact` is honored.
    const last = media.constraintsSeen[media.constraintsSeen.length - 1];
    expect(last).toEqual({ audio: { deviceId: { exact: 'mic-b' } } });
  });

  it('requests acquisition as `exact` too, so the saved id cannot be overridden', async () => {
    // `ideal` here let Chrome's own device-picker preference win, capturing a mic we
    // never asked for while the recorded preference named a device never opened.
    await answeredCall({ audioInputDeviceId: 'mic-a' });

    expect(media.constraintsSeen).toEqual([{ audio: { deviceId: { exact: 'mic-a' } } }]);
  });

  it('falls back to an unconstrained mic when the saved id no longer resolves', async () => {
    // A stale saved id is the normal case (ids rotate per origin, devices get
    // unplugged), so it must not fail the call the way bare `exact` would.
    media.failWith('OverconstrainedError');
    const call = await answeredCall({ audioInputDeviceId: 'mic-gone' });

    expect(media.constraintsSeen).toEqual([
      { audio: { deviceId: { exact: 'mic-gone' } } },
      { audio: true },
    ]);
    // The call still connected, and the preference is kept so a replug is picked up.
    expect(pc(call).localDescription?.type).toBe('answer');
    expect(call.audioInputDeviceId).toBe('mic-gone');
  });

  it('does not retry a permission denial, which would double-prompt', async () => {
    media.failWith('NotAllowedError');
    const call = new Call(makeInit({ audioInputDeviceId: 'mic-a' }));

    await expect(call.whenLocalMediaReady()).rejects.toBeDefined();
    expect(media.callCount).toBe(1);
  });

  it('does not retry a locked mic, where looser constraints cannot help', async () => {
    // NotReadableError is only reported once NO device of the kind is readable, so
    // dropping the deviceId constraint has nothing left to find — the retry would just
    // fail again and flash a second permission indicator.
    media.failWith('NotReadableError');
    const call = new Call(makeInit({ audioInputDeviceId: 'mic-a' }));

    // The raw DOMException propagates — phone.ts classifies it off whenLocalMediaReady.
    await expect(call.whenLocalMediaReady()).rejects.toMatchObject({
      name: 'NotReadableError',
    });
    expect(media.callCount).toBe(1);
  });

  it('asks for no device at all when nothing is saved', async () => {
    await answeredCall();
    expect(media.constraintsSeen).toEqual([{ audio: true }]);
  });

  describe('failure handling', () => {
    it('leaves everything untouched when acquisition fails', async () => {
      const call = await answeredCall();
      const original = pc(call).audioSender()?.track as FakeTrack;
      media.failWith('NotFoundError');

      await expect(call.setAudioInputDevice('mic-gone')).rejects.toMatchObject({
        code: 'audio_device_unavailable',
      });

      expect(pc(call).audioSender()?.track).toBe(original);
      expect(original.stopped).toBe(false);
      expect(call.audioInputDeviceId).toBeNull();
    });

    it('reports a denied permission as mic_permission_denied', async () => {
      const call = await answeredCall();
      media.failWith('NotAllowedError');

      await expect(call.setAudioInputDevice('mic-b')).rejects.toMatchObject({
        code: 'mic_permission_denied',
      });
    });

    it('does not poison later switches after a failure', async () => {
      const call = await answeredCall();
      media.failWith('NotFoundError');
      await expect(call.setAudioInputDevice('mic-gone')).rejects.toBeDefined();

      await call.setAudioInputDevice('mic-c');
      expect(pc(call).audioSender()?.track?.deviceId).toBe('mic-c');
    });
  });

  describe('lifecycle edges', () => {
    it('is a no-op when the device is already selected', async () => {
      const call = await answeredCall({ audioInputDeviceId: 'mic-a' });
      const countAfterSetup = media.callCount;

      await call.setAudioInputDevice('mic-a');

      expect(media.callCount).toBe(countAfterSetup);
    });

    it('moves off a device when asked for the OS default, even with no prior selection', async () => {
      const call = await answeredCall();
      const live = pc(call).audioSender()?.track as FakeTrack;
      Object.defineProperty(live, 'deviceId', { value: 'mic-a', configurable: true });
      expect(call.audioInputDeviceId).toBeNull();
      const before = media.callCount;

      await call.setAudioInputDevice(null);

      expect(media.callCount).toBe(before + 1);
      expect(media.constraintsSeen[media.constraintsSeen.length - 1]).toEqual({ audio: true });
      expect(live.stopped).toBe(true);
    });

    it('still short-circuits a redundant default request when nothing is captured', async () => {
      const call = new Call(makeInit());
      const before = media.callCount;

      await call.setAudioInputDevice(null);

      expect(media.callCount).toBe(before);
    });

    it('records the preference without acquiring once the call has ended', async () => {
      const call = await answeredCall();
      call.handleServerMessage({
        type: 'call.ended',
        call_id: 'call_test',
        reason: 'hangup',
      } as never);
      const countAtEnd = media.callCount;

      await expect(call.setAudioInputDevice('mic-b')).resolves.toBeUndefined();

      expect(call.audioInputDeviceId).toBe('mic-b');
      expect(media.callCount).toBe(countAtEnd);
    });

    it('waits for the initial acquisition instead of racing it', async () => {
      const release = media.block();
      const call = new Call(makeInit());
      const switching = call.setAudioInputDevice('mic-b');
      release();
      await switching;

      expect(media.constraintsSeen).toEqual([
        { audio: true },
        { audio: { deviceId: { exact: 'mic-b' } } },
      ]);
      expect(call.audioInputDeviceId).toBe('mic-b');
    });

    it('serializes concurrent switches and stops the loser', async () => {
      const call = await answeredCall();

      await Promise.all([call.setAudioInputDevice('mic-b'), call.setAudioInputDevice('mic-c')]);

      const live = pc(call).audioSender()?.track;
      expect(live?.deviceId).toBe('mic-c');
      expect(live?.stopped).toBe(false);
      expect(call.audioInputDeviceId).toBe('mic-c');
      expect(localTracks(call)).toHaveLength(1);
    });
  });

  describe('construction', () => {
    it('captures the device supplied by the phone', async () => {
      await answeredCall({ audioInputDeviceId: 'mic-a' });
      expect(media.constraintsSeen[0]).toEqual({ audio: { deviceId: { exact: 'mic-a' } } });
    });

    it('asks for the default mic when no device is selected', async () => {
      await answeredCall();
      expect(media.constraintsSeen[0]).toEqual({ audio: true });
    });

    it('connects after recovering from a denied microphone', async () => {
      // localMediaReady is assigned once at construction. A failed acquire left it
      // rejected forever, so prepareAnswerForOffer's `await` aborted and the inbound
      // call silently never connected — even though the UI showed a working mic.
      media.failWith('NotAllowedError');
      const call = new Call(makeInit());
      await expect(call.whenLocalMediaReady()).rejects.toBeDefined();

      await call.setAudioInputDevice('mic-b');
      await call.prepareAnswerForOffer('fake-offer-sdp');

      // An answer was actually produced, on the recovered device.
      expect(pc(call).localDescription?.type).toBe('answer');
      expect(pc(call).audioSender()?.track?.deviceId).toBe('mic-b');
    });

    it('connects after a denied microphone when the offer arrived first', async () => {
      // Production ordering: the server sends sdp.offer immediately after call.incoming,
      // so prepareAnswerForOffer runs (and discards the offer) while the permission
      // prompt is still open. The recovery switch has to rebuild the answer itself.
      media.failWith('NotAllowedError');
      const call = new Call(makeInit());
      await expect(call.whenLocalMediaReady()).rejects.toBeDefined();

      await call.prepareAnswerForOffer('fake-offer-sdp');
      // The offer was consumed and dropped: no answer was built.
      expect(pc(call).localDescription).toBeNull();
      expect(pc(call).answersCreated).toBe(0);

      await call.setAudioInputDevice('mic-b');

      expect(pc(call).localDescription?.type).toBe('answer');
      expect(pc(call).audioSender()?.track?.deviceId).toBe('mic-b');
    });

    it('sends the answer when answer() was clicked during the mic prompt', async () => {
      media.failWith('NotAllowedError');
      const call = new Call(makeInit());
      await expect(call.whenLocalMediaReady()).rejects.toBeDefined();
      await call.prepareAnswerForOffer('fake-offer-sdp');

      call.answer();
      expect(sent(call).filter((m) => m.type === 'sdp.answer')).toHaveLength(0);

      await call.setAudioInputDevice('mic-b');

      expect(sent(call).filter((m) => m.type === 'sdp.answer')).toHaveLength(1);
    });

    it('re-acquires the same device after its track ended', async () => {
      const call = await answeredCall({ audioInputDeviceId: 'mic-a' });
      const live = pc(call).audioSender()?.track as FakeTrack;
      const countAfterSetup = media.callCount;

      // The headset is unplugged: watchCaptureTrack reports it but leaves the dead
      // track on the sender, so re-picking the same device is the recovery path.
      live.end();
      await call.setAudioInputDevice('mic-a');

      expect(media.callCount).toBe(countAfterSetup + 1);
      expect(pc(call).audioSender()?.track).not.toBe(live);
    });

    it('re-acquires the saved device once it comes back after a fallback', async () => {
      // The fallback captures whatever the OS gives, so the preference can name a
      // device that was never opened. Selecting it must then genuinely acquire it
      // rather than short-circuit on the matching preference.
      media.failWith('OverconstrainedError');
      const call = await answeredCall({ audioInputDeviceId: 'mic-a' });
      expect(call.audioInputDeviceId).toBe('mic-a');
      expect(call.effectiveAudioInputDeviceId).toBeNull();
      const countAfterSetup = media.callCount;

      await call.setAudioInputDevice('mic-a');

      expect(media.callCount).toBe(countAfterSetup + 1);
      expect(pc(call).audioSender()?.track?.deviceId).toBe('mic-a');
    });

    it('keeps a mute that landed during the replaceTrack await', async () => {
      const call = await answeredCall({ audioInputDeviceId: 'mic-a' });
      const sender = pc(call).audioSender();
      let release: (() => void) | undefined;
      sender!.blockReplaceTrack(
        new Promise<void>((resolve) => {
          release = resolve;
        })
      );

      const switching = call.setAudioInputDevice('mic-b');
      // The user hits mute while the swap is suspended: mute() flips the OLD track,
      // and nothing else re-reads isMuted after the new one is installed.
      call.mute();
      release?.();
      await switching;

      expect(call.isMuted).toBe(true);
      expect(pc(call).audioSender()?.track?.enabled).toBe(false);
    });

    it('applies a switch made before negotiation attached a sender', async () => {
      const call = new Call(makeInit());
      await call.setAudioInputDevice('mic-b');
      await call.prepareAnswerForOffer('fake-offer-sdp');

      expect(pc(call).audioSender()?.track?.deviceId).toBe('mic-b');
    });

    it('exposes the device the OS actually granted', async () => {
      const call = await answeredCall({ audioInputDeviceId: 'mic-a' });
      // How a UI detects "asked for the headset, got whatever the fallback opened".
      expect(call.effectiveAudioInputDeviceId).toBe('mic-a');
    });
  });

  describe('device loss', () => {
    it('emits audioInputLost when the captured device vanishes', async () => {
      const call = await answeredCall();
      const lost = jest.fn();
      call.on('audioInputLost', lost);

      (pc(call).audioSender()?.track as FakeTrack).end();

      expect(lost).toHaveBeenCalledTimes(1);
    });

    it('stays quiet on dispose()', async () => {
      // dispose() set neither endedSettled nor state, and releaseMedia stops tracks
      // without removing them — so teardown flashed the disconnected-mic alert.
      const call = await answeredCall();
      const lost = jest.fn();
      call.on('audioInputLost', lost);

      call.dispose();
      (pc(call).audioSender()?.track as FakeTrack).end();

      expect(lost).not.toHaveBeenCalled();
    });

    it('stays quiet for a track we displaced ourselves', async () => {
      const call = await answeredCall();
      const lost = jest.fn();
      call.on('audioInputLost', lost);
      const original = pc(call).audioSender()?.track as FakeTrack;

      await call.setAudioInputDevice('mic-b');
      original.end();

      expect(lost).not.toHaveBeenCalled();
    });
  });
});
