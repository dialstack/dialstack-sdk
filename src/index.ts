/**
 * DialStack SDK - Official JavaScript SDK for DialStack
 *
 * @packageDocumentation
 */

// Core exports
export { loadDialstackAndInitialize } from './core/initialize';
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
  PhoneNumberStatus,
  PhoneNumberItem,
  PhoneNumbersClasses,
  // Account onboarding types
  AccountOnboardingStep,
  OnboardingCollectionOptions,
  AccountOnboardingClasses,
  // Custom render types
  VoicemailRowRenderer,
  CallLogRowRenderer,
} from './types';

// Default icons (can be used to customize or extend)
export { defaultIcons } from './components/base-component';

// Note: Web Components (BaseComponent, CallLogsComponent, VoicemailsComponent)
// are not exported from the main entry point to ensure SSR compatibility.
// They are registered automatically when the SDK is loaded in a browser.
// For advanced usage, import from '@dialstack/sdk/components'.

// React exports
export {
  DialstackComponentsProvider,
  useDialstackComponents,
  useDialstack,
} from './react/DialstackComponentsProvider';
export { useCreateComponent } from './react/useCreateComponent';
export { useUpdateWithSetter } from './react/useUpdateWithSetter';
export { CallLogs } from './react/CallLogs';
export { Voicemails } from './react/Voicemails';
export { CallHistory } from './react/CallHistory';
export { DialPlanViewer } from './react/DialPlanViewer';
export { PhoneNumberOrdering } from './react/PhoneNumberOrdering';
export { PhoneNumbers } from './react/PhoneNumbers';
export { AccountOnboarding } from './react/AccountOnboarding';

export type { DialstackComponentsProviderProps } from './react/DialstackComponentsProvider';
export type { CallLogsProps } from './react/CallLogs';
export type { VoicemailsProps } from './react/Voicemails';
export type { CallHistoryProps } from './react/CallHistory';
export type { PhoneNumberOrderingProps } from './react/PhoneNumberOrdering';
export type { PhoneNumbersProps } from './react/PhoneNumbers';
export type { AccountOnboardingProps } from './react/AccountOnboarding';
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

// Provisioning types
export type {
  DeviceSettings,
  AbstractSettings,
  DeviceStatus,
  ProvisionedDevice,
  CreateDeviceRequest,
  UpdateDeviceRequest,
  DeviceListOptions,
  ProvisioningEvent,
  ProvisioningEventListOptions,
} from './types';

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
} from './types';

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
} from './types';

// Type-only re-exports (safe for SSR)
export type { DateRange } from './components/call-logs';

// Note: Server SDK is exported from '@dialstack/sdk/server'
// Do not import server SDK in browser code
