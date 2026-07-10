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
  useCall,
  useCallActions,
  useCallDuration,
  useEmergencyBinding,
  isIncomingRinging,
  isCallActive,
  selectScreen,
  callPeerNumber,
  callPeerName,
  formatCallDuration,
  formatDisplayNumber,
  callStateLabelKey,
} from './react/softphone-hooks';
export type {
  UseCallOptions,
  UseCallResult,
  SoftphoneConnectionState,
  UseCallActions,
  UseCallActionsOptions,
  UseEmergencyBinding,
  UseEmergencyBindingDeps,
  SoftphoneScreen,
} from './react/softphone-hooks';
