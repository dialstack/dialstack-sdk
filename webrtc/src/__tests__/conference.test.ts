/**
 * Local-conference (three-way) mixer tests.
 *
 * The load-bearing assertion is the GRAPH SHAPE: each leg's uplink must carry
 * the mic and every OTHER leg, and never that leg's own remote audio. Getting
 * that wrong ships audible self-echo to the far end, which no type or lint check
 * would catch — so the wiring is asserted explicitly, per connection.
 */

import { LocalConference, supportsConference } from '../conference.js';
import type { PhoneError } from '../errors.js';
import type { Call } from '../call.js';
import type { MediaStream } from '../platform.js';

class FakeTrack {
  enabled = true;
  stopped = false;
  readonly kind = 'audio';
  constructor(readonly label: string) {}
  stop(): void {
    this.stopped = true;
  }
}

class FakeStream {
  constructor(
    readonly label: string,
    private tracks: FakeTrack[] = [new FakeTrack(`${label}-track`)]
  ) {}
  getAudioTracks(): FakeTrack[] {
    return this.tracks;
  }
}

/** Records every connect(), so the wiring can be asserted edge by edge. */
class FakeNode {
  readonly connections: FakeNode[] = [];
  disconnected = false;
  constructor(readonly label: string) {}
  connect(target: FakeNode): void {
    this.connections.push(target);
  }
  // Real disconnect() drops edges: with a target, just that one; without,
  // all of them. The old stub only set a flag, so it could not show whether
  // teardown actually unwired anything.
  disconnect(target?: FakeNode): void {
    this.disconnected = true;
    if (target) {
      const i = this.connections.indexOf(target);
      if (i !== -1) this.connections.splice(i, 1);
    } else {
      this.connections.length = 0;
    }
  }
}

class FakeGainNode extends FakeNode {
  gain = { value: 1 };
}

class FakeDestinationNode extends FakeNode {
  readonly stream: FakeStream;
  channelCount = 2; // the spec default, so a test can see production narrow it
  constructor(label: string) {
    super(label);
    this.stream = new FakeStream(label);
  }
}

class FakeAudioContext {
  static instances: FakeAudioContext[] = [];
  static nextId = 0;
  closed = false;
  resumed = false;
  private id = ++FakeAudioContext.nextId;
  private sourceCount = 0;
  private destCount = 0;
  private gainCount = 0;
  readonly sources = new Map<FakeStream, FakeNode>();
  readonly destinations: FakeDestinationNode[] = [];

  constructor() {
    FakeAudioContext.instances.push(this);
  }
  createMediaStreamSource(stream: FakeStream): FakeNode {
    const node = new FakeNode(`src${this.id}-${++this.sourceCount}:${stream.label}`);
    this.sources.set(stream, node);
    return node;
  }
  createGain(): FakeGainNode {
    return new FakeGainNode(`gain${this.id}-${++this.gainCount}`);
  }
  createMediaStreamDestination(): FakeDestinationNode {
    const node = new FakeDestinationNode(`dest${this.id}-${++this.destCount}`);
    this.destinations.push(node);
    return node;
  }
  resume(): Promise<void> {
    this.resumed = true;
    return Promise.resolve();
  }
  close(): Promise<void> {
    this.closed = true;
    return Promise.resolve();
  }
}

class FakeSender {
  replaced: Array<FakeTrack | null> = [];
  constructor(public track: FakeTrack | null) {}
  replaceTrack(next: FakeTrack | null): Promise<void> {
    this.replaced.push(next);
    this.track = next;
    return Promise.resolve();
  }
}

interface FakeCallShape {
  id: string;
  isMuted: boolean;
  isConnected: boolean;
  remoteMediaStream: FakeStream;
  localMediaStream: FakeStream;
  peerConnection: { getSenders(): FakeSender[] };
  sender: FakeSender;
  /** What the mixer attached, so tests can see the pairing it now owns. */
  conference: unknown;
  attachConference(conference: unknown): void;
}

function fakeCall(id: string, opts: { connected?: boolean; muted?: boolean } = {}): FakeCallShape {
  const sender = new FakeSender(new FakeTrack(`${id}-mic`));
  return {
    id,
    isMuted: opts.muted ?? false,
    isConnected: opts.connected ?? true,
    remoteMediaStream: new FakeStream(`${id}-remote`),
    localMediaStream: new FakeStream(`${id}-local`),
    peerConnection: { getSenders: () => [sender] },
    sender,
    conference: null,
    attachConference(conference: unknown) {
      this.conference = conference;
    },
  };
}

