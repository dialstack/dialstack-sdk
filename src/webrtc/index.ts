// The softphone sources now live at sdk/webrtc/src. This barrel keeps the
// `@dialstack/sdk/webrtc` subpath resolving to the same surface, and keeps the
// declaration emit landing at dist/webrtc/index.d.ts, which the exports map
// names directly.
export { DialStackPhone } from '../../webrtc/src/phone';
export { Call } from '../../webrtc/src/call';
export { PhoneError, NotImplementedError } from '../../webrtc/src/errors';
export type { PhoneErrorCode } from '../../webrtc/src/errors';
export type { PlatformStorage } from '../../webrtc/src/platform';
export { RingbackTone } from '../../webrtc/src/ringback';
export type { Ringback } from '../../webrtc/src/ringback';
export type { SignalingSocketFactory, AppResumeSubscribe } from '../../webrtc/src/transport';
export type {
  AudioDevice,
  AudioDeviceList,
  PhoneOptions,
  CallOptions,
  CallState,
  CallDirection,
  CallEndReason,
  RejectReason,
  HeldBy,
  PresenceStatus,
  SettablePresenceStatus,
  PresenceEntry,
  PresenceUpdate,
  DirectoryEntry,
  EmergencyAddress,
  EmergencyAddressInput,
  EmergencyAddressDetails,
  ListResponse,
} from '../../webrtc/src/types';
export type { PaginatedList, Page, PageItem } from '../../js/src/shared/pagination';
