/**
 * React hook for creating and managing Web Components
 */

import { useEffect, useRef } from 'react';
import { BaseComponent } from '../components/base-component';

export interface UseCreateComponentOptions {
  clientSecret: string;
}

/**
 * Hook to create and manage a Web Component instance
 */
export function useCreateComponent<T extends BaseComponent>(
  ComponentClass: { new(): T },
  options: UseCreateComponentOptions
): React.RefObject<HTMLDivElement> {
  const containerRef = useRef<HTMLDivElement>(null);
  const componentRef = useRef<T | null>(null);

  useEffect(() => {
    if (!containerRef.current) return;

    // Create component instance
    const component = new ComponentClass();
    component.setClientSecret(options.clientSecret);

    // Append to container
    containerRef.current.appendChild(component);
    componentRef.current = component;

    // Cleanup on unmount
    return () => {
      if (componentRef.current && componentRef.current.parentNode) {
        componentRef.current.parentNode.removeChild(componentRef.current);
      }
    };
  }, [options.clientSecret]);

  return containerRef;
}
