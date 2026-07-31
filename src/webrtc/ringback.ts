// North-American ringback (440 + 480 Hz, 2 s on / 4 s off), synthesized with
// WebAudio so the softphone has audible ringing when the network sends none.
const TONE_FREQUENCIES_HZ = [440, 480];
const ON_SECONDS = 2;
const OFF_SECONDS = 4;
const CADENCE_SECONDS = ON_SECONDS + OFF_SECONDS;
// How far ahead of the audio clock to keep cadence windows scheduled. Larger
// than the re-arm interval so timer jitter (or a throttled background tab)
// can't leave a gap before the next top-up runs.
const SCHEDULE_AHEAD_SECONDS = 2 * CADENCE_SECONDS;
// Per-oscillator; the two sum at the gain node, so keep well below 1.0.
const ON_GAIN = 0.12;

// `sinkId` isn't in this TypeScript release's AudioContextOptions. An engine without the
// Audio Output Devices API ignores the unknown option and returns a default-routed context.
type RoutableAudioContextOptions = AudioContextOptions & { sinkId?: string };
type AudioContextConstructor = new (options?: RoutableAudioContextOptions) => AudioContext;

function resolveAudioContext(): AudioContextConstructor | null {
  const g = globalThis as Record<string, unknown>;
  const Ctor = g.AudioContext ?? g.webkitAudioContext;
  return (Ctor as AudioContextConstructor | undefined) ?? null;
}

// `AudioContext.setSinkId` is Chromium-only (110+), unlike the identically-named
// HTMLMediaElement method, so outside Chromium a tone stays on the OS default.
type RoutableAudioContext = AudioContext & {
  setSinkId?: (sinkId: string) => Promise<void>;
};

/**
 * Outbound ringback contract the call core drives. The core never guards the
 * call site, so implementations must be idempotent and no-op silently when their
 * audio backend is unavailable. Web is `RingbackTone` (WebAudio); React Native
 * supplies its own (InCallManager-backed) via `PhoneOptions.ringback`, because
 * WebAudio's `AudioContext` doesn't exist there.
 */
export interface Ringback {
  readonly isPlaying: boolean;
  start(): void;
  stop(): void;
  /**
   * Route the tone to a specific output device, or null for the OS default.
   *
   * OPTIONAL: an implementation whose backend has no per-device routing simply
   * omits it (React Native routes audio through InCallManager, not per-device),
   * and the core calls it as `ringback.setSinkId?.(id)` so an omission is a no-op
   * rather than a crash. Like start/stop, an implementation that has it must
   * no-op instead of throwing when its backend can't honor the request.
   */
  setSinkId?(deviceId: string | null): void;
}

export class RingbackTone implements Ringback {
  private ctx: AudioContext | null = null;
  private gain: GainNode | null = null;
  private oscillators: OscillatorNode[] = [];
  private cadenceTimer: ReturnType<typeof setInterval> | null = null;
  private started = false;
  // Audio-clock time of the next on-window to schedule. Tracked (rather than
  // re-read from currentTime each tick) so windows stay on a fixed cadence
  // lattice and never drift or overlap, even if the re-arm timer fires late.
  private nextCadenceTime = 0;
  private sinkId: string | null = null;

  get isPlaying(): boolean {
    return this.started;
  }

  /**
   * Applied at AudioContext *construction* in start(), not after: the async setter
   * would let the first milliseconds out of the default device. A context already
   * running is re-routed live — the one case the setter is needed for.
   */
  setSinkId(deviceId: string | null): void {
    this.sinkId = deviceId;
    const ctx = this.ctx as RoutableAudioContext | null;
    if (!ctx || typeof ctx.setSinkId !== 'function') return;
    // '' is the spec's default sink; bailing on null left a live tone on the old device.
    void Promise.resolve(ctx.setSinkId(deviceId ?? '')).catch(() => undefined);
  }

  // Idempotent; no-ops without throwing when WebAudio is unavailable (e.g. a
  // Node/test environment) so callers never have to guard the call site.
  start(): void {
    if (this.started) return;
    const Ctor = resolveAudioContext();
    if (!Ctor) return;
    let ctx: AudioContext;
    try {
      // Re-passed every start(): stop() closes the context, so once-only silently reverts.
      ctx = new Ctor(this.sinkId ? { sinkId: this.sinkId } : undefined);
    } catch {
      // Some engines reject an unusable sink at construction. Chrome instead reroutes
      // itself to the default device, so this is a guard for the stricter ones: tone on
      // the default rather than not at all, and forget the id so it isn't retried.
      this.sinkId = null;
      try {
        ctx = new Ctor();
      } catch {
        return;
      }
    }
    this.ctx = ctx;

    // Outbound calls start from a user gesture, so a suspended context can be
    // resumed without tripping autoplay policy. Best-effort; failure is silence.
    if (ctx.state === 'suspended' && typeof ctx.resume === 'function') {
      void Promise.resolve(ctx.resume()).catch(() => undefined);
    }

    try {
      const gain = ctx.createGain();
      gain.gain.value = 0;
      gain.connect(ctx.destination);
      this.gain = gain;

      for (const frequency of TONE_FREQUENCIES_HZ) {
        const osc = ctx.createOscillator();
        osc.frequency.value = frequency;
        osc.connect(gain);
        osc.start();
        this.oscillators.push(osc);
      }

      // Anchor the cadence lattice to the clock, then top it up each cadence so
      // the ring repeats for as long as the call rings.
      this.nextCadenceTime = ctx.currentTime;
      this.scheduleCadenceAhead();
      this.cadenceTimer = setInterval(() => this.scheduleCadenceAhead(), CADENCE_SECONDS * 1000);
      // Set last: a throw above leaves started=false so isPlaying stays honest
      // and the instance can be retried rather than reporting a silent "playing".
      this.started = true;
    } catch {
      this.teardown();
    }
  }

  // Idempotent.
  stop(): void {
    if (!this.started) return;
    this.started = false;
    this.teardown();
  }

  private teardown(): void {
    if (this.cadenceTimer) {
      clearInterval(this.cadenceTimer);
      this.cadenceTimer = null;
    }
    for (const osc of this.oscillators) {
      try {
        osc.stop();
        osc.disconnect();
      } catch {
        // Already stopped/disconnected.
      }
    }
    this.oscillators = [];
    if (this.gain) {
      try {
        this.gain.disconnect();
      } catch {
        // Already disconnected.
      }
      this.gain = null;
    }
    const ctx = this.ctx;
    this.ctx = null;
    if (ctx && typeof ctx.close === 'function') {
      void Promise.resolve(ctx.close()).catch(() => undefined);
    }
  }

  // Schedule on/off windows up to SCHEDULE_AHEAD_SECONDS past the audio clock,
  // continuing from nextCadenceTime so the grid is contiguous across re-arms.
  private scheduleCadenceAhead(): void {
    const ctx = this.ctx;
    const gain = this.gain;
    if (!ctx || !gain) return;
    // Drop windows that already fully elapsed (e.g. the timer was throttled
    // while backgrounded), staying on the lattice rather than re-anchoring.
    while (this.nextCadenceTime + CADENCE_SECONDS <= ctx.currentTime) {
      this.nextCadenceTime += CADENCE_SECONDS;
    }
    const horizon = ctx.currentTime + SCHEDULE_AHEAD_SECONDS;
    while (this.nextCadenceTime < horizon) {
      gain.gain.setValueAtTime(ON_GAIN, this.nextCadenceTime);
      gain.gain.setValueAtTime(0, this.nextCadenceTime + ON_SECONDS);
      this.nextCadenceTime += CADENCE_SECONDS;
    }
  }
}
