/**
 * Shared React plumbing: the provider every component needs, and the hooks that
 * read it.
 *
 * **Components are not exported here.** Each lives behind its own subpath —
 * `@dialstack/sdk-react/call-logs`, `/dial-plan`, `/softphone`, and so on — so a
 * consumer's import path itself excludes what they do not use. A root barrel
 * re-exporting everything makes the whole module graph reachable, which measured
 * at ~127 KB and pulled `@xyflow/react`, `dagre` and `cmdk` into an app that
 * rendered only a softphone. `sideEffects: false` cannot fix that (the code is
 * genuinely reachable, not dead) and neither can `preserveModules`; splitting the
 * entry point is the only lever.
 *
 * This module stays the single home of the components context, so every subpath
 * resolves one `createContext` and `<OnboardingPortal>` can see the provider the
 * app rendered.
 *
 * @packageDocumentation
 */

// Context & hooks
export {
  DialstackComponentsProvider,
  useDialstackComponents,
  useDialstack,
  // The context object itself, which every component subpath imports from here
  // rather than inlining. That is what makes one provider visible to all of them:
  // a second createContext call in another bundle would produce a context the
  // app's provider never filled, and the component would render blank with no
  // error. `providerAsPackageEntry` in the rollup config rewrites those imports to
  // this package's own name, so this export is what they land on — dropping it
  // breaks every subpath at bundle time.
  DialstackComponentsContext,
} from './react/DialstackComponentsProvider';
export { useCreateComponent } from './react/useCreateComponent';
export { useUpdateWithSetter } from './react/useUpdateWithSetter';
export { useAppearance } from './react/useAppearance';

export type { DialstackComponentsProviderProps } from './react/DialstackComponentsProvider';
