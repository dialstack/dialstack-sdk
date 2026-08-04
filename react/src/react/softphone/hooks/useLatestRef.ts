import { useEffect, useRef } from 'react';

/**
 * Mirror the latest render's `value` into a ref, so a stable callback or an
 * effect can read the freshest value without listing it as a dependency.
 *
 * The softphone's connect/wiring effects intentionally depend only on
 * credentials (or the phone identity); a non-credential option passed inline —
 * an `iceServers` array literal, a fresh `onError` each render — must NOT be in
 * those deps, or its changing identity would tear the socket down and reconnect
 * mid-registration (dropping incoming calls). Reading it through this ref keeps
 * it out of the deps while still using the current value.
 *
 * The ref is written in an effect (never during render, which react-hooks/refs
 * forbids), so callers must only read `.current` later — in a callback, an event
 * handler, or a subsequent effect — never during the same render.
 */
export function useLatestRef<T>(value: T): { readonly current: T } {
  const ref = useRef(value);
  useEffect(() => {
    ref.current = value;
  }, [value]);
  return ref;
}
