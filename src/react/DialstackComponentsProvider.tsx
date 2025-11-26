/**
 * React Context Provider for DialStack Components
 */

import React, { createContext, useContext } from 'react';
import type { ReactNode } from 'react';
import type { DialStackInstance } from '../core/types';

interface DialstackComponentsContextValue {
  dialstack: DialStackInstance;
}

const DialstackComponentsContext = createContext<DialstackComponentsContextValue | null>(null);

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
