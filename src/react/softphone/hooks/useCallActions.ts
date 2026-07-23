/**
 * `useCallActions` — platform-agnostic per-call imperative actions, shared
 * web ↔ RN.
 *
 * Wraps the foreground `Call`'s imperative actions (answer / reject / hangup /
 * mute / hold / DTMF / transfer) so both softphones call them identically, with
 * the same `PhoneError` → `onError` normalization. This is call CONTROL only —
 * no view-state. In-call presentation state (the keypad/transfer overlay flags of
 * the built-in `OngoingCall`) lives in `useCallOverlays`, so a consumer building a
 * custom layout gets these actions without any built-in-UI plumbing. It
 * deliberately does NOT render anything — it returns plain callbacks the platform
 * UI binds to its own controls.
 */

import { useCallback, useState } from 'react';
import type { Call, PhoneError } from '../../../webrtc';
import { sanitizeOrEmitInvalid } from '../core/view-model';

export interface UseCallActionsOptions {
  /** Fired on a failed action (e.g. DTMF on a call with no sender, transfer). */
  onError?: (e: { code: string; message: string }) => void;
}

/**
 * The imperative actions for one specific call, with core throws contained via
 * `onError`. This is the per-call subset shared by every call surface (the
 * foreground in-call controls AND an incoming/held card): each card binds these
 * to a specific `Call` rather than only the foreground one.
 */
export interface CallActions {
  answer: () => void;
  reject: () => void;
  hangup: () => void;
  toggleMute: () => void;
  toggleHold: () => void;
  /** Send a DTMF digit (no-op when no call). */
  sendDtmf: (digit: string) => void;
}

export interface UseCallActions extends CallActions {
  /**
   * Blind-transfer the active call to `destination`. Returns `true` when the
   * transfer was *initiated* (so the UI can close its transfer overlay), `false`
   * on empty input or a synchronous failure routed to `onError`. `true` means
   * initiated, not confirmed — the core call is fire-and-forget, so the outcome
   * arrives later as the call ending ('transferred') or an `onError`.
   */
  transfer: (destination: string) => boolean;

  /**
   * Build the per-call action subset for a SPECIFIC call — used by the
   * incoming/held cards, which act on a call that isn't the foreground one. The
   * foreground actions above are exactly `callActionsFor(activeCall)`.
   */
  callActionsFor: (call: Call | null) => CallActions;
}

/**
 * The raw per-call actions for `call`, with core throws routed through `fail`.
 * Pure (not a hook): both the foreground `useCallActions` and any per-card
 * binding go through this one implementation so answer/reject/hangup/mute/hold/
 * dtmf can never diverge between surfaces.
 */
function makeCallActions(
  call: Call | null,
  fail: (err: unknown, fallbackCode: string) => void,
  rerender: () => void
): CallActions {
  return {
    answer: () => {
      if (!call) return;
      try {
        call.answer();
      } catch (err) {
        fail(err, 'call_failed');
      }
    },
    reject: () => {
      if (!call) return;
      try {
        call.reject();
      } catch (err) {
        fail(err, 'call_failed');
      }
    },
    hangup: () => {
      if (!call) return;
      try {
        call.hangup();
      } catch (err) {
        fail(err, 'call_failed');
      }
    },
    toggleMute: () => {
      if (!call) return;
      try {
        if (call.isMuted) call.unmute();
        else call.mute();
        rerender();
      } catch (err) {
        fail(err, 'call_failed');
      }
    },
    toggleHold: () => {
      if (!call) return;
      try {
        if (call.state === 'held') call.resume();
        else call.hold();
      } catch (err) {
        fail(err, 'call_failed');
      }
    },
    sendDtmf: (digit: string) => {
      if (!digit || !call) return;
      try {
        call.sendDtmf(digit);
      } catch (err) {
        fail(err, 'call_failed');
      }
    },
  };
}

/**
 * Action callbacks for `call` (the foreground call, may be null). Errors thrown
 * by the core surface via `onError` rather than escaping to the caller.
 */
export function useCallActions(
  call: Call | null,
  options: UseCallActionsOptions = {}
): UseCallActions {
  const { onError } = options;
  // Mute is client-local state the core mutates in place (call.mute() flips
  // call.isMuted with no server round-trip / event), so nothing would re-render
  // the mute control on its own. Bump a tick after toggling it. Hold, by
  // contrast, is server-confirmed via call.on('held'/'resumed'), which useCalls
  // already re-renders on — so it needs no local tick.
  const [, setTick] = useState(0);
  const rerender = useCallback(() => setTick((t) => t + 1), []);

  const fail = useCallback(
    (err: unknown, fallbackCode: string) => {
      const e = err as PhoneError;
      onError?.({ code: e?.code ?? fallbackCode, message: e?.message ?? String(err) });
    },
    [onError]
  );

  // Per-call action subset for a SPECIFIC call — the incoming/held cards act on
  // a call that isn't the foreground one. `makeCallActions` is the one shared
  // implementation so no surface can diverge. The build is cheap and the closures
  // are transient (rebound each render), so it isn't memoized.
  const callActionsFor = useCallback(
    (target: Call | null): CallActions => makeCallActions(target, fail, rerender),
    [fail, rerender]
  );

  // The foreground actions ARE the per-call actions bound to `call` — built via
  // the same callActionsFor path so there's a single code path (no second
  // makeCallActions call to drift from it).
  const { answer, reject, hangup, toggleMute, toggleHold, sendDtmf } = callActionsFor(call);

  const transfer = useCallback(
    (destination: string): boolean => {
      if (!call) return false;
      // Clean the dial string the same way placeCall does (strip formatting,
      // E.164 a valid number) and emit the shared invalid-destination error on
      // junk input — silent for an empty field, since the UI gates on non-empty.
      const target = sanitizeOrEmitInvalid(destination, onError, { silentWhenEmpty: true });
      if (!target) return false;
      try {
        call.transfer(target);
        // Report that the transfer was initiated (not confirmed — the core call is
        // fire-and-forget) so the caller can close its transfer overlay; this hook
        // no longer owns that view-state (it lives in useCallOverlays).
        return true;
      } catch (err) {
        fail(err, 'call_failed');
        return false;
      }
    },
    [call, fail, onError]
  );

  return {
    answer,
    reject,
    hangup,
    toggleMute,
    toggleHold,
    sendDtmf,
    transfer,
    callActionsFor,
  };
}
