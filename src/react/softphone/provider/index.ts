/**
 * Shared, framework-agnostic softphone provider core — the wiring both the web
 * and React Native providers reuse. DOM/RN-free, re-exported through the internal
 * `src/react/softphone/core` barrel.
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
