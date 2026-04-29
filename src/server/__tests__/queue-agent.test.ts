import { DialStack } from '../index';

const mockFetch = jest.fn();
global.fetch = mockFetch;

describe('users.queueAgent', () => {
  let dialstack: DialStack;
  const acct = { dialstackAccount: 'acct_test123' };

  beforeEach(() => {
    dialstack = new DialStack('sk_test_xxx');
    mockFetch.mockReset();
  });

  describe('users.updateQueueAgent', () => {
    const mockResponse = {
      user_id: 'user_abc',
      status: 'paused',
      paused_at: '2026-04-27T12:00:00Z',
      pause_reason: 'break',
      logged_in_at: '2026-04-27T11:00:00Z',
      in_call_since: null,
      updated_at: '2026-04-27T12:00:00Z',
    };

    it('POSTs to /v1/users/:user_id/queue-agent with the body', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => mockResponse,
        headers: new Headers(),
      });

      const result = await dialstack.users.updateQueueAgent(
        'user_abc',
        { status: 'paused', reason: 'break' },
        acct
      );

      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining('/v1/users/user_abc/queue-agent'),
        expect.objectContaining({
          method: 'POST',
          body: JSON.stringify({ status: 'paused', reason: 'break' }),
          headers: expect.objectContaining({
            'DialStack-Account': 'acct_test123',
          }),
        })
      );
      expect(result.status).toBe('paused');
      expect(result.pause_reason).toBe('break');
    });

    it('omits reason when only status is sent', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({
          ...mockResponse,
          status: 'available',
          pause_reason: null,
          paused_at: null,
        }),
        headers: new Headers(),
      });

      await dialstack.users.updateQueueAgent('user_abc', { status: 'available' }, acct);

      const [, init] = mockFetch.mock.calls[0];
      expect(init.body).toBe(JSON.stringify({ status: 'available' }));
    });

    it('handles logged_out transitions', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({
          user_id: 'user_abc',
          status: 'logged_out',
          updated_at: '2026-04-27T12:00:00Z',
        }),
        headers: new Headers(),
      });

      const result = await dialstack.users.updateQueueAgent(
        'user_abc',
        { status: 'logged_out' },
        acct
      );

      expect(result.status).toBe('logged_out');
      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining('/v1/users/user_abc/queue-agent'),
        expect.objectContaining({ method: 'POST' })
      );
    });
  });

  describe('users.retrieveQueueAgent', () => {
    it('GETs /v1/users/:user_id/queue-agent and returns the state', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({
          user_id: 'user_abc',
          status: 'paused',
          paused_at: '2026-04-27T12:00:00Z',
          pause_reason: 'break',
          logged_in_at: '2026-04-27T11:00:00Z',
          updated_at: '2026-04-27T12:00:00Z',
        }),
        headers: new Headers(),
      });

      const result = await dialstack.users.retrieveQueueAgent('user_abc', acct);

      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining('/v1/users/user_abc/queue-agent'),
        expect.objectContaining({
          method: 'GET',
          headers: expect.objectContaining({
            'DialStack-Account': 'acct_test123',
          }),
        })
      );
      expect(result.status).toBe('paused');
      expect(result.pause_reason).toBe('break');
    });
  });
});
