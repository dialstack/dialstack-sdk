import { DialStack } from '../index';

const mockFetch = jest.fn();
global.fetch = mockFetch;

describe('AI Agents', () => {
  let dialstack: DialStack;
  const acct = { dialstackAccount: 'acct_test123' };

  beforeEach(() => {
    dialstack = new DialStack('sk_test_xxx');
    mockFetch.mockReset();
  });

  const mockAgent = {
    id: 'aia_01abc',
    name: 'VoiceAI Agent',
    voice_app_id: 'va_01abc',
    persona_name: 'Receptionist',
    greeting_name: 'Sample Practice',
    instructions: 'Be brief.',
    faq_responses: [],
    scheduling: null,
    created_at: '2024-01-01T00:00:00Z',
    updated_at: '2024-01-01T00:00:00Z',
  };

  describe('aiAgents.retrieve', () => {
    it('GETs the agent by ID with the account header', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => mockAgent,
        headers: new Headers(),
      });

      const result = await dialstack.aiAgents.retrieve('aia_01abc', acct);

      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining('/v1/ai-agents/aia_01abc'),
        expect.objectContaining({
          method: 'GET',
          headers: expect.objectContaining({ 'DialStack-Account': 'acct_test123' }),
        })
      );
      expect(result.id).toBe('aia_01abc');
    });
  });

  describe('aiAgents.update', () => {
    it('POSTs partial update payload', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({ ...mockAgent, instructions: 'Updated' }),
        headers: new Headers(),
      });

      const result = await dialstack.aiAgents.update(
        'aia_01abc',
        { instructions: 'Updated' },
        acct
      );

      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining('/v1/ai-agents/aia_01abc'),
        expect.objectContaining({
          method: 'POST',
          body: JSON.stringify({ instructions: 'Updated' }),
        })
      );
      expect(result.instructions).toBe('Updated');
    });
  });

  describe('aiAgents.list', () => {
    it('returns a paginated list and threads through limit', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({
          object: 'list',
          url: '/v1/ai-agents',
          next_page_url: null,
          previous_page_url: null,
          data: [mockAgent],
        }),
        headers: new Headers(),
      });

      const page = await dialstack.aiAgents.list({ limit: 1 }, acct);

      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining('/v1/ai-agents?limit=1'),
        expect.objectContaining({ method: 'GET' })
      );
      expect(page.data).toHaveLength(1);
      expect(page.data[0]?.id).toBe('aia_01abc');
    });
  });
});
