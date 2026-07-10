/**
 * React Context Provider for DialStack Components
 */

import React, { createContext, useContext } from 'react';
import type { ReactNode } from 'react';
import type { DialStackInstance } from '../types';

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
        'See https://docs.dialstack.ai/sdk/react for setup instructions.'
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
