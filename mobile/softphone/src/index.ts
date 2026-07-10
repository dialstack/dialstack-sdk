/**
 * @dialstack/mobile-softphone — the React Native softphone components.
 *
 * The mobile siblings of the web softphone, with the SAME API: a headless
 * SoftphoneProvider that owns the connection, a batteries-included <Softphone>,
 * and the composable pieces (<DialPad> / <IncomingCall> / <OngoingCall>) for
 * building a bespoke experience. Built on the SDK's shared headless core +
 * call-state hooks (`@dialstack/sdk/react/softphone`).
 *
 * Bring your own `react-native-webrtc` / `react-native-incall-manager` (peer
 * deps) and pass a WebRTC token.
 *
 * @example
 * ```tsx
 * // Batteries-included
 * <Softphone token={webrtcToken} />
 *
 * // Build-your-own: the phone stays connected while the UI mounts/unmounts
 * <SoftphoneProvider token={webrtcToken}>
 *   {incoming ? <IncomingCall /> : <DialPad />}
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
