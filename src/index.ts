/**
 * DialStack SDK - Official JavaScript SDK for DialStack
 *
 * @packageDocumentation
 */

// Core exports
export { loadDialstackAndInitialize, initialize, getInstance } from './core/initialize';
export type {
  DialStackInitParams,
  DialStackInstance,
  ComponentTagName,
  AppearanceOptions,
  UpdateOptions,
} from './core/types';

// Web Components (for advanced usage)
export { BaseComponent } from './components/base-component';
export { CallLogsComponent } from './components/call-logs';
export { VoicemailsComponent } from './components/voicemails';
export type { DateRange } from './components/call-logs';

// React exports
export {
  DialstackComponentsProvider,
  useDialstackComponents,
} from './react/DialstackComponentsProvider';
export { useCreateComponent } from './react/useCreateComponent';
export { useUpdateWithSetter } from './react/useUpdateWithSetter';
export { CallLogs } from './react/CallLogs';
export { Voicemails } from './react/Voicemails';

export type { DialstackComponentsProviderProps } from './react/DialstackComponentsProvider';
export type { CallLogsProps } from './react/CallLogs';
export type { VoicemailsProps } from './react/Voicemails';
