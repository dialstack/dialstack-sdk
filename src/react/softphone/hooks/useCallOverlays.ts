/**
 * `useCallOverlays` — the in-call keypad/transfer overlay flags, shared web ↔ RN.
 *
 * These are presentation state for ONE screen (the built-in `OngoingCall`): the
 * DTMF keypad panel and the blind-transfer input, which are mutually exclusive.
 * They are deliberately kept OUT of `useCallActions` (which is platform-agnostic
 * call control) so a consumer building a custom layout gets call control without
 * this built-in-UI plumbing. It's a shared hook rather than local `OngoingCall`
 * state only so web and React Native can't drift on WHEN the overlays reset.
 */

import { useCallback, useEffect, useState } from 'react';
import type { Call } from '../../../webrtc';

export interface UseCallOverlays {
  /** Whether the in-call DTMF keypad overlay is showing. */
  showKeypad: boolean;
  /** Whether the in-call transfer input overlay is showing. */
  showTransfer: boolean;
  /** Toggle the DTMF keypad (closes the transfer overlay — they're exclusive). */
  toggleKeypad: () => void;
  /** Toggle the transfer input (closes the keypad overlay). */
  toggleTransfer: () => void;
  /** Close the transfer overlay (e.g. after a transfer is handed off). */
  closeTransfer: () => void;
}

/**
 * The keypad/transfer overlay flags for the current foreground `call`. Both reset
 * whenever the foreground call changes (a new call arrives, or the current one
 * ends → null) — owning that here keeps web and RN identical, so neither UI has
 * to wire overlay-reset by hand and they can't drift on *when* it happens.
 */
export function useCallOverlays(call: Call | null): UseCallOverlays {
  const [showKeypad, setShowKeypad] = useState(false);
  const [showTransfer, setShowTransfer] = useState(false);

  const toggleKeypad = useCallback(() => {
    setShowKeypad((v) => !v);
    setShowTransfer(false);
  }, []);
  const toggleTransfer = useCallback(() => {
    setShowTransfer((v) => !v);
    setShowKeypad(false);
  }, []);
  const closeTransfer = useCallback(() => setShowTransfer(false), []);

  // Reset the overlays whenever the foreground call changes. Owning this here
  // keeps web and RN identical — neither UI wires it by hand, and they can't
  // drift on *when* it happens (change vs end).
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- reset transient overlays on foreground-call change
    setShowKeypad(false);
    setShowTransfer(false);
  }, [call]);

  return { showKeypad, showTransfer, toggleKeypad, toggleTransfer, closeTransfer };
}
