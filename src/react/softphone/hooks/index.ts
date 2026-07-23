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
export type { UseCallActions, UseCallActionsOptions, CallActions } from './useCallActions';

// Internal built-in-UI machinery — the OngoingCall overlay flags. Consumed by the
// provider only; deliberately NOT re-exported from the public `softphone/index.ts`
// barrel (nor the RN-safe `core/softphone-core.ts`), so it isn't part of the SDK's
// public API.
export { useCallOverlays } from './useCallOverlays';
export type { UseCallOverlays } from './useCallOverlays';

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
  canPlaceCall,
  selectScreen,
  selectLayout,
  callPeerNumber,
  callPeerName,
  formatCallDuration,
  formatDisplayNumber,
  stripToDialString,
  sanitizeDestination,
  DIAL_COUNTRY,
  callStateLabelKey,
  errorMessageKey,
} from '../core/view-model';
export type { SoftphoneScreen, SoftphoneLayout } from '../core/view-model';
