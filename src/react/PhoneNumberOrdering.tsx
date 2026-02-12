/**
 * React wrapper for PhoneNumberOrdering Web Component
 */

import React from 'react';
import { useDialstackComponents } from './DialstackComponentsProvider';
import { useCreateComponent } from './useCreateComponent';
import { useUpdateWithSetter } from './useUpdateWithSetter';
import type {
  LoaderStart,
  LoadError,
  FormattingOptions,
  ComponentIcons,
  LayoutVariant,
  NumberOrder,
  PhoneNumberOrderingClasses,
} from '../types';
import type { Locale } from '../locales';

export interface PhoneNumberOrderingProps {
  /**
   * Optional CSS class name
   */
  className?: string;

  /**
   * Optional inline styles
   */
  style?: React.CSSProperties;

  /**
   * Locale for UI strings
   */
  locale?: Locale;

  /**
   * Formatting options for phone numbers
   */
  formatting?: FormattingOptions;

  /**
   * Custom icons (partial override of defaults)
   */
  icons?: ComponentIcons;

  /**
   * Layout variant (compact, comfortable, default)
   */
  layoutVariant?: LayoutVariant;

  /**
   * Custom CSS classes for styling integration
   */
  classes?: PhoneNumberOrderingClasses;

  /**
   * Callback when component starts loading
   */
  onLoaderStart?: (event: LoaderStart) => void;

  /**
   * Callback when there's an error loading data
   */
  onLoadError?: (event: LoadError) => void;

  /**
   * Callback when an order is successfully placed
   */
  onOrderComplete?: (event: { orderId: string; order: NumberOrder }) => void;

  /**
   * Callback when an order fails
   */
  onOrderError?: (event: { error: string }) => void;
}

/**
 * PhoneNumberOrdering component enables searching and ordering phone numbers
 *
 * Multi-step flow: search → results → confirm → order → complete
 *
 * Must be used within a DialstackComponentsProvider.
 *
 * @example
 * ```tsx
 * <DialstackComponentsProvider dialstack={dialstack}>
 *   <PhoneNumberOrdering
 *     onOrderComplete={(e) => console.log('Ordered:', e.orderId)}
 *     onOrderError={(e) => console.error('Failed:', e.error)}
 *   />
 * </DialstackComponentsProvider>
 * ```
 */
export const PhoneNumberOrdering: React.FC<PhoneNumberOrderingProps> = ({
  className,
  style,
  locale,
  formatting,
  icons,
  layoutVariant,
  classes,
  onLoaderStart,
  onLoadError,
  onOrderComplete,
  onOrderError,
}) => {
  const { dialstack } = useDialstackComponents();
  const { containerRef, componentInstance } = useCreateComponent(
    dialstack,
    'phone-number-ordering'
  );

  // Sync configuration props
  useUpdateWithSetter(componentInstance, locale, (c, v) => c.setLocale(v));
  useUpdateWithSetter(componentInstance, formatting, (c, v) => c.setFormatting(v));
  useUpdateWithSetter(componentInstance, icons, (c, v) => c.setIcons(v));
  useUpdateWithSetter(componentInstance, layoutVariant, (c, v) => c.setLayoutVariant(v));
  useUpdateWithSetter(componentInstance, classes, (c, v) => c.setClasses(v));

  // Sync callbacks
  useUpdateWithSetter(componentInstance, onLoaderStart, (c, v) => c.setOnLoaderStart(v));
  useUpdateWithSetter(componentInstance, onLoadError, (c, v) => c.setOnLoadError(v));
  useUpdateWithSetter(componentInstance, onOrderComplete, (c, v) => c.setOnOrderComplete(v));
  useUpdateWithSetter(componentInstance, onOrderError, (c, v) => c.setOnOrderError(v));

  return <div ref={containerRef} className={className} style={style} />;
};
