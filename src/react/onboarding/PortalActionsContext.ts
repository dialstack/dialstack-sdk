import { createContext, useContext } from 'react';

export interface PortalActions {
  onSaveAndExit: () => void;
}

export const PortalActionsContext = createContext<PortalActions | null>(null);

export function usePortalActions(): PortalActions {
  const ctx = useContext(PortalActionsContext);
  if (!ctx) {
    throw new Error('usePortalActions must be used inside the OnboardingPortal');
  }
  return ctx;
}
