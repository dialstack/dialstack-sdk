import React, { useRef, useEffect } from 'react';
import type { DialStackInstanceImpl } from '../../types/core';
import type { AppearanceOptions, LayoutVariant } from '../../types/appearance';
import type { DIDItem } from '../../types';
import { createMockInstance } from '../../__mocks__/mock-instance';

export interface WebComponentStoryProps {
  /** Component tag name without the 'dialstack-' prefix */
  tagName: string;
  theme?: 'light' | 'dark';
  layoutVariant?: LayoutVariant;
  empty?: boolean;
  /** Override DIDs returned by the mock instance */
  dids?: DIDItem[];
  /** Extra setup after setInstance (e.g. calling setUserId) */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  setup?: (el: any) => void;
}

/**
 * Helper that mounts a raw Web Component custom element inside a React story.
 */
export const WebComponentStory: React.FC<WebComponentStoryProps> = ({
  tagName,
  theme = 'light',
  layoutVariant,
  empty = false,
  dids,
  setup,
}) => {
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const appearance: AppearanceOptions = { theme };
    const rawInstance = createMockInstance(appearance, { empty, dids });
    // Wrap with logging proxy to trace API calls
    const instance = new Proxy(rawInstance, {
      get(target, prop, receiver) {
        const value = Reflect.get(target, prop, receiver);
        if (typeof value !== 'function' || typeof prop !== 'string') return value;
        if (['getAppearance', 'getClientSecret', 'create', 'update', 'on', 'off'].includes(prop))
          return value;
        return (...args: unknown[]) => {
          const t0 = performance.now();
          const result = value.apply(target, args);
          if (result && typeof result.then === 'function') {
            return result.then((res: unknown) => {
              const ms = (performance.now() - t0).toFixed(0);
              console.log(
                `%c[API] WC%c ${prop}%c (${ms}ms)`,
                'color:#e91e63;font-weight:bold',
                'color:#333;font-weight:bold',
                'color:#999',
                args.length ? args : ''
              );
              return res;
            });
          }
          return result;
        };
      },
    }) as DialStackInstanceImpl;

    const el = document.createElement(`dialstack-${tagName}`) as HTMLElement & {
      setInstance: (i: DialStackInstanceImpl) => void;
      setLayoutVariant?: (v: LayoutVariant) => void;
    };

    el.setInstance(instance);
    if (layoutVariant && el.setLayoutVariant) {
      el.setLayoutVariant(layoutVariant);
    }

    container.appendChild(el);

    if (setup) setup(el);

    return () => {
      container.removeChild(el);
    };
  }, [tagName, theme, layoutVariant, empty, setup]);

  return <div ref={containerRef} />;
};
