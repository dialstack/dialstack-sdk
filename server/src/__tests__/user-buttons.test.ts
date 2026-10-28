import { DialStack, type User, type UserButtonOverride } from '../index.js';

const mockFetch = jest.fn();
global.fetch = mockFetch;

describe('User button layout', () => {
  let dialstack: DialStack;
  const acct = { dialstackAccount: 'acct_test123' };

  beforeEach(() => {
    dialstack = new DialStack('sk_test_xxx');
    mockFetch.mockReset();
  });

  function mockJSON(body: unknown, status = 200) {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      status,
      json: async () => body,
      text: async () => JSON.stringify(body),
      headers: new Headers({ 'x-request-id': 'req_123' }),
    });
  }

  function lastCall(): { url: string; method: string; body: unknown } {
    const [url, init] = mockFetch.mock.calls[0];
    return { url, method: init.method, body: init.body ? JSON.parse(init.body) : undefined };
  }

  it('binds and clears a user button template', async () => {
    mockJSON({ id: 'user_1', button_template: 'btpl_1' });
    const user: User = await dialstack.users.update('user_1', { button_template: 'btpl_1' }, acct);
    expect(user.button_template).toBe('btpl_1');
    expect(lastCall()).toMatchObject({
      url: 'https://api.dialstack.ai/v1/users/user_1',
      method: 'POST',
      body: { button_template: 'btpl_1' },
    });

    mockFetch.mockReset();
    mockJSON({ id: 'user_1', button_template: null });
    await dialstack.users.update('user_1', { button_template: null }, acct);
    expect(lastCall().body).toEqual({ button_template: null });
  });

  it('expands button_template on retrieve', async () => {
    mockJSON({ id: 'user_1', button_template: { id: 'btpl_1', name: 'Exec' } });
    await dialstack.users.retrieve('user_1', { ...acct, expand: ['button_template'] });
    expect(lastCall().url).toBe(
      'https://api.dialstack.ai/v1/users/user_1?expand%5B%5D=button_template'
    );
  });

  it('creates, lists and deletes user button overrides', async () => {
    const override: UserButtonOverride = {
      id: 'usrbtn_1',
      object: 'user_button_override',
      user: 'user_1',
      position: 2,
      suppressed: false,
      label: 'Lobby',
      type: 'speed_dial',
      target: { destination: '100' },
      created_at: '2026-10-26T00:00:00Z',
    };
    mockJSON(override, 201);
    await dialstack.users.createButtonOverride(
      'user_1',
      { position: 2, label: 'Lobby', type: 'speed_dial', target: { destination: '100' } },
      acct
    );
    expect(lastCall()).toMatchObject({
      url: 'https://api.dialstack.ai/v1/users/user_1/button_overrides',
      method: 'POST',
    });

    mockFetch.mockReset();
    mockJSON({
      object: 'list',
      url: '/v1/users/user_1/button_overrides',
      data: [override],
      next_page_url: null,
      previous_page_url: null,
    });
    const page = await dialstack.users.listButtonOverrides('user_1', { limit: 5 }, acct);
    expect(lastCall().url).toBe(
      'https://api.dialstack.ai/v1/users/user_1/button_overrides?limit=5'
    );
    expect(page.data[0].user).toBe('user_1');

    mockFetch.mockReset();
    mockFetch.mockResolvedValueOnce({
      ok: true,
      status: 204,
      json: async () => undefined,
      text: async () => '',
      headers: new Headers({ 'x-request-id': 'req_123' }),
    });
    await dialstack.users.delButtonOverride('user_1', 'usrbtn_1', acct);
    expect(lastCall()).toMatchObject({
      url: 'https://api.dialstack.ai/v1/users/user_1/button_overrides/usrbtn_1',
      method: 'DELETE',
    });
  });
});
