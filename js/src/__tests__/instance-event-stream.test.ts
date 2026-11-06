/**
 * Tests for the lifecycle of the SSE event stream: one stream per instance,
 * cancellation of an in-flight connect, and reconnect backoff.
 */

import { TextDecoder, TextEncoder } from 'util';

// jsdom has neither; without TextDecoder every stream errors as soon as it opens.
Object.assign(globalThis, { TextDecoder, TextEncoder });

interface FakeStream {
  signal: AbortSignal;
  push(text: string): void;
  close(): void;
  fail(): void;
}

type Read = { done: boolean; value?: Uint8Array };

const CONNECTED = 'event: connected\ndata: {}\n\n';
const HEARTBEAT = ': heartbeat\n\n';

describe('DialStackInstanceImplClass event stream', () => {
  const originalFetch = global.fetch;
  let streams: FakeStream[];
  let instances: Array<{ logout(): Promise<void> }>;
  // When set, fetch stays pending until the test settles it.
  let holdFetches: boolean;
  let heldFetches: Array<{ signal: AbortSignal; respond(status: number): void }>;

  // A stream whose reads stay pending until the test pushes data, closes it,
  // fails it, or the fetch signal aborts it.
  const openStream = (signal: AbortSignal): Response => {
    const queued: Array<() => Promise<Read>> = [];
    let waiting: { resolve: (r: Read) => void; reject: (e: unknown) => void } | null = null;
    const deliver = (
      settle: (w: NonNullable<typeof waiting>) => void,
      later: () => Promise<Read>
    ) => {
      if (waiting) {
        const w = waiting;
        waiting = null;
        settle(w);
      } else {
        queued.push(later);
      }
    };
    signal.addEventListener('abort', () => {
      waiting?.reject(new DOMException('aborted', 'AbortError'));
      waiting = null;
    });
    streams.push({
      signal,
      push: (text) => {
        const chunk = { done: false, value: new TextEncoder().encode(text) };
        deliver(
          (w) => w.resolve(chunk),
          () => Promise.resolve(chunk)
        );
      },
      close: () =>
        deliver(
          (w) => w.resolve({ done: true }),
          () => Promise.resolve({ done: true })
        ),
      fail: () => {
        const error = new TypeError('network error');
        deliver(
          (w) => w.reject(error),
          () => Promise.reject(error)
        );
      },
    });
    const reader = {
      read: () =>
        queued.length > 0
          ? queued.shift()!()
          : new Promise<Read>((resolve, reject) => {
              waiting = { resolve, reject };
            }),
    };
    return { ok: true, status: 200, body: { getReader: () => reader } } as unknown as Response;
  };

  const rejected = (status: number) =>
    ({ ok: false, status, json: async () => ({ error: 'unauthorized' }) }) as unknown as Response;

  beforeEach(() => {
    jest.useFakeTimers();
    streams = [];
    instances = [];
    holdFetches = false;
    heldFetches = [];
    global.fetch = jest.fn((_url: unknown, init?: RequestInit) => {
      const signal = init!.signal!;
      if (signal.aborted) return Promise.reject(new DOMException('aborted', 'AbortError'));
      if (!holdFetches) return Promise.resolve(openStream(signal));
      return new Promise<Response>((resolve) => {
        heldFetches.push({
          signal,
          respond: (status) => resolve(status === 200 ? openStream(signal) : rejected(status)),
        });
      });
    }) as unknown as typeof fetch;
    jest.spyOn(console, 'log').mockImplementation(() => {});
    jest.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(async () => {
    // Close every stream and timer before the next test's fetch mock goes in.
    for (const instance of instances) await instance.logout();
    jest.restoreAllMocks();
    jest.useRealTimers();
    global.fetch = originalFetch;
  });

  // fetchClientSecret resolves 200ms later, leaving the window in which the
  // stream used to be unclaimed.
  const newInstance = async () => {
    const { DialStackInstanceImplClass } = await import('../core/instance');
    const instance = new DialStackInstanceImplClass({
      publishableKey: 'pk_test_xxx',
      fetchClientSecret: () =>
        new Promise<string>((resolve) => setTimeout(() => resolve('cs_test_secret'), 200)),
    });
    instances.push(instance);
    return instance;
  };

  const openStreams = () => streams.filter((s) => !s.signal.aborted);
  const lastStream = () => streams[streams.length - 1]!;

  it('shares one stream between listeners added in the same tick', async () => {
    const instance = await newInstance();
    const onIncoming = jest.fn();
    const onRinging = jest.fn();
    instance.on('call.incoming', onIncoming);
    instance.on('call.ringing', onRinging);
    await jest.advanceTimersByTimeAsync(200);

    expect(global.fetch).toHaveBeenCalledTimes(1);

    streams[0]!.push(
      'event: call.incoming\ndata: {"from_number":"+14155551234","to_number":"+14155559876","timestamp":"2026-11-06T12:00:00Z"}\n\n' +
        'event: call.ringing\ndata: {"call_id":"call_x","user":"user_x","ringing_at":"2026-11-06T12:00:00Z","timestamp":"2026-11-06T12:00:00Z"}\n\n'
    );
    await jest.advanceTimersByTimeAsync(0);

    expect(onIncoming).toHaveBeenCalledTimes(1);
    expect(onRinging).toHaveBeenCalledTimes(1);
  });

  it('leaves exactly one stream after on, off, on in the same tick, and none after the last off', async () => {
    const instance = await newInstance();
    const handler = jest.fn();
    instance.on('call.incoming', handler);
    instance.off('call.incoming', handler);
    instance.on('call.incoming', handler);
    await jest.advanceTimersByTimeAsync(200);

    expect(global.fetch).toHaveBeenCalledTimes(1);
    expect(openStreams()).toHaveLength(1);

    instance.off('call.incoming', handler);
    expect(openStreams()).toHaveLength(0);

    await jest.advanceTimersByTimeAsync(60_000);
    expect(global.fetch).toHaveBeenCalledTimes(1);
  });

  it('never opens a stream when off cancels the connect in flight', async () => {
    const instance = await newInstance();
    const handler = jest.fn();
    instance.on('call.incoming', handler);
    instance.off('call.incoming', handler);
    await jest.advanceTimersByTimeAsync(60_000);

    expect(global.fetch).not.toHaveBeenCalled();
  });

  it('ignores a 401 for a connect that was cancelled and replaced', async () => {
    const instance = await newInstance();
    const handler = jest.fn();
    holdFetches = true;
    instance.on('call.incoming', handler);
    await jest.advanceTimersByTimeAsync(200);
    expect(heldFetches).toHaveLength(1);

    // The 401 arrives, but off/on run before the connect resumes.
    heldFetches[0]!.respond(401);
    instance.off('call.incoming', handler);
    instance.on('call.incoming', handler);
    await jest.advanceTimersByTimeAsync(0);
    expect(heldFetches).toHaveLength(2);
    heldFetches[1]!.respond(200);

    // The stale 401 neither reconnects nor replaces the live stream.
    await jest.advanceTimersByTimeAsync(60_000);
    expect(global.fetch).toHaveBeenCalledTimes(2);
    expect(openStreams()).toHaveLength(1);
  });

  it('ignores a server close for a stream that was cancelled and replaced', async () => {
    const instance = await newInstance();
    const handler = jest.fn();
    instance.on('call.incoming', handler);
    await jest.advanceTimersByTimeAsync(200);

    // The server closes the stream, but off/on run before the read resumes.
    streams[0]!.close();
    instance.off('call.incoming', handler);
    instance.on('call.incoming', handler);
    await jest.advanceTimersByTimeAsync(0);
    expect(global.fetch).toHaveBeenCalledTimes(2);

    await jest.advanceTimersByTimeAsync(60_000);
    expect(global.fetch).toHaveBeenCalledTimes(2);
    expect(openStreams()).toHaveLength(1);
    expect(openStreams()[0]).toBe(streams[1]);
  });

  // Drops the current stream with `drop`, then checks the reconnect waits
  // exactly `delay` ms.
  const expectReconnectAfter = async (drop: () => void, delay: number) => {
    const before = (global.fetch as jest.Mock).mock.calls.length;
    drop();
    await jest.advanceTimersByTimeAsync(delay - 1);
    expect(global.fetch).toHaveBeenCalledTimes(before);
    await jest.advanceTimersByTimeAsync(1);
    expect(global.fetch).toHaveBeenCalledTimes(before + 1);
  };

  it('backs off when an accepted stream keeps dropping right away', async () => {
    const instance = await newInstance();
    instance.on('call.incoming', jest.fn());
    await jest.advanceTimersByTimeAsync(200);

    // Accepted (`connected`) and then closed, each time: 1s, 2s, 4s.
    for (const delay of [1000, 2000, 4000]) {
      await expectReconnectAfter(() => {
        lastStream().push(CONNECTED);
        lastStream().close();
      }, delay);
    }

    // A stream that delivered a heartbeat was healthy: back to 1s.
    await expectReconnectAfter(() => {
      lastStream().push(CONNECTED + HEARTBEAT);
      lastStream().close();
    }, 1000);
  });

  it('restarts the backoff when a healthy stream fails with a network error', async () => {
    const instance = await newInstance();
    instance.on('call.incoming', jest.fn());
    await jest.advanceTimersByTimeAsync(200);

    for (const delay of [1000, 2000]) {
      await expectReconnectAfter(() => lastStream().fail(), delay);
    }

    await expectReconnectAfter(() => {
      lastStream().push(CONNECTED + HEARTBEAT);
      lastStream().fail();
    }, 1000);
  });
});
