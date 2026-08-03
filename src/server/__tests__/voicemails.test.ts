import { DialStack } from '../index';
import type { CallLog, Voicemail } from '../index';

// Mock fetch globally
const mockFetch = jest.fn();
global.fetch = mockFetch;

describe('Voicemails', () => {
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
      url: '/v1/voicemails',
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

  describe('voicemails.list', () => {
    it('forwards every documented filter and expands call', async () => {
      mockEmptyList();

      await dialstack.voicemails.list(
        {
          limit: 10,
          owner: 'user_123',
          is_read: false,
          from_date: '2026-01-01T00:00:00Z',
          expand: ['call'],
        },
        acct
      );

      const query = new URL(requestedUrl()).searchParams;
      expect(Object.fromEntries(query)).toEqual({
        limit: '10',
        owner: 'user_123',
        is_read: 'false',
        from_date: '2026-01-01T00:00:00Z',
        'expand[]': 'call',
      });
    });

    it('sends is_read=false rather than dropping the falsey value', async () => {
      mockEmptyList();

      await dialstack.voicemails.list({ is_read: false }, acct);

      expect(requestedUrl()).toBe('https://api.dialstack.ai/v1/voicemails?is_read=false');
    });

    it('omits is_read when unset', async () => {
      mockEmptyList();

      await dialstack.voicemails.list({ owner: 'svm_1' }, acct);

      expect(requestedUrl()).toBe('https://api.dialstack.ai/v1/voicemails?owner=svm_1');
    });
  });

  describe('voicemails.retrieve', () => {
    it('forwards expand', async () => {
      mockJSON({ id: 'vm_123' });

      await dialstack.voicemails.retrieve('vm_123', { ...acct, expand: ['call'] });

      expect(requestedUrl()).toBe(
        'https://api.dialstack.ai/v1/voicemails/vm_123?expand%5B%5D=call'
      );
    });

    it('narrows the expanded call to a call log', async () => {
      mockJSON({
        id: 'vm_123',
        owner: 'user_123',
        call: { id: 'call_123', direction: 'inbound' },
      });

      const voicemail: Voicemail = await dialstack.voicemails.retrieve('vm_123', {
        ...acct,
        expand: ['call'],
      });

      expect((voicemail.call as CallLog).id).toBe('call_123');
    });

    it('leaves call as a bare id when not expanded', async () => {
      mockJSON({ id: 'vm_123', owner: 'user_123', call: 'call_123' });

      const voicemail: Voicemail = await dialstack.voicemails.retrieve('vm_123', acct);

      expect(voicemail.call).toBe('call_123');
      expect(requestedUrl()).toBe('https://api.dialstack.ai/v1/voicemails/vm_123');
    });
  });

  describe('voicemails.update', () => {
    it('sends is_read, including an explicit false', async () => {
      mockJSON({ id: 'vm_123', is_read: false });

      await dialstack.voicemails.update('vm_123', { is_read: false }, acct);

      expect(requestedUrl()).toBe('https://api.dialstack.ai/v1/voicemails/vm_123');
      expect(requestInit().method).toBe('POST');
      expect(JSON.parse(requestInit().body as string)).toEqual({ is_read: false });
    });
  });

  describe('voicemails.del', () => {
    it('issues a DELETE', async () => {
      mockNoContent();

      await dialstack.voicemails.del('vm_123', acct);

      expect(requestedUrl()).toBe('https://api.dialstack.ai/v1/voicemails/vm_123');
      expect(requestInit().method).toBe('DELETE');
    });
  });

  describe('voicemails.retrieveTranscript', () => {
    it('reads the transcript envelope', async () => {
      mockJSON({ voicemail: 'vm_123', status: 'completed', text: 'Hi, this is John.' });

      const transcript = await dialstack.voicemails.retrieveTranscript('vm_123', acct);

      expect(requestedUrl()).toBe('https://api.dialstack.ai/v1/voicemails/vm_123/transcript');
      expect(transcript.text).toBe('Hi, this is John.');
      expect(transcript.status).toBe('completed');
    });
  });
});
