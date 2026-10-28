import {
  DialStack,
  type DeviceSettingsResource,
  type DeviceSettingsUpdateParams,
} from '../index.js';

const mockFetch = jest.fn();
global.fetch = mockFetch;

const view: DeviceSettingsResource = {
  object: 'device_settings',
  settings: {},
  defaults: { abstractions: { network: { sip_transport: 'tls' } } },
  sources: { 'abstractions.network.sip_transport': 'platform' },
  settable: ['abstractions.network.sip_transport'],
};

describe('account device settings', () => {
  let dialstack: DialStack;

  beforeEach(() => {
    dialstack = new DialStack('sk_test_xxx');
    mockFetch.mockReset();
    mockFetch.mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => view,
      text: async () => JSON.stringify(view),
      headers: new Headers({ 'x-request-id': 'req_123' }),
    });
  });

  it('retrieves the singleton', async () => {
    const got = await dialstack.accounts.retrieveDeviceSettings('acct_1');
    expect(mockFetch.mock.calls[0][0]).toBe(
      'https://api.dialstack.ai/v1/accounts/acct_1/device-settings'
    );
    expect(mockFetch.mock.calls[0][1].method).toBe('GET');
    expect(got.sources['abstractions.network.sip_transport']).toBe('platform');
  });

  it('posts a merge patch', async () => {
    const params = {
      settings: { abstractions: { network: { sip_transport: null } } },
    } satisfies DeviceSettingsUpdateParams;
    await dialstack.accounts.updateDeviceSettings('acct_1', params);

    const [url, init] = mockFetch.mock.calls[0];
    expect(url).toBe('https://api.dialstack.ai/v1/accounts/acct_1/device-settings');
    expect(init.method).toBe('POST');
    expect(JSON.parse(init.body)).toEqual(params);
  });

  it('clears every setting with settings: null', async () => {
    await dialstack.accounts.updateDeviceSettings('acct_1', { settings: null });
    expect(JSON.parse(mockFetch.mock.calls[0][1].body)).toEqual({ settings: null });
  });
});
