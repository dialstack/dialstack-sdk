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
  QualityMetricLeg,
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
  DirectoryListingType,
  UpdatePhoneNumberRequest,
  PhoneNumberStatus,
  PhoneNumberItem,
  PhoneNumbersClasses,
  // Account onboarding types
  AccountOnboardingStep,
  OnboardingCollectionOptions,
  AccountOnboardingClasses,
  OnboardingPortalClasses,
  OnboardingUser,
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

// Note: React components and hooks are exported from '@dialstack/sdk/react'
// Do not import React components from this entry point.

// Provisioning types
export type {
  DeviceSettings,
  AbstractSettings,
  DeviceType,
  Device,
  DeviceStatus,
  DeviceLine,
  ProvisionedDevice,
  CreateDeskphoneRequest,
  UpdateDeskphoneRequest,
  CreateDeskphoneLineRequest,
  UpdateDeskphoneLineRequest,
  DeviceListOptions,
  ProvisioningEvent,
  ProvisioningEventListOptions,
} from './types';
export { isDeskphone, isDECTBase } from './types';

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

// Timezone constants
export { US_TIMEZONES } from './constants/us-timezones';

// Note: Server SDK is exported from '@dialstack/sdk/server'
// Do not import server SDK in browser code
