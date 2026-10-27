import { act, renderHook, waitFor } from '@testing-library/react';
import type {
  DirectoryEntry,
  PhoneError,
  PresenceEntry,
  PresenceUpdate,
} from '@dialstack/sdk-webrtc';

import {
  useAccountDirectory,
  MAX_DIRECTORY_PRESENCE,
  type AccountDirectoryPhone,
} from '../useAccountDirectory';
import type { SoftphoneConnectionState } from '../usePhone';

const entry = (user: string, displayName: string, ext: string[] = []): DirectoryEntry => ({
  user,
  displayName,
  extensionNumbers: ext,
});

const presence = (
  userId: string,
  status: PresenceEntry['status'],
  doNotDisturb = false
): PresenceEntry => ({
  userId,
  name: userId,
  status,
  doNotDisturb,
  statusText: null,
  updatedAt: '2026-10-23T00:00:00Z',
});

function fakePhone(directory: DirectoryEntry[] | (() => Promise<DirectoryEntry[]>)) {
  const handlers = {
    presenceList: new Set<(l: PresenceEntry[]) => void>(),
    presenceUpdate: new Set<(u: PresenceUpdate) => void>(),
    error: new Set<(e: PhoneError) => void>(),
  };
  const phone = {
    listDirectory: jest.fn(typeof directory === 'function' ? directory : async () => directory),
    subscribePresence: jest.fn<void, [string[]]>(),
    on: jest.fn((event: keyof typeof handlers, h: never) => handlers[event].add(h)),
    off: jest.fn((event: keyof typeof handlers, h: never) => handlers[event].delete(h)),
  };
  return {
    phone: phone as unknown as AccountDirectoryPhone & typeof phone,
    listeners: () =>
      handlers.presenceList.size + handlers.presenceUpdate.size + handlers.error.size,
    error: (e: PhoneError) => act(() => handlers.error.forEach((h) => h(e))),
    snapshot: (l: PresenceEntry[]) => act(() => handlers.presenceList.forEach((h) => h(l))),
    update: (u: PresenceUpdate) => act(() => handlers.presenceUpdate.forEach((h) => h(u))),
  };
}

type Props = {
  phone: AccountDirectoryPhone | null;
  connection: SoftphoneConnectionState;
  enabled: boolean;
};
const render = (initialProps: Props) =>
  renderHook(
    ({ phone, connection, enabled }: Props) => useAccountDirectory(phone, connection, enabled),
    { initialProps }
  );

