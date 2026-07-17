import { renderHook, act, waitFor } from '@testing-library/react';
import { useEmergencyBinding, type UseEmergencyBindingDeps } from '../useEmergencyBinding';
import type { EmergencyAddress } from '../../../webrtc';

// `registered_ip` null = never anchored (present + reconnect); non-null = anchored
// in some session. The short-circuit-to-bound also requires that THIS session
// presented the id (getPresentedAddressId matches) — registered_ip alone is not
// proof this connection is bound.
function addr(id: string, registered_ip: string | null = null): EmergencyAddress {
  return { id, registered_ip } as unknown as EmergencyAddress;
}

// Build deps with sensible spies; override per test. `list` resolves to the
// given saved addresses (default: one unanchored address).
function makeDeps(over: Partial<UseEmergencyBindingDeps> = {}): {
  deps: UseEmergencyBindingDeps;
  spies: {
    list: jest.Mock;
    save: jest.Mock;
    select: jest.Mock;
    getPresentedAddressId: jest.Mock;
    clearRegisteredIp: jest.Mock;
    reconnect: jest.Mock;
  };
} {
  const spies = {
    list: jest.fn().mockResolvedValue([addr('ea_1')]),
    save: jest.fn().mockResolvedValue(addr('ea_new')),
    select: jest.fn(),
    // Default: the phone presented nothing this session (fresh install / pasted
    // token). Tests exercising the same-network short-circuit override this to
    // return the anchored address id.
    getPresentedAddressId: jest.fn().mockReturnValue(null),
    clearRegisteredIp: jest.fn().mockResolvedValue(undefined),
    reconnect: jest.fn().mockResolvedValue(undefined),
  };
  const deps: UseEmergencyBindingDeps = {
    disabled: false,
    connection: 'connected',
    identityKey: 'tok-user-a',
    ...spies,
    ...over,
  };
  return { deps, spies };
}

