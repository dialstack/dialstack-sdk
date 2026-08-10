export { DialStackPhone } from './phone.js';
export { Call } from './call.js';
export { PhoneError, NotImplementedError } from './errors.js';
export type { PhoneErrorCode } from './errors.js';
export type { PlatformStorage } from './platform.js';
// The web implementation as well as its shape: the React softphone persists the
// user's audio-device choice through it, and a host on another platform can
// substitute its own.
export { storage } from './platform.js';
export { RingbackTone } from './ringback.js';
export type { Ringback } from './ringback.js';
export type { SignalingSocketFactory, AppResumeSubscribe } from './transport.js';
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
} from './types.js';
export type { PaginatedList, Page, PageItem } from './pagination.js';
// The factory as well as the types: the React softphone builds paginated lists of
// its own and takes them from here rather than from the browser package, so that
// edge stays a dependency it already has instead of widening the peer.
export { createPaginatedList } from './pagination.js';
