import { resolveCallAudio, silentRingback } from '../callAudio';

describe('resolveCallAudio', () => {
  it('leaves call audio to the SDK by default', () => {
    expect(resolveCallAudio(false)).toBe('sdk');
  });

  it('lets an app without a bridge take call audio over', () => {
    expect(resolveCallAudio(false, 'host')).toBe('host');
  });

  it('always leaves call audio to the host with a bridge', () => {
    expect(resolveCallAudio(true)).toBe('host');
    expect(resolveCallAudio(true, 'sdk')).toBe('host');
  });
});

describe('silentRingback', () => {
  it('never reports itself playing', () => {
    silentRingback.start();
    expect(silentRingback.isPlaying).toBe(false);
    silentRingback.stop();
    expect(silentRingback.isPlaying).toBe(false);
  });
});
