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
export { DialPlanViewer } from './react/DialPlanViewer';
export { PhoneNumberOrdering } from './react/PhoneNumberOrdering';
export { PhoneNumbers } from './react/PhoneNumbers';

// React prop types
export type { DialstackComponentsProviderProps } from './react/DialstackComponentsProvider';
export type { CallLogsProps } from './react/CallLogs';
export type { VoicemailsProps } from './react/Voicemails';
export type { CallHistoryProps } from './react/CallHistory';
export type { PhoneNumberOrderingProps } from './react/PhoneNumberOrdering';
export type { PhoneNumbersProps } from './react/PhoneNumbers';

// Onboarding components are in their own entry point: '@dialstack/sdk/react/onboarding'
// Import OnboardingPortal from there.

// DialPlan types (used with DialPlanViewer)
export type {
  DialPlan,
  DialPlanNode,
  DialPlanNodeType,
  ScheduleNode,
  InternalDialNode,
  ScheduleNodeConfig,
  InternalDialNodeConfig,
  DialPlanViewerProps,
} from './types/dial-plan';
