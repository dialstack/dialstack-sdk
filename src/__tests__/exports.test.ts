/**
 * Property-based tests for SDK exports
 */

import * as SDK from '../index';

describe('SDK Exports', () => {
  it('exports loadDialstackAndInitialize function', () => {
    expect(SDK.loadDialstackAndInitialize).toBeDefined();
    expect(typeof SDK.loadDialstackAndInitialize).toBe('function');
  });

  it('exports DialstackComponentsProvider component', () => {
    expect(SDK.DialstackComponentsProvider).toBeDefined();
  });

  it('exports useDialstackComponents hook', () => {
    expect(SDK.useDialstackComponents).toBeDefined();
    expect(typeof SDK.useDialstackComponents).toBe('function');
  });

  it('exports useCreateComponent hook', () => {
    expect(SDK.useCreateComponent).toBeDefined();
    expect(typeof SDK.useCreateComponent).toBe('function');
  });

  it('exports useUpdateWithSetter hook', () => {
    expect(SDK.useUpdateWithSetter).toBeDefined();
    expect(typeof SDK.useUpdateWithSetter).toBe('function');
  });

  it('exports CallLogs component', () => {
    expect(SDK.CallLogs).toBeDefined();
  });

  it('exports Voicemails component', () => {
    expect(SDK.Voicemails).toBeDefined();
  });

  describe('Naming conventions', () => {
    const reactComponentExports = [
      'DialstackComponentsProvider',
      'CallLogs',
      'Voicemails',
    ];

    const hookExports = [
      'useDialstackComponents',
      'useCreateComponent',
      'useUpdateWithSetter',
    ];

    const functionExports = ['loadDialstackAndInitialize'];

    it('all React component exports start with uppercase letter', () => {
      const allStartWithUppercase = reactComponentExports.every(
        (name) => /^[A-Z]/.test(name)
      );
      expect(allStartWithUppercase).toBe(true);
    });

    it('all hook exports start with "use"', () => {
      const allStartWithUse = hookExports.every(
        (name) => name.startsWith('use')
      );
      expect(allStartWithUse).toBe(true);
    });

    it('all function exports start with lowercase letter', () => {
      const allStartWithLowercase = functionExports.every(
        (name) => /^[a-z]/.test(name)
      );
      expect(allStartWithLowercase).toBe(true);
    });

    it('all exports exist in SDK', () => {
      const allExports = [...reactComponentExports, ...hookExports, ...functionExports];
      const allExist = allExports.every(
        (name) => (SDK as Record<string, unknown>)[name] !== undefined
      );
      expect(allExist).toBe(true);
    });
  });
});
