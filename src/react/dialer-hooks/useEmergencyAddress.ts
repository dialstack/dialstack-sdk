/**
 * `useEmergencyAddress` — manages the per-user E911 emergency address the Dialer
 * must present before it can place outbound PSTN calls. The ari call path blocks
 * WebRTC PSTN until a verified address is bound to the user (provisioning the
 * account LOCATION is a separate thing and does not satisfy this).
 *
 * This hook does NOT own a phone. It drives the emergency-address REST surface
 * through the SAME `DialStackPhone` the call session owns (via the
 * `list`/`save` callbacks from `useCall`), so there is exactly one connection
 * per user and reading/writing the address never disturbs the registration that
 * receives incoming calls.
 *
 * Platform-agnostic: imports only the headless core, no DOM.
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import type { EmergencyAddress, EmergencyAddressInput } from '../../webrtc';

export interface UseEmergencyAddressDeps {
  /** True once the phone is connected, so the initial list can run. */
  connected: boolean;
  /** List saved addresses via the call session's phone. */
  list: () => Promise<EmergencyAddress[]>;
  /** Create/validate an address via the call session's phone (no reconnect). */
  save: (input: EmergencyAddressInput) => Promise<EmergencyAddress>;
}

export interface UseEmergencyAddress {
  /** True until the initial list resolves (after the phone connects). */
  loading: boolean;
  /** The bound address id (registered_ip set) if one exists — PSTN is unlocked. */
  boundAddressId: string | null;
  /** The saved address (may be unbound), for prefilling the form. */
  current: EmergencyAddress | null;
  /** True while a save is in flight. */
  saving: boolean;
  /** The last save error (e.g. a carrier rejection), or null. */
  error: string | null;
  /** Create/validate the address; returns its id or null on failure. */
  submit: (input: EmergencyAddressInput) => Promise<string | null>;
}

export function useEmergencyAddress({
  connected,
  list,
  save,
}: UseEmergencyAddressDeps): UseEmergencyAddress {
  const [loading, setLoading] = useState(true);
  const [current, setCurrent] = useState<EmergencyAddress | null>(null);
  const [boundAddressId, setBoundAddressId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Read the current saved address once the phone connects. Guarded so it runs
  // once per connect, not on every render.
  const listRef = useRef(list);
  useEffect(() => {
    listRef.current = list;
  });
  useEffect(() => {
    if (!connected) return;
    let cancelled = false;
    (async () => {
      try {
        const addrs = await listRef.current();
        if (cancelled) return;
        const addr = addrs[0] ?? null;
        setCurrent(addr);
        // registered_ip !== null means the address is bound to a network and
        // the Dialer can place PSTN calls.
        setBoundAddressId(addr && addr.registered_ip !== null ? addr.id : null);
      } catch {
        // Best-effort — leave as "no address", the form will show.
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [connected]);

  const submit = useCallback(
    async (input: EmergencyAddressInput): Promise<string | null> => {
      setSaving(true);
      setError(null);
      try {
        const addr = await save(input);
        setCurrent(addr);
        setBoundAddressId(addr.id);
        return addr.id;
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Failed to save emergency address');
        return null;
      } finally {
        setSaving(false);
      }
    },
    [save]
  );

  return { loading, boundAddressId, current, saving, error, submit };
}
