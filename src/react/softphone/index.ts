/**
 * Softphone — the SDK's embedded phone, and the single public front door for it.
 *
 * The offering is two ways to embed a phone, both driven by one provider:
 * 1. Drop in `<Softphone>` — the batteries-included UI — inside a
 *    `<SoftphoneProvider>`.
 * 2. Or mix and match the UI parts (`DialPad`, `IncomingCall`/`IncomingCallCard`,
 *    `OngoingCall`) inside the same provider to build a bespoke experience.
 *
 * The provider owns the connection and token, so the pieces stay connected as
 * they mount/unmount. This barrel is the authority on the public softphone API:
 * it re-exports exactly what consumers need and nothing internal. `react.ts`
 * forwards it verbatim, so `@dialstack/sdk/react` exposes the same names — e.g.
 * `import { Softphone, SoftphoneProvider } from '@dialstack/sdk/react'`.
 *
 * Internals stay in the sibling folders and are NOT surfaced here: `provider/`
 * (SoftphoneProviderBase), `hooks/` (useEmergencyBinding), `core/` (the DOM/RN-free
 * headless barrel `@dialstack/sdk-native` inlines).
 *
 * @packageDocumentation
 */

// 1. The provider owns the connection + token; render the UI inside it.
export {
  SoftphoneProvider,
  useSoftphone,
  useActiveCall,
  useIncomingCall,
} from './provider/SoftphoneProvider';
export type {
  SoftphoneProviderProps,
  SoftphoneContextValue,
  SoftphoneConnectionState,
} from './provider/SoftphoneProvider';

// 2a. Batteries-included UI.
export { Softphone } from './ui/Softphone';
export type { SoftphoneProps } from './ui/Softphone';

// 2b. Mix-and-match UI parts for a bespoke experience.
export { DialPad } from './ui/DialPad';
export type { DialPadProps } from './ui/DialPad';
export { IncomingCall, IncomingStack } from './ui/IncomingCall';
export { IncomingCallCard } from './ui/IncomingCallCard';
export { OngoingCall } from './ui/OngoingCall';

// Shared call-state hooks + view-model helpers — the platform-agnostic layer the
// web Softphone and a React Native softphone both build on.
export {
  useCalls,
  useCallActions,
  useCallDuration,
  useLastError,
  useDialInput,
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
} from './hooks';
export type {
  UseCallsOptions,
  UseCallsResult,
  UseCallActions,
  UseCallActionsOptions,
  UseLastError,
  UseDialInput,
  SoftphoneError,
  SoftphoneScreen,
} from './hooks';
