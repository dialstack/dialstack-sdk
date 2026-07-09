/**
 * Shared dialer hooks + view-model — the platform-agnostic "brain" of the SDK
 * dialer, consumed by both the web React `<Dialer>` and the React Native dialer.
 *
 * These import only the headless core (`../../webrtc`) and React, never the DOM
 * or React Native, so the call-state logic that's easy to let drift between the
 * two UIs is single-sourced here. Each platform builds only its own render tree.
 */

export { useCall } from './useCall';
export type { UseCallOptions, UseCallResult, DialerConnectionState } from './useCall';

export { useCallActions } from './useCallActions';
export type { UseCallActions, UseCallActionsOptions } from './useCallActions';

export { useCallDuration } from './useCallDuration';

export { useEmergencyAddress } from './useEmergencyAddress';
export type { UseEmergencyAddress } from './useEmergencyAddress';

export {
  isIncomingRinging,
  isCallActive,
  selectScreen,
  callPeerNumber,
  callPeerName,
  formatCallDuration,
  formatDisplayNumber,
  callStateLabelKey,
} from '../../components/dialer-view-model';
export type { DialerScreen } from '../../components/dialer-view-model';
