/**
 * DialStack SDK - Official JavaScript SDK for DialStack
 *
 * @packageDocumentation
 */

// Core exports
export { initialize, getInstance } from './core/initialize';
export { createInstance } from './core/instance';
export type {
  DialStackOptions,
  DialStackInstance,
  SessionOptions,
  Session,
} from './core/types';

// Web Components
export { BaseComponent } from './components/base-component';
export { CallLogsComponent } from './components/call-logs';
export { VoicemailsComponent } from './components/voicemails';

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
