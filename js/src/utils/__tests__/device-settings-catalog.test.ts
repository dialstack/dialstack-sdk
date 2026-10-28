import {
  deviceSettingsCatalog,
  deviceSettingsPatch,
  readDeviceSetting,
  settableDeviceSettings,
} from '../device-settings-catalog';
import type { DeviceSettingsResource } from '../../types';

const transport = 'abstractions.network.sip_transport';

const view: DeviceSettingsResource = {
  object: 'device_settings',
  settings: { abstractions: { network: { sip_transport: 'tcp' } } },
  defaults: { abstractions: { network: { sip_transport: 'tls' } } },
  sources: { [transport]: 'platform' },
  settable: [transport, 'abstractions.features.not_in_this_catalog'],
};

describe('deviceSettingsCatalog', () => {
  it('describes the SIP transport', () => {
    expect(deviceSettingsCatalog.find((d) => d.path === transport)).toEqual({
      path: transport,
      kind: 'enum',
      options: ['udp', 'tcp', 'tls'],
      labelKey: 'sipTransport',
      confirmOn: ['tls'],
    });
  });

  it('has unique paths', () => {
    const paths = deviceSettingsCatalog.map((d) => d.path);
    expect(new Set(paths).size).toBe(paths.length);
  });
});

describe('settableDeviceSettings', () => {
  it('keeps what the API allows and the catalog describes, in catalog order', () => {
    expect(settableDeviceSettings(view).map((d) => d.path)).toEqual([transport]);
  });

  it('hides a catalog entry the level cannot write', () => {
    expect(settableDeviceSettings({ ...view, settable: [] })).toEqual([]);
  });
});

describe('readDeviceSetting', () => {
  it('reads a dotted path, undefined when unset', () => {
    expect(readDeviceSetting(view.settings, transport)).toBe('tcp');
    expect(readDeviceSetting(view.defaults, transport)).toBe('tls');
    expect(readDeviceSetting({}, transport)).toBeUndefined();
  });
});

describe('deviceSettingsPatch', () => {
  it('nests a value under its path', () => {
    expect(deviceSettingsPatch(transport, 'udp')).toEqual({
      settings: { abstractions: { network: { sip_transport: 'udp' } } },
    });
  });

  it('sends null to clear back to inherit', () => {
    expect(deviceSettingsPatch(transport, null)).toEqual({
      settings: { abstractions: { network: { sip_transport: null } } },
    });
  });
});
