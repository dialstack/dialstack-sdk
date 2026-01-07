/**
 * React wrapper for CallHistory Web Component
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
  CallHistoryDisplayOptions,
  CallHistoryClasses,
} from '../types';
import type { Locale } from '../locales';

export interface CallHistoryProps {
  /**
   * Phone number to fetch call history for (E.164 format, required)
   */
  phoneNumber: string;

  /**
   * Maximum number of calls to display
   * @default 5
   */
  limit?: number;

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
   * Formatting options for dates
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
   *
   * @example
   * ```tsx
   * <CallHistory
   *   classes={{
   *     base: 'rounded-lg',
   *     item: 'hover:bg-gray-50',
   *     itemMissed: 'bg-red-50'
   *   }}
   * />
   * ```
   */
  classes?: CallHistoryClasses;

  /**
   * Display options for controlling field visibility
   */
  displayOptions?: CallHistoryDisplayOptions;

  /**
   * Callback when component starts loading
   */
  onLoaderStart?: (event: LoaderStart) => void;

  /**
   * Callback when there's an error loading call history
   */
  onLoadError?: (event: LoadError) => void;
}

/**
 * CallHistory component displays recent calls for a specific phone number
 *
 * Must be used within a DialstackComponentsProvider.
 *
 * @example
 * ```tsx
 * <DialstackComponentsProvider dialstack={dialstack}>
 *   <CallHistory
 *     phoneNumber="+14155551234"
 *     limit={5}
 *   />
 * </DialstackComponentsProvider>
 * ```
 */
export const CallHistory: React.FC<CallHistoryProps> = ({
  phoneNumber,
  limit,
  className,
  style,
  locale,
  formatting,
  icons,
  layoutVariant,
  classes,
  displayOptions,
  onLoaderStart,
  onLoadError,
}) => {
  const { dialstack } = useDialstackComponents();
  const { containerRef, componentInstance } = useCreateComponent(dialstack, 'call-history');

  // Sync data props to Web Component
  useUpdateWithSetter(componentInstance, phoneNumber, (comp, val) => comp.setPhoneNumber(val));
  useUpdateWithSetter(componentInstance, limit, (comp, val) => comp.setLimit(val));

  // Sync configuration props
  useUpdateWithSetter(componentInstance, locale, (comp, val) => comp.setLocale(val));
  useUpdateWithSetter(componentInstance, formatting, (comp, val) => comp.setFormatting(val));
  useUpdateWithSetter(componentInstance, icons, (comp, val) => comp.setIcons(val));
  useUpdateWithSetter(componentInstance, layoutVariant, (comp, val) => comp.setLayoutVariant(val));
  useUpdateWithSetter(componentInstance, classes, (comp, val) => comp.setClasses(val));
  useUpdateWithSetter(componentInstance, displayOptions, (comp, val) =>
    comp.setDisplayOptions(val)
  );

  // Sync callbacks to Web Component
  useUpdateWithSetter(componentInstance, onLoaderStart, (comp, val) => comp.setOnLoaderStart(val));
  useUpdateWithSetter(componentInstance, onLoadError, (comp, val) => comp.setOnLoadError(val));

  return <div ref={containerRef} className={className} style={style} />;
};
