import { DialStack } from '../index';
import type { User, UserPresence, UserPresenceItem } from '../index';

// Mock fetch globally
const mockFetch = jest.fn();
global.fetch = mockFetch;

describe('User do_not_disturb', () => {
  let dialstack: DialStack;
  const acct = { dialstackAccount: 'acct_test123' };

  beforeEach(() => {
    dialstack = new DialStack('sk_test_xxx');
    mockFetch.mockReset();
  });

  function mockJSON(body: unknown) {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => body,
      text: async () => JSON.stringify(body),
      headers: new Headers({ 'x-request-id': 'req_123' }),
    });
  }

  it('sends do_not_disturb in the update body, including an explicit false', async () => {
    mockJSON({ id: 'user_123', name: null, email: null, do_not_disturb: false });

    await dialstack.users.update('user_123', { do_not_disturb: false }, acct);

    const [, init] = mockFetch.mock.calls[0];
    expect(init.method).toBe('POST');
    // Guards against an omitempty-style drop of a falsey boolean.
    expect(JSON.parse(init.body)).toEqual({ do_not_disturb: false });
  });

  it('reads do_not_disturb off the user response', async () => {
    mockJSON({ id: 'user_123', name: null, email: null, do_not_disturb: true });

    const user: User = await dialstack.users.retrieve('user_123', acct);
    expect(user.do_not_disturb).toBe(true);
  });

  it('exposes do_not_disturb on singleton and bulk presence', async () => {
    mockJSON({ state: 'available', notifiable: false, do_not_disturb: true });
    const single: UserPresence = await dialstack.users.retrievePresence('user_123', acct);
    expect(single.do_not_disturb).toBe(true);

    mockJSON({
      object: 'list',
      url: '/v1/presence',
      data: [{ user: 'user_123', state: 'offline', notifiable: true, do_not_disturb: false }],
    });
    const list = await dialstack.presence.list({ users: ['user_123'] }, acct);
    const item: UserPresenceItem = list.data[0];
    expect(item.do_not_disturb).toBe(false);
  });
});
