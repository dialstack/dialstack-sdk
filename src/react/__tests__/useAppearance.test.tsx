/**
 * Tests for useAppearance hook
 */

import { act, renderHook } from '@testing-library/react';

import type { AppearanceOptions, DialStackInstance } from '../../types';
import { useAppearance } from '../useAppearance';

function createFakeInstance(initial?: AppearanceOptions) {
  let appearance = initial;
  const targets = new Set<HTMLElement>();

  const instance = {
    getAppearance: () => appearance,
    addAppearanceTarget: jest.fn((el: HTMLElement) => {
      targets.add(el);
    }),
    removeAppearanceTarget: jest.fn((el: HTMLElement) => {
      targets.delete(el);
    }),
    update: (next: AppearanceOptions | undefined) => {
      appearance = next;
      targets.forEach((target) => {
        target.dispatchEvent(
          new CustomEvent('dialstack-appearance-update', { detail: { appearance: next } })
        );
      });
    },
  };

  return { instance: instance as unknown as DialStackInstance, targets };
}

describe('useAppearance', () => {
  it('returns the initial appearance from getAppearance()', () => {
    const { instance } = createFakeInstance({ theme: 'light' });
    const { result } = renderHook(() => useAppearance(instance));
    expect(result.current).toEqual({ theme: 'light' });
  });

  it('re-renders with the new appearance when an update is dispatched', () => {
    const { instance } = createFakeInstance({ theme: 'light' });
    const { result } = renderHook(() => useAppearance(instance));

    expect(result.current?.theme).toBe('light');

    act(() => {
      (instance as unknown as { update: (a: AppearanceOptions) => void }).update({ theme: 'dark' });
    });

    expect(result.current?.theme).toBe('dark');
  });

  it('registers a target on mount and unregisters it on unmount', () => {
    const { instance, targets } = createFakeInstance({ theme: 'light' });
    const { unmount } = renderHook(() => useAppearance(instance));

    expect(instance.addAppearanceTarget).toHaveBeenCalledTimes(1);
    expect(targets.size).toBe(1);

    unmount();

    expect(instance.removeAppearanceTarget).toHaveBeenCalledTimes(1);
    expect(targets.size).toBe(0);
  });
});
