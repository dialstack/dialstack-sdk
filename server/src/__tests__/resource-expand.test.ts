import { DialStack } from '../index.js';

// Mock fetch globally
const mockFetch = jest.fn();
global.fetch = mockFetch;

/**
 * Every resource whose API surface supports `expand[]=extensions`. Asserted as
 * exact URLs — a `stringContaining` check passes even when the parameter is
 * silently dropped, which is how this gap went unnoticed.
 */
const RESOURCES = [
  { name: 'voiceApps', path: '/v1/voice-apps', id: 'va_123' },
  { name: 'dialPlans', path: '/v1/dialplans', id: 'dp_123' },
  { name: 'ringGroups', path: '/v1/ring_groups', id: 'rg_123' },
  { name: 'queues', path: '/v1/queues', id: 'qu_123' },
  { name: 'aiAgents', path: '/v1/ai-agents', id: 'agent_123' },
] as const;

describe('expand[]=extensions across resources', () => {
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

  function requestedUrl(): string {
    return mockFetch.mock.calls[0][0];
  }

  // The resource blocks are structurally identical, so index them dynamically
  // rather than repeating the same five-line test ten times.
  /* eslint-disable @typescript-eslint/no-explicit-any */
  function resource(name: string): any {
    return (dialstack as any)[name];
  }
  /* eslint-enable @typescript-eslint/no-explicit-any */

  describe.each(RESOURCES)('$name', ({ name, path, id }) => {
    it('forwards expand on list', async () => {
      mockJSON({
        object: 'list',
        url: path,
        data: [],
        next_page_url: null,
        previous_page_url: null,
      });

      await resource(name).list({ expand: ['extensions'] }, acct);

      expect(requestedUrl()).toBe(`https://api.dialstack.ai${path}?expand%5B%5D=extensions`);
    });

    it('forwards expand on retrieve', async () => {
      mockJSON({ id });

      await resource(name).retrieve(id, { ...acct, expand: ['extensions'] });

      expect(requestedUrl()).toBe(`https://api.dialstack.ai${path}/${id}?expand%5B%5D=extensions`);
    });

    it('omits expand[] when not requested', async () => {
      mockJSON({ id });

      await resource(name).retrieve(id, acct);

      expect(requestedUrl()).toBe(`https://api.dialstack.ai${path}/${id}`);
    });
  });

  it('keeps expand alongside the existing list filters', async () => {
    mockJSON({
      object: 'list',
      url: '/v1/ai-agents',
      data: [],
      next_page_url: null,
      previous_page_url: null,
    });

    // Deliberately paired with `limit` rather than `starting_after`: the cursor
    // params on this resource are dead (parseListParams reads only limit and
    // page), so asserting one here would read as coverage for a no-op.
    await dialstack.aiAgents.list({ limit: 3, expand: ['extensions'] }, acct);

    expect(requestedUrl()).toBe(
      'https://api.dialstack.ai/v1/ai-agents?limit=3&expand%5B%5D=extensions'
    );
  });

  it('types the expanded extensions envelope on the response', async () => {
    mockJSON({
      id: 'qu_123',
      name: 'Support',
      extensions: {
        object: 'list',
        url: '',
        next_page_url: null,
        previous_page_url: null,
        data: [
          {
            number: '200',
            target: 'qu_123',
            status: 'active',
            created_at: '2025-01-01T00:00:00Z',
            updated_at: '2025-01-01T00:00:00Z',
          },
        ],
      },
    });

    const queue = await dialstack.queues.retrieve('qu_123', {
      ...acct,
      expand: ['extensions'],
    });

    expect(queue.extensions?.data[0].number).toBe('200');
  });
});
