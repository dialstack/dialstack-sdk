/**
 * The types, locales and constants the rest of the SDK is built on.
 *
 * Internal to this package — not a public subpath. It exists so the entry points
 * here and in `@dialstack/sdk-react` share one definition of each type: a
 * `CallLog` the server client returns is the same `CallLog` the React components
 * accept. Consumers reach these names through `.` or `./pure`.
 *
 * Side-effect-free by construction: no component registration, no network calls.
 * That is what lets `./pure` re-export it for SSR.
 *
 * @packageDocumentation
 */

export * from './types';
export { defaultLocale, en } from './locales';
export type { Locale } from './locales';

// The REST client, shared by the initializer here and the React components.
// `isApiError` rather than only the class: see its own docs — the error is thrown
// here and caught in @dialstack/sdk-react, so `instanceof` across that boundary
// is unreliable.
export { ApiError, isApiError, DialStackInstanceImplClass } from './core/instance';

// Device onboarding-readiness, a pure derivation over the shared device types.
// Exported so every consumer agrees on what "ready" means rather than each
// re-deriving it.
export { deviceReadiness } from './utils/device-readiness';
export type {
  DeviceReadinessInput,
  DeviceReadiness,
  DeviceReadinessStep,
  DeviceReadinessPrerequisite,
} from './utils/device-readiness';

// Bulk phone-number entry. Shared so the admin portal and the onboarding portal
// accept and reject exactly the same input — a number one surface takes and the
// other refuses is a number left off a port order.
export { formatOnBlur, formatWhileTyping } from './utils/phone-input-format';
export {
  classifyPhoneNumberRows,
  formatNationalUS,
  isPhoneNumberListReady,
  parsePhoneNumberRows,
  readyPhoneNumbers,
} from './utils/phone-list';
export type { NumberIssue, ParsedRow, ParseProblemReason, RowStatus } from './utils/phone-list';
