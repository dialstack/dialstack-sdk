import type {
  DeviceSettings,
  DeviceSettingsPatch,
  DeviceSettingsResource,
  DeviceSettingsUpdateParams,
} from '../types';

/** How a device setting is edited. */
export type DeviceSettingKind = 'enum' | 'boolean' | 'integer';

/**
 * What a UI needs to render one device setting. The API decides which settings a
 * level may write (`settable`); this says how to show them. Labels are keys, so
 * each surface supplies its own translations.
 */
export interface DeviceSettingDefinition {
  /** Dotted path into {@link DeviceSettings}, as the API's `settable` lists it. */
  path: string;
  kind: DeviceSettingKind;
  /** The values an `enum` setting accepts, in display order. */
  options?: readonly string[];
  /** Translation key for the setting's label and help. */
  labelKey: string;
  /** Values that need the user to confirm before they are saved. */
  confirmOn?: readonly string[];
}

/**
 * Every device setting a UI knows how to render. A setting the API opens at a
 * level but that is missing here is not shown, so an older SDK simply hides
 * settings it does not know.
 */
export const deviceSettingsCatalog: readonly DeviceSettingDefinition[] = [
  {
    path: 'abstractions.network.sip_transport',
    kind: 'enum',
    options: ['udp', 'tcp', 'tls'],
    labelKey: 'sipTransport',
    confirmOn: ['tls'],
  },
];

/** The catalog entries the level may write, in catalog order. */
export function settableDeviceSettings(
  view: Pick<DeviceSettingsResource, 'settable'>
): DeviceSettingDefinition[] {
  const settable = new Set(view.settable);
  return deviceSettingsCatalog.filter((d) => settable.has(d.path));
}

/** The value at a dotted path, or `undefined` when unset. */
export function readDeviceSetting(settings: DeviceSettings, path: string): unknown {
  let node: unknown = settings;
  for (const key of path.split('.')) {
    if (node === null || typeof node !== 'object') return undefined;
    node = (node as Record<string, unknown>)[key];
  }
  return node ?? undefined;
}

/** An update that sets one setting, or clears it back to inheriting with `null`. */
export function deviceSettingsPatch(path: string, value: unknown): DeviceSettingsUpdateParams {
  const nested = path.split('.').reduceRight<unknown>((child, key) => ({ [key]: child }), value);
  return { settings: nested as DeviceSettingsPatch };
}
