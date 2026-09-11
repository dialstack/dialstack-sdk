/**
 * Client-side three-way calling: a local WebAudio mixer that bridges two call
 * legs into one conversation, the way a desk phone does.
 *
 * No server-side conference bridge is involved, and no new signaling: each leg
 * stays an ordinary point-to-point call. All this does is rewrite what each one
 * *sends*, so every party hears the others.
 *
 * The mix is PER-LEG, not one shared bus. A party must never receive its own
 * audio back — that is echo, and at these latencies it is unusable — so each
 * leg's uplink carries the mic plus the OTHER legs' remote audio, and nothing
 * else:
 *
 *     mic ──┬──────────────> [dest A] ──> A's uplink
 *           └──────────────> [dest B] ──> B's uplink
 *
 *     A.remote ─────────────> [dest B]        (A heard by B)
 *     B.remote ─────────────> [dest A]        (B heard by A)
 *
 *     A.remote + B.remote ──> [dest local] ──> speaker (the local user)
 *
 * Uplink injection goes through `RTCRtpSender.replaceTrack`, which is not an
 * input to the negotiation-needed check (same reasoning as `switchAudioInput`),
 * so a merge never reopens SDP on a live call. Unmerging restores each sender's
 * original mic track.
 *
 * Hold is deliberately not involved: `Call.hold()` is a frame the client chooses
 * to send, so a merged pair is simply left un-held and media keeps flowing on
 * both legs.
 *
 * Browser-only: it needs both WebAudio and a DOM (see `supportsConference`).
 * On React Native `supportsConference()` reports false and the softphone hides
 * the merge control rather than failing at the call site.
 */

import { PhoneError } from './errors.js';
import type { Call } from './call.js';
import type { MediaStream, MediaStreamTrack } from './platform.js';

// Lazy: hosts install WebAudio late (or never), so capturing at module load
// would bind whatever existed at first import.
type AudioContextConstructor = new (options?: AudioContextOptions) => AudioContext;

function resolveAudioContext(): AudioContextConstructor | null {
  const g = globalThis as Record<string, unknown>;
  const Ctor = g.AudioContext ?? g.webkitAudioContext;
  return (Ctor as AudioContextConstructor | undefined) ?? null;
}

/**
 * Hold `stream` in a muted, playing <audio> so the browser keeps rendering its
 * tracks, and return the element for teardown. Returns null where there is no
 * DOM (tests, React Native) — the graph still works there, and on hosts that do
 * not need this the element is simply inert.
 */
function renderSilently(stream: MediaStream): HTMLAudioElement | null {
  if (typeof document === 'undefined') return null;
  const el = document.createElement('audio');
  el.srcObject = stream;
  el.muted = true;
  el.autoplay = true;
  void Promise.resolve(el.play()).catch(() => undefined);
  return el;
}

/**
 * A destination node defaults to 2 channels, which would upmix the mono mic and
 * then downmix again at the encoder — the negotiated envelope is mono Opus.
 */
function monoDestination(ctx: AudioContext): MediaStreamAudioDestinationNode {
  const dest = ctx.createMediaStreamDestination();
  dest.channelCount = 1;
  return dest;
}

/**
 * Disconnect a node, or just one of its edges. Throws where the edge was never
 * made or the context is already closed, which teardown treats as done.
 */
function disconnectQuietly(node: AudioNode | null, target?: AudioNode): void {
  if (!node) return;
  try {
    if (target) node.disconnect(target);
    else node.disconnect();
  } catch {
    // Already disconnected.
  }
}

/** Stop a track if present; some hosts throw on a second stop. */
function stopTrack(track: MediaStreamTrack | null): void {
  if (!track) return;
  try {
    track.stop();
  } catch {
    // Already stopped.
  }
}

/**
 * Whether this host can mix locally, and so whether merge can be offered.
 *
 * Needs a DOM as well as WebAudio: each leg reaches the mix through a
 * keep-alive `<audio>` element (see `renderSilently`), so without `document`
 * every source node reads silence. Deliberately not an `AudioContext` probe
 * alone — react-native-audio-api ships one, which would otherwise offer merge
 * on React Native, where the WebRTC binding has no track a JS-built mix could
 * install anyway.
 */
export function supportsConference(): boolean {
  return typeof document !== 'undefined' && resolveAudioContext() !== null;
}

