// The Node client now lives at sdk/server/src. This barrel keeps the
// `@dialstack/sdk/server` subpath resolving to the same surface, and keeps the
// declaration emit landing at dist/server/index.d.ts, which the exports map
// names directly.
export * from '../../server/src/index';
