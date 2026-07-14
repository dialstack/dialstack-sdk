/**
 * Reference `PlatformStorage` adapter backed by AsyncStorage, for the bare
 * example. The SDK takes no persistence dependency of its own, so the host
 * supplies one; this is the AsyncStorage flavour (the Expo example ships an MMKV
 * one). Pass it to `<SoftphoneProvider storage={...} />`.
 *
 * AsyncStorage is asynchronous, but the softphone core reads the persisted E911
 * id *synchronously* when the phone is constructed. Bridge the two with a small
 * synchronous in-memory cache that hydrates from AsyncStorage at module load
 * (fire-and-forget) and writes through on every set. On a cold first launch the
 * value may not be hydrated in time for the very first synchronous read — which
 * is fine: the address id is normally also supplied via
 * `SoftphoneProvider.emergencyAddressId`, and persistence is a convenience for
 * subsequent launches.
 */
import AsyncStorage from '@react-native-async-storage/async-storage';
import type { PlatformStorage } from '@dialstack/sdk-native';

const NAMESPACE = 'dialstack.webrtc.';
const cache = new Map<string, string>();
// Keys written locally since load — async hydration must not stomp a value the
// app has already written if a set/remove lands before the multiGet resolves.
const dirtyKeys = new Set<string>();

void (async () => {
  try {
    const keys = await AsyncStorage.getAllKeys();
    const ours = keys.filter((k) => k.startsWith(NAMESPACE));
    if (ours.length === 0) return;
    for (const [key, value] of await AsyncStorage.multiGet(ours)) {
      if (value != null && !dirtyKeys.has(key)) cache.set(key, value);
    }
  } catch {
    // Best-effort hydration.
  }
})();

export const asyncStorageAdapter: PlatformStorage = {
  getItem(key) {
    return cache.get(key) ?? null;
  },
  setItem(key, value) {
    dirtyKeys.add(key);
    cache.set(key, value);
    void AsyncStorage.setItem(key, value).catch(() => undefined);
  },
  removeItem(key) {
    dirtyKeys.add(key);
    cache.delete(key);
    void AsyncStorage.removeItem(key).catch(() => undefined);
  },
};