/** The two fakes are structural stand-ins for the real core types. */
const asCall = (c: FakeCallShape): Call => c as unknown as Call;
const asStream = (s: FakeStream): MediaStream => s as unknown as MediaStream;

const originalAudioContext = (globalThis as Record<string, unknown>).AudioContext;

beforeEach(() => {
  FakeAudioContext.instances = [];
  (globalThis as Record<string, unknown>).AudioContext = FakeAudioContext;
});

afterEach(() => {
  (globalThis as Record<string, unknown>).AudioContext = originalAudioContext;
});

function ctx(): FakeAudioContext {
  const [instance] = FakeAudioContext.instances;
  if (!instance) throw new Error('no AudioContext was constructed');
  return instance;
}

/**
 * The destinations by role. Creation order is an implementation detail — the
 * local monitor is built before the per-leg uplinks — so tests resolve the
 * uplinks by asking which destination each call's sender was swapped onto, and
 * take the monitor as the one left over.
 */
function graph(calls: FakeCallShape[]): {
  uplinks: FakeDestinationNode[];
  monitor: FakeDestinationNode;
} {
  const { destinations } = ctx();
  const uplinks = calls.map((call) => {
    const [mixed] = call.sender.replaced;
    const dest = destinations.find((d) => d.stream.getAudioTracks()[0] === mixed);
    if (!dest) throw new Error(`no uplink destination found for ${call.id}`);
    return dest;
  });
  const monitor = destinations.find((d) => !uplinks.includes(d));
  if (!monitor) throw new Error('no local monitor destination found');
  return { uplinks, monitor };
}

describe('supportsConference', () => {
  it('is true when the host provides WebAudio', () => {
    expect(supportsConference()).toBe(true);
  });

  // The DOM half of the gate lives in conference-domless.test.ts: jsdom's
  // `document` is non-configurable, so it cannot be removed here.

  it('is false where AudioContext is absent (React Native)', () => {
    delete (globalThis as Record<string, unknown>).AudioContext;
    // The prefixed name is the other accepted spelling; neither is present here.
    delete (globalThis as Record<string, unknown>).webkitAudioContext;
    expect(supportsConference()).toBe(false);
  });
});

