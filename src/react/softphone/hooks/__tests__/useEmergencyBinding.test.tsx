import { renderHook, act, waitFor } from '@testing-library/react';
import { useEmergencyBinding, type UseEmergencyBindingDeps } from '../useEmergencyBinding';
import type { EmergencyAddress } from '../../../../webrtc';

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
    getPresentedAddressId: jest.Mock;
    clearRegisteredIp: jest.Mock;
    reconnectWithEmergency: jest.Mock;
  };
} {
  const spies = {
    list: jest.fn().mockResolvedValue([addr('ea_1')]),
    save: jest.fn().mockResolvedValue(addr('ea_new')),
    // Default: the phone presented nothing this session (fresh install / pasted
    // token). Tests exercising the same-network short-circuit override this to
    // return the anchored address id.
    getPresentedAddressId: jest.fn().mockReturnValue(null),
    clearRegisteredIp: jest.fn().mockResolvedValue(undefined),
    reconnectWithEmergency: jest.fn().mockResolvedValue(undefined),
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

    // First connected pass auto-presents (reconnectWithEmergency once).
    await waitFor(() => expect(spies.reconnectWithEmergency).toHaveBeenCalledWith('ea_1'));
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
    spies.reconnectWithEmergency.mockClear();
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
    await waitFor(() => expect(spies.reconnectWithEmergency).toHaveBeenCalledWith('ea_2'));
    // And it never re-presented user A's address after the switch.
    expect(spies.reconnectWithEmergency).not.toHaveBeenCalledWith('ea_1');
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
    expect(spies.reconnectWithEmergency).not.toHaveBeenCalled();
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
    expect(spies.reconnectWithEmergency).not.toHaveBeenCalled();
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
    expect(spies.reconnectWithEmergency).not.toHaveBeenCalled();
  });

  it('does NOT trust registered_ip when the phone presented no address this session', async () => {
    // The bug: a saved address has registered_ip from a PAST session, but this
    // session presented nothing (fresh install / pasted token / no persisted id),
    // so the server bound nothing. Trusting registered_ip alone would mark the
    // gate satisfied while outbound PSTN is silently blocked server-side. Instead
    // the hook must present the address (reconnectWithEmergency) so the server
    // binds it to THIS connection — it must NOT short-circuit to bound off the
    // stale anchor without re-presenting. Hold the rebind pending so we can assert
    // it did not report bound off the stale registered_ip alone.
    let releaseReconnect: () => void = () => undefined;
    const reconnectWithEmergency = jest.fn(
      () =>
        new Promise<void>((resolve) => {
          releaseReconnect = resolve;
        })
    );
    const { deps } = makeDeps({
      list: jest.fn().mockResolvedValue([addr('ea_1', '203.0.113.7')]),
      getPresentedAddressId: jest.fn().mockReturnValue(null), // presented nothing
      reconnectWithEmergency,
    });
    const { result } = renderHook(() => useEmergencyBinding(deps));

    // It presents the saved address rather than short-circuiting to bound off the
    // stale registered_ip; bound stays false until the rebind actually confirms.
    await waitFor(() => expect(reconnectWithEmergency).toHaveBeenCalledWith('ea_1'));
    expect(result.current.bound).toBe(false);
    releaseReconnect();
  });

  it('stays unbound across an auto-adopt rebind that the server then denies', async () => {
    // Auto-adopt presents a saved-but-unpresented address; the rebind is in flight
    // when network.changed (moved network) denies it. `bound` must be false the whole
    // way through — at present time, mid-rebind, and after it resolves — so the E911
    // gate never shows green while outbound PSTN is blocked. (The auto-adopt branch
    // deliberately never sets bound itself; boundness is decided only by the effect
    // re-run driven by a fresh 'connected', which never comes here.)
    let releaseReconnect: () => void = () => undefined;
    const reconnectWithEmergency = jest.fn(
      () =>
        new Promise<void>((resolve) => {
          releaseReconnect = resolve;
        })
    );
    const { deps } = makeDeps({
      list: jest.fn().mockResolvedValue([addr('ea_1')]),
      getPresentedAddressId: jest.fn().mockReturnValue(null),
      reconnectWithEmergency,
    });
    const { result } = renderHook(() => useEmergencyBinding(deps));

    await waitFor(() => expect(reconnectWithEmergency).toHaveBeenCalledWith('ea_1'));
    expect(result.current.bound).toBe(false); // mid-rebind, before any denial
    act(() => result.current.onNetworkChanged());
    await act(async () => {
      releaseReconnect();
      await Promise.resolve();
    });
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

    // create() saved + reconnected-with-the-new-id but did not itself set bound.
    expect(spies.save).toHaveBeenCalled();
    expect(result.current.bound).toBe(false);
    // It must present the newly-created address so the authenticate carries it and
    // the server can bind it — otherwise the banner never clears.
    expect(spies.reconnectWithEmergency).toHaveBeenCalledWith('ea_new');
  });

  it('confirm() rejects (not resolves) on failure so the UI keeps the prompt open', async () => {
    // reconnect fails → confirm must set error AND reject, so the banner does
    // not collapse its form as if the address were bound.
    const { deps, spies } = makeDeps({
      reconnectWithEmergency: jest.fn().mockRejectedValue(new Error('bind failed')),
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

  it('confirm() shows the neutral message (not the internal string) when reconnect is interrupted', async () => {
    // A concurrent teardown aborts the rebind's reconnect() with transport_closed:
    // a benign interruption, not a bind failure. The user sees a neutral retry
    // message, never the phone's internal 'Disconnected before…' string.
    const interruption = Object.assign(
      new Error('Disconnected before the softphone finished connecting'),
      { code: 'transport_closed' }
    );
    const { deps } = makeDeps({
      reconnectWithEmergency: jest.fn().mockRejectedValue(interruption),
    });
    const { result } = renderHook(() => useEmergencyBinding(deps));
    await waitFor(() => expect(result.current.loading).toBe(false));

    let rejected: unknown = null;
    await act(async () => {
      await result.current.confirm('ea_1').catch((e) => {
        rejected = e;
      });
    });
    // Still rejects so the banner keeps the prompt open...
    expect(rejected).toBe(interruption);
    // ...but the surfaced error is the neutral retry message.
    expect(result.current.error).toBe('Connection interrupted. Please try again.');
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

describe('useEmergencyBinding rebind completion', () => {
  // confirm/create now await the correlated reconnectWithEmergency directly (no
  // blind timeout / late reconcile) — its resolve/reject is the real signal.
  it('resolves confirm and clears error once the rebind settles', async () => {
    let releaseReconnect: () => void = () => undefined;
    const reconnectWithEmergency = jest.fn(
      () =>
        new Promise<void>((resolve) => {
          releaseReconnect = resolve;
        })
    );
    const { deps } = makeDeps({ reconnectWithEmergency, list: jest.fn().mockResolvedValue([]) });
    const { result } = renderHook(() => useEmergencyBinding(deps));
    await waitFor(() => expect(result.current.loading).toBe(false));

    let settled = false;
    await act(async () => {
      result.current.confirm('ea_1').then(
        () => {
          settled = true;
        },
        () => {
          settled = true;
        }
      );
      await Promise.resolve();
    });
    // Still pending while the rebind is in flight; submitting reflects that.
    expect(settled).toBe(false);
    expect(result.current.submitting).toBe(true);

    await act(async () => {
      releaseReconnect();
      await Promise.resolve();
    });
    await waitFor(() => expect(result.current.submitting).toBe(false));
    expect(settled).toBe(true);
    expect(result.current.error).toBeNull();
  });

  it('keeps a real error when the rebind fails', async () => {
    const reconnectWithEmergency = jest.fn().mockRejectedValue(new Error('bind failed late'));
    const { deps } = makeDeps({ reconnectWithEmergency, list: jest.fn().mockResolvedValue([]) });
    const { result } = renderHook(() => useEmergencyBinding(deps));
    await waitFor(() => expect(result.current.loading).toBe(false));

    await act(async () => {
      await result.current.confirm('ea_1').catch(() => undefined);
    });
    expect(result.current.error).toBe('bind failed late');
  });

  it('clears submitting on the create() happy path', async () => {
    // Happy-path guard for the create() branch: submitting (the UI block) returns to
    // false when the rebind resolves. NOTE: this does NOT cover the StrictMode-
    // stranded-submitting bug (jsdom can't reproduce that timing — the chrome-devtools
    // e2e is that guard); it only pins the ordinary create() clear.
    const reconnectWithEmergency = jest.fn().mockResolvedValue(undefined);
    const { deps } = makeDeps({ reconnectWithEmergency, list: jest.fn().mockResolvedValue([]) });
    const { result } = renderHook(() => useEmergencyBinding(deps));
    await waitFor(() => expect(result.current.loading).toBe(false));

    await act(async () => {
      await result.current
        .create({
          address_number: '1',
          street: 'Main',
          city: 'X',
          state: 'CA',
          postal_code: '90000',
        } as never)
        .catch(() => undefined);
    });

    expect(reconnectWithEmergency).toHaveBeenCalled();
    expect(result.current.submitting).toBe(false);
  });

  it('caps the Saving… spinner: a stuck rebind fails the form after the timeout', async () => {
    // The rebind never settles (stuck socket). The form must stop spinning and show
    // an error after the spinner cap, rather than hang on the phone's ~30s timeout.
    jest.useFakeTimers();
    try {
      const reconnectWithEmergency = jest.fn(() => new Promise<void>(() => undefined)); // never settles
      const { deps } = makeDeps({ reconnectWithEmergency, list: jest.fn().mockResolvedValue([]) });
      const { result } = renderHook(() => useEmergencyBinding(deps));
      // connect effect's list() resolves; drain its microtasks under fake timers.
      await act(async () => {
        await Promise.resolve();
      });

      let settled = false;
      await act(async () => {
        result.current.confirm('ea_1').catch(() => {
          settled = true;
        });
        await Promise.resolve();
      });
      expect(result.current.submitting).toBe(true); // spinning while in flight

      await act(async () => {
        jest.advanceTimersByTime(8000); // REBIND_SPINNER_TIMEOUT_MS
        await Promise.resolve();
      });
      expect(settled).toBe(true);
      expect(result.current.submitting).toBe(false);
      expect(result.current.error).toMatch(/Timed out confirming your location/);
    } finally {
      jest.useRealTimers();
    }
  });

  it('clears the timeout error when a rebind succeeds AFTER the spinner cap fired', async () => {
    // Slow-but-not-stuck: the cap rejects confirm() with the timeout message, then
    // the rebind actually succeeds. The late-settle reconcile must clear the stale
    // timeout banner directly (not leave it sitting over a bound gate).
    jest.useFakeTimers();
    try {
      let resolveRebind!: () => void;
      const reconnectWithEmergency = jest.fn(
        () => new Promise<void>((res) => (resolveRebind = res))
      );
      const { deps } = makeDeps({
        reconnectWithEmergency,
        list: jest.fn().mockResolvedValue([]),
      });
      const { result } = renderHook(() => useEmergencyBinding(deps));
      await act(async () => {
        await Promise.resolve();
      });

      await act(async () => {
        result.current.confirm('ea_1').catch(() => undefined);
        await Promise.resolve();
      });
      await act(async () => {
        jest.advanceTimersByTime(8000);
        await Promise.resolve();
      });
      expect(result.current.error).toMatch(/Timed out confirming your location/);

      // The rebind finally resolves; the late-settle reconcile clears the error.
      await act(async () => {
        resolveRebind();
        await Promise.resolve();
        await Promise.resolve();
      });
      expect(result.current.error).toBeNull();
    } finally {
      jest.useRealTimers();
    }
  });

  it('surfaces the REAL failure reason when a rebind fails AFTER the spinner cap fired', async () => {
    // The cap shows the generic timeout message, then the rebind fails for a
    // specific reason. The banner must update to that reason, not stay on "timed out".
    jest.useFakeTimers();
    try {
      let rejectRebind!: (e: Error) => void;
      const reconnectWithEmergency = jest.fn(
        () => new Promise<void>((_res, rej) => (rejectRebind = rej))
      );
      const { deps } = makeDeps({
        reconnectWithEmergency,
        list: jest.fn().mockResolvedValue([]),
      });
      const { result } = renderHook(() => useEmergencyBinding(deps));
      await act(async () => {
        await Promise.resolve();
      });

      await act(async () => {
        result.current.confirm('ea_1').catch(() => undefined);
        await Promise.resolve();
      });
      await act(async () => {
        jest.advanceTimersByTime(8000);
        await Promise.resolve();
      });
      expect(result.current.error).toMatch(/Timed out confirming your location/);

      await act(async () => {
        rejectRebind(new Error('Address rejected by carrier'));
        await Promise.resolve();
        await Promise.resolve();
      });
      expect(result.current.error).toBe('Address rejected by carrier');
    } finally {
      jest.useRealTimers();
    }
  });

  it('does not flash bound=true while a confirm submit is in flight (no wrong-green)', async () => {
    // The gate is denied. Tapping confirm clears `denied` synchronously, which
    // re-runs the connect effect while the socket is STILL the old 'connected' one
    // (teardown hasn't dispatched yet). With a presented+anchored address that
    // re-run hits the bound path — but flipping bound=true off that stale socket,
    // before the rebind has actually re-bound, is a wrong-green flash. Hold the
    // rebind pending and assert bound never goes true mid-submit.
    let releaseReconnect: () => void = () => undefined;
    const reconnectWithEmergency = jest.fn(
      () => new Promise<void>((resolve) => (releaseReconnect = resolve))
    );
    const { deps } = makeDeps({
      list: jest.fn().mockResolvedValue([addr('ea_1', '203.0.113.7')]),
      getPresentedAddressId: jest.fn().mockReturnValue('ea_1'),
      reconnectWithEmergency,
    });
    const { result } = renderHook(() => useEmergencyBinding(deps));
    await waitFor(() => expect(result.current.bound).toBe(true));

    // Deny, then confirm — while the rebind is pending, bound must NOT be true.
    act(() => result.current.onNetworkChanged());
    expect(result.current.bound).toBe(false);
    await act(async () => {
      result.current.confirm('ea_1').catch(() => undefined);
      await Promise.resolve();
    });
    expect(result.current.submitting).toBe(true);
    expect(result.current.bound).toBe(false); // no wrong-green flash mid-submit

    releaseReconnect();
  });

  it('caps the auto-adopt rebind so a stuck fresh socket does not suppress the banner', async () => {
    // Auto-adopt presents a saved-but-unpresented address; if that rebind's socket
    // opens but never authenticates, an UNCAPPED await would hold `loading` (which
    // hides the banner) for the full ~20s connect timeout. The cap must resolve
    // loading at REBIND_SPINNER_TIMEOUT_MS instead.
    jest.useFakeTimers();
    try {
      const reconnectWithEmergency = jest.fn(() => new Promise<void>(() => undefined)); // never settles
      const { deps } = makeDeps({
        list: jest.fn().mockResolvedValue([addr('ea_1')]),
        getPresentedAddressId: jest.fn().mockReturnValue(null), // triggers auto-adopt present
        reconnectWithEmergency,
      });
      const { result } = renderHook(() => useEmergencyBinding(deps));
      await act(async () => {
        await Promise.resolve();
      });
      await waitFor(() => expect(reconnectWithEmergency).toHaveBeenCalledWith('ea_1'));
      // Before the cap, loading is still true (banner suppressed).
      expect(result.current.loading).toBe(true);

      await act(async () => {
        jest.advanceTimersByTime(8000); // REBIND_SPINNER_TIMEOUT_MS
        await Promise.resolve();
      });
      // The cap resolved loading so the banner can show — not held to ~20s.
      expect(result.current.loading).toBe(false);
    } finally {
      jest.useRealTimers();
    }
  });
});