describe('useEmergencyBinding identity reset', () => {
  it('resets bound / auto-adopt state when the identity (token) changes', async () => {
    // User A: saved address, presented once (auto-adopt), then bound.
    const { deps, spies } = makeDeps();
    const { result, rerender } = renderHook(
      (p: UseEmergencyBindingDeps) => useEmergencyBinding(p),
      {
        initialProps: deps,
      }
    );

    // First connected pass auto-presents (select + reconnect once).
    await waitFor(() => expect(spies.select).toHaveBeenCalledWith('ea_1'));
    // The reconnect drives the connection through 'reconnecting' → 'connected'
    // again; that fresh 'connected' re-runs the effect, which now (auto-adopted)
    // binds. Drive that cycle explicitly since there's no real socket here.
    await act(async () => {
      rerender({ ...deps, connection: 'reconnecting' });
    });
    await act(async () => {
      rerender({ ...deps, connection: 'connected' });
    });
    await waitFor(() => expect(result.current.bound).toBe(true));

    // User B logs in on the SAME client (token changes). The binding must NOT
    // carry over: the reset clears bound and re-arms the one-shot auto-adopt, so
    // user B's own address is presented afresh (not inherited from A).
    spies.select.mockClear();
    spies.list.mockResolvedValue([addr('ea_2')]);
    await act(async () => {
      rerender({ ...deps, identityKey: 'tok-user-b' });
    });
    // The identity reset must have dropped the stale unlock immediately.
    expect(result.current.bound).toBe(false);

    // A token change reconnects (as the real provider does) — drive the cycle so
    // the effect re-runs and auto-presents user B's address.
    await act(async () => {
      rerender({ ...deps, identityKey: 'tok-user-b', connection: 'reconnecting' });
    });
    await act(async () => {
      rerender({ ...deps, identityKey: 'tok-user-b', connection: 'connected' });
    });
    // Presented user B's address afresh — the auto-adopt guard was reset.
    await waitFor(() => expect(spies.select).toHaveBeenCalledWith('ea_2'));
    // And it never re-presented user A's address after the switch.
    expect(spies.select).not.toHaveBeenCalledWith('ea_1');
  });

  it('short-circuits to bound for an anchored address the phone presented this session (no reconnect)', async () => {
    // Anchored (registered_ip set) AND presented on this socket's authenticate →
    // the server has re-bound it. Treat as bound WITHOUT a reconnect —
    // reconnecting an already-bound address comes back denied and the banner
    // would never clear (the original regression this short-circuit guards).
    const { deps, spies } = makeDeps({
      list: jest.fn().mockResolvedValue([addr('ea_1', '203.0.113.7')]),
      getPresentedAddressId: jest.fn().mockReturnValue('ea_1'),
    });
    const { result } = renderHook(() => useEmergencyBinding(deps));

    await waitFor(() => expect(result.current.bound).toBe(true));
    expect(spies.reconnect).not.toHaveBeenCalled();
    expect(spies.select).not.toHaveBeenCalled();
  });

  it('short-circuits to bound off the PRESENTED address, not addrs[0], for a multi-address user', async () => {
    // A user with several saved addresses whose presented id is NOT the first in
    // the list. Pinning the "bound this session?" check to addrs[0] would ignore
    // the actually-presented (anchored) address and force-reconnect onto addrs[0]
    // — the wrong address. Match on the presented id wherever it sits in the list.
    const { deps, spies } = makeDeps({
      list: jest.fn().mockResolvedValue([addr('ea_first'), addr('ea_2', '203.0.113.7')]),
      getPresentedAddressId: jest.fn().mockReturnValue('ea_2'),
    });
    const { result } = renderHook(() => useEmergencyBinding(deps));

    await waitFor(() => expect(result.current.bound).toBe(true));
    expect(spies.reconnect).not.toHaveBeenCalled();
    expect(spies.select).not.toHaveBeenCalled();
  });

  it('does not clobber a bound older selection with addrs[0] when it is unanchored', async () => {
    // addrs is newest-first: addrs[0] is a newly-saved office address (unanchored),
    // but the persisted/presented selection is the older, genuinely-bound home
    // address. Resolving `active` off addrs[0] would select()+reconnect onto the
    // office address, dropping the working home binding. Resolve off the presented
    // id instead: home is presented AND anchored → stay bound, no reconnect.
    const { deps, spies } = makeDeps({
      list: jest.fn().mockResolvedValue([addr('ea_office'), addr('ea_home', '203.0.113.7')]),
      getPresentedAddressId: jest.fn().mockReturnValue('ea_home'),
    });
    const { result } = renderHook(() => useEmergencyBinding(deps));

    await waitFor(() => expect(result.current.bound).toBe(true));
    expect(spies.reconnect).not.toHaveBeenCalled();
    expect(spies.select).not.toHaveBeenCalled();
  });

  it('does NOT trust registered_ip when the phone presented no address this session', async () => {
    // The bug: a saved address has registered_ip from a PAST session, but this
    // session presented nothing (fresh install / pasted token / no persisted id),
    // so the server bound nothing. Trusting registered_ip alone would mark the
    // gate satisfied while outbound PSTN is silently blocked server-side. Instead
    // the hook must present the address (select + reconnect) so the server binds
    // it to THIS connection — and must not report bound off the stale anchor.
    const { deps, spies } = makeDeps({
      list: jest.fn().mockResolvedValue([addr('ea_1', '203.0.113.7')]),
      getPresentedAddressId: jest.fn().mockReturnValue(null), // presented nothing
    });
    const { result } = renderHook(() => useEmergencyBinding(deps));

    // It presents the saved address to bind it to this session, rather than
    // short-circuiting to bound off the stale registered_ip.
    await waitFor(() => expect(spies.select).toHaveBeenCalledWith('ea_1'));
    expect(spies.reconnect).toHaveBeenCalled();
    expect(result.current.bound).toBe(false);
  });

  it('does not mark bound optimistically on create — the server decides', async () => {
    // No saved address yet → unbound; create() saves + reconnects but must not
    // flip bound true on its own (a fresh address is registered_ip: null and the
    // session is only usable once the server accepts it for this network).
    const { deps, spies } = makeDeps({ list: jest.fn().mockResolvedValue([]) });
    const { result } = renderHook(() => useEmergencyBinding(deps));

    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.bound).toBe(false);

    await act(async () => {
      await result.current.create({
        address_number: '1',
        street: 'Main',
        city: 'X',
        state: 'CA',
        postal_code: '90000',
      } as never);
    });

    // create() saved + reconnected but did not itself set bound.
    expect(spies.save).toHaveBeenCalled();
    expect(spies.reconnect).toHaveBeenCalled();
    expect(result.current.bound).toBe(false);
    // It must present the newly-created address (select its id) before the
    // reconnect, so the authenticate carries it and the server can bind it —
    // otherwise the banner never clears even though the address was created.
    expect(spies.select).toHaveBeenCalledWith('ea_new');
  });

  it('confirm() rejects (not resolves) on failure so the UI keeps the prompt open', async () => {
    // reconnect fails → confirm must set error AND reject, so the banner does
    // not collapse its form as if the address were bound.
    const { deps, spies } = makeDeps({
      reconnect: jest.fn().mockRejectedValue(new Error('bind failed')),
    });
    const { result } = renderHook(() => useEmergencyBinding(deps));
    await waitFor(() => expect(result.current.loading).toBe(false));

    let rejected: unknown = null;
    await act(async () => {
      await result.current.confirm('ea_1').catch((e) => {
        rejected = e;
      });
    });
    expect(rejected).toBeInstanceOf(Error);
    expect((rejected as Error).message).toBe('bind failed');
    expect(spies.clearRegisteredIp).toHaveBeenCalledWith('ea_1');
    expect(result.current.error).toBe('bind failed');
  });

  it('create() rejects on failure', async () => {
    const { deps } = makeDeps({
      list: jest.fn().mockResolvedValue([]),
      save: jest.fn().mockRejectedValue(new Error('carrier rejected')),
    });
    const { result } = renderHook(() => useEmergencyBinding(deps));
    await waitFor(() => expect(result.current.loading).toBe(false));

    let rejected: unknown = null;
    await act(async () => {
      await result.current
        .create({
          address_number: '1',
          street: 'Main',
          city: 'X',
          state: 'CA',
          postal_code: '90000',
        } as never)
        .catch((e) => {
          rejected = e;
        });
    });
    expect((rejected as Error)?.message).toBe('carrier rejected');
    expect(result.current.error).toBe('carrier rejected');
  });
});

