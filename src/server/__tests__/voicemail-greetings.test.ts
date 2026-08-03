import { DialStack } from '../index';

// Mock fetch globally
const mockFetch = jest.fn();
global.fetch = mockFetch;

describe('Voicemail greetings', () => {
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

  function requestedUrl(): string {
    return mockFetch.mock.calls[0][0];
  }

  function requestInit(): {
    method: string;
    body?: BodyInit;
    headers: Record<string, string>;
  } {
    return mockFetch.mock.calls[0][1];
  }

  const greeting = {
    owner: 'user_123',
    greeting_type: 'unavailable',
    format: 'wav',
    duration_seconds: 12.4,
    size_bytes: 98560,
    url: 'https://greetings.example.com/g.wav?Signature=abc',
    updated_at: '2026-01-01T00:00:00Z',
  };

  describe('voicemailGreetings.upload', () => {
    it('sends multipart form data with the audio under a file field', async () => {
      mockJSON(greeting);

      const audio = new Blob(['fake-wav-bytes'], { type: 'audio/wav' });
      await dialstack.voicemailGreetings.upload('user_123', 'unavailable', audio, {
        ...acct,
        filename: 'welcome.wav',
      });

      expect(requestedUrl()).toBe(
        'https://api.dialstack.ai/v1/voicemail_greetings/user_123/unavailable'
      );
      expect(requestInit().method).toBe('POST');

      const form = requestInit().body as FormData;
      expect(form).toBeInstanceOf(FormData);
      const sent = form.get('file') as File;
      expect(sent).toBeInstanceOf(Blob);
      expect(sent.name).toBe('welcome.wav');
    });

    it('omits Content-Type so fetch can set the multipart boundary', async () => {
      mockJSON(greeting);

      const audio = new Blob(['fake-wav-bytes'], { type: 'audio/wav' });
      await dialstack.voicemailGreetings.upload('user_123', 'unavailable', audio, acct);

      // A hardcoded application/json here would corrupt the upload.
      expect(requestInit().headers['Content-Type']).toBeUndefined();
      expect(requestInit().headers['Authorization']).toBe('Bearer sk_test_xxx');
    });

    it('works for a shared voicemail box owner', async () => {
      mockJSON({ ...greeting, owner: 'svm_123' });

      const audio = new Blob(['x'], { type: 'audio/wav' });
      await dialstack.voicemailGreetings.upload('svm_123', 'unavailable', audio, acct);

      expect(requestedUrl()).toBe(
        'https://api.dialstack.ai/v1/voicemail_greetings/svm_123/unavailable'
      );
    });
  });

  describe('voicemailGreetings.retrieve', () => {
    it('reads the greeting metadata and signed url', async () => {
      mockJSON(greeting);

      const result = await dialstack.voicemailGreetings.retrieve('user_123', 'unavailable', acct);

      expect(requestedUrl()).toBe(
        'https://api.dialstack.ai/v1/voicemail_greetings/user_123/unavailable'
      );
      expect(requestInit().method).toBe('GET');
      expect(result.duration_seconds).toBe(12.4);
      expect(result.url).toContain('g.wav');
    });
  });

  describe('voicemailGreetings.del', () => {
    it('issues a DELETE', async () => {
      mockNoContent();

      await dialstack.voicemailGreetings.del('user_123', 'unavailable', acct);

      expect(requestedUrl()).toBe(
        'https://api.dialstack.ai/v1/voicemail_greetings/user_123/unavailable'
      );
      expect(requestInit().method).toBe('DELETE');
    });
  });

  describe('JSON requests are unaffected', () => {
    it('still sends application/json for a normal body', async () => {
      mockJSON({ id: 'vm_123', is_read: true });

      await dialstack.voicemails.update('vm_123', { is_read: true }, acct);

      expect(requestInit().headers['Content-Type']).toBe('application/json');
      expect(JSON.parse(requestInit().body as string)).toEqual({ is_read: true });
    });
  });
});
