import { DialStack } from '../index';

// Mock fetch globally
const mockFetch = jest.fn();
global.fetch = mockFetch;

describe('Ring Groups', () => {
  let dialstack: DialStack;
  const acct = { dialstackAccount: 'acct_test123' };

  beforeEach(() => {
    dialstack = new DialStack('sk_test_xxx');
    mockFetch.mockReset();
  });

  describe('ringGroups.create', () => {
    it('creates a ring group with required params', async () => {
      const mockResponse = {
        id: 'rg_123',
        name: 'Sales Team',
        timeout_seconds: 20,
        ignore_forwarding: false,
        members: [],
        created_at: '2024-01-01T00:00:00Z',
        updated_at: '2024-01-01T00:00:00Z',
      };
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => mockResponse,
        headers: new Headers({ 'x-request-id': 'req_123' }),
      });

      const result = await dialstack.ringGroups.create({ name: 'Sales Team' }, acct);

      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining('/v1/ring_groups'),
        expect.objectContaining({
          method: 'POST',
          headers: expect.objectContaining({
            'DialStack-Account': 'acct_test123',
          }),
        })
      );
      expect(result.name).toBe('Sales Team');
    });

    it('creates a ring group with all optional params', async () => {
      const mockResponse = {
        id: 'rg_123',
        name: 'Support Team',
        timeout_seconds: 45,
        ignore_forwarding: true,
        members: [],
        created_at: '2024-01-01T00:00:00Z',
        updated_at: '2024-01-01T00:00:00Z',
      };
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => mockResponse,
        headers: new Headers(),
      });

      const result = await dialstack.ringGroups.create(
        {
          name: 'Support Team',
          timeout_seconds: 45,
          ignore_forwarding: true,
        },
        acct
      );

      expect(result.timeout_seconds).toBe(45);
      expect(result.ignore_forwarding).toBe(true);
    });
  });

  describe('ringGroups.retrieve', () => {
    it('retrieves a ring group by ID', async () => {
      const mockResponse = {
        id: 'rg_123',
        name: 'Sales Team',
        members: [],
      };
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => mockResponse,
        headers: new Headers(),
      });

      const result = await dialstack.ringGroups.retrieve('rg_123', acct);

      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining('/v1/ring_groups/rg_123'),
        expect.objectContaining({ method: 'GET' })
      );
      expect(result.id).toBe('rg_123');
    });
  });

  describe('ringGroups.update', () => {
    it('updates ring group settings', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({ id: 'rg_123', timeout_seconds: 45 }),
        headers: new Headers(),
      });

      await dialstack.ringGroups.update('rg_123', { timeout_seconds: 45 }, acct);

      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining('/v1/ring_groups/rg_123'),
        expect.objectContaining({ method: 'POST' })
      );
    });
  });

  describe('ringGroups.del', () => {
    it('deletes a ring group', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 204,
        headers: new Headers(),
      });

      await dialstack.ringGroups.del('rg_123', acct);

      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining('/v1/ring_groups/rg_123'),
        expect.objectContaining({ method: 'DELETE' })
      );
    });
  });

  describe('ringGroups.list', () => {
    it('lists ring groups with pagination', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({
          object: 'list',
          url: '/v1/ring_groups',
          data: [],
          next_page_url: null,
          previous_page_url: null,
        }),
        headers: new Headers(),
      });

      await dialstack.ringGroups.list(undefined, acct);

      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining('/v1/ring_groups'),
        expect.objectContaining({ method: 'GET' })
      );
    });

    it('lists ring groups with limit parameter', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({
          object: 'list',
          url: '/v1/ring_groups',
          data: [],
          next_page_url: null,
          previous_page_url: null,
        }),
        headers: new Headers(),
      });

      await dialstack.ringGroups.list({ limit: 10 }, acct);

      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining('/v1/ring_groups?limit=10'),
        expect.objectContaining({ method: 'GET' })
      );
    });
  });

  describe('ringGroups.addMember', () => {
    it('adds extension member', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({
          id: 'rgm_123',
          ring_group_id: 'rg_123',
          extension: 'user_456',
          phone_number: null,
          created_at: '2024-01-01T00:00:00Z',
        }),
        headers: new Headers(),
      });

      const result = await dialstack.ringGroups.addMember(
        'rg_123',
        { extension: 'user_456' },
        acct
      );

      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining('/v1/ring_groups/rg_123/members'),
        expect.objectContaining({ method: 'POST' })
      );
      expect(result.extension).toBe('user_456');
    });

    it('adds phone number member', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({
          id: 'rgm_124',
          ring_group_id: 'rg_123',
          extension: null,
          phone_number: '+14155551234',
          created_at: '2024-01-01T00:00:00Z',
        }),
        headers: new Headers(),
      });

      const result = await dialstack.ringGroups.addMember(
        'rg_123',
        { phone_number: '+14155551234' },
        acct
      );

      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining('/v1/ring_groups/rg_123/members'),
        expect.objectContaining({ method: 'POST' })
      );
      expect(result.phone_number).toBe('+14155551234');
    });
  });

  describe('ringGroups.removeMember', () => {
    it('removes a member', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 204,
        headers: new Headers(),
      });

      await dialstack.ringGroups.removeMember('rg_123', 'rgm_456', acct);

      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining('/v1/ring_groups/rg_123/members/rgm_456'),
        expect.objectContaining({ method: 'DELETE' })
      );
    });
  });
});
