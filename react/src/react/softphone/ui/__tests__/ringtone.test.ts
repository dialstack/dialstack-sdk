import { IncomingRingtone } from '../ringtone';

class FakeParam {
  value = 0;
  setValueAtTime(): void {}
}

class FakeNode {
  frequency = new FakeParam();
  gain = new FakeParam();
  connect(): void {}
  disconnect(): void {}
  start(): void {}
  stop(): void {}
}

class FakeAudioContext {
  static instances: FakeAudioContext[] = [];
  state: 'suspended' | 'running' | 'closed' = 'running';
  currentTime = 0;
  destination = {};
  closed = false;
  readonly options: { sinkId?: string } | undefined;
  sinkIdCalls: string[] = [];

  constructor(options?: { sinkId?: string }) {
    this.options = options;
    FakeAudioContext.instances.push(this);
  }
  createOscillator(): FakeNode {
    return new FakeNode();
  }
  createGain(): FakeNode {
    return new FakeNode();
  }
  setSinkId(sinkId: string): Promise<void> {
    this.sinkIdCalls.push(sinkId);
    return Promise.resolve();
  }
  resume(): Promise<void> {
    this.state = 'running';
    return Promise.resolve();
  }
  close(): Promise<void> {
    this.closed = true;
    this.state = 'closed';
    return Promise.resolve();
  }
}

describe('IncomingRingtone output routing', () => {
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

  it('constructs the context already routed, rather than switching after', () => {
    const ringtone = new IncomingRingtone();
    ringtone.setSinkId('spk-1');
    ringtone.start();

    const ctx = FakeAudioContext.instances[0];
    expect(ctx.options).toEqual({ sinkId: 'spk-1' });
    expect(ctx.sinkIdCalls).toEqual([]);
  });

  it('re-routes every start, because stop() closes the context', () => {
    const ringtone = new IncomingRingtone();
    ringtone.setSinkId('spk-1');
    ringtone.start();
    ringtone.stop();
    ringtone.start();

    expect(FakeAudioContext.instances).toHaveLength(2);
    expect(FakeAudioContext.instances[1].options).toEqual({ sinkId: 'spk-1' });
  });

  it('re-routes a ring that is already playing', () => {
    const ringtone = new IncomingRingtone();
    ringtone.start();
    ringtone.setSinkId('spk-2');

    expect(FakeAudioContext.instances[0].sinkIdCalls).toEqual(['spk-2']);
  });

  it('passes no options at all when using the OS default', () => {
    const ringtone = new IncomingRingtone();
    ringtone.setSinkId(null);
    ringtone.start();

    expect(FakeAudioContext.instances[0].options).toBeUndefined();
  });

  it('rings on the default device when a stale sink makes construction throw', () => {
    // The AudioContext constructor validates the sink synchronously and throws for an id
    // that no longer resolves — the normal state of a saved id before the page has mic
    // permission. Going silent here just looked like missed calls.
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

    const tone = new IncomingRingtone();
    tone.setSinkId('spk-gone');
    tone.start();

    expect(tone.isPlaying).toBe(true);
  });

  it('forgets a sink that threw, so later rings do not retry it', () => {
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

    const tone = new IncomingRingtone();
    tone.setSinkId('spk-gone');
    tone.start();
    tone.stop();
    const afterFirst = attempts;

    tone.start();

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

    const ringtone = new IncomingRingtone();
    ringtone.setSinkId('spk-1');
    ringtone.start();

    expect(ringtone.isPlaying).toBe(true);
  });

  it('still rings on a context with no setSinkId method', () => {
    class NoSinkContext extends FakeAudioContext {
      setSinkId = undefined as unknown as (id: string) => Promise<void>;
    }
    (globalThis as Record<string, unknown>).AudioContext =
      NoSinkContext as unknown as typeof AudioContext;

    const ringtone = new IncomingRingtone();
    ringtone.start();
    // lib.dom.d.ts types setSinkId, so only a runtime check catches its absence.
    expect(() => ringtone.setSinkId('spk-2')).not.toThrow();
    expect(ringtone.isPlaying).toBe(true);
  });

  it('keeps ringing when the device rejects the route', async () => {
    class RejectingContext extends FakeAudioContext {
      setSinkId(): Promise<void> {
        return Promise.reject(new Error('NotFoundError'));
      }
    }
    (globalThis as Record<string, unknown>).AudioContext =
      RejectingContext as unknown as typeof AudioContext;

    const ringtone = new IncomingRingtone();
    ringtone.start();
    ringtone.setSinkId('spk-gone');
    await Promise.resolve();

    expect(ringtone.isPlaying).toBe(true);
  });

  it('reverts a live tone to the OS default', async () => {
    // Bailing on null left the tone on the device the user just switched away from.
    // '' is the spec's default-sink instruction.
    const tone = new IncomingRingtone();
    tone.setSinkId('spk-1');
    tone.start();
    tone.setSinkId(null);

    expect(FakeAudioContext.instances[0].sinkIdCalls).toEqual(['']);
  });
});
