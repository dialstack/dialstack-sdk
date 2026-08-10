/**
 * usePhone forwards `onTokenExpiring` to the constructed phone, and does so
 * without letting a changing callback identity retrigger the connect effect
 * (which would tear down + reconnect the socket). The refresh mechanism itself
 * is covered at the phone layer in
 * the softphone package's own `phone-token-refresh.test.ts`; here we only
 * assert the hook plumbs the option through the factory correctly.
 */

import { renderHook } from '@testing-library/react';
import type { DialStackPhone, PhoneOptions } from '@dialstack/sdk-webrtc';
import { usePhone, __setPhoneFactory } from '../softphone/hooks/usePhone';

class FakePhone {
  isConnected = false;
  on(): void {}
  off(): void {}
  connect(): Promise<void> {
    this.isConnected = true;
    return Promise.resolve();
  }
  disconnect(): void {
    this.isConnected = false;
  }
}

describe('usePhone onTokenExpiring forwarding', () => {
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

  it('forwards onTokenExpiring to the phone and invokes the latest callback', async () => {
    const first = jest.fn().mockResolvedValue('fresh-1');

    const { rerender } = renderHook(
      ({ cb }: { cb: () => Promise<string> }) =>
        usePhone({ token: 'tok', onTokenExpiring: cb, autoConnect: false }),
      { initialProps: { cb: first } }
    );

    expect(optionsSeen).toHaveLength(1);
    expect(typeof optionsSeen[0].onTokenExpiring).toBe('function');

    // A new callback identity must NOT reconstruct the phone (no reconnect)...
    const second = jest.fn().mockResolvedValue('fresh-2');
    rerender({ cb: second });
    expect(optionsSeen).toHaveLength(1);

    // ...yet the wrapper the phone holds must call the freshest callback.
    await optionsSeen[0].onTokenExpiring!();
    expect(first).not.toHaveBeenCalled();
    expect(second).toHaveBeenCalledTimes(1);
  });

  it('passes undefined when no onTokenExpiring is supplied', () => {
    renderHook(() => usePhone({ token: 'tok', autoConnect: false }));
    expect(optionsSeen).toHaveLength(1);
    expect(optionsSeen[0].onTokenExpiring).toBeUndefined();
  });
});
