/**
 * `@dialstack/sdk-native` — the React Native softphone components, same API as
 * the web softphone.
 *
 * A separate package from `@dialstack/sdk` so the web SDK's dependency graph
 * stays free of anything React Native. Self-contained: it inlines its own
 * compiled copy of the shared headless core at build time, so it has no runtime
 * dependency on `@dialstack/sdk`.
 *
 * Bring your own WebRTC package (any build whose `registerGlobals()` installs
 * the standard surface) plus `react-native-incall-manager` / `react-native-svg`,
 * supply a `storage` adapter to `<SoftphoneProvider>`, and pass a WebRTC token.
 *
 * @example
 * ```tsx
 * import { Softphone, SoftphoneProvider } from '@dialstack/sdk-native';
 *
 * <SoftphoneProvider token={webrtcToken}>
 *   <Softphone />
 * </SoftphoneProvider>
 * ```
 */

export { nativeSignalingSocket } from './nativeSignalingSocket';
export {
  SoftphoneProvider,
  useSoftphone,
  useActiveCall,
  useIncomingCall,
} from './SoftphoneProvider';
export type {
  SoftphoneProviderProps,
  SoftphoneContextValue,
  ConnectionState,
} from './SoftphoneProvider';

export { Softphone } from './softphone/Softphone';
export type { SoftphoneProps } from './softphone/Softphone';
export { DialPad } from './softphone/DialPad';
export type { DialPadProps } from './softphone/DialPad';
export { IncomingCall } from './softphone/IncomingCall';
export { OngoingCall } from './softphone/OngoingCall';
export { EmergencyBanner } from './softphone/EmergencyBanner';

// The persistence adapter interface the host implements for the required
// `storage` prop.
export type { PlatformStorage, EmergencyAddressInput } from '@dialstack/sdk-react/core';

// The call surface, by name, so an integrator bridging to the OS call UI can
// write `(call: Call) => …` functions over it.
export type { Call, CallState, CallEndReason, UseCallActions } from '@dialstack/sdk-react/core';

// The OS call surface as a library-agnostic port. `@dialstack/sdk-native/testing`
// has the in-memory fake and the contract suite an adapter must pass.
export type {
  OsActiveSession,
  OsCallAdapter,
  OsCallEventName,
  OsCallEvents,
  OsEndReason,
  OsIncomingCall,
  OsOutgoingCall,
  OsSessionId,
} from './os/OsCallAdapter';

// The OS⇄SDK call bridge: the one subscriber to both sides. Works with no
// renderer, so a push-woken headless runtime starts it like the window.
export { NativeCallBridge, toOsEndReason } from './bridge/NativeCallBridge';
export type {
  AppLifecycle,
  AppLifecycleState,
  BridgeCall,
  BridgePhone,
  BridgePhoneError,
  NativeCallBridgeOptions,
} from './bridge/NativeCallBridge';
export { RuntimeHold } from './bridge/RuntimeHold';
export { createPhone, getPhone, requirePhone } from './bridge/createPhone';
export type { CreatePhoneOptions } from './bridge/createPhone';
export { appLifecycle, registerWakeTask, DEFAULT_WAKE_TASK } from './bridge/reactNative';
