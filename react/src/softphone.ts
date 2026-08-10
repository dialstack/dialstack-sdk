/**
 * The React softphone — provider, hooks and UI primitives.
 *
 * Its own entry point so an app embedding only the softphone does not pull the
 * dial-plan editor's `@xyflow/react` and `dagre` through a shared barrel. Measured:
 * ~58 KB with none of the three heavy dependencies, against ~144 KB and all three
 * when the same component was reached through a root barrel.
 *
 * This is the one component family needing **no initializer**. It authenticates
 * differently — a short-lived user-session token and a WebSocket, rather than the
 * instance's client secret over REST — so `<SoftphoneProvider token={…}>` works with
 * no `<DialstackComponentsProvider>` above it. Passing an instance is optional and
 * only lights up live appearance sync.
 *
 * Registration and in-call control must keep working when REST is down, so any
 * future REST-backed feature here stays additive rather than load-bearing.
 *
 * @packageDocumentation
 */

export * from './react/softphone';
