/**
 * Shared softphone hooks + view-model — the platform-agnostic "brain" of the SDK
 * softphone, consumed by both the web React `<Softphone>` and the React Native softphone.
 *
 * These import only the headless core (`../../webrtc`) and React, never the DOM
 * or React Native, so the call-state logic that's easy to let drift between the
 * two UIs is single-sourced here. Each platform builds only its own render tree.
 */

export { usePhone } from './usePhone';
export type { UsePhoneOptions, UsePhoneResult, SoftphoneConnectionState } from './usePhone';

export { useCalls, MAX_CALLS } from './useCalls';
export type { UseCallsOptions, UseCallsResult } from './useCalls';

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
export type {
  UseEmergencyBinding,
  UseEmergencyBindingOptions,
  PhoneE911Api,
} from './useEmergencyBinding';

export { useLastError } from './useLastError';
export type { UseLastError, SoftphoneError } from './useLastError';

export { usePeerResolver } from './usePeerResolver';
export type { PeerInfo, ResolvePeer } from './usePeerResolver';

export { useAccountDirectory } from './useAccountDirectory';
export { useDialBrowse } from './useDialBrowse';
export type { UseDialBrowse } from './useDialBrowse';
export { useDialPanel } from './useDialPanel';
export type { UseDialPanel } from './useDialPanel';
export { useDirectorySearch } from './useDirectorySearch';
export type { UseDirectorySearch } from './useDirectorySearch';
export type { AccountDirectoryPhone } from './useAccountDirectory';

export { useDialInput } from './useDialInput';
export type { UseDialInput } from './useDialInput';

export { useDialTarget } from './useDialTarget';
export type { UseDialTarget } from './useDialTarget';

export {
  isIncomingRinging,
  shouldRingIncoming,
  isCallActive,
  canPlaceCall,
  callOrPick,
  selectScreen,
  selectLayout,
  callPeerNumber,
  callPeerName,
  peerDisplay,
  isRoomyLayout,
  HOST_MIN_WIDTH,
  HOST_MIN_HEIGHT,
  formatCallDuration,
  formatDisplayNumber,
  stripToDialString,
  sanitizeDestination,
  DIAL_COUNTRY,
  callStateLabelKey,
  errorMessageKey,
  filterDirectory,
  directoryContactTags,
  presenceLabelKey,
  contactDetail,
  matchDirectoryByNumber,
  currentContact,
  presenceTone,
  effectivePresence,
  accountDirectoryContacts,
  mergeDirectories,
} from '../core/view-model';
export type {
  SoftphoneScreen,
  SoftphoneLayout,
  PeerDisplay,
  SoftphoneLayoutVariant,
  DirectoryContact,
  DirectoryContactGroup,
  PresenceTone,
} from '../core/view-model';
