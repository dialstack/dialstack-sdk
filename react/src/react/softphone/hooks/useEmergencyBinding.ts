/**
 * `useEmergencyBinding` — the Softphone's built-in E911 provisioning logic.
 *
 * Model: "always send it, the server decides." The server binds the presented
 * emergency address to the connection's network, at the `authenticate` handshake
 * or in-band on the open socket, and is the authority on whether it's valid
 * here — it rejects a mismatch via the `network.changed` signal.
 *
 *   - On connect, if the session has a saved address but presented none (fresh
 *     browser), auto-present it (one in-band rebind). Same network → the server
 *     binds it silently (reused). Different network → the server denies
 *     (network.changed) → we prompt. Live calls are unaffected either way.
 *   - `bound` is true unless the server denied (network.changed) or there is no
 *     saved address to present at all.
 *
 * When the host supplies `emergencyAddressId`, it manages E911 itself and this
 * hook stays dormant (`disabled`). 911/933 are never gated by any of this.
 *
 * It talks to the `DialStackPhone` (owned by `usePhone`) DIRECTLY via a narrow
 * interface — the subset of phone methods E911 needs. That interface is the
 * hook's testable seam: a test passes a small phone-shaped stub, no full mock.
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import type {
  EmergencyAddress,
  EmergencyAddressInput,
  PaginatedList,
  ListResponse,
} from '@dialstack/sdk-webrtc';
import type { SoftphoneConnectionState } from './usePhone';
import { useLatestRef } from './useLatestRef';

/**
 * The narrow slice of `DialStackPhone` this hook uses. `DialStackPhone` satisfies
 * it structurally, so the provider passes the phone straight in; a test passes a
 * minimal stub with just these members.
 */
export interface PhoneE911Api {
  /** List the user's saved emergency addresses (auto-paginating; we read the first page). */
  listEmergencyAddresses: () => PaginatedList<ListResponse<EmergencyAddress>>;
  /** Create + validate a new emergency address (does not bind it). */
  setEmergencyAddress: (input: EmergencyAddressInput) => Promise<EmergencyAddress>;
  /**
   * The emergency-address id the phone presented on the CURRENT socket's
   * authenticate (null if none). A saved address's `registered_ip` proves it was
   * bound in *some* session, not this one — only a match here means the server
   * bound it for the live connection.
   */
  readonly presentedEmergencyAddressId: string | null;
  /**
   * Bind `id` on the open connection, keeping live calls; resolves with the
   * verdict. `anchor` confirms it for the current network whatever network it
   * was confirmed on before.
   */
  rebindEmergencyAddress: (
    id: string,
    options?: { anchor?: boolean }
  ) => Promise<{ bound: boolean }>;
}

export interface UseEmergencyBindingOptions {
  /** Skip all E911 handling (the host supplies emergencyAddressId itself). */
  disabled: boolean;
  /** Live connection state — the check runs when this becomes 'connected'. */
  connection: SoftphoneConnectionState;
  /**
   * The WebRTC token — identity of the session this binding belongs to. When it
   * changes ALL binding state must reset, or on a shared client the previous
   * user's state lingers and the new user can show E911 unlocked without ever
   * presenting their own address (a safety gate reading green for the wrong identity).
   */
  identityKey: string;
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
  /** True while an address submit (confirm/create) is in flight. */
  submitting: boolean;
  /** Last error (e.g. a carrier rejection). */
  error: string | null;
  /** Called from the Softphone when the phone emits `network.changed` (denied). */
  onNetworkChanged: () => void;
  /** Confirm an existing saved address for this network (clears its anchor + rebinds). */
  confirm: (id: string) => Promise<void>;
  /** Create + validate a new address, then bind it. */
  create: (input: EmergencyAddressInput) => Promise<void>;
}

// Shown when a rebind was interrupted (transport_closed: the socket dropped or
// the reply never came) rather than refused — not a rebind failure, so a neutral
// retry beats the phone's internal abort string.
const INTERRUPTED_MESSAGE = 'Connection interrupted. Please try again.';

// Fail the "Saving…" form well before the phone's own reply timeout (longer still
// when it has to connect first) so a stuck rebind doesn't spin the button that long.
const REBIND_SPINNER_TIMEOUT_MS = 8000;
const REBIND_TIMEOUT_MESSAGE = 'Timed out confirming your location. Please try again.';
// The server answered but would not bind the address on this network.
const REBIND_DENIED_MESSAGE = "We couldn't confirm this address on this network. Please try again.";

