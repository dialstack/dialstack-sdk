/**
 * Tests for the /v1/presence query the SDK builds from each park-slot selector,
 * on both the one-shot read and the subscription.
 *
 * The query is worth pinning because "all" and specific slots are mutually
 * exclusive server-side — they disagree about whether free slots are emitted —
 * so a client that sent both would get a 400 instead of a board.
 */

import { DialStack } from '../server';

describe('park slots', () => {
  const mockFetch = jest.fn();
  global.fetch = mockFetch;

  const emptyBoard = {
    ok: true,
    status: 200,
    json: async () => ({ object: 'list', url: '/v1/presence', data: [] }),
    text: async () => '{"object":"list","url":"/v1/presence","data":[]}',
    headers: new Headers(),
  };

  const client = new DialStack('sk_test_xxx');
  const options = { dialstackAccount: 'acct_01h00000000000000000000000' };

  beforeEach(() => {
    mockFetch.mockReset();
    mockFetch.mockResolvedValue(emptyBoard);
  });

  const requestedUrl = (): string => String(mockFetch.mock.calls[0][0]);

  describe('presence.list query', () => {
    it('asks for all park slots when none are named', async () => {
      await client.presence.list({ parkSlots: true }, options);
      expect(requestedUrl()).toContain('park_slot%5B%5D=all');
    });

    it('names each requested slot', async () => {
      await client.presence.list({ parkSlotNumbers: [1, 2] }, options);

      const url = requestedUrl();
      expect(url).toContain('park_slot%5B%5D=1');
      expect(url).toContain('park_slot%5B%5D=2');
      expect(url).not.toContain('park_slot%5B%5D=all');
    });

    // Sending both would be rejected, so the more specific request wins rather
    // than the caller discovering the conflict as a 400.
    it('prefers named slots over parkSlots rather than sending both', async () => {
      await client.presence.list({ parkSlots: true, parkSlotNumbers: [3] }, options);

      const url = requestedUrl();
      expect(url).toContain('park_slot%5B%5D=3');
      expect(url).not.toContain('park_slot%5B%5D=all');
    });

    it('carries users alongside park slots', async () => {
      await client.presence.list(
        { users: ['user_01h2xcejqtf2nbrexx3vqjhp42'], parkSlotNumbers: [4] },
        options
      );

      const url = requestedUrl();
      expect(url).toContain('user%5B%5D=user_01h2xcejqtf2nbrexx3vqjhp42');
      expect(url).toContain('park_slot%5B%5D=4');
    });
  });

  describe('subscribeParkSlots query', () => {
    // The subscription never resolves, so drive it far enough to observe the
    // request and then close it.
    const openThenClose = async (slots?: number[]): Promise<string> => {
      mockFetch.mockImplementation(
        () => new Promise(() => {}) // never settles; we only want the request
      );
      const subscription = client.presence.subscribeParkSlots({}, { ...options, slots });
      await Promise.resolve();
      subscription.close();
      return requestedUrl();
    };

    it('subscribes to all slots by default', async () => {
      expect(await openThenClose()).toContain('park_slot%5B%5D=all');
    });

    it('subscribes to only the named slots', async () => {
      const url = await openThenClose([2, 5]);
      expect(url).toContain('park_slot%5B%5D=2');
      expect(url).toContain('park_slot%5B%5D=5');
      expect(url).not.toContain('park_slot%5B%5D=all');
    });

    it('falls back to all slots for an empty slot list', async () => {
      expect(await openThenClose([])).toContain('park_slot%5B%5D=all');
    });
  });

  // A 429 without Retry-After is the shape shared infrastructure returns, and it
  // used to skip both the error callback and the backoff escalation — one request
  // per second forever, with the caller told nothing.
  describe('subscribeParkSlots refusals', () => {
    const refuse = (): unknown => ({
      ok: false,
      status: 429,
      body: { cancel: jest.fn() },
      headers: new Headers(),
    });

    // Lets every pending microtask run, so the loop reaches its next await.
    const flush = async (): Promise<void> => {
      for (let i = 0; i < 10; i++) {
        await Promise.resolve();
      }
    };

    beforeEach(() => {
      jest.useFakeTimers();
    });

    afterEach(() => {
      jest.useRealTimers();
    });

    it('reports each refusal and escalates the wait', async () => {
      mockFetch.mockImplementation(async () => refuse());
      const onError = jest.fn();

      const subscription = client.presence.subscribeParkSlots({ onError }, options);
      await flush();

      expect(mockFetch).toHaveBeenCalledTimes(1);
      expect(onError).toHaveBeenCalledTimes(1);

      // First wait is the initial 1s.
      jest.advanceTimersByTime(1000);
      await flush();
      expect(mockFetch).toHaveBeenCalledTimes(2);

      // Second wait has doubled, so another second is not enough to reconnect.
      jest.advanceTimersByTime(1000);
      await flush();
      expect(mockFetch).toHaveBeenCalledTimes(2);

      jest.advanceTimersByTime(1000);
      await flush();
      expect(mockFetch).toHaveBeenCalledTimes(3);

      subscription.close();
    });

    it('releases the refused response body', async () => {
      const response = refuse() as { body: { cancel: jest.Mock } };
      mockFetch.mockImplementation(async () => response);

      const subscription = client.presence.subscribeParkSlots({}, options);
      await flush();

      expect(response.body.cancel).toHaveBeenCalled();
      subscription.close();
    });
  });
});
