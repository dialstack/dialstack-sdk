import { RingbackTone } from '../ringback';

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
  readonly options: { sinkId?: string } | undefined;
  sinkIdCalls: string[] = [];

  constructor(options?: { sinkId?: string }) {
    this.options = options;
    FakeAudioContext.instances.push(this);
  }
  setSinkId(sinkId: string): Promise<void> {
    this.sinkIdCalls.push(sinkId);
    return Promise.resolve();
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

      expect(onTimes()).toEqual([0, 6]);

      ctx.currentTime = 13;
      jest.advanceTimersByTime(6000);

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
    expect(tone.isPlaying).toBe(false);
    expect(FakeAudioContext.instances[0].closed).toBe(true);

    fail = false;
    tone.start();
    expect(tone.isPlaying).toBe(true);
  });

  describe('output device routing', () => {
    it('constructs the context already routed, rather than switching after', () => {
      const tone = new RingbackTone();
      tone.setSinkId('spk-1');
      tone.start();

      const ctx = FakeAudioContext.instances[0];
      expect(ctx.options).toEqual({ sinkId: 'spk-1' });
      expect(ctx.sinkIdCalls).toEqual([]);
    });

    it('re-routes every start, because stop() closes the context', () => {
      const tone = new RingbackTone();
      tone.setSinkId('spk-1');
      tone.start();
      tone.stop();
      tone.start();

      expect(FakeAudioContext.instances).toHaveLength(2);
      expect(FakeAudioContext.instances[1].options).toEqual({ sinkId: 'spk-1' });
    });

    it('re-routes a context that is already ringing', () => {
      const tone = new RingbackTone();
      tone.start();
      tone.setSinkId('spk-2');

      expect(FakeAudioContext.instances[0].sinkIdCalls).toEqual(['spk-2']);
    });

    it('passes no options at all when using the OS default', () => {
      const tone = new RingbackTone();
      tone.setSinkId(null);
      tone.start();

      expect(FakeAudioContext.instances[0].options).toBeUndefined();
    });

    it('rings on the default device when a stale sink makes construction throw', () => {
      // The AudioContext constructor validates the sink synchronously and throws for an
      // id that no longer resolves — the normal state of a saved id before the page has
      // mic permission. Going silent here looked like the SDK had stopped ringing.
      class RejectingSinkContext extends FakeAudioContext {
        constructor(options?: { sinkId?: string }) {
          if (options?.sinkId) {
            throw Object.assign(new Error('no such sink'), { name: 'NotFoundError' });
          }
          super(options);
        }
      }
      (globalThis as Record<string, unknown>).AudioContext =
        RejectingSinkContext as unknown as typeof AudioContext;

      const tone = new RingbackTone();
      tone.setSinkId('spk-gone');
      tone.start();

      expect(tone.isPlaying).toBe(true);
    });

    it('forgets a sink that threw, so later tones do not retry it', () => {
      let attempts = 0;
      class OnceRejectingContext extends FakeAudioContext {
        constructor(options?: { sinkId?: string }) {
          attempts++;
          if (options?.sinkId) {
            throw Object.assign(new Error('no such sink'), { name: 'NotFoundError' });
          }
          super(options);
        }
      }
      (globalThis as Record<string, unknown>).AudioContext =
        OnceRejectingContext as unknown as typeof AudioContext;

      const tone = new RingbackTone();
      tone.setSinkId('spk-gone');
      tone.start();
      tone.stop();
      const afterFirst = attempts;

      tone.start();

      // Exactly one construction on the second start: the bad id is gone, not retried.
      expect(attempts).toBe(afterFirst + 1);
      expect(tone.isPlaying).toBe(true);
    });

    it('still rings on an engine that ignores the sinkId option', () => {
      class OptionIgnoringContext extends FakeAudioContext {
        constructor() {
          super(undefined);
        }
      }
      (globalThis as Record<string, unknown>).AudioContext =
        OptionIgnoringContext as unknown as typeof AudioContext;

      const tone = new RingbackTone();
      tone.setSinkId('spk-1');
      tone.start();

      expect(tone.isPlaying).toBe(true);
    });

    it('still rings on a context with no setSinkId method', () => {
      class NoSinkContext extends FakeAudioContext {
        setSinkId = undefined as unknown as (id: string) => Promise<void>;
      }
      (globalThis as Record<string, unknown>).AudioContext =
        NoSinkContext as unknown as typeof AudioContext;

      const tone = new RingbackTone();
      tone.start();
      // A live change against an engine lacking the method must no-op, not throw —
      // lib.dom.d.ts types setSinkId, so only a runtime check catches its absence.
      expect(() => tone.setSinkId('spk-2')).not.toThrow();
      expect(tone.isPlaying).toBe(true);
    });

    it('keeps ringing when the device rejects the route', async () => {
      class RejectingContext extends FakeAudioContext {
        setSinkId(): Promise<void> {
          return Promise.reject(new Error('NotFoundError'));
        }
      }
      (globalThis as Record<string, unknown>).AudioContext =
        RejectingContext as unknown as typeof AudioContext;

      const tone = new RingbackTone();
      tone.start();
      tone.setSinkId('spk-gone');
      await Promise.resolve();

      expect(tone.isPlaying).toBe(true);
    });
  });

  it('reverts a live tone to the OS default', async () => {
    // Bailing on null left the tone on the device the user just switched away from.
    // '' is the spec's default-sink instruction.
    const tone = new RingbackTone();
    tone.setSinkId('spk-1');
    tone.start();
    tone.setSinkId(null);

    expect(FakeAudioContext.instances[0].sinkIdCalls).toEqual(['']);
  });
});
