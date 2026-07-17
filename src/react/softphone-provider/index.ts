/**
 * Shared, framework-agnostic softphone provider core — the wiring both the web
 * and React Native providers reuse. DOM/RN-free, reachable from the
 * `@dialstack/sdk/react/core` barrel.
 */

export {
  SoftphoneProviderBase,
  SoftphoneContext,
  useSoftphoneBase,
  selectIncomingCall,
} from './SoftphoneProviderBase';
export type {
  SoftphoneContextBase,
  SoftphoneCoreProps,
  SoftphoneProviderBaseProps,
  PlatformEffectState,
} from './SoftphoneProviderBase';
