/**
 * `useEmergencyBinding` — the Softphone's built-in E911 provisioning logic.
 *
 * Model: "always send it, the server decides." The server binds the presented
 * emergency address to the connection's network at the `authenticate` handshake
 * and is the authority on whether it's valid here — it rejects a mismatch via
 * the `network.changed` signal.
 *
 *   - On connect, if the session has a saved address but presented none (fresh
 *     browser), auto-present it (select + reconnect once). Same network → the
 *     server binds it silently (reused). Different network → the server denies
 *     (network.changed) → we prompt.
 *   - `bound` is true unless the server denied (network.changed) or there is no
 *     saved address to present at all.
 *
 * When the host supplies `emergencyAddressId`, it manages E911 itself and this
 * hook stays dormant (`disabled`). 911/933 are never gated by any of this.
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import type { EmergencyAddress, EmergencyAddressInput } from '../../webrtc';
import type { SoftphoneConnectionState } from './useCalls';

export interface UseEmergencyBindingDeps {
  /** Skip all E911 handling (the host supplies emergencyAddressId itself). */
  disabled: boolean;
  /** Live connection state — the check runs when this becomes 'connected'. */
  connection: SoftphoneConnectionState;
  /**
   * Identity of the session this binding belongs to (the WebRTC token). When it
   * changes the phone reconnects as a DIFFERENT user, so ALL binding state must
   * reset — otherwise, on a shared client, the previous user's `bound`/addresses
   * and the one-shot auto-adopt guard linger and the new user can show E911
   * unlocked without ever presenting their own address (a safety-relevant gate
   * reading green for the wrong identity).
   */
  identityKey: string;
  list: () => Promise<EmergencyAddress[]>;
  save: (input: EmergencyAddressInput) => Promise<EmergencyAddress>;
  select: (id: string) => void;
  /**
   * The emergency-address id the phone presented on the CURRENT socket's
   * authenticate (null if none). A saved address's `registered_ip` proves it was
   * bound in *some* session, not this one — only a match here means the server
   * bound it for the live connection.
   */
  getPresentedAddressId: () => string | null;
  clearRegisteredIp: (id: string) => Promise<void>;
  reconnect: () => Promise<void>;
}

export interface UseEmergencyBinding {
  /** True until the first post-connect status resolves. */
  loading: boolean;
  /**
   * True when outbound PSTN is usable for this session — the server accepted the
   * presented address for the current network. False when it denied
   * (network.changed) or there's no saved address → show the prompt.
   */
  bound: boolean;
  /** Saved addresses to offer as "Are you here?" choices. */
  savedAddresses: EmergencyAddress[];
  /** True while an address submit (confirm/create, which forces a reconnect) is in flight. */
  submitting: boolean;
  /** Last error (e.g. a carrier rejection). */
  error: string | null;
  /** Called from the Softphone when the phone emits `network.changed` (denied). */
  onNetworkChanged: () => void;
  /** Confirm an existing saved address for this network (selects + reconnects). */
  confirm: (id: string) => Promise<void>;
  /** Create + validate a new address, then bind it (reconnect). */
  create: (input: EmergencyAddressInput) => Promise<void>;
}

// The rebind after save/confirm waits for the socket to re-authenticate and the
// server to bind the address. Cap that wait so a stuck reconnect surfaces an
// error instead of leaving the form spinning on "Saving…" forever.
const REBIND_TIMEOUT_MS = 8000;

const REBIND_TIMEOUT_MESSAGE = 'Timed out confirming your location. Please try again.';

