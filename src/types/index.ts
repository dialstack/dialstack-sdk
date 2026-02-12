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
  CallHistoryClasses,
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
  CallHistoryDisplayOptions,
  // Behavior options
  VoicemailBehaviorOptions,
  // Row renderers
  VoicemailRowRenderer,
  CallLogRowRenderer,
  // Data models
  CallLog,
  QualityMetricLeg,
  TranscriptStatus,
  Transcript,
  VoicemailTranscript,
  // Configuration
  PaginationOptions,
  FormattingOptions,
  ComponentConfig,
  // Element interfaces
  BaseComponentElement,
  VoicemailsElement,
  CallLogsElement,
  CallHistoryElement,
  ComponentTagName,
  ComponentElement,
} from './components';

// Phone number ordering types
export type {
  SearchAvailableNumbersOptions,
  AvailablePhoneNumber,
  NumberOrder,
  PhoneNumberOrderingClasses,
  PhoneNumberOrderingElement,
} from './phone-number-ordering';

// Core SDK types
export type {
  ClientSecretResponse,
  DialStackInitParams,
  DialStackInstance,
  SessionData,
  DialStackInstanceImpl,
} from './core';

// Dial plan types
export type {
  ScheduleNodeConfig,
  InternalDialNodeConfig,
  DialPlanNodeType,
  ScheduleNode,
  InternalDialNode,
  DialPlanNode,
  DialPlan,
  DialPlanViewerProps,
  GraphNodeType,
  StartNodeData,
  ScheduleNodeData,
  InternalDialNodeData,
  GraphNodeData,
  ScheduleExitType,
  InternalDialExitType,
  // Extension types
  ExtensionStatus,
  Extension,
  ExtensionListResponse,
} from './dial-plan';

// Provisioning configuration types
export type {
  // Line key types
  LineKeyType,
  LineKey,
  // Audio types
  JitterBufferMode,
  JitterBuffer,
  AudioSettings,
  // Display types
  TimeFormat,
  DateFormat,
  BacklightLevel,
  DisplaySettings,
  // Regional types
  RegionalSettings,
  // Network types
  NetworkSettings,
  // Feature types
  FeatureSettings,
  // Top-level types
  AbstractSettings,
  DeviceSettings,
} from './provisioning';

// Device types
export type {
  DeviceStatus,
  DeviceLine,
  ProvisionedDevice,
  CreateDeviceRequest,
  UpdateDeviceRequest,
  DeviceListOptions,
  ProvisioningEvent,
  ProvisioningEventListOptions,
} from './device';

// DECT types
export type {
  MulticellRole,
  DECTBase,
  HandsetStatus,
  DECTHandset,
  DECTExtension,
  CreateDECTBaseRequest,
  UpdateDECTBaseRequest,
  CreateDECTHandsetRequest,
  UpdateDECTHandsetRequest,
  CreateDECTExtensionRequest,
} from './dect';
