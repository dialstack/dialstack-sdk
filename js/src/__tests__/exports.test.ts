/**
 * What the browser package's entry points may and may not expose.
 *
 * The "does not export" half is the load-bearing part: this package must stay
 * importable from a plain HTML page and from a Node SSR pass, so a React component
 * leaking onto its surface is a real defect rather than a style question. Those
 * live in @dialstack/sdk-react.
 */

import * as SDK from '../index';
import * as Pure from '../pure';

describe('@dialstack/sdk-js main entry', () => {
  it.each([
    ['loadDialstackAndInitialize', 'function'],
    ['isDeskphone', 'function'],
    ['isDECTBase', 'function'],
    ['deviceReadiness', 'function'],
    ['isApiError', 'function'],
  ])('exports %s as a %s', (name, kind) => {
    const value = (SDK as Record<string, unknown>)[name];
    expect(value).toBeDefined();
    expect(typeof value).toBe(kind);
  });

  it.each([['defaultIcons'], ['defaultLocale'], ['en'], ['ApiError']])('exports %s', (name) => {
    expect((SDK as Record<string, unknown>)[name]).toBeDefined();
  });

  // Keeps the port-order aliases the umbrella entry published. Consumers import
  // these beside their own PortOrder types, where the unprefixed names collide.
  it('keeps the SDK-prefixed port-order type aliases resolvable', () => {
    // Types erase at runtime, so this asserts at compile time: the file would not
    // typecheck if the aliases stopped being exported.
    const check: import('../index').SDKPortOrderStatus | undefined = undefined;
    expect(check).toBeUndefined();
  });

  it.each([
    ['DialstackComponentsProvider'],
    ['useDialstackComponents'],
    ['useDialstack'],
    ['useCreateComponent'],
    ['useUpdateWithSetter'],
    ['CallLogs'],
    ['Voicemails'],
    ['CallHistory'],
    ['DialPlan'],
    ['PhoneNumberOrdering'],
    ['PhoneNumbers'],
    ['AIAgent'],
    ['OnboardingPortal'],
    ['Softphone'],
    ['SoftphoneProvider'],
  ])('does not export the React binding %s', (name) => {
    expect((SDK as Record<string, unknown>)[name]).toBeUndefined();
  });
});

describe('@dialstack/sdk-js/pure entry', () => {
  // The only difference between the two entries is registration: pure hands that to
  // the caller so it can be imported during SSR without defining custom elements.
  it('exports registerComponents, which the main entry does not', () => {
    expect(typeof Pure.registerComponents).toBe('function');
    expect((SDK as Record<string, unknown>)['registerComponents']).toBeUndefined();
  });

  it('exports the same initializer as the main entry', () => {
    expect(typeof Pure.loadDialstackAndInitialize).toBe('function');
  });

  it.each([['defaultIcons'], ['deviceReadiness'], ['isApiError'], ['defaultLocale']])(
    'shares %s with the main entry',
    (name) => {
      expect((Pure as Record<string, unknown>)[name]).toBeDefined();
    }
  );
});
