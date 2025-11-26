/**
 * React hook for creating and managing Web Components
 */

import { useLayoutEffect, useRef, useState } from 'react';
import type { ComponentTagName, ComponentElement, DialStackInstance } from '../core/types';

// Injected at build time by Rollup
declare const _NPM_PACKAGE_VERSION_: string;

/**
 * Return type for useCreateComponent hook - properly typed based on tag name
 */
export interface UseCreateComponentResult<T extends ComponentTagName> {
  containerRef: React.RefObject<HTMLDivElement>;
  componentInstance: ComponentElement[T] | null;
}

/**
 * Hook to create and manage a Web Component instance
 *
 * Uses useLayoutEffect for synchronous component creation,
 * creates components using dialstack.create(), and handles
 * cleanup on unmount.
 *
 * @param dialstack - The DialStack instance
 * @param tagName - The component tag name (e.g., 'call-logs', 'voicemails')
 * @returns Object with containerRef and properly typed componentInstance
 *
 * @example
 * ```tsx
 * const { containerRef, componentInstance } = useCreateComponent(dialstack, 'voicemails');
 * // componentInstance is typed as VoicemailsElement | null
 * // TypeScript knows about setUserId, setOnVoicemailPlay, etc.
 * ```
 */
export function useCreateComponent<T extends ComponentTagName>(
  dialstack: DialStackInstance,
  tagName: T
): UseCreateComponentResult<T> {
  const containerRef = useRef<HTMLDivElement>(null);
  const componentRef = useRef<ComponentElement[T] | null>(null);
  // Use state to trigger re-render when component is created
  const [componentInstance, setComponentInstance] = useState<ComponentElement[T] | null>(null);

  useLayoutEffect(() => {
    if (!containerRef.current) return;

    // Create component using DialStack SDK
    const component = dialstack.create(tagName);

    // Set SDK version for analytics
    try {
      component.setAttribute('data-dialstack-sdk-version', _NPM_PACKAGE_VERSION_);
    } catch (e) {
      console.log('Error setting SDK version attribute:', e);
    }

    // Append to container
    containerRef.current.appendChild(component as Node);
    componentRef.current = component;
    setComponentInstance(component);

    // Cleanup on unmount
    return () => {
      if (componentRef.current && componentRef.current.parentNode) {
        componentRef.current.parentNode.removeChild(componentRef.current);
      }
    };
  }, [dialstack, tagName]);

  return {
    containerRef,
    componentInstance,
  };
}
