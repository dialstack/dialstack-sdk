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
export { loadDialstackAndInitialize, registerComponents } from './core/initialize-pure';

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
  // Real-time call events
  IncomingCallEvent,
  CallEventType,
  CallEventMap,
  CallEventHandler,
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
  // AI agent types
  AIAgent,
  AIAgentExtensionAvailabilityResult,
  AIAgentFormValues,
  AIAgentHostCreateResult,
  AIAgentHostSubmitPayload,
  FAQItem,
  SchedulingConfig,
  UpdateAIAgentRequest,
  // Programmable button types
  ButtonType,
  ButtonTarget,
  ButtonParams,
  ButtonCompatibilityReason,
  ButtonCompatibilityVerdict,
  ButtonCompatibilitySummary,
  ButtonTemplate,
  ButtonTemplateWithDetails,
  TemplateButton,
  DeviceButtonOverride,
  MaterializedButton,
  CreateButtonTemplateRequest,
  UpdateButtonTemplateRequest,
  CreateTemplateButtonRequest,
  CreateDeviceButtonOverrideRequest,
} from './types';

// Default icons (can be used to customize or extend)
export { defaultIcons } from './components/base-component';

// Type-only re-exports (safe for SSR)
export type { DateRange } from './components/call-logs';
