/**
 * `useCallOverlays` — the in-call overlay flags, shared web ↔ RN.
 *
 * These are presentation state for ONE screen (the built-in `OngoingCall`): the
 * DTMF keypad panel, the blind-transfer input, and the audio-device picker, which
 * are mutually exclusive.
 * They are deliberately kept OUT of `useCallActions` (which is platform-agnostic
 * call control) so a consumer building a custom layout gets call control without
 * this built-in-UI plumbing. It's a shared hook rather than local `OngoingCall`
 * state only so web and React Native can't drift on WHEN the overlays reset.
 */

import { useCallback, useEffect, useState } from 'react';
import type { Call } from '../../../../../webrtc/src';

export interface UseCallOverlays {
  /** Whether the in-call DTMF keypad overlay is showing. */
  showKeypad: boolean;
  /** Whether the in-call transfer input overlay is showing. */
  showTransfer: boolean;
  /** Whether the in-call audio-device picker is showing. */
  showDevices: boolean;
  /** Toggle the DTMF keypad (closes the other overlays — they're exclusive). */
  toggleKeypad: () => void;
  /** Toggle the transfer input (closes the other overlays). */
  toggleTransfer: () => void;
  /** Toggle the audio-device picker (closes the other overlays). */
  toggleDevices: () => void;
  /** Close the transfer overlay (e.g. after a transfer is handed off). */
  closeTransfer: () => void;
}

type OverlayPanel = 'keypad' | 'transfer' | 'devices' | null;

/**
 * The keypad/transfer overlay flags for the current foreground `call`. Both reset
 * whenever the foreground call changes (a new call arrives, or the current one
 * ends → null) — owning that here keeps web and RN identical, so neither UI has
 * to wire overlay-reset by hand and they can't drift on *when* it happens.
 */
export function useCallOverlays(call: Call | null): UseCallOverlays {
  const [panel, setPanel] = useState<OverlayPanel>(null);

  const toggle = useCallback((next: Exclude<OverlayPanel, null>) => {
    setPanel((current) => (current === next ? null : next));
  }, []);

  const toggleKeypad = useCallback(() => toggle('keypad'), [toggle]);
  const toggleTransfer = useCallback(() => toggle('transfer'), [toggle]);
  const toggleDevices = useCallback(() => toggle('devices'), [toggle]);
  const closeTransfer = useCallback(
    () => setPanel((current) => (current === 'transfer' ? null : current)),
    []
  );

  // Reset the overlays whenever the foreground call changes. Owning this here
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- reset transient overlays on foreground-call change
    setPanel(null);
  }, [call]);

  return {
    showKeypad: panel === 'keypad',
    showTransfer: panel === 'transfer',
    showDevices: panel === 'devices',
    toggleKeypad,
    toggleTransfer,
    toggleDevices,
    closeTransfer,
  };
}
