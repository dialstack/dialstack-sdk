import React from 'react';
import { renderHook } from '@testing-library/react';

import { SoftphoneContext, type SoftphoneContextBase } from '../../provider/SoftphoneProviderBase';
import { useRoomyHost } from '../views/useRoomyHost';

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
