import { DialStack, type DIDSummary, type Fax, type FileObject } from '../index.js';

// Mock fetch globally
const mockFetch = jest.fn();
global.fetch = mockFetch;

describe('Faxes', () => {
  let dialstack: DialStack;
  const acct = { dialstackAccount: 'acct_test123' };

  beforeEach(() => {
    dialstack = new DialStack('sk_test_xxx');
    mockFetch.mockReset();
  });

  function mockJSON(body: unknown, status = 200) {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      status,
      json: async () => body,
      text: async () => JSON.stringify(body),
      headers: new Headers({ 'x-request-id': 'req_123' }),
    });
  }

  function mockNoContent() {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      status: 204,
      json: async () => ({}),
      text: async () => '',
      headers: new Headers(),
    });
  }

  function mockEmptyList() {
    mockJSON({
      object: 'list',
      url: '/v1/faxes',
      data: [],
      next_page_url: null,
      previous_page_url: null,
    });
  }

  function requestedUrl(): string {
    return mockFetch.mock.calls[0][0];
  }

  function requestInit(): { method: string; body?: string } {
    return mockFetch.mock.calls[0][1];
  }

  describe('faxes.send', () => {
    it('posts the file, destination, and source did', async () => {
      mockJSON({ id: 'fax_123', status: 'pending' }, 201);

      const fax = await dialstack.faxes.send(
        { file: 'file_123', to: '+14155551234', did: 'did_123' },
        acct
      );

      expect(requestedUrl()).toBe('https://api.dialstack.ai/v1/faxes');
      expect(requestInit().method).toBe('POST');
      expect(JSON.parse(requestInit().body as string)).toEqual({
        file: 'file_123',
        to: '+14155551234',
        did: 'did_123',
      });
      expect(fax.status).toBe('pending');
    });
  });

  describe('faxes.list', () => {
    it('forwards every documented filter and both expansions', async () => {
      mockEmptyList();

      await dialstack.faxes.list(
        {
          limit: 20,
          direction: 'inbound',
          status: 'received',
          did: 'did_123',
          number: '4155551234',
          is_read: false,
          expand: ['file', 'did'],
        },
        acct
      );

      const query = new URL(requestedUrl()).searchParams;
      expect(query.getAll('expand[]')).toEqual(['file', 'did']);
      expect(query.get('direction')).toBe('inbound');
      expect(query.get('status')).toBe('received');
      expect(query.get('did')).toBe('did_123');
      expect(query.get('number')).toBe('4155551234');
      expect(query.get('is_read')).toBe('false');
      expect(query.get('limit')).toBe('20');
    });

    it('sends a bare path with no params', async () => {
      mockEmptyList();

      await dialstack.faxes.list(undefined, acct);

      expect(requestedUrl()).toBe('https://api.dialstack.ai/v1/faxes');
    });
  });

  describe('faxes.retrieve', () => {
    it('forwards expand', async () => {
      mockJSON({ id: 'fax_123' });

      await dialstack.faxes.retrieve('fax_123', { ...acct, expand: ['file'] });

      expect(requestedUrl()).toBe('https://api.dialstack.ai/v1/faxes/fax_123?expand%5B%5D=file');
    });

    it('narrows the expanded file and did to objects', async () => {
      mockJSON({
        id: 'fax_123',
        direction: 'inbound',
        status: 'received',
        file: {
          object: 'file',
          id: 'file_123',
          purpose: 'fax_source',
          filename: 'invoice.pdf',
          type: 'pdf',
          mime_type: 'application/pdf',
          size: 51234,
          url: 'https://files.example.com/invoice.pdf?Signature=abc',
          created_at: '2026-01-01T00:00:00Z',
          updated_at: '2026-01-01T00:00:00Z',
        },
        did: { id: 'did_123', phone_number: '+14155559876' },
      });

      const fax: Fax = await dialstack.faxes.retrieve('fax_123', {
        ...acct,
        expand: ['file', 'did'],
      });

      expect((fax.file as FileObject).url).toContain('invoice.pdf');
      expect((fax.did as DIDSummary).phone_number).toBe('+14155559876');
    });
  });

  describe('faxes.update', () => {
    it('marks a fax unread with an explicit false', async () => {
      mockJSON({ id: 'fax_123', read_at: null });

      await dialstack.faxes.update('fax_123', { is_read: false }, acct);

      expect(requestedUrl()).toBe('https://api.dialstack.ai/v1/faxes/fax_123');
      expect(requestInit().method).toBe('POST');
      expect(JSON.parse(requestInit().body as string)).toEqual({ is_read: false });
    });
  });

  describe('faxes.del', () => {
    it('issues a DELETE', async () => {
      mockNoContent();

      await dialstack.faxes.del('fax_123', acct);

      expect(requestedUrl()).toBe('https://api.dialstack.ai/v1/faxes/fax_123');
      expect(requestInit().method).toBe('DELETE');
    });
  });
});
