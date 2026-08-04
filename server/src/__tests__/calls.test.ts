import { DialStack } from '../index';
import type { CallLog, DIDSummary } from '../index';

// Mock fetch globally
const mockFetch = jest.fn();
global.fetch = mockFetch;

describe('Calls', () => {
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
      status: 202,
      json: async () => ({}),
      text: async () => '',
      headers: new Headers(),
    });
  }

  function mockEmptyList(url: string) {
    mockJSON({ object: 'list', url, data: [], next_page_url: null, previous_page_url: null });
  }

  function requestedUrl(): string {
    return mockFetch.mock.calls[0][0];
  }

  function requestInit(): { method: string; body?: string } {
    return mockFetch.mock.calls[0][1];
  }

  describe('calls.create', () => {
    it('posts the user and dial string', async () => {
      mockNoContent();

      await dialstack.calls.create({ user: 'user_123', dial_string: '+15551234567' }, acct);

      expect(requestedUrl()).toBe('https://api.dialstack.ai/v1/calls');
      expect(requestInit().method).toBe('POST');
      expect(JSON.parse(requestInit().body as string)).toEqual({
        user: 'user_123',
        dial_string: '+15551234567',
      });
    });
  });

  describe('calls.list', () => {
    it('forwards every documented filter and expands did', async () => {
      mockEmptyList('/v1/calls');

      await dialstack.calls.list(
        {
          limit: 25,
          user_id: 'user_123',
          did: 'did_123',
          direction: 'inbound',
          from_number: '+14155551234',
          to_number: '+14155559876',
          status: 'completed',
          from_date: '2026-01-01T00:00:00Z',
          to_date: '2026-02-01T00:00:00Z',
          expand: ['did'],
        },
        acct
      );

      const query = new URL(requestedUrl()).searchParams;
      expect(Object.fromEntries(query)).toEqual({
        limit: '25',
        user_id: 'user_123',
        did: 'did_123',
        direction: 'inbound',
        from_number: '+14155551234',
        to_number: '+14155559876',
        status: 'completed',
        from_date: '2026-01-01T00:00:00Z',
        to_date: '2026-02-01T00:00:00Z',
        'expand[]': 'did',
      });
    });

    it('sends a bare path with no params', async () => {
      mockEmptyList('/v1/calls');

      await dialstack.calls.list(undefined, acct);

      expect(requestedUrl()).toBe('https://api.dialstack.ai/v1/calls');
    });
  });

  describe('calls.retrieve', () => {
    it('forwards expand', async () => {
      mockJSON({ id: 'call_123' });

      await dialstack.calls.retrieve('call_123', { ...acct, expand: ['did'] });

      expect(requestedUrl()).toBe('https://api.dialstack.ai/v1/calls/call_123?expand%5B%5D=did');
    });

    it('narrows the expanded did to an object', async () => {
      mockJSON({
        id: 'call_123',
        did: { id: 'did_123', phone_number: '+14155559876' },
        direction: 'inbound',
      });

      const call: CallLog = await dialstack.calls.retrieve('call_123', {
        ...acct,
        expand: ['did'],
      });

      // `did` is a union: an id string by default, a summary object when expanded.
      expect((call.did as DIDSummary).phone_number).toBe('+14155559876');
    });

    it('leaves did as a bare id when not expanded', async () => {
      mockJSON({ id: 'call_123', did: 'did_123' });

      const call: CallLog = await dialstack.calls.retrieve('call_123', acct);

      expect(call.did).toBe('did_123');
      expect(requestedUrl()).toBe('https://api.dialstack.ai/v1/calls/call_123');
    });
  });

  describe('calls.retrieveRecording', () => {
    it('reads the signed download url', async () => {
      mockJSON({
        call_id: 'call_123',
        download_url: 'https://cdn.example.com/rec.wav?Signature=abc',
        expires_at: '2026-03-05T15:40:00Z',
        duration_seconds: 185,
        file_size_bytes: 2960000,
      });

      const recording = await dialstack.calls.retrieveRecording('call_123', acct);

      expect(requestedUrl()).toBe('https://api.dialstack.ai/v1/calls/call_123/recording');
      expect(recording.download_url).toContain('rec.wav');
      expect(recording.duration_seconds).toBe(185);
    });
  });

  describe('listeners', () => {
    it('creates a listener with a channel', async () => {
      mockJSON(
        {
          id: 'lstn_123',
          call_id: 'call_123',
          url: 'wss://example.com/audio',
          channel: 'both',
          created_at: '2026-01-01T00:00:00Z',
        },
        201
      );

      const listener = await dialstack.calls.createListener(
        'call_123',
        { url: 'wss://example.com/audio', channel: 'both' },
        acct
      );

      expect(requestedUrl()).toBe('https://api.dialstack.ai/v1/calls/call_123/listeners');
      expect(requestInit().method).toBe('POST');
      expect(JSON.parse(requestInit().body as string)).toEqual({
        url: 'wss://example.com/audio',
        channel: 'both',
      });
      expect(listener.id).toBe('lstn_123');
    });

    it('lists listeners with a limit', async () => {
      mockEmptyList('/v1/calls/call_123/listeners');

      await dialstack.calls.listListeners('call_123', { limit: 5 }, acct);

      expect(requestedUrl()).toBe('https://api.dialstack.ai/v1/calls/call_123/listeners?limit=5');
    });

    it('retrieves a single listener', async () => {
      mockJSON({ id: 'lstn_123', call_id: 'call_123' });

      await dialstack.calls.retrieveListener('call_123', 'lstn_123', acct);

      expect(requestedUrl()).toBe('https://api.dialstack.ai/v1/calls/call_123/listeners/lstn_123');
      expect(requestInit().method).toBe('GET');
    });

    it('deletes a listener', async () => {
      mockNoContent();

      await dialstack.calls.delListener('call_123', 'lstn_123', acct);

      expect(requestedUrl()).toBe('https://api.dialstack.ai/v1/calls/call_123/listeners/lstn_123');
      expect(requestInit().method).toBe('DELETE');
    });
  });
});
