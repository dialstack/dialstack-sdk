/**
 * Factory function for creating React wrapper components around Web Components
 *
 * This utility reduces boilerplate when creating new React component wrappers.
 * It handles the common patterns of:
 * - Creating the web component via useCreateComponent
 * - Syncing props to setters via useUpdateWithSetter
 * - Managing className and style props
 *
 * @example
 * ```tsx
 * // Define the component config
 * const CallLogs = createReactComponent<CallLogsProps>({
 *   tagName: 'call-logs',
 *   displayName: 'CallLogs',
 *   propSetters: {
 *     dateRange: 'setDateRange',
 *     limit: 'setLimit',
 *     locale: 'setLocale',
 *     formatting: 'setFormatting',
 *     onLoaderStart: 'setOnLoaderStart',
 *     onLoadError: 'setOnLoadError',
 *   },
 * });
 * ```
 */

import React from 'react';
import type { ComponentTagName } from '../core/types';
import { useDialstackComponents } from './DialstackComponentsProvider';
import { useCreateComponent } from './useCreateComponent';
import { useUpdateWithSetter } from './useUpdateWithSetter';

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
 * Creates a React component wrapper for a DialStack Web Component
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

    // Sync all props to their setters
    const entries = Object.keys(propSetters) as Array<keyof typeof propSetters>;
    entries.forEach((propName) => {
      const setterName = propSetters[propName];
      // eslint-disable-next-line react-hooks/rules-of-hooks
      useUpdateWithSetter(
        componentInstance,
        (restProps as Record<string, unknown>)[propName as string],
        setterName as string
      );
    });

    return <div ref={containerRef} className={className} style={style} />;
  };

  Component.displayName = displayName;

  return Component;
};

/**
 * Type helper for extracting prop types from a component config
 */
export type PropsFromConfig<T> = T extends ReactComponentConfig<infer P> ? P : never;
