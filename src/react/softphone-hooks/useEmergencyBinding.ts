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
  /**
   * The emergency-address id the phone presented on the CURRENT socket's
   * authenticate (null if none). A saved address's `registered_ip` proves it was
   * bound in *some* session, not this one — only a match here means the server
   * bound it for the live connection.
   */
  getPresentedAddressId: () => string | null;
  clearRegisteredIp: (id: string) => Promise<void>;
  /** Select `id` and reconnect in one step; resolves once the server binds it. */
  reconnectWithEmergency: (id: string) => Promise<void>;
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

// Shown when a rebind's reconnect was interrupted (transport_closed from a
// concurrent teardown) rather than failing — not a rebind failure, so a neutral
// retry beats the phone's internal abort string. The connect effect drives the
// next state and this hook re-runs off it.
const INTERRUPTED_MESSAGE = 'Connection interrupted. Please try again.';

// Fail the "Saving…" form well before the phone's own ~30s connect timeout (ICE
// + authenticate) so a stuck rebind doesn't spin the confirm button that long.
const REBIND_SPINNER_TIMEOUT_MS = 8000;
const REBIND_TIMEOUT_MESSAGE = 'Timed out confirming your location. Please try again.';

function isBenignInterruption(e: unknown): boolean {
  return (e as { code?: string } | null)?.code === 'transport_closed';
}

// Reject when the cap elapses so the form stops spinning (rejecting, not resolving,
// keeps the banner open). The rebind keeps running; `onLateSettle` fires only when
// the cap already won and the rebind then settles — clearing the false timeout on
// late success, surfacing the real reason on late failure.
function withSpinnerTimeout(
  rebind: Promise<void>,
  onLateSettle: (error: Error | null) => void
): Promise<void> {
  let capFired = false;
  return new Promise<void>((resolve, reject) => {
    const timer = setTimeout(() => {
      capFired = true;
      reject(new Error(REBIND_TIMEOUT_MESSAGE));
    }, REBIND_SPINNER_TIMEOUT_MS);
    rebind.then(
      () => {
        clearTimeout(timer);
        if (capFired) onLateSettle(null);
        else resolve();
      },
      (e: unknown) => {
        clearTimeout(timer);
        const err = e instanceof Error ? e : new Error(REBIND_TIMEOUT_MESSAGE);
        if (capFired) onLateSettle(err);
        else reject(err);
      }
    );
  });
}