/** One merged leg: its call, its nodes, and what to restore on unmerge. */
interface MergedLeg {
  call: Call;
  /** This leg's uplink mix (mic + the other legs' remote audio). */
  destination: MediaStreamAudioDestinationNode;
  /** This leg's remote audio, tapped once and fanned out to the others. */
  source: MediaStreamAudioSourceNode;
  /**
   * A muted <audio> holding this leg's remote stream.
   *
   * Chrome only pumps a remote WebRTC track while something renders it, and a
   * MediaStreamAudioSourceNode does not count — so tapping the stream into the
   * graph without this yields a source node that receives pure silence, while
   * the far end still hears us (the uplink never touches a remote stream). It is
   * muted because the mix, not this element, is what the user listens to.
   * Long-standing Chrome behaviour; Firefox does not need it.
   */
  keepAlive: HTMLAudioElement | null;
  /**
   * The mic's own branch into this leg's uplink. Mute attenuates THIS, never the
   * uplink track: that track carries the other parties too, so disabling it would
   * cut them off from each other rather than muting the local user.
   */
  micGain: GainNode;
  /**
   * The track this leg's sender carried before the merge, restored on unmerge.
   * Null when the sender had no track (a leg that never acquired local media) —
   * nothing to put back.
   */
  originalTrack: MediaStreamTrack | null;
  /** The mixed track installed on the sender; stopped on unmerge. */
  mixedTrack: MediaStreamTrack | null;
  /**
   * Serialises this leg's sender swaps. A split can land while the install's
   * replaceTrack is still in flight, and two concurrent swaps on one sender
   * settle in either order — which can leave the leg transmitting the mixed
   * track of a graph that has already been disposed.
   */
  swap: Promise<void>;
}

/**
 * A live local conference across two or more legs.
 *
 * Owns the AudioContext and every node in the graph. `dispose()` restores each
 * leg's original uplink and tears the graph down; it is idempotent and safe
 * after a leg has already ended.
 */
export class LocalConference {
  private ctx: AudioContext | null = null;
  private micSource: MediaStreamAudioSourceNode | null = null;
  /** The local monitor mix (every remote party), for the speaker. */
  private localDestination: MediaStreamAudioDestinationNode | null = null;
  /** Fan-out for what the local user hears: the element's stream AND the speakers. */
  private monitorGain: GainNode | null = null;
  private legs: MergedLeg[] = [];
  private disposed = false;
  private onUplinkError?: (error: PhoneError) => void;
  /**
   * Whether the mic is muted across the conference.
   *
   * There is one mic and one mute for the whole conversation, but only the leg
   * whose `mute()` was called records it in its own `isMuted`. Restoring each
   * leg's mic from that per-call flag would put the others back live after a
   * split — silent the whole merge, then transmitting — so this is what
   * `restoreLeg` reads.
   */
  private muted = false;

  /** The calls currently bridged, in merge order. */
  get calls(): Call[] {
    return this.legs.map((l) => l.call);
  }

  /**
   * What the local user should hear: every remote party mixed together.
   *
   * The softphone binds its `<audio>` element to this instead of one call's
   * `remoteMediaStream` while merged — otherwise the user would hear only
   * whichever leg happens to be focused.
   */
  get localMediaStream(): MediaStream | null {
    return this.localDestination?.stream ?? null;
  }

  get isActive(): boolean {
    return !this.disposed && this.legs.length > 0;
  }

  /** Whether `call` is part of this conference. */
  has(call: Call): boolean {
    return this.legs.some((l) => l.call === call);
  }

  /**
   * Bridge `calls` into one conversation, mixing against `micStream` (the local
   * capture every leg shares).
   *
   * Throws — leaving the calls untouched — if the host has no WebAudio or a leg
   * isn't mergeable; the caller surfaces that as an ordinary call error.
   */
  static merge(
    calls: Call[],
    micStream: MediaStream,
    onUplinkError?: (error: PhoneError) => void
  ): LocalConference {
    const conference = new LocalConference();
    conference.onUplinkError = onUplinkError;
    conference.build(calls, micStream);
    return conference;
  }

