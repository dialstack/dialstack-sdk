// Compile-time only: `npm run typecheck` covers this file, while jest never
// type-checks (isolatedModules) and never picks it up (not a *.test.ts).
import type { DeviceSettings, FeatureSettings, NetworkSettings } from './provisioning';

// The wire format is snake_case; the API silently ignores camelCase keys.
export const featureCase: FeatureSettings = {
  // @ts-expect-error -- camelCase is not a wire key
  dndEnabled: true,
};

export const networkCase: NetworkSettings = {
  // @ts-expect-error -- camelCase is not a wire key
  vlanId: 100,
};

export const settingsCase: DeviceSettings = {
  // @ts-expect-error -- camelCase is not a wire key
  vendorOverrides: {},
};
