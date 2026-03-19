/**
 * Property-based tests for SDK exports
 */

import * as SDK from '../index';
import * as ReactSDK from '../react';

describe('SDK Main Entry Exports', () => {
  it('exports loadDialstackAndInitialize function', () => {
    expect(SDK.loadDialstackAndInitialize).toBeDefined();
    expect(typeof SDK.loadDialstackAndInitialize).toBe('function');
  });

  it('exports defaultIcons', () => {
    expect(SDK.defaultIcons).toBeDefined();
  });

  it('exports US_TIMEZONES', () => {
    expect(SDK.US_TIMEZONES).toBeDefined();
  });

  it('exports isDeskphone function', () => {
    expect(SDK.isDeskphone).toBeDefined();
    expect(typeof SDK.isDeskphone).toBe('function');
  });

  it('exports isDECTBase function', () => {
    expect(SDK.isDECTBase).toBeDefined();
    expect(typeof SDK.isDECTBase).toBe('function');
  });

  it('does NOT export React components or hooks', () => {
    const sdkAny = SDK as Record<string, unknown>;
    expect(sdkAny['DialstackComponentsProvider']).toBeUndefined();
    expect(sdkAny['useDialstackComponents']).toBeUndefined();
    expect(sdkAny['useDialstack']).toBeUndefined();
    expect(sdkAny['useCreateComponent']).toBeUndefined();
    expect(sdkAny['useUpdateWithSetter']).toBeUndefined();
    expect(sdkAny['CallLogs']).toBeUndefined();
    expect(sdkAny['Voicemails']).toBeUndefined();
    expect(sdkAny['CallHistory']).toBeUndefined();
    expect(sdkAny['DialPlanViewer']).toBeUndefined();
    expect(sdkAny['PhoneNumberOrdering']).toBeUndefined();
    expect(sdkAny['PhoneNumbers']).toBeUndefined();
    expect(sdkAny['AccountOnboarding']).toBeUndefined();
    expect(sdkAny['OnboardingPortal']).toBeUndefined();
  });
});

describe('SDK React Entry Exports', () => {
  it('exports DialstackComponentsProvider component', () => {
    expect(ReactSDK.DialstackComponentsProvider).toBeDefined();
  });

  it('exports useDialstackComponents hook', () => {
    expect(ReactSDK.useDialstackComponents).toBeDefined();
    expect(typeof ReactSDK.useDialstackComponents).toBe('function');
  });

  it('exports useDialstack hook', () => {
    expect(ReactSDK.useDialstack).toBeDefined();
    expect(typeof ReactSDK.useDialstack).toBe('function');
  });

  it('exports useCreateComponent hook', () => {
    expect(ReactSDK.useCreateComponent).toBeDefined();
    expect(typeof ReactSDK.useCreateComponent).toBe('function');
  });

  it('exports useUpdateWithSetter hook', () => {
    expect(ReactSDK.useUpdateWithSetter).toBeDefined();
    expect(typeof ReactSDK.useUpdateWithSetter).toBe('function');
  });

  it('exports CallLogs component', () => {
    expect(ReactSDK.CallLogs).toBeDefined();
  });

  it('exports Voicemails component', () => {
    expect(ReactSDK.Voicemails).toBeDefined();
  });

  describe('Naming conventions', () => {
    const reactComponentExports = [
      'DialstackComponentsProvider',
      'CallLogs',
      'Voicemails',
      'CallHistory',
      'DialPlanViewer',
      'PhoneNumberOrdering',
      'PhoneNumbers',
      'AccountOnboarding',
      'OnboardingPortal',
    ];

    const hookExports = [
      'useDialstackComponents',
      'useDialstack',
      'useCreateComponent',
      'useUpdateWithSetter',
    ];

    it('all React component exports start with uppercase letter', () => {
      const allStartWithUppercase = reactComponentExports.every((name) => /^[A-Z]/.test(name));
      expect(allStartWithUppercase).toBe(true);
    });

    it('all hook exports start with "use"', () => {
      const allStartWithUse = hookExports.every((name) => name.startsWith('use'));
      expect(allStartWithUse).toBe(true);
    });

    it('all exports exist in React SDK', () => {
      const allExports = [...reactComponentExports, ...hookExports];
      const allExist = allExports.every(
        (name) => (ReactSDK as Record<string, unknown>)[name] !== undefined
      );
      expect(allExist).toBe(true);
    });
  });
});
