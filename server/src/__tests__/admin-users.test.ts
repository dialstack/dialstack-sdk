import { DialStack } from '../index';

// Mock fetch globally
const mockFetch = jest.fn();
global.fetch = mockFetch;

/**
 * Tests for the admin portal users resource.
 *
 * The assertions here are deliberately about the *emitted URL*, not just the
 * parsed response. A resource that quietly drops a parameter it was given
 * returns a perfectly valid response for the wrong request, so a test that only
 * checks the return value cannot tell the two apart — it reads to the caller as
 * "expand doesn't work".
 */
describe('admin.users', () => {
  let dialstack: DialStack;
  const acct = { dialstackAccount: 'acct_test123' };

  beforeEach(() => {
    dialstack = new DialStack('sk_test_xxx');
    mockFetch.mockReset();
  });

  const adminUser = {
    id: 'admin_user_01h2xcejqtf2nbrexx3vqjhp43',
    name: 'Jane Rosen',
    email: 'jane@example.com',
    role: 'account_admin' as const,
    user: 'user_01h2xcejqtf2nbrexx3vqjhp42',
    created_at: '2026-07-14T19:30:51Z',
  };

  const mockResponse = (data: unknown) => ({
    ok: true,
    status: 200,
    json: async () => data,
    text: async () => JSON.stringify(data),
    headers: new Headers(),
  });

  const mockListResponse = (data: unknown[] = [adminUser]) =>
    mockResponse({
      object: 'list',
      url: '/v1/admin/users',
      data,
      next_page_url: null,
      previous_page_url: null,
    });

  /** The URL string passed to fetch for the most recent call. */
  const requestedUrl = (): string => String(mockFetch.mock.calls[0][0]);

  describe('list', () => {
    it('requests the account-scoped collection', async () => {
      mockFetch.mockResolvedValueOnce(mockListResponse());

      await dialstack.admin.users.list(undefined, acct);

      expect(requestedUrl()).toContain('/v1/admin/users');
      expect(mockFetch.mock.calls[0][1].headers['DialStack-Account']).toBe('acct_test123');
    });

    it('sends no query string when given no params', async () => {
      mockFetch.mockResolvedValueOnce(mockListResponse());

      await dialstack.admin.users.list(undefined, acct);

      expect(requestedUrl()).not.toContain('?');
    });

    it('forwards limit and page', async () => {
      mockFetch.mockResolvedValueOnce(mockListResponse());

      await dialstack.admin.users.list({ limit: 25, page: 'cursor_abc' }, acct);

      const url = requestedUrl();
      expect(url).toContain('limit=25');
      expect(url).toContain('page=cursor_abc');
    });

    it('forwards expand as a repeated expand[] parameter', async () => {
      mockFetch.mockResolvedValueOnce(mockListResponse());

      await dialstack.admin.users.list({ expand: ['user'] }, acct);

      // The API reads repeated expand[] entries. A comma-joined single value is
      // silently ignored server-side, so assert the exact encoding.
      const query = new URL(requestedUrl(), 'https://example.test').searchParams;
      expect(query.getAll('expand[]')).toEqual(['user']);
    });

    it('emits one entry per expand value rather than joining them', async () => {
      mockFetch.mockResolvedValueOnce(mockListResponse());

      await dialstack.admin.users.list({ expand: ['user', 'other'] }, acct);

      const query = new URL(requestedUrl(), 'https://example.test').searchParams;
      expect(query.getAll('expand[]')).toEqual(['user', 'other']);
    });

    it('returns the admin users', async () => {
      mockFetch.mockResolvedValueOnce(mockListResponse());

      const result = await dialstack.admin.users.list(undefined, acct);

      expect(result.data).toHaveLength(1);
      expect(result.data[0].role).toBe('account_admin');
      expect(result.data[0].user).toBe('user_01h2xcejqtf2nbrexx3vqjhp42');
    });

    it('represents a seatless administrator with a null user', async () => {
      mockFetch.mockResolvedValueOnce(
        mockListResponse([{ ...adminUser, role: 'owner', user: null }])
      );

      const result = await dialstack.admin.users.list(undefined, acct);

      expect(result.data[0].user).toBeNull();
      expect(result.data[0].role).toBe('owner');
    });

    it('auto-paginates', async () => {
      mockFetch
        .mockResolvedValueOnce(
          mockResponse({
            object: 'list',
            url: '/v1/admin/users',
            data: [adminUser],
            next_page_url: '/v1/admin/users?page=next',
            previous_page_url: null,
          })
        )
        .mockResolvedValueOnce(mockListResponse([{ ...adminUser, id: 'admin_user_second' }]));

      const all = await dialstack.admin.users
        .list(undefined, acct)
        .autoPagingToArray({ limit: 10 });

      expect(all).toHaveLength(2);
    });
  });

  describe('retrieve', () => {
    it('requests the single admin user', async () => {
      mockFetch.mockResolvedValueOnce(mockResponse(adminUser));

      const result = await dialstack.admin.users.retrieve(adminUser.id, undefined, acct);

      expect(requestedUrl()).toContain(`/v1/admin/users/${adminUser.id}`);
      expect(requestedUrl()).not.toContain('?');
      expect(result.email).toBe('jane@example.com');
    });

    it('forwards expand on the single-resource path too', async () => {
      mockFetch.mockResolvedValueOnce(mockResponse(adminUser));

      await dialstack.admin.users.retrieve(adminUser.id, { expand: ['user'] }, acct);

      const query = new URL(requestedUrl(), 'https://example.test').searchParams;
      expect(query.getAll('expand[]')).toEqual(['user']);
    });

    it('inlines the user object when expanded', async () => {
      mockFetch.mockResolvedValueOnce(
        mockResponse({
          ...adminUser,
          user: { id: 'user_01h2xcejqtf2nbrexx3vqjhp42', name: 'Jane Rosen' },
        })
      );

      const result = await dialstack.admin.users.retrieve(adminUser.id, { expand: ['user'] }, acct);

      expect(typeof result.user).toBe('object');
      expect((result.user as { id: string }).id).toBe('user_01h2xcejqtf2nbrexx3vqjhp42');
    });
  });
});
