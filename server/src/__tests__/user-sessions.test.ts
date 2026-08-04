import { DialStack } from '../index';

const mockFetch = jest.fn();
global.fetch = mockFetch;

describe('userSessions', () => {
  let dialstack: DialStack;

  beforeEach(() => {
    dialstack = new DialStack('sk_test_xxx');
    mockFetch.mockReset();
  });

  const mockResponse = (data: unknown) => ({
    ok: true,
    status: 201,
    json: async () => data,
    text: async () => JSON.stringify(data),
    headers: new Headers(),
  });

  it('mints a session with just user', async () => {
    const body = {
      client_secret: 'signed.jwt.here',
      expires_at: '2026-05-21T18:00:00Z',
    };
    mockFetch.mockResolvedValueOnce(mockResponse(body));

    const result = await dialstack.userSessions.create({ user: 'user_abc123' });

    expect(result).toEqual(body);
    expect(mockFetch).toHaveBeenCalledTimes(1);
    const [url, init] = mockFetch.mock.calls[0];
    expect(url).toMatch(/\/v1\/user_sessions$/);
    expect(init.method).toBe('POST');
    expect(JSON.parse(init.body)).toEqual({ user: 'user_abc123' });
    expect(init.headers['Authorization']).toBe('Bearer sk_test_xxx');
  });

  it('passes ttl_seconds when provided', async () => {
    const body = {
      client_secret: 'signed.jwt.here',
      expires_at: '2026-05-21T18:00:00Z',
    };
    mockFetch.mockResolvedValueOnce(mockResponse(body));

    await dialstack.userSessions.create({ user: 'user_abc123', ttl_seconds: 600 });

    const [, init] = mockFetch.mock.calls[0];
    expect(JSON.parse(init.body)).toEqual({ user: 'user_abc123', ttl_seconds: 600 });
  });

  it('surfaces API errors', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 404,
      json: async () => ({ error: 'User not found' }),
      text: async () => JSON.stringify({ error: 'User not found' }),
      headers: new Headers(),
    });

    await expect(dialstack.userSessions.create({ user: 'user_unknown' })).rejects.toThrow();
  });
});
