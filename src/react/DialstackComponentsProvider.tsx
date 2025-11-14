/**
 * React Context Provider for DialStack Components
 */

import React, { createContext, useContext, ReactNode } from 'react';
import { DialStackInstance } from '../core/types';

interface DialstackComponentsContextValue {
  dialstack: DialStackInstance | null;
  clientSecret: string | null;
}

const DialstackComponentsContext = createContext<DialstackComponentsContextValue>({
  dialstack: null,
  clientSecret: null,
});

export interface DialstackComponentsProviderProps {
  dialstack: DialStackInstance;
  clientSecret: string;
  children: ReactNode;
}

/**
 * Provider component that makes DialStack instance and client secret available to child components
 */
export const DialstackComponentsProvider: React.FC<DialstackComponentsProviderProps> = ({
  dialstack,
  clientSecret,
  children,
}) => {
  const value: DialstackComponentsContextValue = {
    dialstack,
    clientSecret,
  };

  return (
    <DialstackComponentsContext.Provider value={value}>
      {children}
    </DialstackComponentsContext.Provider>
  );
};

/**
 * Hook to access the DialStack context
 */
export const useDialstackComponents = (): DialstackComponentsContextValue => {
  const context = useContext(DialstackComponentsContext);
  if (!context.dialstack) {
    throw new Error('useDialstackComponents must be used within a DialstackComponentsProvider');
  }
  return context;
};
