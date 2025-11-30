/**
 * DialStack SDK Type Definitions
 *
 * This module re-exports all types from organized domain files.
 * Import from here for convenience:
 *
 * @example
 * ```typescript
 * import type { AppearanceOptions, DialStackInstance, CallLog } from '@dialstack/sdk';
 * ```
 */

// Appearance and theming
export type {
  Theme,
  LayoutVariant,
  AppearanceVariables,
  AppearanceOptions,
  UpdateOptions,
  IconString,
  ComponentIcons,
  BaseComponentClasses,
  VoicemailsClasses,
  CallLogsClasses,
} from './appearance';

// Callbacks and events
export type {
  LoaderStart,
  LoadError,
  CommonComponentCallbacks,
  VoicemailsCallbacks,
  CallLogsCallbacks,
  // Real-time call events
  IncomingCallEvent,
  CallEventType,
  CallEventMap,
  CallEventHandler,
} from './callbacks';

// Component types
export type {
  // Display options
  VoicemailDisplayOptions,
  CallLogDisplayOptions,
  // Behavior options
  VoicemailBehaviorOptions,
  // Row renderers
  VoicemailRowRenderer,
  CallLogRowRenderer,
  // Data models
  CallLog,
  // Configuration
  PaginationOptions,
  FormattingOptions,
  ComponentConfig,
  // Element interfaces
  BaseComponentElement,
  VoicemailsElement,
  CallLogsElement,
  ComponentTagName,
  ComponentElement,
} from './components';

// Core SDK types
export type {
  ClientSecretResponse,
  DialStackInitParams,
  DialStackInstance,
  SessionData,
  DialStackInstanceImpl,
} from './core';