  private build(calls: Call[], micStream: MediaStream): void {
    // Public surface: a host can call merge() directly, and without a DOM the
    // mix would build and carry silence.
    if (!supportsConference()) {
      throw new PhoneError({
        code: 'call_failed',
        message: 'Merging calls requires WebAudio and a DOM, which this platform does not provide',
      });
    }
    const Ctor = resolveAudioContext()!;
    if (calls.length < 2) {
      throw new PhoneError({
        code: 'invalid_message',
        message: 'Merging requires at least two calls',
      });
    }
    for (const call of calls) {
      if (!call.isConnected) {
        throw new PhoneError({
          code: 'invalid_message',
          message: 'Only connected calls can be merged',
          callId: call.id,
        });
      }
    }

    const ctx = new Ctor();
    this.ctx = ctx;
    // Every failure path must dispose: `merge()` throws before handing back an
    // instance, so the caller has no handle to clean up with.
    try {
      // An autoplay-suspended context would silently mix nothing. Best-effort;
      // the merge must not stall on it.
      void Promise.resolve(ctx.resume()).catch(() => undefined);

      // Muted if any leg was: the legs share one mic, so the safe direction is
      // to keep it off rather than start transmitting for a call the user had
      // already muted.
      this.muted = calls.some((call) => call.isMuted);

      this.micSource = ctx.createMediaStreamSource(micStream);
      this.localDestination = ctx.createMediaStreamDestination();
      this.monitorGain = ctx.createGain();
      this.monitorGain.connect(this.localDestination);

      // Built up-front so pass 2 can cross-connect in a single sweep.
      this.legs = calls.map((call) => ({
        call,
        destination: monoDestination(ctx),
        source: ctx.createMediaStreamSource(call.remoteMediaStream),
        keepAlive: renderSilently(call.remoteMediaStream),
        micGain: ctx.createGain(),
        originalTrack: null,
        mixedTrack: null,
        swap: Promise.resolve(),
      }));

      // Each leg hears the mic and every OTHER leg — never itself, which is the
      // entire point of a per-leg mix.
      for (const leg of this.legs) {
        // Via a gain node, so mute can attenuate the mic alone.
        this.micSource.connect(leg.micGain);
        leg.micGain.connect(leg.destination);
        leg.source.connect(this.monitorGain);
        for (const other of this.legs) {
          if (other === leg) continue;
          other.source.connect(leg.destination);
        }
      }

      // Last, so a failure unwinds a fully-built graph rather than a half-wired one.
      for (const leg of this.legs) {
        this.installUplink(leg);
        // Owned here, not by the caller: the wire now carries the mixed track, so
        // the call must route mute through the mix. Paired with the detach in
        // restoreLeg, which is also where the sender is put back.
        leg.call.attachConference(this);
      }
    } catch (e) {
      this.dispose();
      throw e;
    }
  }

  /** Swap a leg's sender onto its mixed track, remembering the original. */
  private installUplink(leg: MergedLeg): void {
    const sender = leg.call.peerConnection.getSenders().find((s) => s.track?.kind === 'audio');
    if (!sender) {
      throw new PhoneError({
        code: 'call_failed',
        message: 'Cannot merge a call with no audio sender',
        callId: leg.call.id,
      });
    }
    const [mixed] = leg.destination.stream.getAudioTracks();
    if (!mixed) {
      throw new PhoneError({
        code: 'call_failed',
        message: 'The audio mixer produced no track',
        callId: leg.call.id,
      });
    }
    leg.originalTrack = sender.track ?? null;
    // One mic, one mute: `this.muted` is seeded in build() from the legs' own
    // pre-merge state, so a call muted before the merge does not start
    // transmitting again — and every leg agrees, rather than each carrying the
    // mute of whichever call it happened to be.
    leg.micGain.gain.value = this.muted ? 0 : 1;
    // Not awaited: replaceTrack needs no renegotiation. On failure the original
    // mic track keeps sending, so the leg must NOT be recorded as mixed — unmerge
    // would stop a track that was never installed. Recorded on `swap` so a
    // restore queues behind it rather than racing it on the same sender.
    leg.swap = Promise.resolve(sender.replaceTrack(mixed)).then(
      () => {
        leg.mixedTrack = mixed;
      },
      (e: unknown) => {
        try {
          mixed.stop();
        } catch {
          // Already stopped.
        }
        // Its real mic is still on the wire, so it is not in the mix and must
        // not be treated as if it were: while attached, mute moves a gain node
        // this sender never routed through AND Call.setMuted withholds the
        // `call.mute` frame, so the far end would keep hearing a muted user.
        this.detach(leg);
        // Spec-permitted (InvalidModificationError on an envelope mismatch) but
        // unimplemented in every engine today. Reported rather than swallowed:
        // this leg stays on its mic, so the others never hear it.
        this.onUplinkError?.(
          new PhoneError({
            code: 'call_failed',
            message: `Could not add a call to the conference: ${(e as Error)?.message ?? e}`,
            callId: leg.call.id,
          })
        );
      }
    );
  }

