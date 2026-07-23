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

// The whole softphone feature — the SoftphoneProvider (owns the connection), the
// batteries-included <Softphone>, the composable pieces (DialPad / IncomingCall /
// OngoingCall), and the shared call-state hooks + view-model helpers. Its single
// front door is the softphone barrel; this forwards that surface verbatim.
export * from './react/softphone';

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
