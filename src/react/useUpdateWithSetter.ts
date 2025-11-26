/**
 * React hook for synchronizing React props to Web Component setter methods
 */

import { useEffect } from 'react';

/**
 * Type representing a Web Component with setter methods
 * Using a looser type to allow HTMLElement subtypes
 */
type ComponentWithSetters = HTMLElement;

/**
 * Hook that synchronizes a React prop value to a Web Component setter method
 *
 * This enables declarative React patterns (props) to control imperative
 * Web Component APIs (setter methods).
 *
 * @param component - The Web Component instance
 * @param value - The prop value to sync
 * @param setterName - Name of the setter method on the component
 * @param onUpdated - Optional callback after setter is called
 *
 * @example
 * ```tsx
 * const Voicemails = ({ userId }) => {
 *   const { componentInstance } = useCreateComponent('voicemails');
 *   useUpdateWithSetter(componentInstance, userId, 'setUserId');
 *   return <div ref={containerRef} />;
 * };
 * ```
 */
export function useUpdateWithSetter<T>(
  component: ComponentWithSetters | null,
  value: T | undefined,
  setterName: string,
  onUpdated?: (value: T) => void
): void {
  useEffect(() => {
    if (!component || value === undefined) return;

    try {
      // Use bracket notation to access setter method dynamically
      const setter = (component as unknown as Record<string, unknown>)[setterName];
      if (typeof setter === 'function') {
        (setter as (value: T) => void).call(component, value);
        onUpdated?.(value);
      } else {
        console.warn(`DialStack: Setter method "${setterName}" not found on component`);
      }
    } catch (error) {
      console.error(`DialStack: Error calling ${setterName}:`, error);
    }
  }, [component, value, setterName, onUpdated]);
}
