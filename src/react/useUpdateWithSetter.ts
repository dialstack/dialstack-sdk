/**
 * React hook for synchronizing React props to Web Component setter methods
 *
 * This hook provides type-safe synchronization of React props to imperative
 * Web Component APIs.
 */

import { useEffect } from 'react';

/**
 * Hook that synchronizes a React prop value to a Web Component setter method
 *
 * This enables declarative React patterns (props) to control imperative
 * Web Component APIs (setter methods) in a type-safe way.
 *
 * @param component - The Web Component instance (or null if not mounted)
 * @param value - The prop value to sync
 * @param onUpdated - Callback that receives the component and value, should call the setter
 *
 * @example
 * ```tsx
 * const Voicemails = ({ userId, onVoicemailSelect }) => {
 *   const { containerRef, componentInstance } = useCreateComponent(dialstack, 'voicemails');
 *
 *   // Type-safe: TypeScript knows componentInstance has setUserId method
 *   useUpdateWithSetter(componentInstance, userId, (comp, val) => {
 *     comp.setUserId(val);
 *   });
 *
 *   useUpdateWithSetter(componentInstance, onVoicemailSelect, (comp, val) => {
 *     comp.setOnVoicemailSelect(val);
 *   });
 *
 *   return <div ref={containerRef} />;
 * };
 * ```
 */
export function useUpdateWithSetter<T extends HTMLElement, V>(
  component: T | null,
  value: V | undefined,
  onUpdated: (component: T, value: V) => void
): void {
  useEffect(() => {
    if (!component || value === undefined) return;

    try {
      onUpdated(component, value);
    } catch (error) {
      console.error('DialStack: Error calling setter:', error);
    }
  }, [component, value, onUpdated]);
}
