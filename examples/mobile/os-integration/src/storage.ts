import { createMMKV } from 'react-native-mmkv';
import type { PlatformStorage } from '@dialstack/sdk-native';

/**
 * MMKV rather than AsyncStorage because it is SYNCHRONOUS: `PlatformStorage` is
 * a synchronous interface, and a wake push can start this process with no UI, so
 * the wake path must read without an async warm-up (AsyncStorage's pre-hydration
 * read silently returned null).
 *
 * NOT encrypted — plain text on disk behind the app sandbox. Acceptable for the
 * E911 id, borderline for the session token (a short-lived `client_secret`, not
 * an `sk_live`); encrypting means bootstrapping a key from Keychain/Keystore.
 */
const store = createMMKV();

const SESSION_TOKEN_KEY = 'dialstack.sessionToken';

/**
 * The SDK's persistence adapter (stores only the E911 address id). `getItem`
 * returns `string | null` per `PlatformStorage`; MMKV returns `undefined` for a
 * missing key.
 */
export const storage: PlatformStorage = {
  getItem: (key) => store.getString(key) ?? null,
  setItem: (key, value) => {
    store.set(key, value);
  },
  removeItem: (key) => {
    store.remove(key);
  },
};

/**
 * Persist the session token. Must be on disk rather than in memory because a
 * wake push can start this process cold, with no UI and no login flow to run.
 */
export function setSessionToken(token: string): void {
  store.set(SESSION_TOKEN_KEY, token);
}

/** The persisted token, or null when nobody has logged in on this device. */
export function getSessionToken(): string | null {
  return store.getString(SESSION_TOKEN_KEY) ?? null;
}
