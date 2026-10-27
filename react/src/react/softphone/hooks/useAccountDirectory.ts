import { useEffect, useMemo, useRef, useState } from 'react';
import type {
  DialStackPhone,
  DirectoryEntry,
  PhoneError,
  PresenceEntry,
  PresenceStatus,
  PresenceUpdate,
} from '@dialstack/sdk-webrtc';
import {
  accountDirectoryContacts,
  effectivePresence,
  type DirectoryContact,
} from '../core/view-model';
import type { SoftphoneConnectionState } from './usePhone';

/**
 * The server's cap on one presence subscription, which sdk-webrtc's
 * subscribePresence also enforces (MAX_PRESENCE_TARGETS, not exported): keep
 * the two equal. Users past it are still listed, in directory order, just
 * without a status.
 */
export const MAX_DIRECTORY_PRESENCE = 100;

/**
 * Retries of a failed presence subscribe, 1 s, 2 s then 4 s apart. A throw and
 * a server presence_unavailable each get this many per connection.
 */
const SUBSCRIBE_RETRIES = 3;

export type AccountDirectoryPhone = Pick<
  DialStackPhone,
  'listDirectory' | 'subscribePresence' | 'on' | 'off'
>;

const NONE: readonly DirectoryContact[] = [];

/**
 * The other users in the signed-in user's account as directory contacts, with
 * live presence.
 *
 * Fetched, and presence subscribed, each time the phone (re)connects: a
 * subscription belongs to one signaling session and does not survive a
 * reconnect. While the phone is not connected the last list stays, without
 * statuses, since they would be stale. The phone has no way to end a
 * subscription early, so turning this off or unmounting only stops listening;
 * the server drops it with the session.
 *
 * A failed fetch keeps the previous list (empty at first): the directory is a
 * convenience, and typing a destination still works.
 */
export function useAccountDirectory(
  phone: AccountDirectoryPhone | null,
  connection: SoftphoneConnectionState,
  enabled: boolean
): readonly DirectoryContact[] {
  const [entries, setEntries] = useState<readonly DirectoryEntry[]>([]);
  const [presence, setPresence] = useState<Readonly<Record<string, PresenceStatus>>>({});
  const connected = connection === 'connected';
  const active = enabled && !!phone;

  // Who the last successful fetch watched, so a failed refetch can still
  // resubscribe the users it keeps listing.
  const lastWatched = useRef<string[]>([]);

  // A new phone may be a different user: never show the last one's account users.
  useEffect(
    () => () => {
      setEntries([]);
      lastWatched.current = [];
    },
    [phone]
  );

  useEffect(() => {
    if (!active || !phone) return;
    // A snapshot can also answer a subscription the host made itself, so only
    // statuses for users this hook watches are kept.
    let watched = new Set<string>();
    const apply = (list: readonly (PresenceEntry | PresenceUpdate)[]) => {
      const fresh = list.filter((p) => watched.has(p.userId));
      if (fresh.length === 0) return;
      setPresence((prev) => {
        const next = { ...prev };
        for (const p of fresh) next[p.userId] = effectivePresence(p.status, p.doNotDisturb);
        return next;
      });
    };
    const onList = (list: PresenceEntry[]) => apply(list);
    const onUpdate = (update: PresenceUpdate) => apply([update]);
    phone.on('presenceList', onList);
    phone.on('presenceUpdate', onUpdate);

    let cancelled = false;
    let retry: ReturnType<typeof setTimeout> | undefined;
    // A throw here (the socket dropped between the fetch and this) would
    // otherwise leave every user without a status for the whole session:
    // a reconnect React never sees as a state change doesn't re-run the effect.
    const subscribe = (users: string[], attempt: number) => {
      if (cancelled) return;
      try {
        phone.subscribePresence(users);
      } catch {
        if (attempt >= SUBSCRIBE_RETRIES) return;
        retry = setTimeout(() => subscribe(users, attempt + 1), 1000 * 2 ** attempt);
      }
    };
    // The server leaves out a user whose SUBSCRIBE failed, names them in a
    // presence_unavailable, and only retries when the client subscribes again.
    // The error doesn't say who, and resubscribing an already watched user is a
    // no-op on the server, so the whole set is sent again.
    let unavailableRetries = 0;
    const onError = (e: PhoneError) => {
      if (e.code !== 'presence_unavailable' || watched.size === 0) return;
      if (unavailableRetries >= SUBSCRIBE_RETRIES) return;
      clearTimeout(retry);
      const users = [...watched];
      retry = setTimeout(() => subscribe(users, 0), 1000 * 2 ** unavailableRetries++);
    };
    phone.on('error', onError);
    if (connected) {
      phone
        .listDirectory()
        .then((list) => {
          if (cancelled) return;
          setEntries(list);
          const users = list
            .filter((e) => e.extensionNumbers.length > 0)
            .slice(0, MAX_DIRECTORY_PRESENCE)
            .map((e) => e.user);
          watched = new Set(users);
          lastWatched.current = users;
          if (users.length > 0) subscribe(users, 0);
        })
        .catch(() => {
          // Keep the previous list (see the hook's doc), and its statuses: this
          // session's subscription is new, so without it they'd stay blank.
          if (cancelled || lastWatched.current.length === 0) return;
          watched = new Set(lastWatched.current);
          subscribe(lastWatched.current, 0);
        });
    }
    return () => {
      cancelled = true;
      clearTimeout(retry);
      phone.off('presenceList', onList);
      phone.off('presenceUpdate', onUpdate);
      phone.off('error', onError);
      // Stale once the session it came from is gone.
      setPresence({});
    };
  }, [phone, active, connected]);

  return useMemo(
    () => (active ? accountDirectoryContacts(entries, presence) : NONE),
    [active, entries, presence]
  );
}
