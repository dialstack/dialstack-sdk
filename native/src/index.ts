/**
 * `@dialstack/sdk-native` — the React Native softphone components.
 *
 * A separate package from `@dialstack/sdk` on purpose: it carries the React
 * Native peer dependencies, so the web SDK's dependency graph stays structurally
 * free of anything React Native (a web app installing `@dialstack/sdk` can never
 * pull an RN library). It is self-contained — it inlines its own compiled copy
 * of the shared headless core + call-state hooks at build time (the core is
 * authored once in `@dialstack/sdk`'s source and shared at build time only), so
 * it has no runtime dependency on `@dialstack/sdk`.
 *
 * The mobile siblings of the web softphone, with the SAME API: a headless
 * SoftphoneProvider that owns the connection, a batteries-included <Softphone>,
 * and the composable pieces (<DialPad> / <IncomingCall> / <OngoingCall>) for
 * building a bespoke experience.
 *
 * Bring your own `react-native-webrtc` / `react-native-incall-manager` /
 * `react-native-svg` (peer deps), supply a `storage` adapter to
 * `<SoftphoneProvider>` (the SDK takes no persistence dependency — back it with
 * MMKV, AsyncStorage, or anything that implements `PlatformStorage`), and pass a
 * WebRTC token.
 *
 * @example
 * ```tsx
 * import { Softphone, SoftphoneProvider } from '@dialstack/sdk-native';
 *
 * // The provider owns the connection + token (the single entry point); the UI
 * // components are pure consumers under it and can mount/unmount freely.
 * <SoftphoneProvider token={webrtcToken}>
 *   <Softphone />                          // batteries-included UI
 *   // ...or build-your-own: {incoming ? <IncomingCall /> : <DialPad />}
 * </SoftphoneProvider>
 * ```
 */

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
// `storage` prop (an MMKV- or AsyncStorage-backed store; see the example apps).
export type { PlatformStorage, EmergencyAddressInput } from '@dialstack/sdk/react/core';
