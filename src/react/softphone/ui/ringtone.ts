// Incoming-call ringtone, synthesized with WebAudio so the web softphone has an
// audible ring when an inbound call arrives (the core plays outbound *ringback*
// via webrtc/ringback.ts; this is the *inbound* ring, and lives in the softphone
// UI layer — the SDK core stays audio-agnostic about incoming calls).
//
// North-American ringing cadence: a 440 + 480 Hz tone, 2 s on / 4 s off. Same
// structure as the core RingbackTone (scheduled on a fixed cadence lattice,
// idempotent start/stop, silently no-ops without WebAudio), duplicated here
// rather than imported so the softphone UI never depends on webrtc internals.
const TONE_FREQUENCIES_HZ = [440, 480];
const ON_SECONDS = 2;
const OFF_SECONDS = 4;
const CADENCE_SECONDS = ON_SECONDS + OFF_SECONDS;
const SCHEDULE_AHEAD_SECONDS = 2 * CADENCE_SECONDS;
const ON_GAIN = 0.14;

type AudioContextConstructor = new () => AudioContext;

function resolveAudioContext(): AudioContextConstructor | null {
  const g = globalThis as Record<string, unknown>;
  const Ctor = g.AudioContext ?? g.webkitAudioContext;
  return (Ctor as AudioContextConstructor | undefined) ?? null;
}

export class IncomingRingtone {
  private ctx: AudioContext | null = null;
  private gain: GainNode | null = null;
  private oscillators: OscillatorNode[] = [];
  private cadenceTimer: ReturnType<typeof setInterval> | null = null;
  private started = false;
  private nextCadenceTime = 0;

  get isPlaying(): boolean {
    return this.started;
  }

  // Idempotent; no-ops without throwing when WebAudio is unavailable (e.g. SSR
  // or a test environment) so callers never have to guard the call site.
  start(): void {
    if (this.started) return;
    const Ctor = resolveAudioContext();
    if (!Ctor) return;
    let ctx: AudioContext;
    try {
      ctx = new Ctor();
    } catch {
      return;
    }
    this.ctx = ctx;

    // An inbound ring is not initiated by a user gesture, so the AudioContext may
    // start suspended under autoplay policy; resume best-effort (it unlocks once
    // the user has interacted with the page, which is the norm for an app that's
    // already connected the softphone). Failure is silence, never a throw.
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

      this.nextCadenceTime = ctx.currentTime;
      this.scheduleCadenceAhead();
      this.cadenceTimer = setInterval(() => this.scheduleCadenceAhead(), CADENCE_SECONDS * 1000);
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