  /**
   * Apply a mute change across the conference.
   *
   * Once merged the wire carries the MIXED track, so `Call.mute()`'s own
   * `localStream` toggle no longer reaches it — the call routes mute here
   * instead (see `Call.attachConference`).
   */
  setMuted(muted: boolean): void {
    this.muted = muted;
    for (const leg of this.legs) {
      // Only the mic branch: the uplink track also carries the other parties, so
      // disabling it would cut them off from each other.
      leg.micGain.gain.value = muted ? 0 : 1;
      // Mirrored onto every leg, not just the one whose mute() ran: one mic means
      // one mute, and each leg's own flag is what its card reads once the
      // conference is split and the user switches to it.
      leg.call.isMuted = muted;
    }
  }

  /**
   * Drop one leg (it hung up, or was split off), restoring its own uplink. The
   * remaining legs stay bridged; the caller disposes once fewer than two remain.
   */
  remove(call: Call): void {
    const leg = this.legs.find((l) => l.call === call);
    if (leg) this.detach(leg);
  }

  /**
   * Take one leg out of the graph and give it its own uplink back.
   *
   * Every node it owns goes with it. `dispose()` can skip this — closing the
   * context drops the whole graph — but a `remove()` on a conference that keeps
   * running would otherwise leave the leg's gain and destination alive, still
   * fed by every surviving leg's source.
   */
  private detach(leg: MergedLeg): void {
    if (!this.legs.includes(leg)) return;
    this.legs = this.legs.filter((l) => l !== leg);
    this.restoreLeg(leg);
    // The survivors each hold an edge into this leg's destination, built by the
    // cross-connect in build(). Disconnecting the destination itself does not
    // remove them — in WebAudio the edge belongs to the source.
    for (const other of this.legs) disconnectQuietly(other.source, leg.destination);
    disconnectQuietly(leg.source);
    disconnectQuietly(leg.micGain);
    disconnectQuietly(leg.destination);
  }

  /** Put a leg's own mic track back on its sender and stop the mixed one. */
  private restoreLeg(leg: MergedLeg): void {
    // Detached first: a leg on a released graph must not keep routing mute into
    // it. Synchronous, unlike the sender swap below — the caller may dispose and
    // immediately act on the call.
    leg.call.attachConference(null);
    // Queued behind any in-flight install: racing a second replaceTrack on one
    // sender settles in either order, which can leave the leg transmitting a
    // mixed track after the graph is gone.
    leg.swap = leg.swap.then(() => {
      const sender = leg.call.peerConnection.getSenders().find((s) => s.track?.kind === 'audio');
      // A sender on an ended call is gone; replaceTrack would reject.
      const mixed = leg.mixedTrack;
      leg.mixedTrack = null;
      if (sender && leg.originalTrack && leg.call.isConnected) {
        // The conference's mute, not this leg's own `isMuted`: only the call
        // whose mute() ran records it, so keying off the per-call flag would put
        // the other legs back live after a split — silent for the whole merge,
        // then transmitting while the UI still reads muted.
        leg.originalTrack.enabled = !this.muted;
        // Stopped only AFTER the mic is back on the sender: stopping a track still
        // attached to a sender cuts that leg's outbound media rather than swapping
        // it, which ended the other call moments after a split.
        return Promise.resolve(sender.replaceTrack(leg.originalTrack))
          .catch(() => undefined)
          .then(() => stopTrack(mixed));
      }
      stopTrack(mixed);
      return undefined;
    });
    if (leg.keepAlive) {
      leg.keepAlive.srcObject = null;
      leg.keepAlive = null;
    }
  }

  /**
   * Tear the conference down: every leg returns to its own mic uplink and the
   * graph is released. Idempotent.
   */
  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    for (const leg of this.legs) {
      this.restoreLeg(leg);
      try {
        leg.source.disconnect();
      } catch {
        // Already disconnected.
      }
    }
    this.legs = [];
    try {
      this.micSource?.disconnect();
    } catch {
      // Already disconnected.
    }
    try {
      this.monitorGain?.disconnect();
    } catch {
      // Already disconnected.
    }
    this.monitorGain = null;
    this.micSource = null;
    this.localDestination = null;
    const ctx = this.ctx;
    this.ctx = null;
    // A leaked context keeps the tab's audio indicator lit for the session.
    if (ctx) void Promise.resolve(ctx.close()).catch(() => undefined);
  }
}
