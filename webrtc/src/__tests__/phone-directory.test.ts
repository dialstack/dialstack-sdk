import { DialStackPhone } from '../phone.js';
import type { DirectoryEntry, TypedDirectoryEntry } from '../types.js';

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

  it('keeps the no-argument result assignable to DirectoryEntry[]', async () => {
    const phone = new DialStackPhone({
      token: 'tok',
      autoReconnect: false,
      apiBaseUrl: 'https://api.test',
    });
    // Compile-time: existing annotated consumers and literals keep working.
    const entries: DirectoryEntry[] = await phone.listDirectory();
    const literal: DirectoryEntry = { user: 'user_x', displayName: 'x', extensionNumbers: [] };
    expect(entries.map((e) => e.user)).toEqual(['user_a', 'user_b']);
    expect(literal.user).toBe('user_x');
  });

  it('sends types[] and maps every typed row to { type, id }', async () => {
    fetchMock.mockImplementationOnce(async () => ({
      ok: true,
      status: 200,
      json: async () => ({
        object: 'list',
        url: '/v1/me/directory',
        next_page_url: null,
        previous_page_url: null,
        data: [
          {
            object: 'directory_entry',
            type: 'user',
            id: 'user_a',
            user: 'user_a',
            display_name: 'Ada',
            extension_numbers: ['101'],
          },
          {
            object: 'directory_entry',
            type: 'queue',
            id: 'qu_b',
            display_name: 'Billing',
            extension_numbers: ['600'],
          },
          {
            object: 'directory_entry',
            type: 'ring_group',
            id: 'rg_c',
            display_name: 'Sales',
            extension_numbers: ['601'],
          },
          {
            object: 'directory_entry',
            type: 'voice_app',
            id: 'va_d',
            display_name: 'Bot',
            extension_numbers: ['602'],
          },
          {
            object: 'directory_entry',
            type: 'dial_plan',
            id: 'dp_e',
            display_name: 'Main',
            extension_numbers: ['603'],
          },
          {
            object: 'directory_entry',
            type: 'shared_voicemail_box',
            id: 'svm_f',
            display_name: 'Support',
            extension_numbers: ['604'],
          },
        ],
      }),
    }));
    const phone = new DialStackPhone({
      token: 'tok',
      autoReconnect: false,
      apiBaseUrl: 'https://api.test',
    });

    const entries: TypedDirectoryEntry[] = await phone.listDirectory({
      types: ['user', 'queue', 'ring_group', 'voice_app', 'dial_plan', 'shared_voicemail_box'],
    });

    const [url] = fetchMock.mock.calls[0] as [string];
    expect(new URL(url).searchParams.getAll('types[]')).toEqual([
      'user',
      'queue',
      'ring_group',
      'voice_app',
      'dial_plan',
      'shared_voicemail_box',
    ]);
    expect(entries).toEqual([
      { type: 'user', id: 'user_a', displayName: 'Ada', extensionNumbers: ['101'] },
      { type: 'queue', id: 'qu_b', displayName: 'Billing', extensionNumbers: ['600'] },
      { type: 'ring_group', id: 'rg_c', displayName: 'Sales', extensionNumbers: ['601'] },
      { type: 'voice_app', id: 'va_d', displayName: 'Bot', extensionNumbers: ['602'] },
      { type: 'dial_plan', id: 'dp_e', displayName: 'Main', extensionNumbers: ['603'] },
      {
        type: 'shared_voicemail_box',
        id: 'svm_f',
        displayName: 'Support',
        extensionNumbers: ['604'],
      },
    ]);
  });

  it('skips a type this SDK version does not know instead of mislabeling it', async () => {
    fetchMock.mockImplementationOnce(async () => ({
      ok: true,
      status: 200,
      json: async () => ({
        object: 'list',
        url: '/v1/me/directory',
        next_page_url: null,
        previous_page_url: null,
        data: [
          {
            type: 'park_slot',
            id: 'ps_x',
            display_name: 'Park 1',
            extension_numbers: ['700'],
          },
          { user: 'user_a', display_name: 'Ada' },
        ],
      }),
    }));
    const phone = new DialStackPhone({
      token: 'tok',
      autoReconnect: false,
      apiBaseUrl: 'https://api.test',
    });

    const entries = await phone.listDirectory({ types: 'all' });

    const [url] = fetchMock.mock.calls[0] as [string];
    expect(new URL(url).searchParams.getAll('types[]')).toEqual(['all']);
    // The legacy row (no type, no id) is a user identified by `user`.
    expect(entries).toEqual([
      { type: 'user', id: 'user_a', displayName: 'Ada', extensionNumbers: [] },
    ]);
  });

  it('accepts an optional options value at the call site', async () => {
    const phone = new DialStackPhone({
      token: 'tok',
      autoReconnect: false,
      apiBaseUrl: 'https://api.test',
    });
    const forwarded: { types?: ['queue'] } | undefined = undefined;
    // Compile-time: forwarding a possibly-undefined options value type-checks.
    const entries = await phone.listDirectory(forwarded);
    expect(entries).toHaveLength(2);
  });
});