describe('useEmergencyBinding rebind timeout', () => {
  const REBIND_TIMEOUT_MS = 8000;

  // `waitFor` polls on real timers, so under fake timers we drive the hook
  // deterministically: `flush` runs microtasks (promise continuations like the
  // connect effect's list()/setLoading and the late-settle reconcile) inside act.
  beforeEach(() => jest.useFakeTimers());
  afterEach(() => {
    jest.runOnlyPendingTimers();
    jest.useRealTimers();
  });

  const flush = () =>
    act(async () => {
      await Promise.resolve();
    });

  it('surfaces the timeout error, then clears it when the slow reconnect later succeeds', async () => {
    // reconnect resolves only when we release it — simulating a slow-but-not-stuck
    // network where the rebind actually succeeds after the timeout has fired.
    let releaseReconnect: () => void = () => undefined;
    const reconnect = jest.fn(
      () =>
        new Promise<void>((resolve) => {
          releaseReconnect = resolve;
        })
    );
    const { deps } = makeDeps({ reconnect, list: jest.fn().mockResolvedValue([]) });
    const { result } = renderHook(() => useEmergencyBinding(deps));
    await flush(); // connect effect resolves list() → loading false
    expect(result.current.loading).toBe(false);

    // Kick off confirm; hold the promise so we can assert its rejection.
    let confirmErr: unknown = null;
    await act(async () => {
      result.current.confirm('ea_1').catch((e) => {
        confirmErr = e;
      });
      await Promise.resolve();
    });

    // Fire the 8s timeout — confirm rejects with the timeout message.
    await act(async () => {
      jest.advanceTimersByTime(REBIND_TIMEOUT_MS);
      await Promise.resolve();
    });
    await flush();
    expect((confirmErr as Error).message).toMatch(/Timed out confirming your location/);
    expect(result.current.error).toMatch(/Timed out confirming your location/);

    // The slow reconnect now finally succeeds — the false timeout error clears.
    await act(async () => {
      releaseReconnect();
      await Promise.resolve();
    });
    await flush();
    expect(result.current.error).toBeNull();
  });

  it('keeps an error when the slow reconnect later fails', async () => {
    let rejectReconnect: (e: Error) => void = () => undefined;
    const reconnect = jest.fn(
      () =>
        new Promise<void>((_, reject) => {
          rejectReconnect = reject;
        })
    );
    const { deps } = makeDeps({ reconnect, list: jest.fn().mockResolvedValue([]) });
    const { result } = renderHook(() => useEmergencyBinding(deps));
    await flush();
    expect(result.current.loading).toBe(false);

    await act(async () => {
      result.current.confirm('ea_1').catch(() => undefined);
      await Promise.resolve();
    });
    await act(async () => {
      jest.advanceTimersByTime(REBIND_TIMEOUT_MS);
      await Promise.resolve();
    });
    await flush();
    expect(result.current.error).toMatch(/Timed out/);

    // Late failure keeps a real error in front of the user (not cleared).
    await act(async () => {
      rejectReconnect(new Error('bind failed late'));
      await Promise.resolve();
    });
    await flush();
    expect(result.current.error).toBe('bind failed late');
  });
});
