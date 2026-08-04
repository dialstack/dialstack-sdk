import { DialStack } from '../index';

// Mock fetch globally
const mockFetch = jest.fn();
global.fetch = mockFetch;

describe('List parameter encoding', () => {
  let dialstack: DialStack;
  const acct = { dialstackAccount: 'acct_test123' };

  beforeEach(() => {
    dialstack = new DialStack('sk_test_xxx');
    mockFetch.mockReset();
  });

  function mockEmptyList(url: string) {
    const body = {
      object: 'list',
      url,
      data: [],
      next_page_url: null,
      previous_page_url: null,
    };
    mockFetch.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => body,
      text: async () => JSON.stringify(body),
      headers: new Headers({ 'x-request-id': 'req_123' }),
    });
  }

  function requestedUrl(): string {
    return mockFetch.mock.calls[0][0];
  }

  describe('limit', () => {
    // The API rejects limit < 1 with a 400. Dropping a 0 instead of sending it
    // silently substitutes the default page size, which reads as success.
    it('sends an explicit limit=0 rather than dropping it', async () => {
      mockEmptyList('/v1/users');

      await dialstack.users.list({ limit: 0 }, acct);

      expect(requestedUrl()).toBe('https://api.dialstack.ai/v1/users?limit=0');
    });

    it('omits limit when it is not set', async () => {
      mockEmptyList('/v1/users');

      await dialstack.users.list({ search: 'ada' }, acct);

      expect(requestedUrl()).toBe('https://api.dialstack.ai/v1/users?search=ada');
    });

    it('applies to every list resource', async () => {
      mockEmptyList('/v1/queues');

      await dialstack.queues.list({ limit: 0 }, acct);

      expect(requestedUrl()).toBe('https://api.dialstack.ai/v1/queues?limit=0');
    });
  });

  describe('cursor pagination reaches every paginated list', () => {
    // Each of these emits next_page_url, so `page` must be expressible or the
    // caller is pinned to page 1 when paging manually.
    it('forwards page on calls.listListeners', async () => {
      mockEmptyList('/v1/calls/call_1/listeners');

      await dialstack.calls.listListeners('call_1', { limit: 5, page: 'cursor_x' }, acct);

      expect(requestedUrl()).toBe(
        'https://api.dialstack.ai/v1/calls/call_1/listeners?limit=5&page=cursor_x'
      );
    });

    it('forwards page on aiAgents.list', async () => {
      mockEmptyList('/v1/ai-agents');

      await dialstack.aiAgents.list({ page: 'cursor_x' }, acct);

      expect(requestedUrl()).toBe('https://api.dialstack.ai/v1/ai-agents?page=cursor_x');
    });

    it('forwards page on queues.listMembers', async () => {
      mockEmptyList('/v1/queues/qu_1/members');

      await dialstack.queues.listMembers('qu_1', { page: 'cursor_x' }, acct);

      expect(requestedUrl()).toBe('https://api.dialstack.ai/v1/queues/qu_1/members?page=cursor_x');
    });
  });

  describe('extensions.list pagination', () => {
    // The list returns page URLs whose cursor is the extension number, so
    // without a `page` parameter the returned list could never advance.
    it('forwards the page cursor', async () => {
      mockEmptyList('/v1/extensions');

      // An opaque token as the API emits it, not a bare extension number: `page`
      // is base64url-encoded JSON and a raw number would 400 against the real
      // endpoint.
      const cursor = 'eyJzdGFydGluZ19hZnRlciI6IjEwMSIsImxpbWl0IjoxMH0';
      await dialstack.extensions.list({ limit: 10, page: cursor, target: 'user_123' }, acct);

      expect(requestedUrl()).toBe(
        `https://api.dialstack.ai/v1/extensions?limit=10&page=${cursor}&target=user_123`
      );
    });

    it('sends a bare path with no params', async () => {
      mockEmptyList('/v1/extensions');

      await dialstack.extensions.list(undefined, acct);

      expect(requestedUrl()).toBe('https://api.dialstack.ai/v1/extensions');
    });
  });
});
