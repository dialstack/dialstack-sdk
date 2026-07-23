/**
 * `useCallDuration` — the live in-call duration readout, shared web ↔ RN.
 *
 * The `Call` updates its `duration` field in place via an internal timer; React
 * doesn't observe that mutation. This hook ticks while a call is up and returns
 * the formatted `m:ss` string so the UI re-renders the readout each second.
 */

import { useEffect, useState } from 'react';
import type { Call } from '../../../webrtc';
import { formatCallDuration, isCallActive } from '../core/view-model';

/**
 * Returns the formatted elapsed time for `call`, ticking every `intervalMs`
 * (default 500ms — twice a second so the readout never visibly lags the wall
 * clock). Returns `0:00` when there is no active call.
 */
export function useCallDuration(call: Call | null, intervalMs = 500): string {
  const [, setTick] = useState(0);

  const active = call != null && isCallActive(call);
  useEffect(() => {
    if (!active) return;
    const id = setInterval(() => setTick((t) => t + 1), intervalMs);
    return () => clearInterval(id);
  }, [active, intervalMs]);

  return formatCallDuration(call ? call.duration : 0);
}
