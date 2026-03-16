import React, { useRef, useEffect } from 'react';
import type { DialStackInstanceImpl } from '../../types/core';
import type { AppearanceOptions, LayoutVariant } from '../../types/appearance';
import { createMockInstance } from '../../__mocks__/mock-instance';

export interface WebComponentStoryProps {
  /** Component tag name without the 'dialstack-' prefix */
  tagName: string;
  theme?: 'light' | 'dark';
  layoutVariant?: LayoutVariant;
  empty?: boolean;
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
  setup,
}) => {
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const appearance: AppearanceOptions = { theme };
    const instance = createMockInstance(appearance, { empty });

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
