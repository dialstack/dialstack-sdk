import { useCallback, useEffect, useRef, useState } from 'react';
import type { Call } from '@dialstack/sdk-webrtc';

import { callPeerNumber } from '../core/view-model';

/**
 * What the host knows about the remote party of a call — typically the record in
 * its own system that the caller's number matches. Kept to what a call screen
 * already shows: the softphone uses the name as the call's title and draws the
 * avatar above it, and everything else on the screen stays as it is.
 */
export interface PeerInfo {
  /** Replaces the caller-id name or the bare number as the call's title. */
  name?: string;
  /** Initials for the avatar disc, or an image URL drawn inside it. */
  avatar?: { initials?: string; uri?: string };
}

/**
 * Looks up the remote party of a call; may be async. Called once per remote
 * number for each resolver identity: calls to or from the same number share
 * the answer, so base it on the number, and a call whose other party changes
 * is asked about again. Pass a new function (e.g. `useCallback` over the data
 * it reads) when its answers would change, and keep it stable otherwise.
 * A `null`/`undefined` result, a rejection or a throw all leave the call on the
 * default display (caller-id name, else the number).
 */
export type ResolvePeer = (
  call: Call
) => PeerInfo | null | undefined | Promise<PeerInfo | null | undefined>;

// Blank fields dropped, once, on arrival, so every view reads the same shape.
function normalize(info: PeerInfo | null | undefined): PeerInfo | null {
  if (!info) return null;
  const clean = (s?: string) => (typeof s === 'string' && s.trim() ? s.trim() : undefined);
  const initials = clean(info.avatar?.initials);
  const uri = clean(info.avatar?.uri);
  const out: PeerInfo = {
    name: clean(info.name),
    avatar: initials || uri ? { initials, uri } : undefined,
  };
  return out.name || out.avatar ? out : null;
}

/**
 * Resolves the {@link PeerInfo} of each live call's remote number and returns a
 * lookup for the views. Keyed by number, not by call, so a call whose party
 * changes mid-call (a forward, a transfer) can't keep the previous party's
 * answer. A number is asked about once per resolver: when `resolvePeer` changes
 * (say a `useCallback` over contacts that just loaded), every live number is
 * asked again, and its previous answer stays on screen until the new one lands.
 * Entries for numbers no live call has are dropped, and an answer from a
 * superseded resolver or for a number that is gone is discarded.
 */
export function usePeerResolver(
  resolvePeer: ResolvePeer | undefined,
  calls: readonly Call[]
): (call: Call | null | undefined) => PeerInfo | null {
  // Per number: the answer and the resolver that gave it, and the resolver whose
  // lookup is in flight (at most one per number; a newer one supersedes it).
  const results = useRef(new Map<string, { info: PeerInfo | null; from: ResolvePeer }>());
  const pending = useRef(new Map<string, ResolvePeer>());
  const [version, setVersion] = useState(0);
  // A party change mutates the Call in place and only re-renders, keeping the
  // array's identity, so the effect also watches the numbers themselves.
  const numbers = calls.map(callPeerNumber).join('\n');

  useEffect(() => {
    if (!resolvePeer) {
      // Removing resolvePeer means "no resolver": forget its answers, and let
      // in-flight ones land on an empty pending map (they are then discarded).
      if (results.current.size > 0 || pending.current.size > 0) {
        results.current.clear();
        pending.current.clear();
        setVersion((v) => v + 1);
      }
      return;
    }
    const live = new Map<string, Call>();
    for (const call of calls) {
      const number = callPeerNumber(call);
      if (!live.has(number)) live.set(number, call);
    }
    for (const n of [...results.current.keys()]) if (!live.has(n)) results.current.delete(n);
    for (const n of [...pending.current.keys()]) if (!live.has(n)) pending.current.delete(n);

    for (const [number, call] of live) {
      if (results.current.get(number)?.from === resolvePeer) continue;
      if (pending.current.get(number) === resolvePeer) continue;
      pending.current.set(number, resolvePeer);
      // Promise.resolve().then() so a resolver that throws synchronously is
      // caught the same way as one that rejects.
      Promise.resolve()
        .then(() => resolvePeer(call))
        .then(normalize, () => null)
        .then((info) => {
          if (pending.current.get(number) !== resolvePeer) return;
          pending.current.delete(number);
          const before = results.current.get(number)?.info ?? null;
          results.current.set(number, { info, from: resolvePeer });
          if (info || before) setVersion((v) => v + 1);
        });
    }
  }, [calls, numbers, resolvePeer]);

  return useCallback(
    (call: Call | null | undefined) =>
      call ? (results.current.get(callPeerNumber(call))?.info ?? null) : null,
    // `version` is the cache's change signal: a new lookup identity re-renders
    // the views that read through it when a result lands.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [version]
  );
}
