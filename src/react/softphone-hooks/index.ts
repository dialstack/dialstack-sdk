/**
 * Shared softphone hooks + view-model — the platform-agnostic "brain" of the SDK
 * softphone, consumed by both the web React `<Softphone>` and the React Native softphone.
 *
 * These import only the headless core (`../../webrtc`) and React, never the DOM
 * or React Native, so the call-state logic that's easy to let drift between the
 * two UIs is single-sourced here. Each platform builds only its own render tree.
 */

export { useCall } from './useCall';
export type { UseCallOptions, UseCallResult, SoftphoneConnectionState } from './useCall';

export { useCallActions } from './useCallActions';
export type { UseCallActions, UseCallActionsOptions } from './useCallActions';

export { useCallDuration } from './useCallDuration';

export { useEmergencyBinding } from './useEmergencyBinding';
export type { UseEmergencyBinding, UseEmergencyBindingDeps } from './useEmergencyBinding';

export {
  isIncomingRinging,
  isCallActive,
  selectScreen,
  callPeerNumber,
  callPeerName,
  formatCallDuration,
  formatDisplayNumber,
  callStateLabelKey,
} from '../../components/softphone-view-model';
export type { SoftphoneScreen } from '../../components/softphone-view-model';
