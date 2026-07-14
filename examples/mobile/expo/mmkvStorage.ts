/**
 * Reference `PlatformStorage` adapter backed by react-native-mmkv, for the Expo
 * example. The SDK takes no persistence dependency of its own, so the host
 * supplies one; this is the MMKV flavour (the bare example ships an AsyncStorage
 * one). Pass it to `<SoftphoneProvider storage={...} />`.
 *
 * MMKV is synchronous, which matches how the softphone core reads the persisted
 * E911 id (synchronously, at phone construction) — so unlike the AsyncStorage
 * adapter this needs no in-memory cache; it's a direct pass-through.
 *
 * Uses react-native-mmkv v4 (`createMMKV()`, `.remove()`), which is a Nitro
 * module and requires the New Architecture (enabled in this app's app.json) plus
 * `react-native-nitro-modules`. The SDK stays version-agnostic: it only needs
 * something implementing `PlatformStorage`, so a v2/v3 (`new MMKV()`, `.delete()`)
 * consumer would adjust this adapter, not the SDK.
 */
import { createMMKV } from 'react-native-mmkv';
import type { PlatformStorage } from '@dialstack/sdk-native';

const mmkv = createMMKV({ id: 'dialstack.softphone' });

export const mmkvStorage: PlatformStorage = {
  getItem(key) {
    return mmkv.getString(key) ?? null;
  },
  setItem(key, value) {
    mmkv.set(key, value);
  },
  removeItem(key) {
    mmkv.remove(key);
  },
};
