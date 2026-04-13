/**
 * useAppearance — subscribe to live appearance updates from a DialStack instance.
 *
 * React-only SDK components (no underlying custom element) use this hook so
 * that calls to `dialstack.update({ appearance })` re-render them with the
 * new theme/variables — mirroring the behavior web components get for free
 * via the `dialstack-appearance-update` event dispatched by the instance.
 */

import { useEffect, useState } from 'react';

import type { AppearanceOptions, DialStackInstance } from '../types';

/**
 * Returns the current `AppearanceOptions` for the given instance and re-runs
 * the host component whenever `dialstack.update()` changes appearance.
 */
export function useAppearance(dialstack: DialStackInstance): AppearanceOptions | undefined {
  const [appearance, setAppearance] = useState<AppearanceOptions | undefined>(() =>
    dialstack.getAppearance()
  );

  useEffect(() => {
    if (typeof document === 'undefined') return;

    const target = document.createElement('div');
    const handler = (event: Event) => {
      const detail = (event as CustomEvent<{ appearance: AppearanceOptions | undefined }>).detail;
      setAppearance(detail?.appearance);
    };
    target.addEventListener('dialstack-appearance-update', handler);

    dialstack.addAppearanceTarget(target);

    return () => {
      dialstack.removeAppearanceTarget(target);
      target.removeEventListener('dialstack-appearance-update', handler);
    };
  }, [dialstack]);

  return appearance;
}
