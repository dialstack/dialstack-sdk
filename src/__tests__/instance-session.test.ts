/**
 * Tests for session parsing and account-scoped methods on DialStackInstanceImplClass
 */

describe('DialStackInstanceImplClass session behavior', () => {
  const mockFetch = jest.fn();
  global.fetch = mockFetch;

  const mockJsonResponse = (data: unknown, status = 200) => ({
    ok: status >= 200 && status < 300,
    status,
    json: async () => data,
    text: async () => JSON.stringify(data),
    headers: new Headers(),
  });

  beforeEach(() => {
    mockFetch.mockReset();
  });

  it('uses accountId from fetchClientSecret object for account-scoped requests', async () => {
    const { DialStackInstanceImplClass } = await import('../core/instance');
    const instance = new DialStackInstanceImplClass({
      publishableKey: 'pk_test_xxx',
      fetchClientSecret: async () => ({
        clientSecret: 'not-a-jwt-token',
        accountId: 'acct_01h00000000000000000000000',
        expiresAt: '2026-02-27T00:00:00.000Z',
      }),
    });

    await instance.startSession();

    mockFetch.mockResolvedValueOnce(
      mockJsonResponse({
        id: 'acct_01h00000000000000000000000',
        config: {},
        created_at: '2026-01-01T00:00:00Z',
        updated_at: '2026-01-01T00:00:00Z',
      })
    );

    await instance.getAccount();

    const [url, options] = mockFetch.mock.calls[0] as [string, RequestInit];
    expect(url).toContain('/v1/accounts/acct_01h00000000000000000000000');
    const headers = options.headers as Headers;
    expect(headers.get('Authorization')).toBe('Bearer not-a-jwt-token');
    expect(headers.get('Content-Type')).toBe('application/json');
  });

  it('sends Content-Type header for account update POST requests', async () => {
    const { DialStackInstanceImplClass } = await import('../core/instance');
    const instance = new DialStackInstanceImplClass({
      publishableKey: 'pk_test_xxx',
      fetchClientSecret: async () => ({
        clientSecret: 'cs_test_secret',
        accountId: 'acct_01h00000000000000000000000',
      }),
    });

    await instance.startSession();

    mockFetch.mockResolvedValueOnce(
      mockJsonResponse({
        id: 'acct_01h00000000000000000000000',
        config: {},
        created_at: '2026-01-01T00:00:00Z',
        updated_at: '2026-01-01T00:00:00Z',
      })
    );

    await instance.updateAccount({ name: 'Updated Name' });

    const [, options] = mockFetch.mock.calls[0] as [string, RequestInit];
    expect(options.method).toBe('POST');
    const headers = options.headers as Headers;
    expect(headers.get('Content-Type')).toBe('application/json');
  });

  it('throws a clear error when accountId is missing for account-scoped methods', async () => {
    const { DialStackInstanceImplClass } = await import('../core/instance');
    const instance = new DialStackInstanceImplClass({
      publishableKey: 'pk_test_xxx',
      fetchClientSecret: async () => 'cs_test_secret',
    });

    await instance.startSession();

    await expect(instance.getAccount()).rejects.toThrow(
      'DialStack: accountId is required for account-scoped methods. Return { clientSecret, accountId } from fetchClientSecret.'
    );
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it('validateLocationE911 sends POST and returns validation result', async () => {
    const { DialStackInstanceImplClass } = await import('../core/instance');
    const instance = new DialStackInstanceImplClass({
      publishableKey: 'pk_test_xxx',
      fetchClientSecret: async () => ({
        clientSecret: 'cs_test_secret',
        accountId: 'acct_01h00000000000000000000000',
      }),
    });

    await instance.startSession();

    const validationResult = { adjusted: true, address: { house_number: '123', city: 'NY' } };
    mockFetch.mockResolvedValueOnce(mockJsonResponse(validationResult));

    const result = await instance.validateLocationE911('loc_01abc');

    const [url, options] = mockFetch.mock.calls[0] as [string, RequestInit];
    expect(url).toContain('/v1/locations/loc_01abc/validate-e911');
    expect(options.method).toBe('POST');
    expect(result).toEqual(validationResult);
  });

  it('validateLocationE911 throws on error response', async () => {
    const { DialStackInstanceImplClass } = await import('../core/instance');
    const instance = new DialStackInstanceImplClass({
      publishableKey: 'pk_test_xxx',
      fetchClientSecret: async () => ({
        clientSecret: 'cs_test_secret',
        accountId: 'acct_01h00000000000000000000000',
      }),
    });

    await instance.startSession();

    mockFetch.mockResolvedValueOnce(mockJsonResponse({ error: 'not found' }, 404));

    await expect(instance.validateLocationE911('loc_bad')).rejects.toThrow(
      'Failed to validate E911 address: 404'
    );
  });

  it('provisionLocationE911 sends POST and returns updated location', async () => {
    const { DialStackInstanceImplClass } = await import('../core/instance');
    const instance = new DialStackInstanceImplClass({
      publishableKey: 'pk_test_xxx',
      fetchClientSecret: async () => ({
        clientSecret: 'cs_test_secret',
        accountId: 'acct_01h00000000000000000000000',
      }),
    });

    await instance.startSession();

    const locationData = {
      id: 'loc_01abc',
      name: 'HQ',
      e911_status: 'pending',
      address: { city: 'NY', state: 'NY', postal_code: '10001', country: 'US' },
      status: 'active',
      created_at: '2026-01-01T00:00:00Z',
      updated_at: '2026-01-01T00:00:00Z',
    };
    mockFetch.mockResolvedValueOnce(mockJsonResponse(locationData));

    const result = await instance.provisionLocationE911('loc_01abc');

    const [url, options] = mockFetch.mock.calls[0] as [string, RequestInit];
    expect(url).toContain('/v1/locations/loc_01abc/provision-e911');
    expect(options.method).toBe('POST');
    expect(result).toEqual(locationData);
  });

  it('provisionLocationE911 throws on error response', async () => {
    const { DialStackInstanceImplClass } = await import('../core/instance');
    const instance = new DialStackInstanceImplClass({
      publishableKey: 'pk_test_xxx',
      fetchClientSecret: async () => ({
        clientSecret: 'cs_test_secret',
        accountId: 'acct_01h00000000000000000000000',
      }),
    });

    await instance.startSession();

    mockFetch.mockResolvedValueOnce(mockJsonResponse({ error: 'bad gateway' }, 502));

    await expect(instance.provisionLocationE911('loc_bad')).rejects.toThrow(
      'Failed to provision E911: 502'
    );
  });
});
