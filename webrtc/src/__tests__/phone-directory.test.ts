import { DialStackPhone } from '../phone.js';

describe('DialStackPhone.listDirectory', () => {
  let originalFetch: unknown;
  let fetchMock: jest.Mock;

  beforeEach(() => {
    originalFetch = (globalThis as Record<string, unknown>).fetch;
    fetchMock = jest.fn(async () => ({
      ok: true,
      status: 200,
      json: async () => ({
        object: 'list',
        url: '/v1/me/directory',
        next_page_url: null,
        previous_page_url: null,
        data: [
          { user: 'user_a', display_name: 'Ada Lovelace', extension_numbers: ['101', '102'] },
          // An API that predates extension_numbers omits it.
          { user: 'user_b', display_name: 'Grace Hopper' },
        ],
      }),
    }));
    (globalThis as Record<string, unknown>).fetch = fetchMock;
  });

  afterEach(() => {
    (globalThis as Record<string, unknown>).fetch = originalFetch;
  });

  it('maps wire entries to camelCase and defaults missing extension numbers to []', async () => {
    const phone = new DialStackPhone({
      token: 'tok',
      autoReconnect: false,
      apiBaseUrl: 'https://api.test',
    });

    const entries = await phone.listDirectory();

    expect(entries).toEqual([
      { user: 'user_a', displayName: 'Ada Lovelace', extensionNumbers: ['101', '102'] },
      { user: 'user_b', displayName: 'Grace Hopper', extensionNumbers: [] },
    ]);
    const [url] = fetchMock.mock.calls[0] as [string];
    expect(url).toBe('https://api.test/v1/me/directory');
  });
});
