import { DialStack, type Tos } from '../index.js';

// Mock fetch globally
const mockFetch = jest.fn();
global.fetch = mockFetch;

describe('Account subscription agreement', () => {
  let dialstack: DialStack;

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

  function requestInit(): { method: string; body?: string; headers: Record<string, string> } {
    return mockFetch.mock.calls[0][1];
  }

  const agreement = {
    version: '2026-01-15',
    url: 'https://dialstack.ai/ssa',
    content: 'I agree, including the 911 acknowledgement.',
    body: '<p>Agreement</p>',
    acceptance: null,
  };

  describe('accounts.retrieveTos', () => {
    it('forwards expand', async () => {
      mockJSON(agreement);

      await dialstack.accounts.retrieveTos('acct_123', { expand: ['pricing'] });

      expect(requestedUrl()).toBe(
        'https://api.dialstack.ai/v1/accounts/acct_123/tos?expand%5B%5D=pricing'
      );
    });

    it('sends no query string when expand is omitted', async () => {
      mockJSON(agreement);

      await dialstack.accounts.retrieveTos('acct_123');

      expect(requestedUrl()).toBe('https://api.dialstack.ai/v1/accounts/acct_123/tos');
    });

    it('is platform-level — no account header', async () => {
      mockJSON(agreement);

      await dialstack.accounts.retrieveTos('acct_123');

      expect(requestInit().headers['DialStack-Account']).toBeUndefined();
    });

    it('exposes the expanded pricing and the acceptance record', async () => {
      mockJSON({
        ...agreement,
        acceptance: {
          accepted_at: '2026-01-16T10:00:00Z',
          ip: '203.0.113.7',
          user_agent: 'Mozilla/5.0',
          pricing: { per_user_rate: 1999, per_did_rate: 299, per_voiceai_location_rate: 4999 },
        },
        pricing: { per_user_rate: 1999, per_did_rate: 299, per_voiceai_location_rate: 4999 },
      });

      const tos: Tos = await dialstack.accounts.retrieveTos('acct_123', {
        expand: ['pricing'],
      });

      expect(tos.pricing?.per_user_rate).toBe(1999);
      // The snapshot on the acceptance is what makes consent provable later.
      expect(tos.acceptance?.pricing.per_did_rate).toBe(299);
      expect(tos.acceptance?.ip).toBe('203.0.113.7');
    });

    it('reports an unaccepted agreement as a null acceptance', async () => {
      mockJSON(agreement);

      const tos: Tos = await dialstack.accounts.retrieveTos('acct_123');

      expect(tos.acceptance).toBeNull();
    });
  });

  describe('accounts.acceptTos', () => {
    it('posts only the version', async () => {
      mockJSON({ ...agreement, acceptance: null });

      await dialstack.accounts.acceptTos('acct_123', { version: '2026-01-15' });

      expect(requestedUrl()).toBe('https://api.dialstack.ai/v1/accounts/acct_123/tos');
      expect(requestInit().method).toBe('POST');
      // Evidence is derived server-side from the request, never sent.
      expect(JSON.parse(requestInit().body as string)).toEqual({ version: '2026-01-15' });
    });
  });
});
