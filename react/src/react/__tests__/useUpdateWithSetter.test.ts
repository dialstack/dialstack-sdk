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
      ({ value }) => useUpdateWithSetter(mockComponent, value, (comp, val) => comp.setUserId(val)),
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
  // Wrappers pass the setter inline, so it is a new function every render; a
  // host re-rendering on a timer must not re-apply an unchanged prop.
  it('does not re-apply the same value when only the setter closure is new', () => {
    const mockSetter = jest.fn();
    const mockComponent = { setLimit: mockSetter } as unknown as HTMLElement & {
      setLimit: (val: number) => void;
    };

    const { rerender } = renderHook(() =>
      useUpdateWithSetter(mockComponent, 3, (comp, val) => comp.setLimit(val))
    );
    rerender();
    rerender();

    expect(mockSetter).toHaveBeenCalledTimes(1);
  });

  it('does not re-apply the same object', () => {
    const mockSetter = jest.fn();
    const mockComponent = { setClasses: mockSetter } as unknown as HTMLElement & {
      setClasses: (val: Record<string, string>) => void;
    };
    const classes = { base: 'rounded-lg' };

    const { rerender } = renderHook(() =>
      useUpdateWithSetter(mockComponent, classes, (comp, val) => comp.setClasses(val))
    );
    rerender();

    expect(mockSetter).toHaveBeenCalledTimes(1);
  });

  it('re-applies an object whose contents changed', () => {
    const mockSetter = jest.fn();
    const mockComponent = { setClasses: mockSetter } as unknown as HTMLElement & {
      setClasses: (val: Record<string, string>) => void;
    };

    const { rerender } = renderHook(
      ({ base }) =>
        useUpdateWithSetter(mockComponent, { base }, (comp, val) => comp.setClasses(val)),
      { initialProps: { base: 'a' } }
    );
    rerender({ base: 'b' });

    expect(mockSetter).toHaveBeenLastCalledWith({ base: 'b' });
    expect(mockSetter).toHaveBeenCalledTimes(2);
  });

  // A new callback closes over the host's latest state, so it must reach the
  // element even though it does the same thing.
  it('re-applies a new callback', () => {
    const mockSetter = jest.fn();
    const mockComponent = { setOnRowClick: mockSetter } as unknown as HTMLElement & {
      setOnRowClick: (val: () => void) => void;
    };

    const { rerender } = renderHook(() =>
      useUpdateWithSetter(
        mockComponent,
        () => {},
        (comp, val) => comp.setOnRowClick(val)
      )
    );
    rerender();

    expect(mockSetter).toHaveBeenCalledTimes(2);
  });

  it('re-applies every value to a new component instance', () => {
    const first = jest.fn();
    const second = jest.fn();
    const make = (setLimit: jest.Mock) =>
      ({ setLimit }) as unknown as HTMLElement & { setLimit: (val: number) => void };

    const { rerender } = renderHook(
      ({ comp }) => useUpdateWithSetter(comp, 3, (c, val) => c.setLimit(val)),
      { initialProps: { comp: make(first) } }
    );
    rerender({ comp: make(second) });

    expect(first).toHaveBeenCalledTimes(1);
    expect(second).toHaveBeenCalledWith(3);
  });
  it('logs a throwing setter once per value, not on every render', () => {
    const errorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
    const setter = jest.fn(() => {
      throw new Error('bad value');
    });
    const mockComponent = { setLimit: setter } as unknown as HTMLElement & {
      setLimit: (val: number) => void;
    };

    const { rerender } = renderHook(() =>
      useUpdateWithSetter(mockComponent, 3, (comp, val) => comp.setLimit(val))
    );
    rerender();
    rerender();

    expect(setter).toHaveBeenCalledTimes(1);
    expect(errorSpy).toHaveBeenCalledTimes(1);
    errorSpy.mockRestore();
  });
});
