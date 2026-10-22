/**
 * React Context Provider for DialStack Components
 */

import React, { createContext, useContext, type ReactNode } from 'react';
import type { DialStackInstance } from '@dialstack/sdk-js';
import { PACKAGE_VERSION } from './version';

interface DialstackComponentsContextValue {
  dialstack: DialStackInstance;
}

/**
 * The DialStack components context. Exported so components that can also run
 * standalone (e.g. the softphone, which needs only a WebRTC token) may read it
 * *optionally* via `useContext` — subscribing to live appearance updates when a
 * `<DialstackComponentsProvider>` is present, and falling back to their own
 * props when it is not. Components that always require the provider should use
 * `useDialstackComponents()` (which throws when absent) instead.
 */
const DialstackComponentsContext = createContext<DialstackComponentsContextValue | null>(null);
export { DialstackComponentsContext };

export interface DialstackComponentsProviderProps {
  /**
   * The DialStack instance from loadDialstackAndInitialize()
   */
  dialstack: DialStackInstance;

  /**
   * Child components to render
   */
  children: ReactNode;
}

/**
 * Provider component that makes DialStack instance available to child components
 *
 * @example
 * ```tsx
 * const dialstack = await loadDialstackAndInitialize({
 *   publishableKey: 'pk_test_...',
 *   fetchClientSecret: async () => {
 *     const res = await fetch('/api/dialstack/session');
 *     return (await res.json()).clientSecret;
 *   }
 * });
 *
 * <DialstackComponentsProvider dialstack={dialstack}>
 *   <CallLogs />
 *   <Voicemails />
 * </DialstackComponentsProvider>
 * ```
 */
export const DialstackComponentsProvider: React.FC<DialstackComponentsProviderProps> = ({
  dialstack,
  children,
}) => {
  // During render, not in an effect: children's effects run before their
  // parent's, so an effect here would let a child's first request go out
  // without the sdk-react token. Idempotent, so re-renders cost nothing. The
  // optional chaining tolerates integrators' test doubles of the instance and a
  // plain-JS integrator rendering this before the instance has loaded.
  dialstack?.registerClientPackage?.('sdk-react', PACKAGE_VERSION);

  const value: DialstackComponentsContextValue = {
    dialstack,
  };

  return (
    <DialstackComponentsContext.Provider value={value}>
      {children}
    </DialstackComponentsContext.Provider>
  );
};

/**
 * Hook to access the DialStack context
 *
 * @throws {Error} If used outside of DialstackComponentsProvider
 */
export const useDialstackComponents = (): DialstackComponentsContextValue => {
  const context = useContext(DialstackComponentsContext);
  if (!context) {
    throw new Error(
      'Could not find DialStack context; You need to wrap your app in a <DialstackComponentsProvider> provider. ' +
        'See https://docs.dialstack.ai/sdks/setup for setup instructions.'
    );
  }
  return context;
};

/**
 * Hook to access the DialStack instance directly
 *
 * @throws {Error} If used outside of DialstackComponentsProvider
 */
export const useDialstack = (): DialStackInstance => {
  const { dialstack } = useDialstackComponents();
  return dialstack;
};

/**
 * Report a React-only component (one that is not a web component, which
 * reports itself) in the `DialStack-Client` header. No-op outside a provider.
 * Runs during render, like the provider's own registration, so requests from
 * the component's children's mount effects already carry it.
 * @internal
 */
export function useReportComponent(name: string): void {
  useContext(DialstackComponentsContext)?.dialstack?.registerClientComponent?.('sdk-react', name);
}
