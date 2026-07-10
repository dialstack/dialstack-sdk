/**
 * DialStack SDK - React Entry Point
 *
 * All React components, hooks, and React-specific types.
 * Import from '@dialstack/sdk/react' to use these.
 *
 * @packageDocumentation
 */

// Context & hooks
export {
  DialstackComponentsProvider,
  useDialstackComponents,
  useDialstack,
} from './react/DialstackComponentsProvider';
export { useCreateComponent } from './react/useCreateComponent';
export { useUpdateWithSetter } from './react/useUpdateWithSetter';

// Components
export { CallLogs } from './react/CallLogs';
export { Voicemails } from './react/Voicemails';
export { CallHistory } from './react/CallHistory';
export { DialPlan } from './react/DialPlan';
export { PhoneNumberOrdering } from './react/PhoneNumberOrdering';
export { PhoneNumbers } from './react/PhoneNumbers';
export { AIAgent } from './react/AIAgent';

// Composable softphone: the SoftphoneProvider owns the connection; Softphone is
// the batteries-included UI; DialPad / IncomingCall / OngoingCall are the pieces
// for building a bespoke experience (render them inside a SoftphoneProvider and
// mount/unmount freely — the phone stays connected in the provider).
export {
  SoftphoneProvider,
  useSoftphone,
  useActiveCall,
  useIncomingCall,
} from './react/SoftphoneProvider';
export { Softphone } from './react/softphone/Softphone';
export { DialPad } from './react/softphone/DialPad';
export { IncomingCall } from './react/softphone/IncomingCall';
export { OngoingCall } from './react/softphone/OngoingCall';

// React prop types
export type { DialstackComponentsProviderProps } from './react/DialstackComponentsProvider';
export type { CallLogsProps } from './react/CallLogs';
export type { VoicemailsProps } from './react/Voicemails';
export type { CallHistoryProps } from './react/CallHistory';
export type { DialPlanProps } from './react/DialPlan';
export type { ListResourcesOptions, ResourceType } from './react/dial-plan/registry-types';
export type { PhoneNumberOrderingProps } from './react/PhoneNumberOrdering';
export type { PhoneNumbersProps } from './react/PhoneNumbers';
export type { AIAgentProps } from './react/AIAgent';
export type {
  SoftphoneProviderProps,
  SoftphoneContextValue,
  SoftphoneConnectionState,
} from './react/SoftphoneProvider';
export type { SoftphoneProps } from './react/softphone/Softphone';
export type { DialPadProps } from './react/softphone/DialPad';

// Shared softphone hooks + view-model — the platform-agnostic call-state layer the
// web Softphone and a React Native softphone both build on. Also exported from the
// dedicated, RN-safe entry '@dialstack/sdk/react/softphone'.
export {
  useCall,
  useCallActions,
  useCallDuration,
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
  UseCallActions,
  UseCallActionsOptions,
  SoftphoneScreen,
} from './react/softphone-hooks';
export { buildAIAgentPrefillFaq, shouldApplyPrefillFaq } from './components/ai-agent/prefill-faq';

// AI agent resource types — re-exported here so consumers using only the
// React entry point can type onSaved/onError handlers without reaching into
// the main entry.
export type {
  AIAgent as AIAgentData,
  AIAgentExtensionAvailabilityResult,
  AIAgentFormValues,
  AIAgentHostCreateResult,
  AIAgentHostSubmitPayload,
  FAQItem,
  UpdateAIAgentRequest,
} from './types/ai-agent';

// Onboarding components are in their own entry point: '@dialstack/sdk/react/onboarding'
// Import OnboardingPortal from there.

// DialPlan types
export type {
  DialPlan as DialPlanData,
  DialPlanNode,
  DialPlanNodeType,
  ScheduleNode,
  InternalDialNode,
  RingAllUsersNode,
  ExternalDialNode,
  ScheduleNodeConfig,
  InternalDialNodeConfig,
  RingAllUsersNodeConfig,
  ExternalDialNodeConfig,
  VoiceAppNodeData,
  DialPlanMode,
  DialPlanHandle,
} from './types/dial-plan';
