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

// React prop types
export type { DialstackComponentsProviderProps } from './react/DialstackComponentsProvider';
export type { CallLogsProps } from './react/CallLogs';
export type { VoicemailsProps } from './react/Voicemails';
export type { CallHistoryProps } from './react/CallHistory';
export type { DialPlanProps, DialPlanMode } from './react/DialPlan';
export type { ResourceType } from './react/dial-plan/registry-types';
export type { PhoneNumberOrderingProps } from './react/PhoneNumberOrdering';
export type { PhoneNumbersProps } from './react/PhoneNumbers';

// Onboarding components are in their own entry point: '@dialstack/sdk/react/onboarding'
// Import OnboardingPortal from there.

// DialPlan types
export type {
  DialPlan as DialPlanData,
  DialPlanNode,
  DialPlanNodeType,
  ScheduleNode,
  InternalDialNode,
  ScheduleNodeConfig,
  InternalDialNodeConfig,
} from './types/dial-plan';
