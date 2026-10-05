import type { DialStackInstance, Extension } from '@dialstack/sdk-js';
import { listAllExtensions } from '../list-all-extensions';

const ext = (number: string): Extension => ({
  number,
  target: `user_${number}`,
  status: 'active',
  created_at: '2026-01-01T00:00:00Z',
  updated_at: '2026-01-01T00:00:00Z',
});

const page = (data: Extension[], next_page_url: string | null) => ({
  ok: true,
  json: async () => ({ object: 'list', data, next_page_url }),
});

describe('listAllExtensions', () => {
  // Paging itself is fetchAllPages' job; this pins that every page goes through it.
  it('pages through fetchAllPages rather than one extensions.list() call', async () => {
    const fetchApi = jest.fn().mockResolvedValue(page([ext('1100'), ext('1000')], null));
    const fetchAllPages = jest.fn(
      async <T>(fn: (o: { limit: number }) => Promise<{ data: T[] }>) =>
        (await fn({ limit: 100 })).data
    );

    const result = await listAllExtensions({
      fetchApi,
      fetchAllPages,
    } as unknown as DialStackInstance);

    expect(fetchAllPages).toHaveBeenCalledTimes(1);
    expect(fetchApi).toHaveBeenCalledWith('/v1/extensions?limit=100');
    expect(result.map((e) => e.number)).toEqual(['1100', '1000']);
  });

  it('throws on a failed first page', async () => {
    const fetchApi = jest.fn().mockResolvedValue({
      ok: false,
      status: 500,
      text: async () => 'boom',
    });
    const fetchAllPages = async <T>(fn: (o: { limit: number }) => Promise<{ data: T[] }>) =>
      (await fn({ limit: 100 })).data;

    await expect(
      listAllExtensions({ fetchApi, fetchAllPages } as unknown as DialStackInstance)
    ).rejects.toThrow('Failed to list extensions: 500 boom');
  });
});
