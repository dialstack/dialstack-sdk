/**
 * React hook for creating and managing Web Components
 */

import { useCallback, useRef, useState } from 'react';
import type { ComponentTagName, ComponentElement, DialStackInstance } from '../types';

// Injected at build time by Rollup
declare const _NPM_PACKAGE_VERSION_: string;

/**
 * Return type for useCreateComponent hook - properly typed based on tag name
 */
export interface UseCreateComponentResult<T extends ComponentTagName> {
  containerRef: React.RefCallback<HTMLDivElement>;
  componentInstance: ComponentElement[T] | null;
}

/**
 * Hook to create and manage a Web Component instance
 *
 * Uses a callback ref pattern for synchronous component creation when the
 * container mounts. Creates components using dialstack.create() and handles
 * cleanup when the container unmounts or when dependencies change.
 *
 * @param dialstack - The DialStack instance
 * @param tagName - The component tag name (e.g., 'call-logs', 'voicemails')
 * @returns Object with containerRef (callback) and properly typed componentInstance
 *
 * @example
 * ```tsx
 * const { containerRef, componentInstance } = useCreateComponent(dialstack, 'voicemails');
 * // containerRef is a callback ref to attach to the container div
 * // componentInstance is typed as VoicemailsElement | null
 * // TypeScript knows about setUserId, setOnVoicemailPlay, etc.
 * ```
 */
export function useCreateComponent<T extends ComponentTagName>(
  dialstack: DialStackInstance,
  tagName: T
): UseCreateComponentResult<T> {
  const componentRef = useRef<ComponentElement[T] | null>(null);
  // Use state to trigger re-render when component is created
  const [componentInstance, setComponentInstance] = useState<ComponentElement[T] | null>(null);

  // Use callback ref to create component when container mounts
  const containerRef = useCallback(
    (container: HTMLDivElement | null) => {
      // Cleanup previous component if it exists
      if (componentRef.current && componentRef.current.parentNode) {
        componentRef.current.parentNode.removeChild(componentRef.current);
        componentRef.current = null;
        setComponentInstance(null);
      }

      if (!container) return;

      // Create component using DialStack SDK
      const component = dialstack.create(tagName);

      // Set SDK version for analytics
      try {
        component.setAttribute('data-dialstack-sdk-version', _NPM_PACKAGE_VERSION_);
      } catch (e) {
        console.log('Error setting SDK version attribute:', e);
      }

      // Append to container
      container.appendChild(component as Node);
      componentRef.current = component;
      setComponentInstance(component);
    },
    [dialstack, tagName]
  );

  return {
    containerRef,
    componentInstance,
  };
}
