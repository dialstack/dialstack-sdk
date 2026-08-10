/**
 * DialStack browser SDK — initialization, the REST client and the web components.
 *
 * Importing this module **registers the custom elements**: the initializer below
 * pulls each component for its `customElements.define` side effect. That is why
 * `sideEffects` in package.json is an allowlist naming this file rather than
 * `false` — a blanket `false` lets a bundler drop every registration, and the
 * failure is silent (`document.createElement` returns an inert element that
 * renders nothing). Use `./pure` when you want to register them yourself.
 *
 * @packageDocumentation
 */

// Core exports
export { loadDialstackAndInitialize } from './core/initialize';

// Everything the shared base provides — types, locales, constants, the REST
// client, the device-readiness derivation. `export *` rather than a hand-listed
// set: shared.ts is internal to this package, so its surface and this one's are
// the same thing, and the old hand-listed form silently dropped names that
// @dialstack/sdk-react re-exports.
export * from './shared';

// Default icons, so consumers can extend rather than replace them.
export { defaultIcons } from './components/base-component';

// Port-order types also published under `SDK`-prefixed aliases. The unprefixed
// names arrive via shared.ts; these aliases are kept because consumers import
// them alongside their own PortOrder types, where the bare names collide.
export type {
  PortOrderStatus as SDKPortOrderStatus,
  PortOrderDetails as SDKPortOrderDetails,
  PortOrder as SDKPortOrder,
  CreatePortOrderRequest as SDKCreatePortOrderRequest,
} from './types';

// Note: the web components themselves (BaseComponent, CallLogsComponent, …) are
// deliberately not exported — they register on import, and exporting the classes
// invites consumers to construct them outside the custom-elements lifecycle.
//
// React components live in @dialstack/sdk-react. Do not import them here.

// Type-only, and outside shared.ts because it belongs to a component module.
export type { DateRange } from './components/call-logs';
