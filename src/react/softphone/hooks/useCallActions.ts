/**
 * `useCallActions` — action callbacks + transient in-call UI flags, shared
 * web ↔ RN.
 *
 * Wraps the foreground `Call`'s imperative actions (answer / reject / hangup /
 * mute / hold / DTMF / transfer) so both softphones call them identically, with the
 * same `PhoneError` → `onError` normalization, and owns the mutually-exclusive
 * keypad / transfer overlay flags. It deliberately does NOT render anything — it
 * returns plain callbacks + booleans the platform UI binds to its own controls.
 */

import { useCallback, useEffect, useState } from 'react';
import type { Call, PhoneError } from '../../../webrtc';
import { sanitizeDestination, DIAL_COUNTRY } from '../core/view-model';

export interface UseCallActionsOptions {
  /** Fired on a failed action (e.g. DTMF on a call with no sender, transfer). */
  onError?: (e: { code: string; message: string }) => void;
}

/**
 * The imperative actions for one specific call, with core throws contained via
 * `onError`. This is the per-call subset shared by every call surface (the
 * foreground in-call controls AND an incoming/held card): each card binds these
 * to a specific `Call` rather than only the foreground one. The overlay flags and
 * `transfer` (which depend on foreground UI state) live on `UseCallActions`, not
 * here.
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
  /** Whether the in-call DTMF keypad overlay is showing. */
  showKeypad: boolean;
  /** Whether the in-call transfer input overlay is showing. */
  showTransfer: boolean;
  /** Toggle the DTMF keypad (closes the transfer overlay — they're exclusive). */
  toggleKeypad: () => void;
  /** Toggle the transfer input (closes the keypad overlay). */
  toggleTransfer: () => void;
  /** Reset both overlays (e.g. when the foreground call changes or ends). */
  resetOverlays: () => void;

  /** Blind-transfer the active call to `destination`; closes the overlay on success. */
  transfer: (destination: string) => void;

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
 * Action callbacks for `call` (the foreground call, may be null), plus the
 * keypad/transfer overlay flags. Errors thrown by the core surface via
 * `onError` rather than escaping to the caller.
 */
export function useCallActions(
  call: Call | null,
  options: UseCallActionsOptions = {}
): UseCallActions {
  const { onError } = options;
  const [showKeypad, setShowKeypad] = useState(false);
  const [showTransfer, setShowTransfer] = useState(false);
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

  const toggleKeypad = useCallback(() => {
    setShowKeypad((v) => !v);
    setShowTransfer(false);
  }, []);
  const toggleTransfer = useCallback(() => {
    setShowTransfer((v) => !v);
    setShowKeypad(false);
  }, []);
  const resetOverlays = useCallback(() => {
    setShowKeypad(false);
    setShowTransfer(false);
  }, []);

  // Reset the overlays whenever the foreground call changes (a new call arrives,
  // or the current one ends → null). Owning this here keeps web and RN identical
  // — neither UI has to wire overlay-reset by hand, and they can't drift on
  // *when* it happens (change vs end).
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- reset transient overlays on foreground-call change
    setShowKeypad(false);
    setShowTransfer(false);
  }, [call]);

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
    (destination: string) => {
      // Clean the dial string the same way placeCall/attended transfer do, so a
      // pasted/formatted number ("(581) 319-5082") blind-transfers cleanly
      // instead of being rejected by the server's dial allowlist.
      const target = sanitizeDestination(destination, DIAL_COUNTRY);
      if (!target || !call) return;
      try {
        call.transfer(target);
        setShowTransfer(false);
      } catch (err) {
        fail(err, 'call_failed');
      }
    },
    [call, fail]
  );

  return {
    showKeypad,
    showTransfer,
    toggleKeypad,
    toggleTransfer,
    resetOverlays,
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
