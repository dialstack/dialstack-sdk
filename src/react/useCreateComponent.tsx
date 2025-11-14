/**
 * React hook for creating and managing Web Components
 */

import { useLayoutEffect, useRef } from 'react';
import type { ComponentTagName, ComponentElement, DialStackInstance } from '../core/types';

/**
 * Hook to create and manage a Web Component instance
 *
 * Uses useLayoutEffect for synchronous component creation,
 * creates components using dialstack.create(), and handles
 * cleanup on unmount.
 *
 * @param dialstack - The DialStack instance
 * @param tagName - The component tag name (e.g., 'call-logs', 'voicemails')
 * @returns Ref to attach to a container div
 */
export function useCreateComponent<T extends ComponentTagName>(
  dialstack: DialStackInstance,
  tagName: T
): React.RefObject<HTMLDivElement> {
  const containerRef = useRef<HTMLDivElement>(null);
  const componentRef = useRef<ComponentElement[T] | null>(null);

  useLayoutEffect(() => {
    if (!containerRef.current) return;

    // Create component using DialStack SDK
    const component = dialstack.create(tagName);

    // Append to container
    containerRef.current.appendChild(component as Node);
    componentRef.current = component;

    // Cleanup on unmount
    return () => {
      if (componentRef.current && componentRef.current.parentNode) {
        componentRef.current.parentNode.removeChild(componentRef.current);
      }
    };
  }, [dialstack, tagName]);

  return containerRef;
}
