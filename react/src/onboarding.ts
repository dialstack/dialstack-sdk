/**
 * `<OnboardingPortal>` — the account-onboarding wizard.
 *
 * Its own entry point, and the largest component family in the package (~17k
 * lines). Renders its own React rather than a custom element, but still needs an
 * initialized instance — it calls `phoneNumbers.list`, `phoneNumberOrders` and
 * `portOrders` — so wrap it in `<DialstackComponentsProvider>` from
 * `@dialstack/sdk-react`:
 *
 * ```tsx
 * import { DialstackComponentsProvider } from '@dialstack/sdk-react';
 * import { OnboardingPortal } from '@dialstack/sdk-react/onboarding';
 * ```
 *
 * The provider must resolve to the same module instance the app rendered, which is
 * why this bundle imports the context from the package root rather than inlining
 * it — see `providerAsPackageEntry` in the rollup config.
 *
 * @packageDocumentation
 */

export { OnboardingPortal } from './react/onboarding/OnboardingPortal';
export type { OnboardingPortalProps } from './react/onboarding/OnboardingPortal';
