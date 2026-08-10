/**
 * The side-effect-free twin of the main entry.
 *
 * Identical surface, except nothing is registered on import: you call
 * `registerComponents()` when you want the custom elements defined. Use this for
 * SSR, for tests, and anywhere a module-level `customElements.define` would run
 * too early or in the wrong realm.
 *
 * Neither this file nor its sources are listed in package.json's `sideEffects`
 * allowlist — being droppable is the point.
 *
 * @packageDocumentation
 */

export { loadDialstackAndInitialize, registerComponents } from './core/initialize-pure';

// The same shared base the main entry re-exports. Types, locales and pure
// helpers carry no side effects, so there is nothing to withhold here — the only
// difference between the two entries is component registration.
export * from './shared';

// Importing base-component pulls no `customElements.define` — that lives in the
// concrete component modules, which this entry deliberately does not touch.
export { defaultIcons } from './components/base-component';

export type {
  PortOrderStatus as SDKPortOrderStatus,
  PortOrderDetails as SDKPortOrderDetails,
  PortOrder as SDKPortOrder,
  CreatePortOrderRequest as SDKCreatePortOrderRequest,
} from './types';

export type { DateRange } from './components/call-logs';
