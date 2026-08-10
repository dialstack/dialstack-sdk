import { DialStack, DialStackError, type DeviceUserConflictResponse } from '../index.js';

// Mock fetch globally
const mockFetch = jest.fn();
global.fetch = mockFetch;

describe('Error body parsing', () => {
  let dialstack: DialStack;
  const acct = { dialstackAccount: 'acct_test123' };

  beforeEach(() => {
    dialstack = new DialStack('sk_test_xxx');
    mockFetch.mockReset();
  });

  function mockError(status: number, body: unknown, statusText = 'Conflict') {
    mockFetch.mockResolvedValueOnce({
      ok: false,
      status,
      statusText,
      json: async () => body,
      text: async () => JSON.stringify(body),
      headers: new Headers({ 'x-request-id': 'req_123' }),
    });
  }

  async function captureError(promise: Promise<unknown>): Promise<DialStackError> {
    try {
      await promise;
    } catch (e) {
      return e as DialStackError;
    }
    throw new Error('expected the request to reject');
  }

  // The shape most handlers return: the message is a *string* under `error`,
  // with `code` and any extra fields as siblings on the same object.
  describe('{ error: "<message>", code, ... }', () => {
    it('surfaces the message rather than falling back to statusText', async () => {
      mockError(409, {
        error: 'User already has a device',
        code: 'user_already_has_device',
        existing_device: 'dev_1',
      });

      const error = await captureError(
        dialstack.devices.assignUser('dev_2', { user: 'user_1' }, acct)
      );

      expect(error.message).toBe('User already has a device');
      expect(error.message).not.toBe('Conflict');
    });

    it('exposes code, so callers can branch on it instead of the message', async () => {
      mockError(409, {
        error: 'User already has a device',
        code: 'user_already_has_device',
        existing_device: 'dev_1',
      });

      const error = await captureError(
        dialstack.devices.assignUser('dev_2', { user: 'user_1' }, acct)
      );

      expect(error.code).toBe('user_already_has_device');
    });

    it('keeps sibling fields reachable on raw', async () => {
      mockError(409, {
        error: 'User already has a device',
        code: 'user_already_has_device',
        existing_device: 'dev_1',
      });

      const error = await captureError(
        dialstack.devices.assignUser('dev_2', { user: 'user_1' }, acct)
      );

      // This is what makes DeviceUserConflictResponse a usable type.
      const conflict = error.raw as unknown as DeviceUserConflictResponse;
      expect(conflict.existing_device).toBe('dev_1');
      expect(conflict.code).toBe('user_already_has_device');
    });

    it('maps the status code to the right error class', async () => {
      mockError(409, { error: 'Extension number already in use', code: 'extension_taken' });

      const error = await captureError(dialstack.buttonTemplates.create({ name: 'dup' }, acct));

      expect(error.statusCode).toBe(409);
      expect(error.requestId).toBe('req_123');
    });
  });

  // echo.NewHTTPError responses, which voicemails and faxes go through.
  describe('{ message: "<message>" }', () => {
    it('still reads the message', async () => {
      mockError(404, { message: 'Voicemail not found' }, 'Not Found');

      const error = await captureError(dialstack.voicemails.retrieve('vm_404', acct));

      expect(error.message).toBe('Voicemail not found');
    });
  });

  // A nested object under `error`, the Stripe-style envelope.
  describe('{ error: { message, code, type } }', () => {
    it('unwraps the nested object', async () => {
      mockError(400, {
        error: {
          message: 'Invalid request',
          code: 'invalid_request',
          type: 'invalid_request_error',
        },
      });

      const error = await captureError(dialstack.calls.retrieve('call_1', acct));

      expect(error.message).toBe('Invalid request');
      expect(error.code).toBe('invalid_request');
      expect(error.type).toBe('invalid_request_error');
    });
  });

  describe('unparseable body', () => {
    it('falls back to statusText', async () => {
      // A 4xx, so the retry path doesn't kick in and consume more mocks.
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 400,
        statusText: 'Bad Request',
        json: async () => {
          throw new Error('not json');
        },
        text: async () => '<html>400</html>',
        headers: new Headers(),
      });

      const error = await captureError(dialstack.voicemails.retrieve('vm_1', acct));

      expect(error.message).toBe('Bad Request');
    });
  });
});
