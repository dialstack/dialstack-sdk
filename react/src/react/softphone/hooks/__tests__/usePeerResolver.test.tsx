import { renderHook, act, waitFor } from '@testing-library/react';
import type { Call } from '@dialstack/sdk-webrtc';

import { usePeerResolver, type ResolvePeer } from '../usePeerResolver';

const call = (id: string, from = '+15551230000'): Call =>
  ({ id, direction: 'inbound', from, fromName: null, to: '1001' }) as unknown as Call;

describe('usePeerResolver', () => {
  it('returns null for every call when no resolver is set', () => {
    const a = call('a');
    const { result } = renderHook(() => usePeerResolver(undefined, [a]));
    expect(result.current(a)).toBeNull();
    expect(result.current(null)).toBeNull();
  });

  it('resolves each call once and re-renders when the result lands', async () => {
    const a = call('a');
    const resolve = jest.fn<ReturnType<ResolvePeer>, [Call]>(async () => ({ name: 'Jordan Lee' }));
    const { result, rerender } = renderHook(({ calls }) => usePeerResolver(resolve, calls), {
      initialProps: { calls: [a] },
    });

    expect(result.current(a)).toBeNull();
    await waitFor(() => expect(result.current(a)).toEqual({ name: 'Jordan Lee' }));

    rerender({ calls: [a] });
    rerender({ calls: [...[a]] });
    expect(resolve).toHaveBeenCalledTimes(1);
  });

  it('accepts a synchronous result', async () => {
    const a = call('a');
    const { result } = renderHook(() => usePeerResolver(() => ({ name: 'VIP' }), [a]));
    await waitFor(() => expect(result.current(a)).toEqual({ name: 'VIP' }));
  });

  it('drops blank fields, and a result with nothing left', async () => {
    const a = call('a');
    const b = call('b');
    const { result } = renderHook(() =>
      usePeerResolver(
        (c) =>
          c.id === 'a'
            ? { name: ' Jordan Lee ', avatar: { initials: 'JL', uri: ' ' } }
            : { name: '  ', avatar: { initials: '' } },
        [a, b]
      )
    );
    await waitFor(() => expect(result.current(a)).not.toBeNull());
    expect(result.current(a)).toEqual({
      name: 'Jordan Lee',
      avatar: { initials: 'JL', uri: undefined },
    });
    expect(result.current(b)).toBeNull();
  });

  it('falls back to the default display when the resolver rejects or throws', async () => {
    const a = call('a');
    const b = call('b');
    const resolve: ResolvePeer = (c) => {
      if (c.id === 'a') return Promise.reject(new Error('lookup failed'));
      throw new Error('boom');
    };
    const { result } = renderHook(() => usePeerResolver(resolve, [a, b]));
    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });
    expect(result.current(a)).toBeNull();
    expect(result.current(b)).toBeNull();
  });

  it('discards a result that arrives after its call has gone', async () => {
    const a = call('a');
    let finish: (v: { name: string }) => void = () => {};
    const resolve = () => new Promise<{ name: string }>((r) => (finish = r));
    const { result, rerender } = renderHook(({ calls }) => usePeerResolver(resolve, calls), {
      initialProps: { calls: [a] as Call[] },
    });
    rerender({ calls: [] });
    await act(async () => finish({ name: 'Too late' }));
    expect(result.current(a)).toBeNull();
  });

  it('asks again when the resolver changes, e.g. once contacts have loaded', async () => {
    const a = call('a');
    const notYet = jest.fn<ReturnType<ResolvePeer>, [Call]>(async () => null);
    const loaded = jest.fn<ReturnType<ResolvePeer>, [Call]>(async () => ({ name: 'Jordan Lee' }));
    const { result, rerender } = renderHook(
      ({ resolve }: { resolve: ResolvePeer }) => usePeerResolver(resolve, [a]),
      { initialProps: { resolve: notYet as ResolvePeer } }
    );
    await waitFor(() => expect(notYet).toHaveBeenCalledTimes(1));
    expect(result.current(a)).toBeNull();

    rerender({ resolve: loaded });
    await waitFor(() => expect(result.current(a)).toEqual({ name: 'Jordan Lee' }));
    expect(loaded).toHaveBeenCalledTimes(1);
  });

  it('keeps the previous answer on screen until the new resolver answers', async () => {
    const a = call('a');
    let finish: (info: { name: string }) => void = () => {};
    const first: ResolvePeer = async () => ({ name: 'Old Name' });
    const second: ResolvePeer = () =>
      new Promise((resolve) => {
        finish = resolve;
      });
    const { result, rerender } = renderHook(
      ({ resolve }: { resolve: ResolvePeer }) => usePeerResolver(resolve, [a]),
      { initialProps: { resolve: first } }
    );
    await waitFor(() => expect(result.current(a)).toEqual({ name: 'Old Name' }));

    rerender({ resolve: second });
    await act(async () => {}); // let the new lookup start
    expect(result.current(a)).toEqual({ name: 'Old Name' });
    await act(async () => finish({ name: 'New Name' }));
    expect(result.current(a)).toEqual({ name: 'New Name' });
  });

  it('discards a late answer from a resolver that has been replaced', async () => {
    const a = call('a');
    let finishStale: (info: { name: string }) => void = () => {};
    const stale: ResolvePeer = () =>
      new Promise((resolve) => {
        finishStale = resolve;
      });
    const fresh: ResolvePeer = async () => ({ name: 'Fresh' });
    const { result, rerender } = renderHook(
      ({ resolve }: { resolve: ResolvePeer }) => usePeerResolver(resolve, [a]),
      { initialProps: { resolve: stale } }
    );
    await act(async () => {}); // let the stale lookup start
    rerender({ resolve: fresh });
    await waitFor(() => expect(result.current(a)).toEqual({ name: 'Fresh' }));

    await act(async () => finishStale({ name: 'Stale' }));
    expect(result.current(a)).toEqual({ name: 'Fresh' });
  });

  it('forgets every answer when the resolver is removed', async () => {
    const a = call('a');
    const resolve: ResolvePeer = async () => ({ name: 'Jordan Lee' });
    const { result, rerender } = renderHook(
      ({ resolve }: { resolve?: ResolvePeer }) => usePeerResolver(resolve, [a]),
      { initialProps: { resolve } as { resolve?: ResolvePeer } }
    );
    await waitFor(() => expect(result.current(a)).toEqual({ name: 'Jordan Lee' }));

    rerender({ resolve: undefined });
    expect(result.current(a)).toBeNull();
  });
});
