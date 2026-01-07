/**
 * Tests for useUpdateWithSetter hook
 */

import { renderHook } from '@testing-library/react';
import { useUpdateWithSetter } from '../useUpdateWithSetter';

describe('useUpdateWithSetter', () => {
  it('calls onUpdated callback when component and value are present', () => {
    const mockSetter = jest.fn();
    const mockComponent = {
      setUserId: mockSetter,
    } as unknown as HTMLElement & { setUserId: (val: string) => void };

    renderHook(() =>
      useUpdateWithSetter(mockComponent, 'user-123', (comp, val) => comp.setUserId(val))
    );

    expect(mockSetter).toHaveBeenCalledWith('user-123');
  });

  it('does not call onUpdated when component is null', () => {
    const mockCallback = jest.fn();

    renderHook(() => useUpdateWithSetter(null, 'user-123', mockCallback));

    expect(mockCallback).not.toHaveBeenCalled();
  });

  it('does not call onUpdated when value is undefined', () => {
    const mockSetter = jest.fn();
    const mockComponent = {
      setUserId: mockSetter,
    } as unknown as HTMLElement & { setUserId: (val: string) => void };

    renderHook(() =>
      useUpdateWithSetter(mockComponent, undefined, (comp, val) => comp.setUserId(val))
    );

    expect(mockSetter).not.toHaveBeenCalled();
  });

  it('handles errors gracefully when callback throws', () => {
    const errorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
    const mockComponent = {} as HTMLElement;

    // Should not throw
    expect(() => {
      renderHook(() =>
        useUpdateWithSetter(mockComponent, 'user-123', () => {
          throw new Error('Callback error');
        })
      );
    }).not.toThrow();

    expect(errorSpy).toHaveBeenCalledWith(
      expect.stringContaining('Error calling setter'),
      expect.any(Error)
    );
    errorSpy.mockRestore();
  });

  it('updates when value changes', () => {
    const mockSetter = jest.fn();
    const mockComponent = {
      setUserId: mockSetter,
    } as unknown as HTMLElement & { setUserId: (val: string) => void };

    const { rerender } = renderHook(
      ({ value }) =>
        useUpdateWithSetter(mockComponent, value, (comp, val) => comp.setUserId(val)),
      { initialProps: { value: 'user-123' as string | undefined } }
    );

    expect(mockSetter).toHaveBeenCalledWith('user-123');

    rerender({ value: 'user-456' });

    expect(mockSetter).toHaveBeenCalledWith('user-456');
    expect(mockSetter).toHaveBeenCalledTimes(2);
  });

  it('receives correct component and value in callback', () => {
    const mockCallback = jest.fn();
    const mockComponent = document.createElement('div');
    const testValue = { id: 'test', name: 'Test User' };

    renderHook(() => useUpdateWithSetter(mockComponent, testValue, mockCallback));

    expect(mockCallback).toHaveBeenCalledWith(mockComponent, testValue);
  });
});
