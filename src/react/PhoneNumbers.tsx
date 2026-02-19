/**
 * React wrapper for PhoneNumbers Web Component
 */

import React from 'react';
import { useDialstackComponents } from './DialstackComponentsProvider';
import { useCreateComponent } from './useCreateComponent';
import { useUpdateWithSetter } from './useUpdateWithSetter';
import type {
  LoaderStart,
  LoadError,
  PhoneNumberItem,
  PhoneNumbersClasses,
  FormattingOptions,
  ComponentIcons,
  LayoutVariant,
} from '../types';
import type { Locale } from '../locales';

export interface PhoneNumbersProps {
  /**
   * Optional CSS class name
   */
  className?: string;

  /**
   * Optional inline styles
   */
  style?: React.CSSProperties;

  /**
   * Maximum number of phone numbers per page (default: 10)
   */
  limit?: number;

  /**
   * Locale for UI strings
   */
  locale?: Locale;

  /**
   * Formatting options for dates and phone numbers
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
  classes?: PhoneNumbersClasses;

  /**
   * Callback when component starts loading
   */
  onLoaderStart?: (event: LoaderStart) => void;

  /**
   * Callback when there's an error loading phone numbers
   */
  onLoadError?: (event: LoadError) => void;

  /**
   * Callback when a row is clicked
   */
  onRowClick?: (event: { phoneNumber: string; item: PhoneNumberItem }) => void;
}

/**
 * PhoneNumbers component displays a unified list of all phone numbers for the authenticated account.
 *
 * Merges data from DIDs, number orders, and port orders into a single table with client-side pagination.
 *
 * Must be used within a DialstackComponentsProvider.
 *
 * @example
 * ```tsx
 * <DialstackComponentsProvider dialstack={dialstack}>
 *   <PhoneNumbers
 *     limit={20}
 *     onRowClick={(e) => console.log('Selected:', e.phoneNumber)}
 *   />
 * </DialstackComponentsProvider>
 * ```
 */
export const PhoneNumbers: React.FC<PhoneNumbersProps> = ({
  className,
  style,
  limit,
  locale,
  formatting,
  icons,
  layoutVariant,
  classes,
  onLoaderStart,
  onLoadError,
  onRowClick,
}) => {
  const { dialstack } = useDialstackComponents();
  const { containerRef, componentInstance } = useCreateComponent(dialstack, 'phone-numbers');

  // Sync data props to Web Component
  useUpdateWithSetter(componentInstance, limit, (comp, val) => comp.setLimit(val));

  // Sync configuration props
  useUpdateWithSetter(componentInstance, locale, (comp, val) => comp.setLocale(val));
  useUpdateWithSetter(componentInstance, formatting, (comp, val) => comp.setFormatting(val));
  useUpdateWithSetter(componentInstance, icons, (comp, val) => comp.setIcons(val));
  useUpdateWithSetter(componentInstance, layoutVariant, (comp, val) => comp.setLayoutVariant(val));
  useUpdateWithSetter(componentInstance, classes, (comp, val) => comp.setClasses(val));

  // Sync callbacks to Web Component
  useUpdateWithSetter(componentInstance, onLoaderStart, (comp, val) => comp.setOnLoaderStart(val));
  useUpdateWithSetter(componentInstance, onLoadError, (comp, val) => comp.setOnLoadError(val));
  useUpdateWithSetter(componentInstance, onRowClick, (comp, val) => comp.setOnRowClick(val));

  return <div ref={containerRef} className={className} style={style} />;
};
