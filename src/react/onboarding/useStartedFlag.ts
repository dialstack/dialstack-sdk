import { useCallback, useSyncExternalStore } from 'react';

/**
 * Per-browser, per-account "splash dismissed" flag for the onboarding portal.
 *
 * When the user clicks "Get Started" on the splash, we record it locally so
 * the splash doesn't reappear on reload. Scoped to (browser × account); a new
 * browser or incognito session sees the splash again. This flag is purely a
 * UI convenience — the durable "is onboarding done" signal is
 * `account.onboarding_complete`, derived from real account data.
 */

const KEY_PREFIX = 'dialstack_onboarding_started_';
const VALUE = '1';

type Subscribers = Set<() => void>;

const subscribersByKey = new Map<string, Subscribers>();

function getSubscribers(key: string): Subscribers {
  let subs = subscribersByKey.get(key);
  if (!subs) {
    subs = new Set();
    subscribersByKey.set(key, subs);
  }
  return subs;
}

function notify(key: string) {
  getSubscribers(key).forEach((fn) => fn());
}

export function useStartedFlag(accountId: string | null | undefined): {
  started: boolean;
  setStarted: () => void;
} {
  const key = accountId ? `${KEY_PREFIX}${accountId}` : '';

  const subscribe = useCallback(
    (callback: () => void) => {
      if (!key) return () => {};
      const subs = getSubscribers(key);
      subs.add(callback);
      return () => {
        subs.delete(callback);
        if (subs.size === 0) subscribersByKey.delete(key);
      };
    },
    [key]
  );

  const getSnapshot = useCallback(() => {
    if (!key || typeof window === 'undefined') return null;
    return window.localStorage.getItem(key);
  }, [key]);

  const getServerSnapshot = useCallback(() => null, []);

  const value = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);

  const setStarted = useCallback(() => {
    if (!key || typeof window === 'undefined') return;
    window.localStorage.setItem(key, VALUE);
    notify(key);
  }, [key]);

  return { started: value === VALUE, setStarted };
}
