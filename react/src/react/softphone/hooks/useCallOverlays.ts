/**
 * `useCallOverlays` — the in-call overlay flags, shared web ↔ RN.
 *
 * These are presentation state for ONE screen (the built-in `OngoingCall`): the
 * DTMF keypad panel, the blind-transfer input, the add-call dial input, and the
 * audio-device picker, which are mutually exclusive.
 * They are deliberately kept OUT of `useCallActions` (which is platform-agnostic
 * call control) so a consumer building a custom layout gets call control without
 * this built-in-UI plumbing. It's a shared hook rather than local `OngoingCall`
 * state only so web and React Native can't drift on WHEN the overlays reset.
 */

import { useCallback, useEffect, useState } from 'react';
import type { Call } from '@dialstack/sdk-webrtc';

export interface UseCallOverlays {
  /** Whether the in-call DTMF keypad overlay is showing. */
  showKeypad: boolean;
  /** Whether the in-call transfer input overlay is showing. */
  showTransfer: boolean;
  /** Whether the in-call audio-device picker is showing. */
  showDevices: boolean;
  /** Whether the in-call add-call dial input is showing. */
  showAddCall: boolean;
  /** Toggle the DTMF keypad (closes the other overlays — they're exclusive). */
  toggleKeypad: () => void;
  /** Toggle the transfer input (closes the other overlays). */
  toggleTransfer: () => void;
  /** Toggle the audio-device picker (closes the other overlays). */
  toggleDevices: () => void;
  /** Toggle the add-call dial input (closes the other overlays). */
  toggleAddCall: () => void;
  /** Close the transfer overlay (e.g. after a transfer is handed off). */
  closeTransfer: () => void;
  /** Close the add-call overlay (e.g. once the second call is placed). */
  closeAddCall: () => void;
}

type OverlayPanel = 'keypad' | 'transfer' | 'devices' | 'addcall' | null;

/**
 * The keypad/transfer overlay flags for the current foreground `call`.
 * `addCallAvailable` (false at the concurrent-call cap) force-closes the add-call
 * panel while it holds. Both reset
 * whenever the foreground call changes (a new call arrives, or the current one
 * ends → null) — owning that here keeps web and RN identical, so neither UI has
 * to wire overlay-reset by hand and they can't drift on *when* it happens.
 */
export function useCallOverlays(call: Call | null, addCallAvailable = true): UseCallOverlays {
  const [panel, setPanel] = useState<OverlayPanel>(null);
  // Drop an add-call panel the moment it becomes unavailable (the concurrent-call
  // cap). At the cap the panel is hidden and its toggle disabled, so leaving
  // `panel` set would strand it unreachable — and it would pop back with stale
  // typed digits as soon as a ringing leg dropped. Cleared during render rather
  // than in an effect: React's "adjust state when a prop changes" pattern, so the
  // stale panel never reaches a commit.
  if (!addCallAvailable && panel === 'addcall') setPanel(null);

  const toggle = useCallback((next: Exclude<OverlayPanel, null>) => {
    setPanel((current) => (current === next ? null : next));
  }, []);

  const toggleKeypad = useCallback(() => toggle('keypad'), [toggle]);
  const toggleTransfer = useCallback(() => toggle('transfer'), [toggle]);
  const toggleDevices = useCallback(() => toggle('devices'), [toggle]);
  const toggleAddCall = useCallback(() => toggle('addcall'), [toggle]);
  const closeTransfer = useCallback(
    () => setPanel((current) => (current === 'transfer' ? null : current)),
    []
  );
  const closeAddCall = useCallback(
    () => setPanel((current) => (current === 'addcall' ? null : current)),
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
    showAddCall: panel === 'addcall',
    toggleKeypad,
    toggleTransfer,
    toggleDevices,
    toggleAddCall,
    closeTransfer,
    closeAddCall,
  };
}
