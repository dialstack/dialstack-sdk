import { DialStackInstanceImplClass } from '../instance';

function recordingInstance() {
  const instance = new DialStackInstanceImplClass({
    publishableKey: 'pk_test_x',
    fetchClientSecret: async () => ({ client_secret: 's', expires_at: 0 }),
  });
  const paths: string[] = [];
  instance.fetchApi = async (path: string) => {
    paths.push(path);
    return {
      ok: true,
      status: 200,
      json: async () => ({ object: 'list', data: [], next_page_url: null }),
    } as unknown as Response;
  };
  return { instance, paths };
}

describe('calls.list', () => {
  it('sends the documented query parameter names', async () => {
    const { instance, paths } = recordingInstance();
    await instance.calls.list({
      limit: 25,
      search: 'dana',
      direction: 'inbound',
      from_date: '2026-10-01T00:00:00Z',
      expand: ['did'],
    });

    const query = new URLSearchParams(paths[0]?.split('?')[1]);
    expect(Object.fromEntries(query)).toEqual({
      limit: '25',
      search: 'dana',
      direction: 'inbound',
      from_date: '2026-10-01T00:00:00Z',
      'expand[]': 'did',
    });
  });

  // The endpoint pages by an opaque token only; a bare starting_after id is
  // ignored and returns the first page again.
  it('pages with the token from a page URL', async () => {
    const { instance, paths } = recordingInstance();
    await instance.calls.list({ page: 'eyJzdGFydGluZ19hZnRlciI6ImNhbGxfMSJ9' });
    expect(paths[0]).toBe('/v1/calls?page=eyJzdGFydGluZ19hZnRlciI6ImNhbGxfMSJ9');
  });
});

// These endpoints page the same way, so a bare cursor would silently return the
// first page again and a page-until-done loop would never finish.
describe('button-template list methods', () => {
  it.each([
    [
      'devices.listCompatibleButtonTemplates',
      (i: DialStackInstanceImplClass) =>
        i.devices.listCompatibleButtonTemplates('dev_1', { page: 'tok', starting_after: 'x' }),
    ],
    [
      'devices.listButtonOverrides',
      (i: DialStackInstanceImplClass) =>
        i.devices.listButtonOverrides('dev_1', { page: 'tok', starting_after: 'x' }),
    ],
    [
      'buttonTemplates.list',
      (i: DialStackInstanceImplClass) =>
        i.buttonTemplates.list({ page: 'tok', ending_before: 'x' }),
    ],
    [
      'buttonTemplates.buttons.list',
      (i: DialStackInstanceImplClass) =>
        i.buttonTemplates.buttons.list('btpl_1', { page: 'tok', ending_before: 'x' }),
    ],
  ])('%s sends the page token and not the ignored bare cursor', async (_name, call) => {
    const { instance, paths } = recordingInstance();
    await call(instance);
    const query = new URLSearchParams(paths[0]?.split('?')[1]);
    expect(query.get('page')).toBe('tok');
    expect(query.has('starting_after')).toBe(false);
    expect(query.has('ending_before')).toBe(false);
  });
});
