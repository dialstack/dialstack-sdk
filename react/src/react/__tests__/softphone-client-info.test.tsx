/**
 * The softphone reports itself to DialStack through the phone's `client`
 * option: via the components instance when one is present (so the signaling
 * connection carries the integration's packages and app info), else alone.
 */

import React from 'react';
import { render } from '@testing-library/react';
import { ClientInfo, type DialStackInstance } from '@dialstack/sdk-js';
import type { DialStackPhone, PhoneOptions } from '@dialstack/sdk-webrtc';
import { __setPhoneFactory } from '../softphone/hooks/usePhone';
import { SoftphoneProvider } from '../softphone';
import { DialstackComponentsProvider, useReportComponent } from '../DialstackComponentsProvider';
import { PACKAGE_VERSION } from '../version';

class FakePhone {
  isConnected = false;
  on(): void {}
  off(): void {}
  connect(): Promise<void> {
    return Promise.resolve();
  }
  disconnect(): void {}
}

describe('SoftphoneProvider client reporting', () => {
  let optionsSeen: PhoneOptions[];

  beforeEach(() => {
    optionsSeen = [];
    __setPhoneFactory((opts) => {
      optionsSeen.push(opts);
      return new FakePhone() as unknown as DialStackPhone;
    });
  });

  afterEach(() => {
    __setPhoneFactory(null);
  });

  it('reports sdk-react alone when rendered standalone', () => {
    render(<SoftphoneProvider token="tok" autoConnect={false} />);

    expect(optionsSeen[0]?.client).toBe(`sdk-react/${PACKAGE_VERSION};c=softphone`);
  });

  it('adds the appInfo prop when standalone', () => {
    render(
      <SoftphoneProvider
        token="tok"
        autoConnect={false}
        appInfo={{ name: 'acme', version: '1.0.0' }}
      />
    );

    expect(optionsSeen[0]?.client).toBe(`sdk-react/${PACKAGE_VERSION};c=softphone app/acme/1.0.0`);
  });

  it('registers on the instance and reports its header inside a components provider', () => {
    const dialstack = {
      getAppearance: () => undefined,
      on: jest.fn(),
      off: jest.fn(),
      addAppearanceTarget: jest.fn(),
      removeAppearanceTarget: jest.fn(),
      registerClientPackage: jest.fn(),
      registerClientComponent: jest.fn(),
      clientHeader: () => 'sdk-js/3.7.0 sdk-react/3.7.0;c=softphone app/acme/1.0.0',
    } as unknown as DialStackInstance;

    render(
      <DialstackComponentsProvider dialstack={dialstack}>
        <SoftphoneProvider token="tok" autoConnect={false} />
      </DialstackComponentsProvider>
    );

    expect(dialstack.registerClientComponent).toHaveBeenCalledWith('sdk-react', 'softphone');
    expect(optionsSeen[0]?.client).toBe('sdk-js/3.7.0 sdk-react/3.7.0;c=softphone app/acme/1.0.0');
  });

  // An instance whose registrations land in a real ClientInfo, so the header
  // reflects what was registered by the time it is read.
  function instanceBackedBy(info: ClientInfo): DialStackInstance {
    return {
      getAppearance: () => undefined,
      on: jest.fn(),
      off: jest.fn(),
      addAppearanceTarget: jest.fn(),
      removeAppearanceTarget: jest.fn(),
      registerClientPackage: (n: string, v: string) => info.registerPackage(n, v),
      registerClientComponent: (p: string, c: string) => info.registerComponent(p, c),
      clientHeader: () => info.header(),
    } as unknown as DialStackInstance;
  }

  it('reports the instance as-is inside a provider, ignoring the appInfo prop', () => {
    const info = new ClientInfo();
    info.registerPackage('sdk-js', '3.7.0');

    render(
      <DialstackComponentsProvider dialstack={instanceBackedBy(info)}>
        <SoftphoneProvider
          token="tok"
          autoConnect={false}
          appInfo={{ name: 'acme', version: '1.0.0' }}
        />
      </DialstackComponentsProvider>
    );

    expect(optionsSeen[0]?.client).toBe(`sdk-js/3.7.0 sdk-react/${PACKAGE_VERSION};c=softphone`);
  });

  it('includes components rendered after the softphone', () => {
    const Later = () => {
      useReportComponent('dial-plan');
      return null;
    };

    render(
      <DialstackComponentsProvider dialstack={instanceBackedBy(new ClientInfo())}>
        <SoftphoneProvider token="tok" autoConnect={false} />
        <Later />
      </DialstackComponentsProvider>
    );

    expect(optionsSeen[0]?.client).toBe(`sdk-react/${PACKAGE_VERSION};c=dial-plan,softphone`);
  });
});
