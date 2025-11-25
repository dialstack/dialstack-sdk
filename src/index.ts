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

// Note: Web Components (BaseComponent, CallLogsComponent, VoicemailsComponent)
// are not exported from the main entry point to ensure SSR compatibility.
// They are registered automatically when the SDK is loaded in a browser.
// For advanced usage, import from '@dialstack/sdk/components'.

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

// Type-only re-exports (safe for SSR)
export type { DateRange } from './components/call-logs';

// Note: Server SDK is exported from '@dialstack/sdk/server'
// Do not import server SDK in browser code
