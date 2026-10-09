import { DialStackInstanceImplClass } from '../instance';

/**
 * A stubbed instance whose only job is to answer one resource GET, so these
 * tests exercise the real ownRingSeconds on the real API payload shape. Reading
 * the wrong key is invisible to a test that hand-builds the resolved object,
 * which is exactly how `config.fmfm` (the API emits `find_me_follow_me`) shipped
 * — every user resolved to null and the whole branch was dead.
 */
function instanceReturning(payload: unknown): DialStackInstanceImplClass {
  const instance = new DialStackInstanceImplClass({
    publishableKey: 'pk_test_x',
    fetchClientSecret: async () => ({ client_secret: 's', expires_at: 0 }),
  });
  instance.fetchApi = async () =>
    ({ ok: true, status: 200, json: async () => payload }) as unknown as Response;
  return instance;
}

describe('resolveRoutingTarget timeout_seconds', () => {
  it("sums a user's Find Me / Follow Me ladder off the key the API emits", async () => {
    const target = await instanceReturning({
      name: 'Ada',
      config: { find_me_follow_me: { steps: [{ timeout: 30 }, { timeout: 60 }] } },
    }).resolveRoutingTarget('user_01abc');

    expect(target?.timeout_seconds).toBe(90);
  });

  it('reports no duration for a user with no ladder', async () => {
    const target = await instanceReturning({ name: 'Ada', config: {} }).resolveRoutingTarget(
      'user_01abc'
    );

    expect(target?.timeout_seconds).toBeNull();
  });

  it("resolves a queue's zero to the hour it actually holds a caller for", async () => {
    const target = await instanceReturning({
      name: 'Support',
      timeout_seconds: 0,
    }).resolveRoutingTarget('qu_01abc');

    expect(target?.timeout_seconds).toBe(3600);
  });

  it("passes a queue's stored wait through when it has one", async () => {
    const target = await instanceReturning({
      name: 'Support',
      timeout_seconds: 600,
    }).resolveRoutingTarget('qu_01abc');

    expect(target?.timeout_seconds).toBe(600);
  });

  it("passes a ring group's stored timeout through", async () => {
    const target = await instanceReturning({
      name: 'Sales',
      timeout_seconds: 20,
    }).resolveRoutingTarget('rg_01abc');

    expect(target?.timeout_seconds).toBe(20);
  });
});

describe('resolveRoutingTarget refresh', () => {
  it('replaces the cached entry with the refetched one', async () => {
    const instance = instanceReturning({ name: 'Sales', timeout_seconds: 20 });
    await instance.resolveRoutingTarget('rg_01abc');
    instance.fetchApi = async () =>
      ({
        ok: true,
        status: 200,
        json: async () => ({ name: 'Sales East', timeout_seconds: 20 }),
      }) as unknown as Response;

    await instance.resolveRoutingTarget('rg_01abc', { refresh: true });

    expect((await instance.resolveRoutingTarget('rg_01abc'))?.name).toBe('Sales East');
  });

  it('keeps the cached entry when the refetch fails', async () => {
    const instance = instanceReturning({ name: 'Sales', timeout_seconds: 20 });
    await instance.resolveRoutingTarget('rg_01abc');
    instance.fetchApi = async () =>
      ({ ok: false, status: 502, json: async () => ({}) }) as unknown as Response;

    const refreshed = await instance.resolveRoutingTarget('rg_01abc', { refresh: true });

    expect(refreshed?.name).toBe('Sales');
    expect((await instance.resolveRoutingTarget('rg_01abc'))?.name).toBe('Sales');
  });
});
