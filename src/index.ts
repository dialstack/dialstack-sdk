/**
 * DialStack SDK - Official JavaScript SDK for DialStack
 *
 * @packageDocumentation
 */

// Core exports
export { loadDialstackAndInitialize } from '../js/src/core/initialize';
export { ApiError } from '../js/src/core/instance';
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
  CallLogDID,
  QualityMetricLeg,
  Transcript,
  TranscriptStatus,
  VoicemailTranscript,
  Sentiment,
  SentimentLabel,
  ChannelSentiment,
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
  CallHistoryDisplayOptions,
  // CSS class types
  CallHistoryClasses,
  PhoneNumberOrderingClasses,
  // Phone number ordering types
  AvailablePhoneNumber,
  NumberOrder,
  // Phone numbers types
  PaginatedResponse,
  DIDItem,
  InboundRouting,
  DirectoryListingType,
  UpdatePhoneNumberRequest,
  SmsPortOutWindow,
  UpdateSmsPortOutRequest,
  PhoneNumberStatus,
  PhoneNumberItem,
  PhoneNumberRowSection,
  PhoneNumberRowClickEvent,
  PhoneNumbersClasses,
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
  UpdateTemplateButtonRequest,
  CreateDeviceButtonOverrideRequest,
  // AI agent types
  AIAgent,
  AIAgentExtensionAvailabilityResult,
  AIAgentFormValues,
  AIAgentHostCreateResult,
  AIAgentHostSubmitPayload,
  FAQItem,
  SchedulingConfig,
  UpdateAIAgentRequest,
  // Account onboarding types
  AccountOnboardingStep,
  OnboardingCollectionOptions,
  AccountOnboardingClasses,
  OnboardingPortalClasses,
  OnboardingUser,
  // Subscription-agreement (tos) types
  AccountPricing,
  TosAcceptance,
  Tos,
  // Custom render types
  VoicemailRowRenderer,
  CallLogRowRenderer,
} from '../js/src/types';

// Default icons (can be used to customize or extend)
export { defaultIcons } from '../js/src/components/base-component';

// Note: Web Components (BaseComponent, CallLogsComponent, VoicemailsComponent)
// are not exported from the main entry point to ensure SSR compatibility.
// They are registered automatically when the SDK is loaded in a browser.
// For advanced usage, import from '@dialstack/sdk/components'.

// Note: React components and hooks are exported from '@dialstack/sdk/react'
// Do not import React components from this entry point.

// Provisioning types
export type {
  DeviceSettings,
  AbstractSettings,
  DeviceType,
  Device,
  DeviceStatus,
  RegistrationStatus,
  DeviceLine,
  DeviceUserAssignment,
  ProvisionedDevice,
  CreateDeskphoneRequest,
  UpdateDeskphoneRequest,
  CreateDeskphoneLineRequest,
  UpdateDeskphoneLineRequest,
  CreateDeviceRequest,
  CreateDeviceResponse,
  UpdateDeviceRequest,
  DeviceListOptions,
  ProvisioningEvent,
  ProvisioningEventListOptions,
} from '../js/src/types';
export { isDeskphone, isDECTBase } from '../js/src/types';

// Device onboarding-readiness derivation (shared so all consumers agree)
export { deviceReadiness } from '../js/src/utils/device-readiness';
export type {
  DeviceReadiness,
  DeviceReadinessInput,
  DeviceReadinessPrerequisite,
  DeviceReadinessStep,
} from '../js/src/utils/device-readiness';

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
} from '../js/src/types';

// Number porting types
export type {
  ApprovePortOrderRequest,
  PortOrderStatus as SDKPortOrderStatus,
  PortOrderDetails as SDKPortOrderDetails,
  PortOrder as SDKPortOrder,
  CreatePortOrderRequest as SDKCreatePortOrderRequest,
  PortApproval,
  PortEligibilityResult,
  PortableNumber,
  NonPortableNumber,
} from '../js/src/types';

// Type-only re-exports (safe for SSR)
export type { DateRange } from '../js/src/components/call-logs';

// Note: Server SDK is exported from '@dialstack/sdk/server'
// Do not import server SDK in browser code
