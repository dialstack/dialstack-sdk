import '../components/phone-numbers';
import { ClientInfo } from '../core/client-info';
import { PACKAGE_VERSION } from '../version';

describe('ClientInfo', () => {
  it('lists packages in registration order with their sorted components', () => {
    const info = new ClientInfo();
    info.registerPackage('sdk-js', '3.7.0');
    info.registerPackage('sdk-react', '3.7.0');
    info.registerComponent('sdk-js', 'voicemails');
    info.registerComponent('sdk-js', 'call-logs');
    info.registerComponent('sdk-js', 'call-logs');
    info.registerComponent('sdk-react', 'dial-plan');

    expect(info.header()).toBe('sdk-js/3.7.0;c=call-logs,voicemails sdk-react/3.7.0;c=dial-plan');
  });

  it('ignores components of a package that was never registered', () => {
    const info = new ClientInfo();
    info.registerPackage('sdk-js', '3.7.0');
    info.registerComponent('sdk-react', 'dial-plan');

    expect(info.header()).toBe('sdk-js/3.7.0');
  });

  it('keeps components when a package is re-registered at a new version', () => {
    const info = new ClientInfo();
    info.registerPackage('sdk-js', '3.7.0');
    info.registerComponent('sdk-js', 'call-logs');
    info.registerPackage('sdk-js', '3.8.0');

    expect(info.header()).toBe('sdk-js/3.8.0;c=call-logs');
  });

  it('appends the app token and reduces caller-supplied text to the safe alphabet', () => {
    const info = new ClientInfo({ name: 'Acme Portal;\r\nx', version: '2.1.0 beta' });
    info.registerPackage('sdk-js', '3.7.0');

    expect(info.header()).toBe('sdk-js/3.7.0 app/Acme-Portal---x/2.1.0-beta');
  });

  it('defaults a missing app version', () => {
    const info = new ClientInfo({ name: 'dialstack-admin' });

    expect(info.header()).toBe('app/dialstack-admin/0.0.0');
  });

  it('reflects registrations made after the header was first built', () => {
    const info = new ClientInfo();
    info.registerPackage('sdk-js', '3.7.0');
    expect(info.header()).toBe('sdk-js/3.7.0');

    info.registerComponent('sdk-js', 'call-logs');
    expect(info.header()).toBe('sdk-js/3.7.0;c=call-logs');
  });
});

describe('DialStack-Client on instance requests', () => {
  const mockFetch = jest.fn();
  global.fetch = mockFetch;

  beforeEach(() => {
    mockFetch.mockReset();
    mockFetch.mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ data: [] }),
      text: async () => '{"data":[]}',
      headers: new Headers(),
    });
  });

  it('sends the sdk-js version, mounted components and app info on API requests', async () => {
    const { DialStackInstanceImplClass } = await import('../core/instance');
    const instance = new DialStackInstanceImplClass({
      publishableKey: 'pk_test_xxx',
      fetchClientSecret: async () => 'cs_test_secret',
      appInfo: { name: 'acme-portal', version: '2.1.0' },
    });
    instance.registerClientComponent('sdk-js', 'call-logs');

    await instance.fetchApi('/v1/calls');

    const [, options] = mockFetch.mock.calls[0] as [string, RequestInit];
    expect((options.headers as Headers).get('DialStack-Client')).toBe(
      `sdk-js/${PACKAGE_VERSION};c=call-logs app/acme-portal/2.1.0`
    );
  });

  it('reports a web component once it is given the instance', async () => {
    const { DialStackInstanceImplClass } = await import('../core/instance');
    const instance = new DialStackInstanceImplClass({
      publishableKey: 'pk_test_xxx',
      fetchClientSecret: async () => 'cs_test_secret',
    });
    const el = document.createElement('dialstack-phone-numbers') as HTMLElement & {
      setInstance(i: unknown): void;
    };
    el.setInstance(instance);

    expect(instance.clientHeader()).toBe(`sdk-js/${PACKAGE_VERSION};c=phone-numbers`);
  });
});