// Run `reconnect()` but reject after REBIND_TIMEOUT_MS so the form doesn't spin
// forever on a stuck socket. `reconnect` has no cancellation, so a timed-out call
// keeps running — on a slow-but-not-stuck network it can succeed a moment after we
// already surfaced the timeout error. Don't abandon it: `onLateSettle` reconciles
// once it finally settles (clear the false error on late success; surface the real
// one on late failure). The caller guards the callback against a stale/unmounted
// reconcile. The detached promise always has a handler, so no unhandled rejection.
async function withRebindTimeout(
  reconnect: () => Promise<void>,
  onLateSettle: (error: Error | null) => void
): Promise<void> {
  const pending = reconnect();
  let timer: ReturnType<typeof setTimeout> | undefined;
  let timedOut = false;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => {
      timedOut = true;
      reject(new Error(REBIND_TIMEOUT_MESSAGE));
    }, REBIND_TIMEOUT_MS);
  });
  // When the timeout wins, wire the still-pending reconnect to reconcile later.
  pending.then(
    () => {
      if (timedOut) onLateSettle(null);
    },
    (e: unknown) => {
      if (timedOut) onLateSettle(e instanceof Error ? e : new Error('Failed to confirm'));
    }
  );
  try {
    await Promise.race([pending, timeout]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

export function useEmergencyBinding(deps: UseEmergencyBindingDeps): UseEmergencyBinding {
  const {
    disabled,
    connection,
    identityKey,
    list,
    save,
    select,
    getPresentedAddressId,
    clearRegisteredIp,
    reconnect,
  } = deps;
  const [loading, setLoading] = useState(!disabled);
  const [bound, setBound] = useState(false);
  const [denied, setDenied] = useState(false);
  const [savedAddresses, setSavedAddresses] = useState<EmergencyAddress[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // A timed-out rebind keeps running and may settle after the form already showed
  // the timeout error. `submitGenRef` bumps on each submit so a late reconcile from
  // an older attempt can't clobber a newer one; `mountedRef` drops late reconciles
  // after unmount. See withRebindTimeout.
  const submitGenRef = useRef(0);
  const mountedRef = useRef(true);
  useEffect(() => {
    return () => {
      mountedRef.current = false;
    };
  }, []);

  // Builds the reconcile callback for one submit attempt. Applies only if the hook
  // is still mounted and no newer submit has started (gen still current): a late
  // success clears the false timeout error (bound already flipped via the connect
  // effect); a late failure keeps a real error in front of the user.
  const lateSettle = useCallback(
    (gen: number, failureMessage: string) => (error: Error | null) => {
      if (!mountedRef.current || submitGenRef.current !== gen) return;
      setError(error ? error.message || failureMessage : null);
    },
    []
  );

  // Latest deps via refs so the connect effect doesn't churn on identity changes.
  const fns = useRef({ list, select, reconnect, getPresentedAddressId });
  useEffect(() => {
    fns.current = { list, select, reconnect, getPresentedAddressId };
  });
  // Guard so we auto-adopt at most once per connected session (no reconnect loop).
  const autoAdoptedRef = useRef(false);

  // Reset ALL session-scoped state when the identity (token) changes — a
  // different user is now on this (possibly shared) client. Without this the
  // prior user's `bound`/`savedAddresses` and the one-shot auto-adopt guard
  // persist, so the new user's session skips presenting its own address and
  // inherits the previous unlock. Re-arm `loading` so the banner stays hidden
  // until the new user's status resolves. Skipped on the initial mount (the
  // useState initializers already hold these values) to avoid a redundant pass.
  const prevIdentityRef = useRef(identityKey);
  useEffect(() => {
    if (prevIdentityRef.current === identityKey) return;
    prevIdentityRef.current = identityKey;
    autoAdoptedRef.current = false;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- reset binding state on identity (user) change
    setBound(false);
    setDenied(false);
    setSavedAddresses([]);
    setError(null);
    setLoading(!disabled);
  }, [identityKey, disabled]);

  const onNetworkChanged = useCallback(() => {
    setDenied(true);
    setBound(false);
  }, []);

  // After each (re)connect: list addresses. If we have a saved one but haven't
  // yet presented it this session (fresh browser), auto-present it + reconnect
  // once — the server then binds it (same network) or denies via
  // network.changed (moved). Otherwise the session is bound unless denied.
  useEffect(() => {
    if (disabled) return;
    if (connection !== 'connected') {
      // Never resolve loading off a transient 'connecting'/'reconnecting' — those
      // are on the way to 'connected'. But a terminal 'disconnected'/'error' will
      // not reach 'connected' on its own, so stop showing the loading state (the
      // banner hides while loading, which would otherwise suppress the E911 prompt
      // forever on a session that authenticated but never connected).
      if (connection === 'disconnected' || connection === 'error') {
        // eslint-disable-next-line react-hooks/set-state-in-effect -- resolve loading on a terminal non-connected state
        setLoading(false);
      }
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const addrs = await fns.current.list();
        if (cancelled) return;
        setSavedAddresses(addrs);
        // Resolve the "active" address by the id the phone actually presented this
        // session, NOT addrs[0]. addrs is ORDER BY id DESC (newest first), but the
        // presented/persisted id is often an older one; pinning to addrs[0] would
        // both mis-judge boundness and, on reconnect, clobber the user's selection
        // with a different address. Fall back to addrs[0] only when nothing was
        // presented (fresh install / pasted token / no persisted id).
        const presentedId = fns.current.getPresentedAddressId();
        const active = addrs.find((a) => a.id === presentedId) ?? addrs[0] ?? null;
        if (!active) {
          // Nothing saved → must collect an address.
          setBound(false);
          return;
        }
        if (!autoAdoptedRef.current && !denied) {
          autoAdoptedRef.current = true;
          // This shortcut has oscillated — do NOT "simplify" it to either extreme
          // without reading both prior regressions; the two failure modes oppose:
          //   - Always present+reconnect: an address genuinely bound this session
          //     gets its registration dropped by the reconnect and comes back
          //     denied → banner never clears (the "already-anchored → bound"
          //     regression).
          //   - Trust `registered_ip` alone → bound: an address bound in a PAST
          //     session (registered_ip set) but NOT presented on THIS socket means
          //     the server bound nothing this session, yet the gate shows green
          //     while outbound PSTN is silently blocked (the stale-anchor bug).
          // `registered_ip` alone can't tell these apart. The discriminator is
          // whether the phone actually presented THIS id in the CURRENT socket's
          // authenticate frame — that's when the server (re)binds.
          const presentedThisSession = presentedId != null && presentedId === active.id;
          if (presentedThisSession && active.registered_ip != null) {
            // Presented on this socket AND anchored → server has re-bound it (same
            // network); treat as bound without a redundant reconnect (which would
            // drop the registration and come back denied). A moved network arrives
            // as network.changed → denied instead.
            setBound(true);
          } else {
            // Nothing bound for this session: present the selected/default address
            // so the server binds it to THIS connection, then let it decide
            // (same-network → bound; moved → network.changed → denied). select()
            // persists the id so the reconnect's authenticate carries it; the
            // autoAdoptedRef one-shot prevents a loop.
            fns.current.select(active.id);
            await fns.current.reconnect();
            return; // the reconnect drives a fresh 'connected' → effect re-runs
          }
        } else {
          // Presented; bound unless the server denied it for this network.
          setBound(!denied);
        }
      } catch {
        if (!cancelled) setBound(false);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [disabled, connection, denied]);

  const confirm = useCallback(
    async (id: string) => {
      const gen = ++submitGenRef.current;
      setSubmitting(true);
      setError(null);
      try {
        setDenied(false);
        autoAdoptedRef.current = true; // explicit choice; don't auto-adopt over it
        // The address may be anchored to a PRIOR network (registered_ip set) — the
        // server only (re)binds a NULL anchor, so clear it first, then reconnect
        // so authenticate re-binds it to THIS network. (Confirming a same-network
        // address is idempotent: cleared then immediately re-bound to the same IP.)
        await clearRegisteredIp(id);
        select(id);
        await withRebindTimeout(reconnect, lateSettle(gen, 'Failed to confirm emergency address'));
      } catch (e) {
        // Surface the error AND rethrow: a failed confirm leaves outbound PSTN
        // gated, so the caller (the banner) must NOT treat this as success and
        // collapse its form. Rethrowing lets the UI keep the prompt open and the
        // host onError fire, instead of a silent failure that looks bound.
        setError(e instanceof Error ? e.message : 'Failed to confirm emergency address');
        throw e;
      } finally {
        setSubmitting(false);
      }
    },
    [clearRegisteredIp, select, reconnect, lateSettle]
  );

  const create = useCallback(
    async (input: EmergencyAddressInput) => {
      const gen = ++submitGenRef.current;
      setSubmitting(true);
      setError(null);
      try {
        setDenied(false);
        autoAdoptedRef.current = true;
        // Present the NEW address on the reconnect (and persist its id), same as
        // confirm() does — otherwise the socket re-authenticates without carrying
        // it, so the server never binds it to this session and the banner never
        // clears even though the address was created.
        const created = await save(input);
        select(created.id);
        await withRebindTimeout(reconnect, lateSettle(gen, 'Failed to save emergency address'));
      } catch (e) {
        // See confirm(): surface + rethrow so a failed create doesn't collapse
        // the form as if the address were bound.
        setError(e instanceof Error ? e.message : 'Failed to save emergency address');
        throw e;
      } finally {
        setSubmitting(false);
      }
    },
    [save, select, reconnect, lateSettle]
  );

  return { loading, bound, savedAddresses, submitting, error, onNetworkChanged, confirm, create };
}
