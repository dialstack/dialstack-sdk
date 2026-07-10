/**
 * Shared softphone hooks + view-model — the platform-agnostic "brain" of the SDK
 * softphone, consumed by both the web React `<Softphone>` and the React Native softphone.
 *
 * These import only the headless core (`../../webrtc`) and React, never the DOM
 * or React Native, so the call-state logic that's easy to let drift between the
 * two UIs is single-sourced here. Each platform builds only its own render tree.
 */

export { useCalls } from './useCalls';
export type { UseCallsOptions, UseCallsResult, SoftphoneConnectionState } from './useCalls';

export { useCallActions } from './useCallActions';
export type { UseCallActions, UseCallActionsOptions } from './useCallActions';

export { useCallDuration } from './useCallDuration';

export { useEmergencyBinding } from './useEmergencyBinding';
export type { UseEmergencyBinding, UseEmergencyBindingDeps } from './useEmergencyBinding';

export { useLastError } from './useLastError';
export type { UseLastError, SoftphoneError } from './useLastError';

export { useDialInput } from './useDialInput';
export type { UseDialInput } from './useDialInput';

export {
  isIncomingRinging,
  shouldRingIncoming,
  isCallActive,
  selectScreen,
  callPeerNumber,
  callPeerName,
  formatCallDuration,
  formatDisplayNumber,
  stripToDialString,
  sanitizeDestination,
  DIAL_COUNTRY,
  callStateLabelKey,
  errorMessageKey,
} from '../../components/softphone-view-model';
export type { SoftphoneScreen } from '../../components/softphone-view-model';
