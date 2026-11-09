import React from 'react';
import { render, renderHook } from '@testing-library/react';

import { SoftphoneContext, type SoftphoneContextBase } from '../../provider/SoftphoneProviderBase';
import { useHostTierProbe, useRoomyHost } from '../views/useRoomyHost';

const withVariant = (layoutVariant: SoftphoneContextBase['layoutVariant']) => {
  const Wrapper: React.FC<{ children: React.ReactNode }> = ({ children }) => (
    <SoftphoneContext.Provider value={{ layoutVariant } as SoftphoneContextBase}>
      {children}
    </SoftphoneContext.Provider>
  );
  return Wrapper;
};

describe('useRoomyHost', () => {
  it('starts on the full tier outside a provider', () => {
    const { result } = renderHook(() => useRoomyHost<HTMLDivElement>());
    expect(result.current.roomy).toBe(true);
  });

  it('starts compact when the provider pins it', () => {
    const { result } = renderHook(() => useRoomyHost<HTMLDivElement>(), {
      wrapper: withVariant('compact'),
    });
    expect(result.current.roomy).toBe(false);
  });
});

describe('useHostTierProbe', () => {
  const Probe: React.FC<{ onTier: (roomy: boolean) => void }> = ({ onTier }) => {
    const { ref, roomy } = useHostTierProbe<HTMLSpanElement>();
    onTier(roomy);
    return <span ref={ref} hidden />;
  };

  // jsdom has no layout: the host reports `height` normally and `emptyHeight`
  // under size containment, as a browser would for a host laid out empty.
  const tierFor = (height: number, emptyHeight: number) => {
    const host = document.createElement('div');
    document.body.appendChild(host);
    host.getBoundingClientRect = () =>
      ({ width: 320, height: host.style.contain === 'size' ? emptyHeight : height }) as DOMRect;
    let roomy: boolean | undefined;
    render(<Probe onTier={(value) => (roomy = value)} />, { container: host });
    return { roomy, compactClass: host.classList.contains('ds-host-small') };
  };

  beforeAll(() => {
    global.ResizeObserver = class {
      observe() {}
      disconnect() {}
      unobserve() {}
    } as unknown as typeof ResizeObserver;
  });

  it('keeps the full tier in a host whose height follows its content', () => {
    // The compact in-call screen is shorter than the minimum; that must not
    // pin the compact tier when nothing outside sets the host's height.
    expect(tierFor(417, 0)).toEqual({ roomy: true, compactClass: false });
  });

  it('goes compact in a host whose short height is imposed', () => {
    expect(tierFor(420, 420)).toEqual({ roomy: false, compactClass: true });
  });

  it('keeps the full tier in a host whose imposed height is enough', () => {
    expect(tierFor(600, 600)).toEqual({ roomy: true, compactClass: false });
  });
});
