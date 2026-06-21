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

    await instance.account.retrieve();

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

    await instance.account.update({ name: 'Updated Name' });

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

    await expect(instance.account.retrieve()).rejects.toThrow(
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

    const result = await instance.locations.validateE911('loc_01abc');

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

    await expect(instance.locations.validateE911('loc_bad')).rejects.toThrow(
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

    const result = await instance.locations.provisionE911('loc_01abc');

    const [url, options] = mockFetch.mock.calls[0] as [string, RequestInit];
    expect(url).toContain('/v1/locations/loc_01abc/provision-e911');
    expect(options.method).toBe('POST');
    expect(result).toEqual(locationData);
  });

  describe('account.tos', () => {
    const newInstance = async () => {
      const { DialStackInstanceImplClass } = await import('../core/instance');
      const instance = new DialStackInstanceImplClass({
        publishableKey: 'pk_test_xxx',
        fetchClientSecret: async () => ({
          clientSecret: 'cs_test_secret',
          accountId: 'acct_01h00000000000000000000000',
        }),
      });
      await instance.startSession();
      return instance;
    };

    const tosDoc = {
      version: '0-draft',
      url: 'https://www.dialstack.ai/ssa',
      content: 'I have read, understood, and agree...',
      acceptance: null,
      pricing: { per_user_rate: 1500, per_did_rate: 200, per_voiceai_location_rate: 5000 },
    };

    it('retrieve requests the account-scoped path with expand[]=pricing', async () => {
      const instance = await newInstance();
      mockFetch.mockResolvedValueOnce(mockJsonResponse(tosDoc));

      const result = await instance.account.tos.retrieve({ expand: ['pricing'] });

      const [url, options] = mockFetch.mock.calls[0] as [string, RequestInit];
      expect(url).toContain('/v1/accounts/acct_01h00000000000000000000000/tos');
      expect(url).toContain('expand%5B%5D=pricing');
      expect((options.method ?? 'GET').toUpperCase()).toBe('GET');
      expect(result).toEqual(tosDoc);
    });

    it('retrieve omits the query string when no expand is given', async () => {
      const instance = await newInstance();
      mockFetch.mockResolvedValueOnce(mockJsonResponse({ ...tosDoc, pricing: undefined }));

      await instance.account.tos.retrieve();

      const [url] = mockFetch.mock.calls[0] as [string, RequestInit];
      expect(url).toMatch(/\/v1\/accounts\/acct_01h00000000000000000000000\/tos$/);
    });

    it('accept POSTs the version and returns the updated agreement', async () => {
      const instance = await newInstance();
      const accepted = {
        ...tosDoc,
        acceptance: { version: '0-draft', accepted_at: 'now', pricing: tosDoc.pricing },
      };
      mockFetch.mockResolvedValueOnce(mockJsonResponse(accepted));

      const result = await instance.account.tos.accept('0-draft');

      const [url, options] = mockFetch.mock.calls[0] as [string, RequestInit];
      expect(url).toContain('/v1/accounts/acct_01h00000000000000000000000/tos');
      expect(options.method).toBe('POST');
      expect(JSON.parse(options.body as string)).toEqual({ version: '0-draft' });
      expect(result).toEqual(accepted);
    });

    it('accept surfaces a 409 stale-version error with its status', async () => {
      const instance = await newInstance();
      mockFetch.mockResolvedValueOnce(
        mockJsonResponse(
          { error: 'Agreement version is out of date', code: 'tos_version_stale' },
          409
        )
      );

      await expect(instance.account.tos.accept('0-draft')).rejects.toMatchObject({ status: 409 });
    });

    it('accept surfaces a 422 pricing-not-set error with its status', async () => {
      const instance = await newInstance();
      mockFetch.mockResolvedValueOnce(
        mockJsonResponse({ error: 'Account pricing must be set' }, 422)
      );

      await expect(instance.account.tos.accept('0-draft')).rejects.toMatchObject({ status: 422 });
    });
  });

  it('refetches the session and retries once when an API request returns 401', async () => {
    const { DialStackInstanceImplClass } = await import('../core/instance');
    const fetchClientSecret = jest
      .fn()
      .mockResolvedValueOnce({
        clientSecret: 'cs_stale',
        accountId: 'acct_01h00000000000000000000000',
      })
      .mockResolvedValueOnce({
        clientSecret: 'cs_fresh',
        accountId: 'acct_01h00000000000000000000000',
      });
    const instance = new DialStackInstanceImplClass({
      publishableKey: 'pk_test_xxx',
      fetchClientSecret,
    });

    await instance.startSession();

    mockFetch
      .mockResolvedValueOnce(mockJsonResponse({ error: 'unauthorized' }, 401))
      .mockResolvedValueOnce(
        mockJsonResponse({
          id: 'acct_01h00000000000000000000000',
          config: {},
          created_at: '2026-01-01T00:00:00Z',
          updated_at: '2026-01-01T00:00:00Z',
        })
      );

    const result = await instance.account.retrieve();

    expect(result.id).toBe('acct_01h00000000000000000000000');
    expect(mockFetch).toHaveBeenCalledTimes(2);
    // First attempt used the stale secret; the retry used a freshly fetched one.
    const auth = (i: number) =>
      ((mockFetch.mock.calls[i] as [string, RequestInit])[1].headers as Headers).get(
        'Authorization'
      );
    expect(auth(0)).toBe('Bearer cs_stale');
    expect(auth(1)).toBe('Bearer cs_fresh');
    expect(fetchClientSecret).toHaveBeenCalledTimes(2);
  });

  it('retries an API 401 only once, then returns the failing response', async () => {
    const { DialStackInstanceImplClass } = await import('../core/instance');
    const fetchClientSecret = jest.fn(async () => ({
      clientSecret: 'cs_dead',
      accountId: 'acct_01h00000000000000000000000',
    }));
    const instance = new DialStackInstanceImplClass({
      publishableKey: 'pk_test_xxx',
      fetchClientSecret,
    });

    await instance.startSession();

    mockFetch.mockResolvedValue(mockJsonResponse({ error: 'unauthorized' }, 401));

    await expect(instance.account.retrieve()).rejects.toThrow('Failed to get account: 401');
    // Exactly one retry — no infinite loop on a persistently-rejected secret.
    expect(mockFetch).toHaveBeenCalledTimes(2);
  });

  it('refreshes the session on event-stream 401 and stops reconnecting after repeated auth failures', async () => {
    jest.useFakeTimers();
    const consoleError = jest.spyOn(console, 'error').mockImplementation(() => {});
    try {
      const { DialStackInstanceImplClass } = await import('../core/instance');
      const fetchClientSecret = jest.fn(async () => 'cs_dead_secret');
      const instance = new DialStackInstanceImplClass({
        publishableKey: 'pk_test_xxx',
        fetchClientSecret,
      });

      // Every event-stream connect is rejected as unauthorized (dead session).
      mockFetch.mockResolvedValue(mockJsonResponse({ error: 'unauthorized' }, 401));

      // Subscribing lazily opens the SSE stream.
      instance.on('call.incoming', () => {});

      // Flush the initial connect plus all backoff reconnects (1s, 2s, 4s).
      await jest.advanceTimersByTimeAsync(60_000);

      const eventCalls = () =>
        mockFetch.mock.calls.filter(([url]) => String(url).includes('/v1/events'));

      // 1 initial attempt + MAX_STREAM_AUTH_FAILURES (3) reconnects, then it gives up.
      expect(eventCalls()).toHaveLength(4);
      // The dead session is dropped and re-fetched on every attempt, rather
      // than reconnecting forever with the same rejected secret.
      expect(fetchClientSecret).toHaveBeenCalledTimes(4);
      expect(consoleError).toHaveBeenCalledTimes(1);

      // Advancing well past the session-refresh interval (~55min for the 1h
      // default expiry) triggers no more attempts and no background refresh —
      // the give-up path wound down refreshTimeoutId, so fetchClientSecret is
      // not re-invoked to re-cache the dead secret.
      await jest.advanceTimersByTimeAsync(2 * 60 * 60 * 1000);
      expect(eventCalls()).toHaveLength(4);
      expect(fetchClientSecret).toHaveBeenCalledTimes(4);
    } finally {
      consoleError.mockRestore();
      jest.useRealTimers();
    }
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

    await expect(instance.locations.provisionE911('loc_bad')).rejects.toThrow(
      'Failed to provision E911: 502'
    );
  });
});