describe('LocalConference graph', () => {
  it('feeds each leg the mic and the OTHER leg, never its own audio', () => {
    const a = fakeCall('a');
    const b = fakeCall('b');
    const mic = new FakeStream('mic');

    LocalConference.merge([asCall(a), asCall(b)], asStream(mic));

    const audio = ctx();
    const micNode = audio.sources.get(mic)!;
    const aRemote = audio.sources.get(a.remoteMediaStream)!;
    const bRemote = audio.sources.get(b.remoteMediaStream)!;
    const {
      uplinks: [destA, destB],
      monitor,
    } = graph([a, b]);

    // The mic reaches both uplinks through its own gain branch (what mute
    // attenuates), and not the local monitor — the user needn't hear themselves.
    const micGains = micNode.connections;
    expect(micGains).toHaveLength(2);
    expect(micGains.flatMap((g) => g.connections)).toEqual([destA, destB]);

    // A's own audio goes to B's uplink and the monitor — never back to A. The
    // monitor is reached through a gain node, so follow that hop.
    const reaches = (node: FakeNode, target: FakeNode): boolean =>
      node.connections.some((c) => c === target || c.connections.includes(target));
    expect(reaches(aRemote, monitor)).toBe(true);
    expect(reaches(aRemote, destB)).toBe(true);
    expect(aRemote.connections).not.toContain(destA);

    // Symmetrically for B.
    expect(reaches(bRemote, monitor)).toBe(true);
    expect(reaches(bRemote, destA)).toBe(true);
    expect(bRemote.connections).not.toContain(destB);
  });

  it('installs each leg mixed uplink via replaceTrack', () => {
    const a = fakeCall('a');
    const b = fakeCall('b');
    LocalConference.merge([asCall(a), asCall(b)], asStream(new FakeStream('mic')));

    // Each sender is swapped exactly once, onto a mixed track that is not the
    // other leg's — crossing these would send each party the wrong mix.
    expect(a.sender.replaced).toHaveLength(1);
    expect(b.sender.replaced).toHaveLength(1);
    expect(a.sender.replaced[0]).not.toBe(b.sender.replaced[0]);
    // And onto a real mixer output, not the original mic track.
    const mixedTracks = ctx().destinations.map((d) => d.stream.getAudioTracks()[0]);
    expect(mixedTracks).toContain(a.sender.replaced[0]);
    expect(mixedTracks).toContain(b.sender.replaced[0]);
  });

  it('reports a rejected uplink swap instead of failing silently', async () => {
    const a = fakeCall('a');
    const b = fakeCall('b');
    a.sender.replaceTrack = () => Promise.reject(new Error('envelope mismatch'));
    const errors: PhoneError[] = [];

    const conference = LocalConference.merge(
      [asCall(a), asCall(b)],
      asStream(new FakeStream('mic')),
      (e) => errors.push(e)
    );
    await Promise.resolve();
    await Promise.resolve();

    // Without the report this leg silently stays on its mic — inaudible to the
    // other party, with nothing anywhere to say so.
    expect(errors).toHaveLength(1);
    expect(errors[0]!.message).toContain('envelope mismatch');
    expect(errors[0]!.callId).toBe(a.id);
    // The healthy leg is unaffected.
    expect(b.sender.replaced).toHaveLength(1);
    conference.dispose();
  });

  it('gives each uplink a mono destination to match the negotiated envelope', () => {
    const a = fakeCall('a');
    const b = fakeCall('b');
    LocalConference.merge([asCall(a), asCall(b)], asStream(new FakeStream('mic')));

    // A default (stereo) destination upmixes the mono mic only for the encoder
    // to downmix it again. The monitor feeds an <audio> element, not a mono
    // encoder, so it is deliberately left alone.
    const { uplinks, monitor } = graph([a, b]);
    for (const dest of uplinks) expect(dest.channelCount).toBe(1);
    expect(monitor.channelCount).toBe(2);
  });

  it('scales to three legs, still excluding each leg from its own uplink', () => {
    const [a, b, c] = [fakeCall('a'), fakeCall('b'), fakeCall('c')];
    LocalConference.merge([asCall(a), asCall(b), asCall(c)], asStream(new FakeStream('mic')));

    const aRemote = ctx().sources.get(a!.remoteMediaStream)!;
    const {
      uplinks: [destA, destB, destC],
    } = graph([a!, b!, c!]);

    expect(aRemote.connections).toContain(destB);
    expect(aRemote.connections).toContain(destC);
    expect(aRemote.connections).not.toContain(destA);
  });

  it('silences the mic branches, never the uplink tracks, while muted', () => {
    const a = fakeCall('a');
    const b = fakeCall('b');
    const mic = new FakeStream('mic');
    const conference = LocalConference.merge([asCall(a), asCall(b)], asStream(mic));

    conference.setMuted(true);

    // The mic branches go silent; the uplink tracks stay live because they also
    // carry the other party, who must keep being heard.
    const gains = ctx().sources.get(mic)!.connections as unknown as FakeGainNode[];
    expect(gains.map((g) => g.gain.value)).toEqual([0, 0]);
    expect((a.sender.track as FakeTrack).enabled).toBe(true);
    expect((b.sender.track as FakeTrack).enabled).toBe(true);
  });
});

describe('LocalConference rejects unmergeable input', () => {
  it('refuses fewer than two calls', () => {
    expect(() =>
      LocalConference.merge([asCall(fakeCall('a'))], asStream(new FakeStream('mic')))
    ).toThrow(/at least two calls/);
  });

  it('refuses a call that is not connected', () => {
    const a = fakeCall('a');
    const ringing = fakeCall('b', { connected: false });
    expect(() =>
      LocalConference.merge([asCall(a), asCall(ringing)], asStream(new FakeStream('mic')))
    ).toThrow(/connected/);
  });

  it('refuses when the host has no WebAudio', () => {
    delete (globalThis as Record<string, unknown>).AudioContext;
    delete (globalThis as Record<string, unknown>).webkitAudioContext;
    expect(() =>
      LocalConference.merge(
        [asCall(fakeCall('a')), asCall(fakeCall('b'))],
        asStream(new FakeStream('mic'))
      )
    ).toThrow(/WebAudio/);
  });
});

