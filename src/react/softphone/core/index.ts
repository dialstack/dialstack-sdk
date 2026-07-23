/**
 * The headless, framework-agnostic React core the SDK's platform packages build
 * on (DOM/RN-free). Today it re-exports the softphone core; future shared cores
 * (e.g. a dialer core) re-export here too.
 *
 * This is an internal authoring home, not a public subpath. The web SDK bundles
 * it into `@dialstack/sdk/react`; `@dialstack/sdk-native` inlines its own compiled
 * copy at build time (see native/rollup.config.mjs). It is intentionally NOT
 * listed in `@dialstack/sdk`'s `exports`, so external consumers cannot import it.
 *
 * @packageDocumentation
 */

export * from './softphone-core';
