/**
 * Tests for useUpdateWithSetter hook
 */

import { renderHook } from '@testing-library/react';
import { useUpdateWithSetter } from '../useUpdateWithSetter';

describe('useUpdateWithSetter', () => {
  it('calls setter when component and value are present', () => {
    const mockSetter = jest.fn();
    const mockComponent = {
      setUserId: mockSetter,
    } as unknown as HTMLElement & Record<string, unknown>;

    renderHook(() => useUpdateWithSetter(mockComponent, 'user-123', 'setUserId'));

    expect(mockSetter).toHaveBeenCalledWith('user-123');
  });

  it('does not call setter when component is null', () => {
    const mockSetter = jest.fn();

    renderHook(() => useUpdateWithSetter(null, 'user-123', 'setUserId'));

    expect(mockSetter).not.toHaveBeenCalled();
  });

  it('does not call setter when value is undefined', () => {
    const mockSetter = jest.fn();
    const mockComponent = {
      setUserId: mockSetter,
    } as unknown as HTMLElement & Record<string, unknown>;

    renderHook(() => useUpdateWithSetter(mockComponent, undefined, 'setUserId'));

    expect(mockSetter).not.toHaveBeenCalled();
  });

  it('calls onUpdated callback after setter is called', () => {
    const mockSetter = jest.fn();
    const mockOnUpdated = jest.fn();
    const mockComponent = {
      setUserId: mockSetter,
    } as unknown as HTMLElement & Record<string, unknown>;

    renderHook(() => useUpdateWithSetter(mockComponent, 'user-123', 'setUserId', mockOnUpdated));

    expect(mockSetter).toHaveBeenCalledWith('user-123');
    expect(mockOnUpdated).toHaveBeenCalledWith('user-123');
  });

  it('logs warning when setter method not found', () => {
    const warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});
    const mockComponent = {} as unknown as HTMLElement & Record<string, unknown>;

    renderHook(() => useUpdateWithSetter(mockComponent, 'user-123', 'setUserId'));

    expect(warnSpy).toHaveBeenCalledWith(
      expect.stringContaining('Setter method "setUserId" not found')
    );
    warnSpy.mockRestore();
  });

  it('handles errors gracefully when setter throws', () => {
    const errorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
    const mockComponent = {
      setUserId: jest.fn(() => {
        throw new Error('Setter error');
      }),
    } as unknown as HTMLElement & Record<string, unknown>;

    // Should not throw
    expect(() => {
      renderHook(() => useUpdateWithSetter(mockComponent, 'user-123', 'setUserId'));
    }).not.toThrow();

    expect(errorSpy).toHaveBeenCalledWith(
      expect.stringContaining('Error calling setUserId'),
      expect.any(Error)
    );
    errorSpy.mockRestore();
  });

  it('updates when value changes', () => {
    const mockSetter = jest.fn();
    const mockComponent = {
      setUserId: mockSetter,
    } as unknown as HTMLElement & Record<string, unknown>;

    const { rerender } = renderHook(
      ({ value }) => useUpdateWithSetter(mockComponent, value, 'setUserId'),
      { initialProps: { value: 'user-123' } }
    );

    expect(mockSetter).toHaveBeenCalledWith('user-123');

    rerender({ value: 'user-456' });

    expect(mockSetter).toHaveBeenCalledWith('user-456');
    expect(mockSetter).toHaveBeenCalledTimes(2);
  });
});
