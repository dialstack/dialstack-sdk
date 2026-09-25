import { DialStack } from '../index.js';

const mockFetch = jest.fn();
global.fetch = mockFetch;

describe('queues.updateMember', () => {
  let dialstack: DialStack;
  const acct = { dialstackAccount: 'acct_test123' };

  beforeEach(() => {
    dialstack = new DialStack('sk_test_xxx');
    mockFetch.mockReset();
  });

  it('POSTs the position and penalty to the member path', async () => {
    const mockResponse = {
      id: 'qm_123',
      queue: 'qu_123',
      user: 'user_123',
      penalty: 2,
      position: 1,
      created_at: '2024-01-01T00:00:00Z',
    };
    mockFetch.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => mockResponse,
      text: async () => JSON.stringify(mockResponse),
      headers: new Headers({ 'x-request-id': 'req_123' }),
    });

    const result = await dialstack.queues.updateMember(
      'qu_123',
      'qm_123',
      { position: 1, penalty: 2 },
      acct
    );

    expect(mockFetch).toHaveBeenCalledWith(
      expect.stringContaining('/v1/queues/qu_123/members/qm_123'),
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({ position: 1, penalty: 2 }),
        headers: expect.objectContaining({ 'DialStack-Account': 'acct_test123' }),
      })
    );
    expect(result.position).toBe(1);
  });
});
