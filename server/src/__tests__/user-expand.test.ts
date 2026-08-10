import { DialStack, type User } from '../index.js';

// Mock fetch globally
const mockFetch = jest.fn();
global.fetch = mockFetch;

describe('User expand[] and search', () => {
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

  function mockEmptyList() {
    mockJSON({
      object: 'list',
      url: '/v1/users',
      data: [],
      next_page_url: null,
      previous_page_url: null,
    });
  }

  /** The URL the SDK actually requested. Asserted exactly — a `stringContaining`
   * check passes even when every parameter is dropped. */
  function requestedUrl(): string {
    return mockFetch.mock.calls[0][0];
  }

  describe('users.list', () => {
    it('forwards search and expand alongside pagination', async () => {
      mockEmptyList();

      await dialstack.users.list({ limit: 5, search: 'ada', expand: ['extensions'] }, acct);

      expect(requestedUrl()).toBe(
        'https://api.dialstack.ai/v1/users?limit=5&search=ada&expand%5B%5D=extensions'
      );
    });

    it('emits one expand[] pair per expansion rather than a joined value', async () => {
      mockEmptyList();

      // `extensions` is the only expansion users supports today; repeating it
      // proves the encoding that makes a future second value work.
      await dialstack.users.list({ expand: ['extensions', 'extensions'] }, acct);

      const query = new URL(requestedUrl()).searchParams;
      expect(query.getAll('expand[]')).toEqual(['extensions', 'extensions']);
    });

    it('omits expand[] entirely when not requested', async () => {
      mockEmptyList();

      await dialstack.users.list({ limit: 5, expand: [] }, acct);

      expect(requestedUrl()).toBe('https://api.dialstack.ai/v1/users?limit=5');
    });

    it('sends a bare path when given no params', async () => {
      mockEmptyList();

      await dialstack.users.list(undefined, acct);

      expect(requestedUrl()).toBe('https://api.dialstack.ai/v1/users');
    });
  });

  describe('users.retrieve', () => {
    it('forwards expand', async () => {
      mockJSON({ id: 'user_123', name: null, email: null, do_not_disturb: false });

      await dialstack.users.retrieve('user_123', { ...acct, expand: ['extensions'] });

      expect(requestedUrl()).toBe(
        'https://api.dialstack.ai/v1/users/user_123?expand%5B%5D=extensions'
      );
    });

    it('sends no query string when expand is omitted', async () => {
      mockJSON({ id: 'user_123', name: null, email: null, do_not_disturb: false });

      await dialstack.users.retrieve('user_123', acct);

      expect(requestedUrl()).toBe('https://api.dialstack.ai/v1/users/user_123');
    });
  });

  describe('expanded response shape', () => {
    it('exposes the extensions list envelope on the user', async () => {
      mockJSON({
        id: 'user_123',
        name: 'Ada',
        email: 'ada@example.com',
        do_not_disturb: false,
        created_at: '2025-01-01T00:00:00Z',
        updated_at: '2025-01-01T00:00:00Z',
        extensions: {
          object: 'list',
          url: '',
          next_page_url: null,
          previous_page_url: null,
          data: [
            {
              number: '101',
              target: 'user_123',
              status: 'active',
              created_at: '2025-01-01T00:00:00Z',
              updated_at: '2025-01-01T00:00:00Z',
            },
          ],
        },
      });

      const user: User = await dialstack.users.retrieve('user_123', {
        ...acct,
        expand: ['extensions'],
      });

      expect(user.extensions?.data[0].number).toBe('101');
      expect(user.extensions?.data[0].status).toBe('active');
    });

    it('leaves extensions undefined when not expanded', async () => {
      mockJSON({ id: 'user_123', name: null, email: null, do_not_disturb: false });

      const user: User = await dialstack.users.retrieve('user_123', acct);

      expect(user.extensions).toBeUndefined();
    });
  });
});
