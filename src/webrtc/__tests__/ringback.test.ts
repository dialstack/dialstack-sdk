import { RingbackTone } from '../ringback';

// Fakes only the WebAudio boundary (AudioContext); the controller's
// start/stop/cadence logic is the real code under test.

class FakeParam {
  value = 0;
  setCalls: Array<{ value: number; time: number }> = [];
  setValueAtTime(value: number, time: number): void {
    this.value = value;
    this.setCalls.push({ value, time });
  }
}

class FakeOscillator {
  frequency = new FakeParam();
  started = false;
  stopped = false;
  connected = false;
  connect(): void {
    this.connected = true;
  }
  disconnect(): void {
    this.connected = false;
  }
  start(): void {
    this.started = true;
  }
  stop(): void {
    this.stopped = true;
  }
}

class FakeGain {
  gain = new FakeParam();
  connected = false;
  connect(): void {
    this.connected = true;
  }
  disconnect(): void {
    this.connected = false;
  }
}

class FakeAudioContext {
  static instances: FakeAudioContext[] = [];
  state: 'suspended' | 'running' | 'closed' = 'running';
  currentTime = 0;
  destination = {};
  oscillators: FakeOscillator[] = [];
  gains: FakeGain[] = [];
  resumed = false;
  closed = false;

  constructor() {
    FakeAudioContext.instances.push(this);
  }
  createOscillator(): FakeOscillator {
    const o = new FakeOscillator();
    this.oscillators.push(o);
    return o;
  }
  createGain(): FakeGain {
    const g = new FakeGain();
    this.gains.push(g);
    return g;
  }
  resume(): Promise<void> {
    this.resumed = true;
    this.state = 'running';
    return Promise.resolve();
  }
  close(): Promise<void> {
    this.closed = true;
    this.state = 'closed';
    return Promise.resolve();
  }
}

describe('RingbackTone', () => {
  const originalAudioContext = (globalThis as Record<string, unknown>).AudioContext;

  beforeEach(() => {
    FakeAudioContext.instances = [];
    (globalThis as Record<string, unknown>).AudioContext =
      FakeAudioContext as unknown as typeof AudioContext;
  });

  afterEach(() => {
    if (originalAudioContext === undefined) {
      delete (globalThis as Record<string, unknown>).AudioContext;
    } else {
      (globalThis as Record<string, unknown>).AudioContext = originalAudioContext;
    }
  });

  it('builds a dual-frequency 440/480 Hz oscillator pair on start', () => {
    const tone = new RingbackTone();
    tone.start();

    expect(tone.isPlaying).toBe(true);
    const ctx = FakeAudioContext.instances[0];
    expect(ctx.oscillators.map((o) => o.frequency.value).sort()).toEqual([440, 480]);
    expect(ctx.oscillators.every((o) => o.started && o.connected)).toBe(true);
  });

  it('schedules an on/off cadence on the gain node', () => {
    const tone = new RingbackTone();
    tone.start();

    const gain = FakeAudioContext.instances[0].gains[0];
    // First window: audible at t=0, silent two seconds later.
    expect(gain.gain.setCalls[0]).toEqual({ value: expect.any(Number), time: 0 });
    expect(gain.gain.setCalls[0].value).toBeGreaterThan(0);
    expect(gain.gain.setCalls[1]).toEqual({ value: 0, time: 2 });
  });

  it('keeps the cadence on a fixed lattice across re-arms (no drift)', () => {
    jest.useFakeTimers();
    try {
      const tone = new RingbackTone();
      tone.start();
      const ctx = FakeAudioContext.instances[0];
      const gain = ctx.gains[0];
      const onTimes = () => gain.gain.setCalls.filter((c) => c.value > 0).map((c) => c.time);

      // Initial batch is scheduled ahead from t=0 on the 6s lattice.
      expect(onTimes()).toEqual([0, 6]);

      // The re-arm timer fires late — the audio clock has already run on to 13s.
      ctx.currentTime = 13;
      jest.advanceTimersByTime(6000);

      // New windows continue the same lattice (12, 18, 24…) instead of
      // re-anchoring to 13, so every on-window stays a multiple of the cadence.
      const ons = onTimes();
      expect(ons).toContain(12);
      expect(ons).toContain(18);
      expect(ons.every((t) => t % 6 === 0)).toBe(true);
    } finally {
      jest.useRealTimers();
    }
  });

  it('resumes a context the browser created suspended', () => {
    (globalThis as Record<string, unknown>).AudioContext = class extends FakeAudioContext {
      constructor() {
        super();
        this.state = 'suspended';
      }
    } as unknown as typeof AudioContext;

    const tone = new RingbackTone();
    tone.start();

    expect(FakeAudioContext.instances[0].resumed).toBe(true);
  });

  it('is idempotent: a second start does not build a second context', () => {
    const tone = new RingbackTone();
    tone.start();
    tone.start();
    expect(FakeAudioContext.instances).toHaveLength(1);
  });

  it('stops oscillators and closes the context on stop', () => {
    const tone = new RingbackTone();
    tone.start();
    const ctx = FakeAudioContext.instances[0];
    tone.stop();

    expect(tone.isPlaying).toBe(false);
    expect(ctx.oscillators.every((o) => o.stopped)).toBe(true);
    expect(ctx.closed).toBe(true);
  });

  it('stop is a no-op when never started', () => {
    const tone = new RingbackTone();
    expect(() => tone.stop()).not.toThrow();
    expect(tone.isPlaying).toBe(false);
  });

  it('degrades gracefully (no throw, stays silent) when WebAudio is unavailable', () => {
    delete (globalThis as Record<string, unknown>).AudioContext;
    const tone = new RingbackTone();
    expect(() => tone.start()).not.toThrow();
    expect(tone.isPlaying).toBe(false);
  });

  it('does not wedge isPlaying if building the graph throws, and can retry', () => {
    let fail = true;
    (globalThis as Record<string, unknown>).AudioContext = class extends FakeAudioContext {
      createOscillator(): FakeOscillator {
        if (fail) throw new Error('oscillator unavailable');
        return super.createOscillator();
      }
    } as unknown as typeof AudioContext;

    const tone = new RingbackTone();
    expect(() => tone.start()).not.toThrow();
    // A failed build must report not-playing (not a silent "playing") and free
    // the context, so a later attempt can succeed.
    expect(tone.isPlaying).toBe(false);
    expect(FakeAudioContext.instances[0].closed).toBe(true);

    fail = false;
    tone.start();
    expect(tone.isPlaying).toBe(true);
  });
});
