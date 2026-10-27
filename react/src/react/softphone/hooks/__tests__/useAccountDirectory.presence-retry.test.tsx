import { act, renderHook, waitFor } from '@testing-library/react';
import { DialStackPhone } from '@dialstack/sdk-webrtc';

import { useAccountDirectory } from '../useAccountDirectory';

// The real phone over a scripted socket: only the server is faked. Its first
// presence.subscribe answers the way the server does when one user's initial
// SUBSCRIBE fails (that user left out of the list, named in a non-fatal
// presence_unavailable); every later one answers for everyone.
class FakeServerSocket {
  static instances: FakeServerSocket[] = [];
  static OPEN = 1;
  readyState = FakeServerSocket.OPEN;
  sent: Array<{ type: string; req_id?: string; users?: string[] }> = [];
  failingSubscribes = 1;
  private handlers: Record<string, ((evt: unknown) => void)[]> = {};
  constructor() {
    FakeServerSocket.instances.push(this);
  }
  addEventListener(event: string, handler: (evt: unknown) => void): void {
    (this.handlers[event] ??= []).push(handler);
  }
  send(data: string): void {
    const msg = JSON.parse(data);
    this.sent.push(msg);
    if (msg.type === 'authenticate') {
      queueMicrotask(() => this.deliver({ type: 'authenticated', req_id: msg.req_id }));
    }
    if (msg.type === 'presence.subscribe') {
      const failing = this.failingSubscribes-- > 0;
      const users: string[] = failing ? msg.users.filter((u: string) => u !== 'user_b') : msg.users;
      queueMicrotask(() => {
        this.deliver({
          type: 'presence.list',
          req_id: msg.req_id,
          users: users.map((u) => ({
            user_id: u,
            name: u,
            status: 'available',
            updated_at: '2026-10-27T00:00:00Z',
          })),
        });
        if (failing) {
          this.deliver({
            type: 'error',
            code: 'presence_unavailable',
            message: 'presence unavailable for some users',
            fatal: false,
            context: { users: ['user_b'] },
          });
        }
      });
    }
  }
  close(): void {
    this.readyState = 3;
    this.fire('close', { code: 1000, reason: '' });
  }
  fire(event: string, evt: unknown): void {
    for (const h of this.handlers[event] ?? []) h(evt);
  }
  deliver(msg: unknown): void {
    this.fire('message', { data: JSON.stringify(msg) });
  }
  subscribes() {
    return this.sent.filter((m) => m.type === 'presence.subscribe');
  }
}

let originalWebSocket: unknown;
beforeEach(() => {
  FakeServerSocket.instances = [];
  const g = globalThis as Record<string, unknown>;
  originalWebSocket = g.WebSocket;
  g.WebSocket = FakeServerSocket;
});
afterEach(() => {
  (globalThis as Record<string, unknown>).WebSocket = originalWebSocket;
});

async function connectedPhone(failingSubscribes: number) {
  const phone = new DialStackPhone({ token: 'tok', iceServers: [], autoReconnect: false });
  phone.on('error', () => {});
  jest.spyOn(phone, 'listDirectory').mockResolvedValue([
    { user: 'user_a', displayName: 'Ana', extensionNumbers: ['1001'] },
    { user: 'user_b', displayName: 'Ben', extensionNumbers: ['1002'] },
  ]);
  const connecting = phone.connect();
  await waitFor(() => expect(FakeServerSocket.instances).toHaveLength(1));
  const ws = FakeServerSocket.instances[0]!;
  ws.failingSubscribes = failingSubscribes;
  ws.fire('open', {});
  await connecting;
  return { phone, ws };
}

const statusOf = (contacts: readonly { id: string; presence?: string }[], user: string) =>
  contacts.find((c) => c.id.includes(user))?.presence;

describe('useAccountDirectory against a real phone, server reporting presence_unavailable', () => {
  it('re-subscribes so the user the server could not watch gets a status', async () => {
    const { phone, ws } = await connectedPhone(1);
    const { result, unmount } = renderHook(() => useAccountDirectory(phone, 'connected', true));

    await waitFor(() => expect(statusOf(result.current, 'user_a')).toBe('available'));
    expect(statusOf(result.current, 'user_b')).toBeUndefined();

    await waitFor(() => expect(statusOf(result.current, 'user_b')).toBe('available'), {
      timeout: 3000,
    });
    expect(ws.subscribes()).toHaveLength(2);
    unmount();
    act(() => phone.disconnect());
  });

  it('gives up after its retries when the server keeps failing', async () => {
    const { phone, ws } = await connectedPhone(Infinity);
    const { result, unmount } = renderHook(() => useAccountDirectory(phone, 'connected', true));

    // 1 + 3 retries, 1 s, 2 s then 4 s apart.
    await waitFor(() => expect(ws.subscribes()).toHaveLength(4), { timeout: 9000 });
    await new Promise((r) => setTimeout(r, 1500));
    expect(ws.subscribes()).toHaveLength(4);
    expect(statusOf(result.current, 'user_b')).toBeUndefined();
    unmount();
    act(() => phone.disconnect());
  }, 15000);
});
