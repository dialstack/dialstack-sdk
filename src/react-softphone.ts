/**
 * DialStack SDK — Softphone Hooks Entry Point (`@dialstack/sdk/react/softphone`).
 *
 * The platform-agnostic React "brain" of the softphone: the shared call-state hooks
 * and view-model used by BOTH the web React `<Softphone>` and a React Native softphone.
 *
 * This is a SEPARATE, lightweight entry from `@dialstack/sdk/react` on purpose:
 * it pulls in only React + the headless WebRTC core, with NO DOM / web component
 * graph (`@xyflow/react`, dagre, custom elements, CSS). That makes it safe to
 * import from React Native, where `@dialstack/sdk/react` would not resolve.
 *
 * @packageDocumentation
 */

export {
  useCalls,
  useCallActions,
  useCallDuration,
  useEmergencyBinding,
  useLastError,
  useDialInput,
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
} from './react/softphone-hooks';
export type {
  UseCallsOptions,
  UseCallsResult,
  SoftphoneConnectionState,
  UseCallActions,
  UseCallActionsOptions,
  CallActions,
  UseEmergencyBinding,
  UseEmergencyBindingDeps,
  UseLastError,
  UseDialInput,
  SoftphoneError,
  SoftphoneScreen,
  SoftphoneLayout,
} from './react/softphone-hooks';

// The locale table + default, re-exported here so the React Native softphone can
// resolve UI strings through the same `t()` accessor as the web softphone (this
// RN-safe entry is the only SDK path RN imports from). Pure data — no DOM/RN dep.
export { defaultLocale } from './locales';
export type { Locale } from './locales';
