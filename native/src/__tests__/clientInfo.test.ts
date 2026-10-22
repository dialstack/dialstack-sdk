import { nativeClient } from '../clientInfo';
import { PACKAGE_VERSION } from '../version';

describe('nativeClient', () => {
  // The leading sdk-native/ is load-bearing: sdk-webrtc's phone.ts leaves out
  // its own stale version only when the string starts with it.
  it('reports sdk-native and the softphone', () => {
    expect(nativeClient()).toBe(`sdk-native/${PACKAGE_VERSION};c=softphone`);
  });

  it('adds the integrator app', () => {
    expect(nativeClient({ name: 'acme-mobile', version: '2.0.0' })).toBe(
      `sdk-native/${PACKAGE_VERSION};c=softphone app/acme-mobile/2.0.0`
    );
  });
});
