/**
 * Headless softphone core — the platform-agnostic React "brain" of the softphone:
 * the shared call-state hooks, provider base, view-model, and framework-agnostic
 * theme/icon/locale data used by BOTH the web `<Softphone>` and the React Native
 * softphone. NO DOM / web component graph (`@xyflow/react`, dagre, custom elements,
 * CSS), so it's safe to import from React Native where `@dialstack/sdk/react`
 * would not resolve.
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
} from '../softphone-hooks';
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
} from '../softphone-hooks';

// The shared provider core (DOM/RN-free). Platform providers build on this.
export {
  SoftphoneProviderBase,
  SoftphoneContext,
  useSoftphoneBase,
  selectIncomingCall,
} from '../softphone-provider';
export type {
  SoftphoneContextBase,
  SoftphoneCoreProps,
  SoftphoneProviderBaseProps,
  PlatformEffectState,
} from '../softphone-provider';

// The locale table + default, re-exported here so the React Native softphone can
// resolve UI strings through the same `t()` accessor as the web softphone (this
// RN-safe entry is the only SDK path RN imports from). Pure data — no DOM/RN dep.
export { defaultLocale } from '../../locales';
export type { Locale } from '../../locales';

// Shared, framework-agnostic theme tokens. This entry is the SINGLE gateway the
// React Native softphone imports from, so RN never deep-imports other subpaths.
export {
  resolveSoftphonePalette,
  softphoneDimensions,
  dialPadKeys,
} from '../../components/softphone-theme';
export type { SoftphonePalette } from '../../components/softphone-theme';

// Shared softphone glyph set (pure SVG path data — no DOM/RN).
export { softphoneGlyphs } from '../../components/softphone-icons';
export type { SoftphoneGlyph } from '../../components/softphone-icons';

// Shared emergency-address form helpers (pure — no DOM/RN).
export { normalizeStateCode } from '../../components/emergency-address-form';

// Headless WebRTC-core types the softphone UI needs. `PlatformStorage` and
// `EmergencyAddressInput` are also needed by the native provider/host adapters.
export type {
  Call,
  CallState,
  CallEndReason,
  EmergencyAddressInput,
  PlatformStorage,
} from '../../webrtc';