describe('LocalConference mute', () => {
  it('toggles every mixed uplink', () => {
    const a = fakeCall('a');
    const b = fakeCall('b');
    const mic = new FakeStream('mic');
    const conference = LocalConference.merge([asCall(a), asCall(b)], asStream(mic));
    const gains = ctx().sources.get(mic)!.connections as unknown as FakeGainNode[];
    const uplinks = graph([a, b]).uplinks.map((d) => d.stream.getAudioTracks()[0]!);

    conference.setMuted(true);
    expect(gains.map((g) => g.gain.value)).toEqual([0, 0]);
    // The uplink tracks stay live: they also carry the OTHER party, so disabling
    // them would cut A and B off from each other rather than muting the user.
    expect(uplinks.map((t) => t.enabled)).toEqual([true, true]);

    conference.setMuted(false);
    expect(gains.map((g) => g.gain.value)).toEqual([1, 1]);
  });
});

describe('LocalConference teardown', () => {
  it('restores each sender original track and stops the mixed one', async () => {
    const a = fakeCall('a');
    const b = fakeCall('b');
    const originalA = a.sender.track;
    const conference = LocalConference.merge(
      [asCall(a), asCall(b)],
      asStream(new FakeStream('mic'))
    );
    const [destA] = graph([a, b]).uplinks;
    const mixedA = destA!.stream.getAudioTracks()[0]!;
    // The leg is recorded as mixed only once replaceTrack resolves, so let that
    // settle before tearing down — otherwise dispose has nothing to restore.
    await Promise.resolve();

    conference.dispose();
    // The mixed track is stopped only after replaceTrack resolves, so let both
    // microtasks settle — stopping it while still attached would cut the leg.
    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();

    expect(a.sender.track).toBe(originalA);
    expect(mixedA.stopped).toBe(true);
    expect(ctx().closed).toBe(true);
  });

  it('is idempotent', () => {
    const conference = LocalConference.merge(
      [asCall(fakeCall('a')), asCall(fakeCall('b'))],
      asStream(new FakeStream('mic'))
    );
    conference.dispose();
    expect(() => conference.dispose()).not.toThrow();
    expect(conference.isActive).toBe(false);
  });

  it('returns EVERY leg muted when the conference was muted', async () => {
    const a = fakeCall('a');
    const b = fakeCall('b');
    const conference = LocalConference.merge(
      [asCall(a), asCall(b)],
      asStream(new FakeStream('mic'))
    );

    // Mute arrives through one call — the anchor, the only leg the control row
    // is bound to — but there is one mic, so it silences the whole conference.
    conference.setMuted(true);
    conference.dispose();
    for (let i = 0; i < 6; i++) await Promise.resolve();

    // Both mics must come back muted. Restoring from each leg's own `isMuted`
    // left the non-anchor leg live: silent for the whole merge, then
    // transmitting, while the UI still showed muted.
    expect((a.sender.track as FakeTrack).enabled).toBe(false);
    expect((b.sender.track as FakeTrack).enabled).toBe(false);
    // And the flag each card reads agrees on both.
    expect(a.isMuted).toBe(true);
    expect(b.isMuted).toBe(true);
  });

  it('carries a pre-merge mute onto every leg uplink', () => {
    // Only one of the two was muted before merging.
    const a = fakeCall('a', { muted: true });
    const b = fakeCall('b');
    const mic = new FakeStream('mic');

    LocalConference.merge([asCall(a), asCall(b)], asStream(mic));

    // One mic, so BOTH mic branches must be silent — seeding each leg's gain
    // from its own call's `isMuted` would leave B's branch open and transmit
    // audio the user had already muted.
    const micGains = ctx().sources.get(mic)!.connections as FakeGainNode[];
    expect(micGains).toHaveLength(2);
    for (const gain of micGains) expect(gain.gain.value).toBe(0);
  });

  it('attaches itself to every leg and detaches on teardown', () => {
    const a = fakeCall('a');
    const b = fakeCall('b');

    const conference = LocalConference.merge(
      [asCall(a), asCall(b)],
      asStream(new FakeStream('mic'))
    );

    // Owned by the mixer, not the caller: a leg the wire has switched to the mix
    // must route mute here, and forgetting the pairing breaks mute silently.
    expect(a.conference).toBe(conference);
    expect(b.conference).toBe(conference);

    conference.dispose();

    // And released, so a leg never routes mute into a disposed graph.
    expect(a.conference).toBeNull();
    expect(b.conference).toBeNull();
  });

  it('drops a leg whose uplink install failed instead of half-merging it', async () => {
    const a = fakeCall('a');
    const b = fakeCall('b');
    a.sender.replaceTrack = () => Promise.reject(new Error('envelope mismatch'));

    const conference = LocalConference.merge(
      [asCall(a), asCall(b)],
      asStream(new FakeStream('mic')),
      () => undefined
    );
    for (let i = 0; i < 4; i++) await Promise.resolve();

    // Its real mic is still on the wire, so it is not in the mix. Left in,
    // mute would move a gain node this sender never routed through while
    // Call.setMuted withheld the frame — the far end keeps hearing a muted user.
    expect(conference.has(asCall(a))).toBe(false);
    expect(conference.has(asCall(b))).toBe(true);
    expect(a.conference).toBeNull();
  });

  it('unwires a removed leg from the survivors', async () => {
    const [a, b, c] = [fakeCall('a'), fakeCall('b'), fakeCall('c')];
    const conference = LocalConference.merge(
      [asCall(a), asCall(b), asCall(c)],
      asStream(new FakeStream('mic'))
    );
    await Promise.resolve();
    const { uplinks } = graph([a, b, c]);
    const destA = uplinks[0]!;

    conference.remove(asCall(a));
    for (let i = 0; i < 4; i++) await Promise.resolve();

    // B and C each held an edge into A's destination from the cross-connect.
    // Leaving them keeps a dead subgraph fed for the rest of the conference.
    const bSrc = ctx().sources.get(b.remoteMediaStream)!;
    const cSrc = ctx().sources.get(c.remoteMediaStream)!;
    expect(bSrc.connections).not.toContain(destA);
    expect(cSrc.connections).not.toContain(destA);
    expect(conference.has(asCall(b))).toBe(true);
  });

  it('restores behind a still-pending install rather than racing it', async () => {
    const a = fakeCall('a');
    const b = fakeCall('b');
    const originalA = a.sender.track;

    // A real replaceTrack settles a turn later. Held open so the split lands
    // while the install is genuinely in flight — the shape that strands a leg
    // on a disposed graph's track if the two swaps are allowed to race.
    let releaseInstall: (() => void) | undefined;
    const realReplace = a.sender.replaceTrack.bind(a.sender);
    a.sender.replaceTrack = (next) =>
      new Promise<void>((resolve) => {
        releaseInstall = () => {
          void realReplace(next);
          resolve();
        };
      });

    const conference = LocalConference.merge(
      [asCall(a), asCall(b)],
      asStream(new FakeStream('mic'))
    );
    conference.dispose();

    // Restore must not have run yet: the install is still in flight.
    expect(a.sender.replaced).toHaveLength(0);

    a.sender.replaceTrack = realReplace;
    releaseInstall!();
    for (let i = 0; i < 6; i++) await Promise.resolve();

    // The ORDER is the whole point: the mixed track goes on, then comes off.
    // Unserialised, the restore lands first and the install overwrites it,
    // leaving the leg transmitting a disposed graph's track.
    expect(a.sender.replaced).toHaveLength(2);
    expect(a.sender.replaced[0]).not.toBe(originalA); // the mix went on first
    expect(a.sender.replaced[1]).toBe(originalA); // then the mic came back
    expect(a.sender.track).toBe(originalA);
  });

  it('removes one leg, leaving the rest bridged', async () => {
    const a = fakeCall('a');
    const b = fakeCall('b');
    const originalA = a.sender.track;
    const conference = LocalConference.merge(
      [asCall(a), asCall(b)],
      asStream(new FakeStream('mic'))
    );

    conference.remove(asCall(a));
    // The restore queues behind the install swap, so let both settle.
    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();

    expect(a.sender.track).toBe(originalA);
    expect(conference.has(asCall(a))).toBe(false);
    expect(conference.has(asCall(b))).toBe(true);
    // Still a live conference object; the caller disposes once it drops below two.
    expect(conference.isActive).toBe(true);
  });

  it('does not replaceTrack on a leg that already ended', async () => {
    const a = fakeCall('a');
    const b = fakeCall('b');
    const conference = LocalConference.merge(
      [asCall(a), asCall(b)],
      asStream(new FakeStream('mic'))
    );
    const replacedDuringMerge = a.sender.replaced.length;
    // The call dropped while merged — its sender is gone server-side, so a
    // restore would reject.
    a.isConnected = false;

    conference.dispose();
    await Promise.resolve();

    expect(a.sender.replaced).toHaveLength(replacedDuringMerge);
  });

  it('restores the mute state onto the returned mic track', async () => {
    const a = fakeCall('a', { muted: true });
    const b = fakeCall('b');
    const conference = LocalConference.merge(
      [asCall(a), asCall(b)],
      asStream(new FakeStream('mic'))
    );

    conference.dispose();
    // The restore queues behind the install swap, so let both settle.
    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();

    // A muted call must come back from the merge still muted on the wire.
    expect((a.sender.track as FakeTrack).enabled).toBe(false);
  });
});