export function useEmergencyBinding(deps: UseEmergencyBindingDeps): UseEmergencyBinding {
  const {
    disabled,
    connection,
    identityKey,
    list,
    save,
    getPresentedAddressId,
    clearRegisteredIp,
    reconnectWithEmergency,
  } = deps;
  const [loading, setLoading] = useState(!disabled);
  const [bound, setBound] = useState(false);
  const [denied, setDenied] = useState(false);
  const [savedAddresses, setSavedAddresses] = useState<EmergencyAddress[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Latest deps in a ref so the connect effect can call them without listing them
  // as deps (which would re-run the rebind on every render). Synced in an effect,
  // not during render — writing a ref mid-render is disallowed (react-hooks/refs).
  const fns = useRef({ list, reconnectWithEmergency, getPresentedAddressId });
  useEffect(() => {
    fns.current = { list, reconnectWithEmergency, getPresentedAddressId };
  });
  // Guard so we auto-adopt at most once per connected session (no reconnect loop).
  const autoAdoptedRef = useRef(false);
  // Bumped per submit so a late-settle reconcile can't clobber a newer submit's
  // state. (A post-unmount setError is a React no-op, so no mounted guard needed.)
  const submitGen = useRef(0);

  // Reset ALL session-scoped state when the identity (token) changes — a different
  // user is now on this (possibly shared) client. Without this the prior user's
  // bound/addresses/auto-adopt guard persist and the new user inherits the previous
  // unlock (a safety-relevant gate lying). Skipped on initial mount (useState
  // initializers already hold these).
  const prevIdentityRef = useRef(identityKey);
  useEffect(() => {
    if (prevIdentityRef.current === identityKey) return;
    prevIdentityRef.current = identityKey;
    autoAdoptedRef.current = false;
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
            // Clear a stale cap-timeout error now this session is bound — but not
            // mid-submit, whose own cap error must stay until its late-settle clears it.
            if (!submitting) setError(null);
          } else {
            // Nothing bound this session: present the address so the server binds it.
            // Do NOT set bound here — the rebind drives a fresh 'connected' that
            // re-runs this effect and decides boundness off a FRESH list() + current
            // `denied`; setting it here risks a wrong-green flash. autoAdoptedRef
            // prevents a re-present loop on that re-run. The cap bounds `loading` so a
            // socket that never authenticates can't hide the banner for the full ~20s
            // CONNECT_TIMEOUT (no late-settle reconcile needed — the re-run decides).
            await withSpinnerTimeout(fns.current.reconnectWithEmergency(active.id), () => {}).catch(
              () => {}
            );
            return;
          }
        } else if (!submitting) {
          // Presented; bound unless denied. Skipped mid-submit: that submit clears
          // `denied` synchronously and re-runs this effect while the socket is still
          // the OLD 'connected' one, so flipping bound=true here would be a wrong-green
          // flash before the rebind actually re-binds. Its reconnect drives the truth.
          setBound(!denied);
          if (!denied) setError(null);
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
  }, [disabled, connection, denied, submitting]);

  // Shared submit protocol for confirm/create: block the form, mark this an
  // explicit choice (so auto-adopt doesn't fire over it), run the caller's `prep`
  // (un-capped: it resolves the address id to rebind), then the rebind under the
  // spinner cap. On failure surface a message + rethrow (a failed rebind leaves
  // outbound PSTN gated, so the banner must not collapse its form). If the rebind
  // outlives the cap, `onLateSettle` reconciles its eventual result.
  const runRebind = useCallback(
    async (fallbackMessage: string, prep: () => Promise<string>): Promise<void> => {
      const gen = ++submitGen.current;
      const errorFor = (e: unknown): string =>
        isBenignInterruption(e)
          ? INTERRUPTED_MESSAGE
          : e instanceof Error
            ? e.message
            : fallbackMessage;
      // Fires only when the cap already rejected and the rebind then settles: clear
      // the false timeout on late success, show the real reason on late failure.
      // Skipped if a newer submit superseded this one.
      const onLateSettle = (lateError: Error | null) => {
        if (submitGen.current !== gen) return;
        setError(lateError ? errorFor(lateError) : null);
      };
      setSubmitting(true);
      setError(null);
      setDenied(false);
      autoAdoptedRef.current = true;
      try {
        const id = await prep();
        await withSpinnerTimeout(reconnectWithEmergency(id), onLateSettle);
      } catch (e) {
        setError(errorFor(e));
        throw e;
      } finally {
        // Always clear the blocking flag once the rebind settles, whichever way.
        setSubmitting(false);
      }
    },
    [reconnectWithEmergency]
  );

  const confirm = useCallback(
    (id: string) =>
      runRebind('Failed to confirm emergency address', async () => {
        // The address may be anchored to a PRIOR network (registered_ip set) — the
        // server only (re)binds a NULL anchor, so clear it first, then present it so
        // the fresh authenticate re-binds it to THIS network. reconnectWithEmergency
        // resolves once the server confirms; bound then flips via the effect re-run.
        await clearRegisteredIp(id);
        return id;
      }),
    [runRebind, clearRegisteredIp]
  );

  const create = useCallback(
    (input: EmergencyAddressInput) =>
      // Create the address, then present it in one step — otherwise the socket
      // re-authenticates without carrying it and the server binds nothing.
      runRebind('Failed to save emergency address', async () => (await save(input)).id),
    [runRebind, save]
  );

  return { loading, bound, savedAddresses, submitting, error, onNetworkChanged, confirm, create };
}
