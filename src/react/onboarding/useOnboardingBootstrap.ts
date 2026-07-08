/**
 * Shared bootstrap hook for the onboarding portal.
 *
 * Fetches account, users, extensions, locations, DIDs, and devices, derives
 * per-substep completion from that data, and hydrates the OnboardingProgressStore.
 *
 * No DB writes happen here — onboarding completion is computed live; the store
 * is an ephemeral projection.
 */

import { useState, useEffect, useMemo, useCallback, useRef, useLayoutEffect } from 'react';
import { useDialstackComponents } from '@dialstack/sdk/react';
import { OnboardingProgressStore } from './progress-store';
import { deriveOnboardingState } from './derive';
import type { Account, OnboardingUser, OnboardingLocation, Tos } from '../../types';
import type { Extension } from '../../types/dial-plan';
import type { DIDItem } from '../../types/phone-numbers';
import type { Device } from '../../types/device';

export interface OnboardingBootstrapResult {
  progressStore: OnboardingProgressStore;
  sharedData: {
    account: Account | null;
    tos: Tos | null;
    /** True when the agreement fetch failed — the gate must fail closed. */
    tosLoadFailed: boolean;
    users: OnboardingUser[];
    extensions: Extension[];
    locations: OnboardingLocation[];
    dids: DIDItem[];
    devices: Device[];
  };
  reloadSharedData: () => Promise<void>;
  storeHydrated: boolean;
}

export function useOnboardingBootstrap(
  onError?: (err: unknown) => void
): OnboardingBootstrapResult {
  const { dialstack } = useDialstackComponents();

  // Ref keeps the bootstrap effect off the onError identity. Without this, an
  // integrator passing an inline callback would change onError identity on
  // every render and re-fire the fetch effect in a loop.
  const onErrorRef = useRef(onError);
  useLayoutEffect(() => {
    onErrorRef.current = onError;
  });

  const progressStore = useMemo(
    () => new OnboardingProgressStore(),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [] // intentionally stable — one store per mount
  );

  const [sharedData, setSharedData] = useState<{
    account: Account | null;
    tos: Tos | null;
    tosLoadFailed: boolean;
    users: OnboardingUser[];
    extensions: Extension[];
    locations: OnboardingLocation[];
    dids: DIDItem[];
    devices: Device[];
  }>({
    account: null,
    tos: null,
    tosLoadFailed: false,
    users: [],
    extensions: [],
    locations: [],
    dids: [],
    devices: [],
  });
  const [storeHydrated, setStoreHydrated] = useState(false);

  const fetchSnapshot = useCallback(async () => {
    const [account, tosResult, users, extensions, locations, dids, deskphones, dectBases] =
      await Promise.all([
        dialstack.account.retrieve(),
        // The subscription-agreement gate keys off this. A fetch failure must NOT
        // silently drop the gate (it's a compliance gate — failing open is unsafe),
        // so we capture the failure distinctly rather than coercing to null, and
        // it must not abort the rest of bootstrap.
        dialstack.account.tos
          .retrieve({ expand: ['pricing'] })
          .then((tos) => ({ tos, failed: false }))
          .catch(() => ({ tos: null, failed: true })),
        dialstack.users.list(),
        dialstack.extensions.list(),
        dialstack.locations.list(),
        dialstack.fetchAllPages<DIDItem>((opts) => dialstack.phoneNumbers.list(opts)),
        dialstack.devices
          .list({ type: 'deskphone', expand: ['users'] })
          .catch(() => [] as Device[]),
        dialstack.devices.list({ type: 'dect_base' }).catch(() => [] as Device[]),
      ]);
    const tos = tosResult.tos;
    const tosLoadFailed = tosResult.failed;
    // The hardware-step derive marks device-assignment complete when a device
    // has a user assignment. Deskphone assignments come eager-loaded via
    // expand[]=users above; DECT handsets are separate devices, so fetch each
    // handset's assignments (handset IDs are device IDs).
    await Promise.all(
      dectBases.map(async (base) => {
        const handsets = await dialstack.dectBases.handsets.list(base.id).catch(() => []);
        await Promise.all(
          handsets.map(async (h) => {
            h.assignments = await dialstack.devices.users.list(h.id).catch(() => []);
          })
        );
        base.handsets = handsets;
      })
    );
    const devices = [...deskphones, ...dectBases];
    return { account, tos, tosLoadFailed, users, extensions, locations, dids, devices };
  }, [dialstack]);

  useEffect(() => {
    let cancelled = false;
    fetchSnapshot()
      .then((data) => {
        if (cancelled) return;
        setSharedData(data);
        const { completed } = deriveOnboardingState(data);
        progressStore.hydrateFromDerived(completed);
        setStoreHydrated(true);
      })
      .catch((err) => {
        if (!cancelled) {
          onErrorRef.current?.(err);
          setStoreHydrated(true);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [fetchSnapshot, progressStore]);

  const reloadSharedData = useCallback(async () => {
    const data = await fetchSnapshot();
    setSharedData(data);
    const { completed } = deriveOnboardingState(data);
    progressStore.hydrateFromDerived(completed);
  }, [fetchSnapshot, progressStore]);

  return { progressStore, sharedData, reloadSharedData, storeHydrated };
}