describe('LocalConference keeps remote tracks rendered', () => {
  // Chrome only pumps a remote WebRTC track while something renders it, and a
  // MediaStreamAudioSourceNode does not count — so without a rendering element
  // every source node in the mix receives silence and the local user hears
  // nothing, while the far ends still hear us. That asymmetry is invisible to a
  // jsdom stub, so what is asserted here is the mechanism: an element exists per
  // leg, holds that leg's stream, is muted, and is released on teardown.
  it('holds each leg remote stream in a muted element, released on dispose', async () => {
    const a = fakeCall('a');
    const b = fakeCall('b');
    const created: HTMLAudioElement[] = [];
    const realCreate = document.createElement.bind(document);
    const spy = jest.spyOn(document, 'createElement').mockImplementation(((tag: string) => {
      const el = realCreate(tag) as HTMLAudioElement;
      if (tag === 'audio') {
        // jsdom has no play(); the production path swallows the rejection.
        (el as unknown as { play: () => Promise<void> }).play = () => Promise.resolve();
        created.push(el);
      }
      return el;
    }) as typeof document.createElement);

    const conference = LocalConference.merge(
      [asCall(a), asCall(b)],
      asStream(new FakeStream('mic'))
    );

    // One per leg, each muted and holding that leg's own remote stream.
    expect(created).toHaveLength(2);
    expect(created.every((el) => el.muted)).toBe(true);
    expect(created.map((el) => el.srcObject)).toEqual([a.remoteMediaStream, b.remoteMediaStream]);

    conference.dispose();
    await Promise.resolve();

    // Released, or the streams stay referenced for the life of the page.
    expect(created.every((el) => el.srcObject === null)).toBe(true);
    spy.mockRestore();
  });

  it('stops a leg mixed track only after the mic is back on the sender', async () => {
    const a = fakeCall('a');
    const b = fakeCall('b');
    const conference = LocalConference.merge(
      [asCall(a), asCall(b)],
      asStream(new FakeStream('mic'))
    );
    await Promise.resolve();
    const [destA] = graph([a, b]).uplinks;
    const mixedA = destA!.stream.getAudioTracks()[0]!;

    // Make the restore observable: record whether the mixed track was already
    // stopped at the moment replaceTrack ran. Stopping a track still attached to
    // the sender cuts that leg's outbound media instead of swapping it, which
    // killed the other call moments after a split.
    // Resolves on a later microtask, like the real one: a synchronous fake makes
    // "stop before" and "stop after" indistinguishable, which is precisely the
    // ordering under test.
    let stoppedDuringRestore: boolean | null = null;
    a.sender.replaceTrack = (next) =>
      Promise.resolve()
        .then(() => Promise.resolve())
        .then(() => {
          stoppedDuringRestore = mixedA.stopped;
          a.sender.replaced.push(next);
          a.sender.track = next;
        });

    conference.dispose();
    // Flush past the fake's own delay plus the production .then chain.
    await new Promise((r) => setTimeout(r, 0));

    // replaceTrack ran while the mixed track was still live...
    expect(stoppedDuringRestore).toBe(false);
    // ...and the stop landed only afterwards.
    expect(mixedA.stopped).toBe(true);
  });
});
