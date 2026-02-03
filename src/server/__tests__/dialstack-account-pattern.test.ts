import { DialStack } from '../index';

// Mock fetch globally
const mockFetch = jest.fn();
global.fetch = mockFetch;

/**
 * Tests verifying the dialstackAccount pattern for all account-scoped resources.
 *
 * The pattern is:
 *   resource.method(params, { dialstackAccount: 'acct_...' })
 *
 * This replaces the previous pattern of:
 *   resource.method('acct_...', params)
 */
describe('dialstackAccount Pattern', () => {
  let dialstack: DialStack;
  const acct = { dialstackAccount: 'acct_test123' };

  beforeEach(() => {
    dialstack = new DialStack('sk_test_xxx');
    mockFetch.mockReset();
  });

  const mockSuccessResponse = (data: unknown = {}) => ({
    ok: true,
    status: 200,
    json: async () => data,
    headers: new Headers(),
  });

  const mockDeleteResponse = () => ({
    ok: true,
    status: 204,
    headers: new Headers(),
  });

  const mockListResponse = () =>
    mockSuccessResponse({
      object: 'list',
      url: '/v1/test',
      data: [],
      next_page_url: null,
      previous_page_url: null,
    });

  const expectDialStackAccountHeader = () => {
    expect(mockFetch).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({
        headers: expect.objectContaining({
          'DialStack-Account': 'acct_test123',
        }),
      })
    );
  };

  describe('users', () => {
    it('create uses dialstackAccount option', async () => {
      mockFetch.mockResolvedValueOnce(mockSuccessResponse({ id: 'user_123' }));
      await dialstack.users.create({ name: 'Alice' }, acct);
      expectDialStackAccountHeader();
    });

    it('retrieve uses dialstackAccount option', async () => {
      mockFetch.mockResolvedValueOnce(mockSuccessResponse({ id: 'user_123' }));
      await dialstack.users.retrieve('user_123', acct);
      expectDialStackAccountHeader();
    });

    it('update uses dialstackAccount option', async () => {
      mockFetch.mockResolvedValueOnce(mockSuccessResponse({ id: 'user_123' }));
      await dialstack.users.update('user_123', { name: 'Bob' }, acct);
      expectDialStackAccountHeader();
    });

    it('del uses dialstackAccount option', async () => {
      mockFetch.mockResolvedValueOnce(mockDeleteResponse());
      await dialstack.users.del('user_123', acct);
      expectDialStackAccountHeader();
    });

    it('list uses dialstackAccount option', async () => {
      mockFetch.mockResolvedValueOnce(mockListResponse());
      await dialstack.users.list(undefined, acct);
      expectDialStackAccountHeader();
    });
  });

  describe('phoneNumbers', () => {
    it('list uses dialstackAccount option', async () => {
      mockFetch.mockResolvedValueOnce(mockListResponse());
      await dialstack.phoneNumbers.list(undefined, acct);
      expectDialStackAccountHeader();
    });
  });

  describe('calls', () => {
    it('update uses dialstackAccount option', async () => {
      mockFetch.mockResolvedValueOnce(mockSuccessResponse());
      await dialstack.calls.update('call_123', { actions: [] }, acct);
      expectDialStackAccountHeader();
    });

    it('retrieveTranscript does not require dialstackAccount', async () => {
      mockFetch.mockResolvedValueOnce(
        mockSuccessResponse({ call_id: 'call_123', status: 'completed', text: 'Hello' })
      );
      // Should work without account context
      await dialstack.calls.retrieveTranscript('call_123');
      expect(mockFetch).toHaveBeenCalled();
    });
  });

  describe('voiceApps', () => {
    it('create uses dialstackAccount option', async () => {
      mockFetch.mockResolvedValueOnce(mockSuccessResponse({ id: 'va_123' }));
      await dialstack.voiceApps.create({ name: 'Test App', url: 'https://example.com' }, acct);
      expectDialStackAccountHeader();
    });

    it('retrieve uses dialstackAccount option', async () => {
      mockFetch.mockResolvedValueOnce(mockSuccessResponse({ id: 'va_123' }));
      await dialstack.voiceApps.retrieve('va_123', acct);
      expectDialStackAccountHeader();
    });

    it('update uses dialstackAccount option', async () => {
      mockFetch.mockResolvedValueOnce(mockSuccessResponse({ id: 'va_123' }));
      await dialstack.voiceApps.update('va_123', { name: 'Updated App' }, acct);
      expectDialStackAccountHeader();
    });

    it('del uses dialstackAccount option', async () => {
      mockFetch.mockResolvedValueOnce(mockDeleteResponse());
      await dialstack.voiceApps.del('va_123', acct);
      expectDialStackAccountHeader();
    });

    it('list uses dialstackAccount option', async () => {
      mockFetch.mockResolvedValueOnce(mockListResponse());
      await dialstack.voiceApps.list(undefined, acct);
      expectDialStackAccountHeader();
    });
  });

  describe('schedules', () => {
    it('create uses dialstackAccount option', async () => {
      mockFetch.mockResolvedValueOnce(mockSuccessResponse({ id: 'sched_123' }));
      await dialstack.schedules.create({ name: 'Business Hours', ranges: [] }, acct);
      expectDialStackAccountHeader();
    });

    it('retrieve uses dialstackAccount option', async () => {
      mockFetch.mockResolvedValueOnce(mockSuccessResponse({ id: 'sched_123' }));
      await dialstack.schedules.retrieve('sched_123', acct);
      expectDialStackAccountHeader();
    });

    it('list uses dialstackAccount option', async () => {
      mockFetch.mockResolvedValueOnce(mockListResponse());
      await dialstack.schedules.list(undefined, acct);
      expectDialStackAccountHeader();
    });
  });

  describe('dialPlans', () => {
    it('create uses dialstackAccount option', async () => {
      mockFetch.mockResolvedValueOnce(mockSuccessResponse({ id: 'dp_123' }));
      await dialstack.dialPlans.create({ name: 'Main', entry_node: 'node1', nodes: [] }, acct);
      expectDialStackAccountHeader();
    });

    it('retrieve uses dialstackAccount option', async () => {
      mockFetch.mockResolvedValueOnce(mockSuccessResponse({ id: 'dp_123' }));
      await dialstack.dialPlans.retrieve('dp_123', acct);
      expectDialStackAccountHeader();
    });

    it('list uses dialstackAccount option', async () => {
      mockFetch.mockResolvedValueOnce(mockListResponse());
      await dialstack.dialPlans.list(undefined, acct);
      expectDialStackAccountHeader();
    });
  });

  describe('extensions', () => {
    it('create uses dialstackAccount option', async () => {
      mockFetch.mockResolvedValueOnce(mockSuccessResponse({ number: '1001' }));
      await dialstack.extensions.create({ number: '1001', target: 'user_123' }, acct);
      expectDialStackAccountHeader();
    });

    it('retrieve uses dialstackAccount option', async () => {
      mockFetch.mockResolvedValueOnce(mockSuccessResponse({ number: '1001' }));
      await dialstack.extensions.retrieve('1001', acct);
      expectDialStackAccountHeader();
    });

    it('update uses dialstackAccount option', async () => {
      mockFetch.mockResolvedValueOnce(mockSuccessResponse({ number: '1001' }));
      await dialstack.extensions.update('1001', { target: 'user_456' }, acct);
      expectDialStackAccountHeader();
    });

    it('del uses dialstackAccount option', async () => {
      mockFetch.mockResolvedValueOnce(mockDeleteResponse());
      await dialstack.extensions.del('1001', acct);
      expectDialStackAccountHeader();
    });

    it('list uses dialstackAccount option', async () => {
      mockFetch.mockResolvedValueOnce(mockListResponse());
      await dialstack.extensions.list(undefined, acct);
      expectDialStackAccountHeader();
    });
  });
});

describe('RequestOptions and Events', () => {
  let dialstack: DialStack;

  beforeEach(() => {
    dialstack = new DialStack('sk_test_xxx');
    mockFetch.mockReset();
  });

  it('emits request event with dialstackAccount', async () => {
    const events: unknown[] = [];
    dialstack.on('request', (event) => events.push(event));

    mockFetch.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => ({ id: 'user_123' }),
      headers: new Headers(),
    });

    await dialstack.users.create({ name: 'Alice' }, { dialstackAccount: 'acct_test123' });

    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({
      method: 'POST',
      path: '/v1/users',
      dialstackAccount: 'acct_test123',
    });
  });

  it('emits response event with dialstackAccount', async () => {
    const events: unknown[] = [];
    dialstack.on('response', (event) => events.push(event));

    mockFetch.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => ({ id: 'user_123' }),
      headers: new Headers({ 'x-request-id': 'req_abc' }),
    });

    await dialstack.users.create({ name: 'Alice' }, { dialstackAccount: 'acct_test123' });

    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({
      method: 'POST',
      path: '/v1/users',
      statusCode: 200,
      dialstackAccount: 'acct_test123',
    });
  });
});
