import { DialStackInstanceImplClass } from '../instance';

function instanceWith(response: Partial<Response>): {
  instance: DialStackInstanceImplClass;
  paths: string[];
} {
  const paths: string[] = [];
  const instance = new DialStackInstanceImplClass({
    publishableKey: 'pk_test_x',
    fetchClientSecret: async () => ({ client_secret: 's', expires_at: 0 }),
  });
  instance.fetchApi = async (path: string) => {
    paths.push(path);
    return response as Response;
  };
  return { instance, paths };
}

describe('admin.users.list', () => {
  it('returns the list data, keeping a null user as null', async () => {
    const owner = {
      id: 'admin_user_01',
      name: 'Sam Okafor',
      email: 'sam@example.com',
      role: 'owner',
      user: null,
      created_at: '2026-06-02T11:04:12Z',
    };
    const { instance, paths } = instanceWith({
      ok: true,
      status: 200,
      json: async () => ({ object: 'list', data: [owner] }),
    });

    const admins = await instance.admin.users.list();

    expect(admins).toEqual([owner]);
    expect(paths).toEqual(['/v1/admin/users?limit=100']);
  });

  it('sends expand as repeated expand[] parameters', async () => {
    const { instance, paths } = instanceWith({
      ok: true,
      status: 200,
      json: async () => ({ data: [] }),
    });

    await instance.admin.users.list({ expand: ['user'] });

    expect(paths[0]).toBe('/v1/admin/users?limit=100&expand%5B%5D=user');
  });

  it('follows next_page_url so the oldest administrators are not dropped', async () => {
    const paths: string[] = [];
    const instance = new DialStackInstanceImplClass({
      publishableKey: 'pk_test_x',
      fetchClientSecret: async () => ({ client_secret: 's', expires_at: 0 }),
    });
    const pages = [
      { data: [{ id: 'admin_user_02' }], next_page_url: '/v1/admin/users?limit=100&page=x' },
      { data: [{ id: 'admin_user_01' }], next_page_url: null },
    ];
    instance.fetchApi = async (path: string) => {
      paths.push(path);
      const page = pages[paths.length - 1];
      return { ok: true, status: 200, json: async () => page } as Response;
    };

    const admins = await instance.admin.users.list();

    expect(admins.map((a) => a.id)).toEqual(['admin_user_02', 'admin_user_01']);
    expect(paths).toEqual(['/v1/admin/users?limit=100', '/v1/admin/users?limit=100&page=x']);
  });

  it('throws on a non-2xx response', async () => {
    const { instance } = instanceWith({
      ok: false,
      status: 403,
      text: async () => 'forbidden',
    });

    await expect(instance.admin.users.list()).rejects.toThrow('403');
  });
});
