/**
 * Factory function for creating React wrapper components around Web Components
 *
 * @deprecated This factory is deprecated. Use the explicit type-safe pattern instead:
 *
 * ```tsx
 * // Preferred: Explicit component with type-safe callbacks
 * export const MyComponent: React.FC<MyProps> = (props) => {
 *   const { dialstack } = useDialstackComponents();
 *   const { containerRef, componentInstance } = useCreateComponent(dialstack, 'my-component');
 *
 *   // Type-safe: TypeScript knows setMyProp exists
 *   useUpdateWithSetter(componentInstance, props.myProp, (comp, val) => comp.setMyProp(val));
 *
 *   return <div ref={containerRef} />;
 * };
 * ```
 *
 * The factory pattern cannot provide the same level of type safety.
 */

import React, { useEffect } from 'react';
import type { ComponentTagName, ComponentElement } from '../core/types';
import { useDialstackComponents } from './DialstackComponentsProvider';
import { useCreateComponent } from './useCreateComponent';

/**
 * Base props that all components support
 */
export interface BaseComponentProps {
  /**
   * Optional CSS class name
   */
  className?: string;

  /**
   * Optional inline styles
   */
  style?: React.CSSProperties;
}

/**
 * Configuration for creating a React component wrapper
 *
 * @deprecated Use explicit components with useUpdateWithSetter callback pattern
 */
export interface ReactComponentConfig<TProps extends BaseComponentProps> {
  /**
   * The web component tag name (e.g., 'call-logs', 'voicemails')
   */
  tagName: ComponentTagName;

  /**
   * Display name for React DevTools
   */
  displayName: string;

  /**
   * Mapping of prop names to setter method names on the web component
   * Keys are prop names, values are setter method names
   */
  propSetters: {
    [K in keyof Omit<TProps, keyof BaseComponentProps>]?: string;
  };
}

/**
 * Internal hook to sync a prop value to a setter method by name
 * This is the old string-based approach, kept for backward compatibility
 *
 * @deprecated Use useUpdateWithSetter with callback pattern instead
 */
function useStringBasedSetter<T extends ComponentTagName>(
  component: ComponentElement[T] | null,
  value: unknown,
  setterName: string
): void {
  useEffect(() => {
    if (!component || value === undefined) return;

    try {
      // Use bracket notation to access setter method dynamically
      const setter = (component as unknown as Record<string, unknown>)[setterName];
      if (typeof setter === 'function') {
        (setter as (value: unknown) => void).call(component, value);
      } else {
        console.warn(`DialStack: Setter method "${setterName}" not found on component`);
      }
    } catch (error) {
      console.error(`DialStack: Error calling ${setterName}:`, error);
    }
  }, [component, value, setterName]);
}

/**
 * Creates a React component wrapper for a DialStack Web Component
 *
 * @deprecated Use explicit components with useUpdateWithSetter callback pattern for type safety.
 *
 * This factory handles the common boilerplate of:
 * - Using the DialStack context
 * - Creating the web component
 * - Syncing props to the component via setter methods
 *
 * @param config - Configuration for the component
 * @returns A React functional component
 */
export const createReactComponent = <TProps extends BaseComponentProps>(
  config: ReactComponentConfig<TProps>
): React.FC<TProps> => {
  const { tagName, displayName, propSetters } = config;

  const Component: React.FC<TProps> = (props) => {
    const { className, style, ...restProps } = props;
    const { dialstack } = useDialstackComponents();
    const { containerRef, componentInstance } = useCreateComponent(dialstack, tagName);

    // Sync all props to their setters using the old string-based approach
    const entries = Object.keys(propSetters) as Array<keyof typeof propSetters>;
    entries.forEach((propName) => {
      const setterName = propSetters[propName];
      if (setterName) {
        // eslint-disable-next-line react-hooks/rules-of-hooks
        useStringBasedSetter(
          componentInstance,
          (restProps as Record<string, unknown>)[propName as string],
          setterName
        );
      }
    });

    return <div ref={containerRef} className={className} style={style} />;
  };

  Component.displayName = displayName;

  return Component;
};

/**
 * Type helper for extracting prop types from a component config
 *
 * @deprecated Use explicit component typing instead
 */
export type PropsFromConfig<T> = T extends ReactComponentConfig<infer P> ? P : never;