describe('useAccountDirectory', () => {
  const directory = [
    entry('user_a', 'Ana Diaz', ['1001', '1009']),
    entry('user_b', 'No Extension'),
    entry('user_c', 'Cy Ford', ['1003']),
  ];

  it('does nothing while disabled', async () => {
    const f = fakePhone(directory);
    const { result } = render({ phone: f.phone, connection: 'connected', enabled: false });
    await act(async () => {});
    expect(result.current).toEqual([]);
    expect(f.phone.listDirectory).not.toHaveBeenCalled();
  });

  it('waits for the connection before fetching', async () => {
    const f = fakePhone(directory);
    const { rerender } = render({ phone: f.phone, connection: 'connecting', enabled: true });
    await act(async () => {});
    expect(f.phone.listDirectory).not.toHaveBeenCalled();
    rerender({ phone: f.phone, connection: 'connected', enabled: true });
    await waitFor(() => expect(f.phone.listDirectory).toHaveBeenCalledTimes(1));
  });

  it('lists users with an extension and watches only them', async () => {
    const f = fakePhone(directory);
    const { result } = render({ phone: f.phone, connection: 'connected', enabled: true });
    await waitFor(() =>
      expect(result.current).toEqual([
        { id: 'user_a', label: 'Ana Diaz', destination: '1001' },
        { id: 'user_c', label: 'Cy Ford', destination: '1003' },
      ])
    );
    expect(f.phone.subscribePresence).toHaveBeenCalledWith(['user_a', 'user_c']);
  });

  it('applies the snapshot and then deltas, folding in Do Not Disturb', async () => {
    const f = fakePhone(directory);
    const { result } = render({ phone: f.phone, connection: 'connected', enabled: true });
    await waitFor(() => expect(f.phone.subscribePresence).toHaveBeenCalled());

    f.snapshot([presence('user_a', 'available'), presence('user_c', 'on_call')]);
    expect(result.current.map((c) => c.presence)).toEqual(['available', 'on_call']);

    f.update(presence('user_a', 'available', true));
    expect(result.current.map((c) => c.presence)).toEqual(['dnd', 'on_call']);
  });

  it('ignores presence for users it does not watch', async () => {
    const f = fakePhone(directory);
    const { result } = render({ phone: f.phone, connection: 'connected', enabled: true });
    await waitFor(() => expect(f.phone.subscribePresence).toHaveBeenCalled());
    f.snapshot([presence('user_b', 'available'), presence('user_z', 'available')]);
    expect(result.current.every((c) => c.presence === undefined)).toBe(true);
  });

  it(`watches at most ${MAX_DIRECTORY_PRESENCE} users and still lists the rest`, async () => {
    const big = Array.from({ length: MAX_DIRECTORY_PRESENCE + 5 }, (_, i) =>
      entry(`user_${i}`, `User ${i}`, [`${2000 + i}`])
    );
    const f = fakePhone(big);
    const { result } = render({ phone: f.phone, connection: 'connected', enabled: true });
    await waitFor(() => expect(result.current).toHaveLength(MAX_DIRECTORY_PRESENCE + 5));
    const watched = f.phone.subscribePresence.mock.calls[0][0];
    expect(watched).toHaveLength(MAX_DIRECTORY_PRESENCE);
    expect(watched[0]).toBe('user_0');
  });

  it('does not subscribe when no user has an extension', async () => {
    const f = fakePhone([entry('user_b', 'No Extension')]);
    render({ phone: f.phone, connection: 'connected', enabled: true });
    await waitFor(() => expect(f.phone.listDirectory).toHaveBeenCalled());
    await act(async () => {});
    expect(f.phone.subscribePresence).not.toHaveBeenCalled();
  });

  it('drops statuses on a reconnect, keeps the list, and resubscribes', async () => {
    const f = fakePhone(directory);
    const { result, rerender } = render({ phone: f.phone, connection: 'connected', enabled: true });
    await waitFor(() => expect(f.phone.subscribePresence).toHaveBeenCalledTimes(1));
    f.snapshot([presence('user_a', 'available')]);

    rerender({ phone: f.phone, connection: 'reconnecting', enabled: true });
    expect(result.current.map((c) => [c.id, c.presence])).toEqual([
      ['user_a', undefined],
      ['user_c', undefined],
    ]);

    rerender({ phone: f.phone, connection: 'connected', enabled: true });
    await waitFor(() => expect(f.phone.subscribePresence).toHaveBeenCalledTimes(2));
    f.snapshot([presence('user_a', 'away')]);
    expect(result.current[0].presence).toBe('away');
  });

  it('retries a presence subscribe that throws', async () => {
    jest.useFakeTimers();
    try {
      const f = fakePhone(directory);
      f.phone.subscribePresence.mockImplementationOnce(() => {
        throw new Error('transport_closed');
      });
      render({ phone: f.phone, connection: 'connected', enabled: true });
      await act(async () => {});
      expect(f.phone.subscribePresence).toHaveBeenCalledTimes(1);
      await act(async () => {
        jest.advanceTimersByTime(1000);
      });
      expect(f.phone.subscribePresence).toHaveBeenCalledTimes(2);
      await act(async () => {
        jest.advanceTimersByTime(10_000);
      });
      // It took on the retry, so no more.
      expect(f.phone.subscribePresence).toHaveBeenCalledTimes(2);
    } finally {
      jest.useRealTimers();
    }
  });

  it('gives up on presence after three retries', async () => {
    jest.useFakeTimers();
    try {
      const f = fakePhone(directory);
      f.phone.subscribePresence.mockImplementation(() => {
        throw new Error('transport_closed');
      });
      render({ phone: f.phone, connection: 'connected', enabled: true });
      await act(async () => {});
      await act(async () => {
        jest.advanceTimersByTime(60_000);
      });
      expect(f.phone.subscribePresence).toHaveBeenCalledTimes(4);
    } finally {
      jest.useRealTimers();
    }
  });

  it('stops retrying presence on unmount', async () => {
    jest.useFakeTimers();
    try {
      const f = fakePhone(directory);
      f.phone.subscribePresence.mockImplementation(() => {
        throw new Error('transport_closed');
      });
      const { unmount } = render({ phone: f.phone, connection: 'connected', enabled: true });
      await act(async () => {});
      unmount();
      jest.advanceTimersByTime(60_000);
      expect(f.phone.subscribePresence).toHaveBeenCalledTimes(1);
    } finally {
      jest.useRealTimers();
    }
  });

  it('resubscribes on presence_unavailable, and only on that code', async () => {
    jest.useFakeTimers();
    try {
      const f = fakePhone(directory);
      render({ phone: f.phone, connection: 'connected', enabled: true });
      await act(async () => {});
      f.error({ code: 'call_failed' } as PhoneError);
      await act(async () => {
        jest.advanceTimersByTime(10_000);
      });
      expect(f.phone.subscribePresence).toHaveBeenCalledTimes(1);
      f.error({ code: 'presence_unavailable' } as PhoneError);
      await act(async () => {
        jest.advanceTimersByTime(1000);
      });
      expect(f.phone.subscribePresence).toHaveBeenCalledTimes(2);
      expect(f.phone.subscribePresence).toHaveBeenLastCalledWith(['user_a', 'user_c']);
    } finally {
      jest.useRealTimers();
    }
  });

  it('keeps the previous list when a fetch fails', async () => {
    let fail = false;
    const f = fakePhone(async () => {
      if (fail) throw new Error('offline');
      return directory;
    });
    const { result, rerender } = render({ phone: f.phone, connection: 'connected', enabled: true });
    await waitFor(() => expect(result.current).toHaveLength(2));
    fail = true;
    rerender({ phone: f.phone, connection: 'reconnecting', enabled: true });
    rerender({ phone: f.phone, connection: 'connected', enabled: true });
    await waitFor(() => expect(f.phone.listDirectory).toHaveBeenCalledTimes(2));
    await act(async () => {});
    expect(result.current).toHaveLength(2);
  });

  it('resubscribes the users it keeps when a refetch fails', async () => {
    let fail = false;
    const f = fakePhone(async () => {
      if (fail) throw new Error('offline');
      return directory;
    });
    const { rerender } = render({ phone: f.phone, connection: 'connected', enabled: true });
    await waitFor(() => expect(f.phone.subscribePresence).toHaveBeenCalledTimes(1));
    fail = true;
    rerender({ phone: f.phone, connection: 'reconnecting', enabled: true });
    rerender({ phone: f.phone, connection: 'connected', enabled: true });
    await waitFor(() => expect(f.phone.subscribePresence).toHaveBeenCalledTimes(2));
    expect(f.phone.subscribePresence).toHaveBeenLastCalledWith(['user_a', 'user_c']);
  });

  it('discards a fetch that lands after the connection dropped', async () => {
    let finish: (l: DirectoryEntry[]) => void = () => {};
    const f = fakePhone(() => new Promise((r) => (finish = r)));
    const { result, rerender } = render({ phone: f.phone, connection: 'connected', enabled: true });
    await waitFor(() => expect(f.phone.listDirectory).toHaveBeenCalled());
    rerender({ phone: f.phone, connection: 'disconnected', enabled: true });
    await act(async () => finish(directory));
    expect(result.current).toEqual([]);
    expect(f.phone.subscribePresence).not.toHaveBeenCalled();
  });

  it('stops listening on unmount and when turned off', async () => {
    const f = fakePhone(directory);
    const { rerender, unmount, result } = render({
      phone: f.phone,
      connection: 'connected',
      enabled: true,
    });
    await waitFor(() => expect(f.phone.subscribePresence).toHaveBeenCalled());
    expect(f.listeners()).toBe(3);

    rerender({ phone: f.phone, connection: 'connected', enabled: false });
    expect(f.listeners()).toBe(0);
    expect(result.current).toEqual([]);

    rerender({ phone: f.phone, connection: 'connected', enabled: true });
    expect(f.listeners()).toBe(3);
    unmount();
    expect(f.listeners()).toBe(0);
  });

  it("forgets the last phone's users when the phone changes", async () => {
    const first = fakePhone(directory);
    const second = fakePhone(() => new Promise(() => {}));
    const { result, rerender } = render({
      phone: first.phone,
      connection: 'connected',
      enabled: true,
    });
    await waitFor(() => expect(result.current).toHaveLength(2));
    rerender({ phone: second.phone, connection: 'connected', enabled: true });
    expect(result.current).toEqual([]);
  });
});