function isBenignInterruption(e: unknown): boolean {
  return (e as { code?: string } | null)?.code === 'transport_closed';
}

type RebindResult = { bound: boolean };

// Reject when the cap elapses so the form stops spinning (rejecting, not resolving,
// keeps the banner open). The rebind keeps running; `onLateSettle` fires only when
// the cap already won and the rebind then settles — applying the verdict and
// clearing the false timeout on late success, surfacing the real reason on late
// failure.
function withSpinnerTimeout(
  rebind: Promise<RebindResult>,
  onLateSettle: (error: Error | null, result?: RebindResult) => void
): Promise<RebindResult> {
  let capFired = false;
  return new Promise<RebindResult>((resolve, reject) => {
    const timer = setTimeout(() => {
      capFired = true;
      reject(new Error(REBIND_TIMEOUT_MESSAGE));
    }, REBIND_SPINNER_TIMEOUT_MS);
    rebind.then(
      (result) => {
        clearTimeout(timer);
        if (capFired) onLateSettle(null, result);
        else resolve(result);
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

export function useEmergencyBinding(
  phone: PhoneE911Api,
  options: UseEmergencyBindingOptions
): UseEmergencyBinding {
  const { disabled, connection, identityKey } = options;
  const [loading, setLoading] = useState(!disabled);
  const [bound, setBound] = useState(false);
  const [denied, setDenied] = useState(false);
  const [savedAddresses, setSavedAddresses] = useState<EmergencyAddress[]>([]);
  const [submitting, setSubmitting] = useState(false);
  // Read inside the post-connect effect WITHOUT retriggering it: listing
  // `submitting` as a dep re-ran the whole address-list fetch on both edges of
  // every submit. The effect only needs the value to decide whether a concurrent
  // submit owns the error/bound state.
  const submittingRef = useLatestRef(submitting);
  const [error, setError] = useState<string | null>(null);

  // The phone read through a latest-value ref so the connect effect can use it
  // without listing it as a dep (a new phone identity would re-run the rebind on
  // every render). `phone` is NON-nullable on purpose: the
  // provider supplies a stable stand-in while no phone exists, so this hook can
  // never take a "maybe" branch on an emergency-address call. A silently skipped
  // bind that still resolves would clear the spinner and close the form while the
  // server bound nothing.
  const phoneRef = useLatestRef(phone);
  // Guard so we auto-adopt at most once per connected session (no re-present loop).
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
  // yet presented it this session (fresh browser), auto-present it once — the
  // server then binds it (same network) or denies via network.changed (moved).
  // Otherwise the session is bound unless denied. The rebind is in-band, so it
  // runs even with a call live: nothing is torn down.
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
        const phone = phoneRef.current;
        const addrs = (await phone.listEmergencyAddresses()).data;
        if (cancelled) return;
        setSavedAddresses(addrs);
        // Resolve the "active" address by the id the phone PRESENTED this session,
        // NOT addrs[0]. addrs is id DESC (newest first) but the presented id is
        // often older; pinning to addrs[0] would mis-judge boundness and clobber
        // the user's selection on reconnect. Fall back to addrs[0] only when
        // nothing was presented.
        const presentedId = phone.presentedEmergencyAddressId;
        const active = addrs.find((a) => a.id === presentedId) ?? addrs[0] ?? null;
        if (!active) {
          setBound(false);
          return;
        }
        if (!autoAdoptedRef.current && !denied) {
          autoAdoptedRef.current = true;
          // This shortcut has OSCILLATED — do NOT "simplify" to either extreme; the
          // two failure modes oppose:
          //   - Always present: an address anchored in a past session but bound
          //     on this one is rebound for nothing — and before the in-band rebind
          //     the reconnect dropped its registration and came back denied →
          //     banner never cleared (the "already-anchored → bound" regression).
          //   - Trust `registered_ip` alone → bound: an address bound in a PAST
          //     session but NOT presented on THIS socket means the server bound
          //     nothing this session, yet the gate shows green while outbound PSTN
          //     is silently blocked (the stale-anchor bug).
          // The discriminator `registered_ip` alone can't provide: whether the
          // phone presented THIS id on the CURRENT socket, which is when the server
          // (re)binds.
          const presentedThisSession = presentedId != null && presentedId === active.id;
          if (presentedThisSession && active.registered_ip != null) {
            // Presented AND anchored → server re-bound it; treat as bound without
            // asking again. A moved network arrives as network.changed → denied
            // instead.
            setBound(true);
            // Not mid-submit: its own cap error must stay until its late-settle clears it.
            if (!submittingRef.current) setError(null);
          } else {
            // Nothing bound this session: present so the server binds, and take
            // its verdict. A denial has already set `denied` (network.changed
            // precedes the reply), which re-runs this effect and cancels this
            // run, so the verdict only ever turns a pending check green.
            // autoAdoptedRef prevents a re-present loop.
            const applyVerdict = (result?: RebindResult) => {
              if (cancelled || !result) return;
              setBound(result.bound);
              if (result.bound && !submittingRef.current) setError(null);
            };
            await withSpinnerTimeout(phone.rebindEmergencyAddress(active.id), (_e, late) =>
              applyVerdict(late)
            ).then(applyVerdict, () => {});
            return;
          }
        } else if (!submittingRef.current) {
          // Presented; bound unless denied. Skipped mid-submit: that submit clears
          // `denied` synchronously and re-runs this effect before the server has
          // answered, so flipping bound=true here would be a wrong-green flash
          // before the rebind actually binds. Its reply drives the truth.
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
  }, [disabled, connection, denied, phoneRef, submittingRef]);

  // Shared submit protocol for confirm/create: block the form, mark this an
  // explicit choice (so auto-adopt doesn't fire over it), run `prep`, then rebind
  // under the spinner cap. The rebind anchors: the user has just said they are
  // at this address, so the server confirms it for this network in one write.
  // Clearing the old anchor over REST first and then binding would race the
  // server's regional read of that same row, which can lag the write and deny
  // the user's confirm (or, after a create, not find the address yet). On failure surface + rethrow — a failed rebind leaves
  // outbound PSTN gated, so the banner must not collapse its form.
  const runRebind = useCallback(
    async (fallbackMessage: string, prep: () => Promise<string>): Promise<void> => {
      const gen = ++submitGen.current;
      const errorFor = (e: unknown): string =>
        isBenignInterruption(e)
          ? INTERRUPTED_MESSAGE
          : e instanceof Error
            ? e.message
            : fallbackMessage;
      // The server's verdict. network.changed came first on a denial and set
      // `denied`; the denial still throws so the banner keeps the form (and what
      // the user typed) open with a reason. Skipped if a newer submit superseded
      // this one.
      const applyVerdict = ({ bound: ok }: RebindResult) => {
        if (submitGen.current !== gen) return;
        setBound(ok);
        if (!ok) throw new Error(REBIND_DENIED_MESSAGE);
        // No fresh 'connected' re-runs the list effect after an in-band bind, so
        // pick up a just-created address (and the new anchor) here. Best-effort.
        phoneRef.current
          .listEmergencyAddresses()
          .then((page) => {
            if (submitGen.current === gen) setSavedAddresses(page.data);
          })
          .catch(() => {});
      };
      // Fires only when the cap already rejected and the rebind then settles: apply
      // the verdict and clear the false timeout on late success, show the real
      // reason on late failure.
      const onLateSettle = (lateError: Error | null, result?: RebindResult) => {
        if (submitGen.current !== gen) return;
        setError(lateError ? errorFor(lateError) : null);
        if (!result) return;
        try {
          applyVerdict(result);
        } catch (e) {
          setError(errorFor(e));
        }
      };
      setSubmitting(true);
      setError(null);
      setDenied(false);
      autoAdoptedRef.current = true;
      try {
        const id = await prep();
        const rebind = phoneRef.current.rebindEmergencyAddress(id, { anchor: true });
        applyVerdict(await withSpinnerTimeout(rebind, onLateSettle));
      } catch (e) {
        setError(errorFor(e));
        throw e;
      } finally {
        // Always clear the blocking flag once the rebind settles, whichever way.
        setSubmitting(false);
      }
    },
    [phoneRef]
  );

  // Both submit paths read the phone through `phoneRef`, the same source
  // `runRebind` uses for the rebind, so one submit never straddles two phone
  // instances if the phone swaps mid-flight.
  const confirm = useCallback(
    (id: string) =>
      // The address may be anchored to a prior network; the anchoring rebind
      // re-anchors it to this one.
      runRebind('Failed to confirm emergency address', async () => id),
    [runRebind]
  );

  const create = useCallback(
    (input: EmergencyAddressInput) =>
      // Create the address, then present it — creating alone binds nothing.
      runRebind('Failed to save emergency address', async () => {
        return (await phoneRef.current.setEmergencyAddress(input)).id;
      }),
    [runRebind, phoneRef]
  );

  return { loading, bound, savedAddresses, submitting, error, onNetworkChanged, confirm, create };
}
