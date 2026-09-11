/**
 * @jest-environment node
 *
 * The DOM half of `supportsConference()`: merge stays hidden on React Native
 * even when the host polyfills WebAudio. Its own file because jsdom's
 * `document` is non-configurable and cannot be removed in the main suite.
 */

import { LocalConference, supportsConference } from '../conference.js';
import type { Call } from '../call.js';
import type { MediaStream } from '../platform.js';

class FakeAudioContext {
  createMediaStreamSource(): unknown {
    return { connect() {}, disconnect() {} };
  }
  createMediaStreamDestination(): unknown {
    return { connect() {}, disconnect() {}, stream: { getAudioTracks: () => [] } };
  }
  createGain(): unknown {
    return { gain: { value: 1 }, connect() {}, disconnect() {} };
  }
  resume(): Promise<void> {
    return Promise.resolve();
  }
  close(): Promise<void> {
    return Promise.resolve();
  }
}

describe('supportsConference on a DOM-less host (React Native)', () => {
  beforeEach(() => {
    (globalThis as Record<string, unknown>).AudioContext = FakeAudioContext;
  });
  afterEach(() => {
    delete (globalThis as Record<string, unknown>).AudioContext;
  });

  it('has no document to confirm the environment models RN', () => {
    expect(typeof document).toBe('undefined');
  });

  it('is false even with WebAudio present', () => {
    expect(supportsConference()).toBe(false);
  });

  it('refuses merge() rather than building a conference that carries silence', () => {
    const call = { isConnected: true, id: 'call_a' } as unknown as Call;
    expect(() => LocalConference.merge([call, call], {} as unknown as MediaStream)).toThrow(
      /WebAudio and a DOM/
    );
  });
});
