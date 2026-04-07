/**
 * Shared bootstrap hook for onboarding entry points.
 *
 * Creates an OnboardingProgressStore, fetches shared data (account, users,
 * extensions, locations), hydrates the store from the account config, and
 * provides a `reloadSharedData` callback.
 *
 * Used by OnboardingPortal for initialization.
 */

import { useState, useEffect, useMemo, useCallback } from 'react';
import { useDialstackComponents } from '@dialstack/sdk/react';
import { OnboardingProgressStore } from './progress-store';
import type { Account, OnboardingUser, OnboardingLocation } from '../../types';
import type { Extension } from '../../types/dial-plan';

export interface OnboardingBootstrapResult {
  progressStore: OnboardingProgressStore;
  sharedData: {
    account: Account | null;
    users: OnboardingUser[];
    extensions: Extension[];
    locations: OnboardingLocation[];
  };
  reloadSharedData: () => Promise<void>;
  storeHydrated: boolean;
}

export function useOnboardingBootstrap(
  onError?: (err: unknown) => void
): OnboardingBootstrapResult {
  const { dialstack } = useDialstackComponents();

  const progressStore = useMemo(
    () =>
      new OnboardingProgressStore((progress) => {
        dialstack.account
          .update({ config: { onboarding_progress: progress } })
          .catch((err) => console.warn('Failed to persist onboarding progress:', err));
      }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [] // intentionally stable — one store per mount
  );

  const [sharedData, setSharedData] = useState<{
    account: Account | null;
    users: OnboardingUser[];
    extensions: Extension[];
    locations: OnboardingLocation[];
  }>({ account: null, users: [], extensions: [], locations: [] });
  const [storeHydrated, setStoreHydrated] = useState(false);

  useEffect(() => {
    let cancelled = false;
    Promise.all([
      dialstack.account.retrieve(),
      dialstack.users.list(),
      dialstack.extensions.list(),
      dialstack.locations.list(),
    ])
      .then(([account, users, extensions, locations]) => {
        if (cancelled) return;
        setSharedData({ account, users, extensions, locations });
        if (account.config?.onboarding_progress) {
          progressStore.hydrate(account.config.onboarding_progress);
        }
        setStoreHydrated(true);
      })
      .catch((err) => {
        if (!cancelled) {
          onError?.(err);
          setStoreHydrated(true);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [dialstack, progressStore, onError]);

  const reloadSharedData = useCallback(async () => {
    const [account, users, extensions, locations] = await Promise.all([
      dialstack.account.retrieve(),
      dialstack.users.list(),
      dialstack.extensions.list(),
      dialstack.locations.list(),
    ]);
    setSharedData({ account, users, extensions, locations });
  }, [dialstack]);

  return { progressStore, sharedData, reloadSharedData, storeHydrated };
}
