/**
 * DialStack SDK - Pure Entry Point (No Side Effects)
 *
 * This entry point does NOT auto-register Web Components.
 * Use this for:
 * - Server-side rendering (SSR)
 * - Testing environments
 * - When you want manual control over component registration
 *
 * For automatic component registration, use '@dialstack/sdk' instead.
 *
 * @packageDocumentation
 */

// Core exports (pure - no component auto-registration)
export {
  loadDialstackAndInitialize,
  initialize,
  getInstance,
  registerComponents,
} from './core/initialize-pure';

export type {
  DialStackInitParams,
  DialStackInstance,
  ComponentTagName,
  AppearanceOptions,
  UpdateOptions,
  ClientSecretResponse,
  // Callback types
  LoaderStart,
  LoadError,
  CommonComponentCallbacks,
  CallLogsCallbacks,
  VoicemailsCallbacks,
  CallLog,
  FormattingOptions,
  PaginationOptions,
  // Icon types
  IconString,
  ComponentIcons,
  // Layout types
  LayoutVariant,
  // Display options
  VoicemailDisplayOptions,
  VoicemailBehaviorOptions,
  CallLogDisplayOptions,
  // Custom render types
  VoicemailRowRenderer,
  CallLogRowRenderer,
} from './core/types';

// Default icons (can be used to customize or extend)
export { defaultIcons } from './components/base-component';

// React exports
export {
  DialstackComponentsProvider,
  useDialstackComponents,
} from './react/DialstackComponentsProvider';
export { useCreateComponent } from './react/useCreateComponent';
export { useUpdateWithSetter } from './react/useUpdateWithSetter';
export { CallLogs } from './react/CallLogs';
export { Voicemails } from './react/Voicemails';

// Advanced: Component factory for creating custom wrappers
export { createReactComponent } from './react/createReactComponent';
export type { BaseComponentProps, ReactComponentConfig } from './react/createReactComponent';

export type { DialstackComponentsProviderProps } from './react/DialstackComponentsProvider';
export type { CallLogsProps } from './react/CallLogs';
export type { VoicemailsProps } from './react/Voicemails';

// Type-only re-exports (safe for SSR)
export type { DateRange } from './components/call-logs';
