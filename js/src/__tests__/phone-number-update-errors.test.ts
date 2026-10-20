import { isApiError } from '../core/instance';

describe('phoneNumbers.update errors', () => {
  const mockFetch = jest.fn();
  global.fetch = mockFetch;

  let instance: import('../core/instance').DialStackInstanceImplClass;

  beforeEach(async () => {
    mockFetch.mockReset();
    const { DialStackInstanceImplClass } = await import('../core/instance');
    instance = new DialStackInstanceImplClass({
      publishableKey: 'pk_test_xxx',
      fetchClientSecret: async () => 'cs_test_secret',
    });
    await instance.startSession();
  });

  it('carries the API code and message on the ApiError', async () => {
    const body = {
      error: 'Toll-free numbers do not support a caller ID name or a directory listing',
      code: 'toll_free_not_supported',
    };
    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 422,
      json: async () => body,
      text: async () => JSON.stringify(body),
      headers: new Headers(),
    });

    const err = await instance.phoneNumbers
      .update('did_01h455vb4pex5vsknk084sn02t', { caller_id_name: 'ACME' })
      .catch((e: unknown) => e);

    expect(isApiError(err)).toBe(true);
    if (!isApiError(err)) return;
    expect(err.status).toBe(422);
    expect(err.code).toBe('toll_free_not_supported');
    expect(err.message).toBe(body.error);
  });
});
