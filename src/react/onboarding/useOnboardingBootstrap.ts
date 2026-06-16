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
import type { Account, OnboardingUser, OnboardingLocation } from '../../types';
import type { Extension } from '../../types/dial-plan';
import type { DIDItem } from '../../types/phone-numbers';
import type { Device } from '../../types/device';

export interface OnboardingBootstrapResult {
  progressStore: OnboardingProgressStore;
  sharedData: {
    account: Account | null;
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
    users: OnboardingUser[];
    extensions: Extension[];
    locations: OnboardingLocation[];
    dids: DIDItem[];
    devices: Device[];
  }>({ account: null, users: [], extensions: [], locations: [], dids: [], devices: [] });
  const [storeHydrated, setStoreHydrated] = useState(false);

  const fetchSnapshot = useCallback(async () => {
    const [account, users, extensions, locations, dids, deskphones, dectBases] = await Promise.all([
      dialstack.account.retrieve(),
      dialstack.users.list(),
      dialstack.extensions.list(),
      dialstack.locations.list(),
      dialstack.fetchAllPages<DIDItem>((opts) => dialstack.phoneNumbers.list(opts)),
      dialstack.devices.list({ type: 'deskphone' }).catch(() => [] as Device[]),
      dialstack.devices.list({ type: 'dect_base' }).catch(() => [] as Device[]),
    ]);
    // /v1/devices doesn't eager-load device_lines or DECT handsets/extensions,
    // but the hardware-step derive needs either (a) a deskphone with a line
    // or (b) a DECT extension on a handset to mark device-assignment complete.
    // Fetch both sub-resources in parallel so device-assignment completion
    // reflects deskphone lines and DECT extensions.
    await Promise.all([
      ...deskphones.map(async (dev) => {
        dev.lines = await dialstack.deskphones.lines.list(dev.id).catch(() => []);
      }),
      ...dectBases.map(async (base) => {
        const handsets = await dialstack.dectBases.handsets.list(base.id).catch(() => []);
        await Promise.all(
          handsets.map(async (h) => {
            h.extensions = await dialstack.dectBases.extensions.list(base.id, h.id).catch(() => []);
          })
        );
        base.handsets = handsets;
      }),
    ]);
    const devices = [...deskphones, ...dectBases];
    return { account, users, extensions, locations, dids, devices };
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
