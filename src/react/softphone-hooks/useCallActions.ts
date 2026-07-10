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
import type { Call, PhoneError } from '../../webrtc';

export interface UseCallActionsOptions {
  /** Fired on a failed action (e.g. DTMF on a call with no sender, transfer). */
  onError?: (e: { code: string; message: string }) => void;
}

export interface UseCallActions {
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

  answer: () => void;
  reject: () => void;
  hangup: () => void;
  toggleMute: () => void;
  toggleHold: () => void;
  /** Send a DTMF digit on the active call (no-op when no call). */
  sendDtmf: (digit: string) => void;
  /** Blind-transfer the active call to `destination`; closes the overlay on success. */
  transfer: (destination: string) => void;
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
  // contrast, is server-confirmed via call.on('held'/'resumed'), which useCall
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

  // answer/reject/hangup/mute/hold call into the transport and can throw
  // (e.g. transport closed mid-action); contain those through `onError` like
  // sendDtmf/transfer do, so a throw never escapes into the UI event handler
  // (see the file header contract).
  const answer = useCallback(() => {
    if (!call) return;
    try {
      call.answer();
    } catch (err) {
      fail(err, 'call_failed');
    }
  }, [call, fail]);
  const reject = useCallback(() => {
    if (!call) return;
    try {
      call.reject();
    } catch (err) {
      fail(err, 'call_failed');
    }
  }, [call, fail]);
  const hangup = useCallback(() => {
    if (!call) return;
    try {
      call.hangup();
    } catch (err) {
      fail(err, 'call_failed');
    }
  }, [call, fail]);

  const toggleMute = useCallback(() => {
    if (!call) return;
    try {
      if (call.isMuted) call.unmute();
      else call.mute();
      rerender();
    } catch (err) {
      fail(err, 'call_failed');
    }
  }, [call, rerender, fail]);

  const toggleHold = useCallback(() => {
    if (!call) return;
    try {
      if (call.state === 'held') call.resume();
      else call.hold();
    } catch (err) {
      fail(err, 'call_failed');
    }
  }, [call, fail]);

  const sendDtmf = useCallback(
    (digit: string) => {
      if (!digit || !call) return;
      try {
        call.sendDtmf(digit);
      } catch (err) {
        fail(err, 'call_failed');
      }
    },
    [call, fail]
  );

  const transfer = useCallback(
    (destination: string) => {
      const target = destination.trim();
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
  };
}
