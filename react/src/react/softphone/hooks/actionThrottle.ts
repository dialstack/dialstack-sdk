import type { Call } from '@dialstack/sdk-webrtc';

/**
 * How long a call action ignores repeats. Long enough to swallow a double tap
 * or double click (the second press lands 100-300 ms after the first), short
 * enough that a deliberate second press still goes through.
 */
export const ACTION_THROTTLE_MS = 500;

/** Runs `action` and returns its result, or returns undefined when the press is dropped. */
export type ActionThrottle = <T>(key: string, action: () => T) => T | undefined;

/**
 * Leading-edge throttle per key: the first press runs at once, presses of the
 * same key within the window are dropped. Not a debounce, which would hold the
 * first press back until the presses stop.
 */
export function createActionThrottle(
  windowMs = ACTION_THROTTLE_MS,
  now: () => number = () => Date.now()
): ActionThrottle {
  const lastRun = new Map<string, number>();
  return (key, action) => {
    const at = now();
    const last = lastRun.get(key);
    if (last !== undefined && at - last < windowMs) return undefined;
    lastRun.set(key, at);
    return action();
  };
}

// Per call, not per hook: the actions are rebuilt every render and bound by
// each incoming or held card as well as by useCalls, and all of them must
// share one window.
const callThrottles = new WeakMap<Call, ActionThrottle>();

/** The throttle for actions on one call, shared by every surface acting on it. */
export function throttleFor(call: Call): ActionThrottle {
  let throttle = callThrottles.get(call);
  if (!throttle) callThrottles.set(call, (throttle = createActionThrottle()));
  return throttle;
}
