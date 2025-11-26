/**
 * React wrapper for CallLogs Web Component
 */

import React from 'react';
import { useDialstackComponents } from './DialstackComponentsProvider';
import { useCreateComponent } from './useCreateComponent';
import { useUpdateWithSetter } from './useUpdateWithSetter';
import type { DateRange } from '../components/call-logs';
import type {
  LoaderStart,
  LoadError,
  CallLog,
  FormattingOptions,
  PaginationOptions,
  ComponentIcons,
  LayoutVariant,
  CallLogDisplayOptions,
  CallLogRowRenderer,
  CallLogsClasses,
} from '../core/types';
import type { Locale } from '../locales';

export interface CallLogsProps {
  /**
   * Optional CSS class name
   */
  className?: string;

  /**
   * Optional inline styles
   */
  style?: React.CSSProperties;

  /**
   * Date range filter for call logs
   */
  dateRange?: DateRange;

  /**
   * Maximum number of call logs to display (default: 20)
   */
  limit?: number;

  /**
   * Pagination options for configuring page sizes
   */
  paginationOptions?: PaginationOptions;

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
   *
   * @example
   * ```tsx
   * <CallLogs
   *   classes={{
   *     base: 'rounded-lg border',
   *     table: 'min-w-full',
   *     row: 'hover:bg-gray-50',
   *     rowInbound: 'text-green-600'
   *   }}
   * />
   * ```
   */
  classes?: CallLogsClasses;

  /**
   * Display options for controlling column visibility
   */
  displayOptions?: CallLogDisplayOptions;

  /**
   * Custom row renderer for call log rows
   */
  customRowRenderer?: CallLogRowRenderer;

  /**
   * Callback when component starts loading
   */
  onLoaderStart?: (event: LoaderStart) => void;

  /**
   * Callback when there's an error loading call logs
   */
  onLoadError?: (event: LoadError) => void;

  /**
   * Callback when pagination changes
   */
  onPageChange?: (event: { offset: number; limit: number }) => void;

  /**
   * Callback when a row is clicked
   */
  onRowClick?: (event: { callId: string; call: CallLog }) => void;
}

/**
 * CallLogs component displays a list of call logs for the authenticated account
 *
 * Must be used within a DialstackComponentsProvider.
 *
 * @example
 * ```tsx
 * <DialstackComponentsProvider dialstack={dialstack}>
 *   <CallLogs
 *     dateRange={{ start: '2025-01-01', end: '2025-01-31' }}
 *     limit={50}
 *     onLoadError={(e) => console.error(e.error)}
 *     onRowClick={(e) => console.log('Selected call:', e.callId)}
 *   />
 * </DialstackComponentsProvider>
 * ```
 */
export const CallLogs: React.FC<CallLogsProps> = ({
  className,
  style,
  dateRange,
  limit,
  paginationOptions,
  locale,
  formatting,
  icons,
  layoutVariant,
  classes,
  displayOptions,
  customRowRenderer,
  onLoaderStart,
  onLoadError,
  onPageChange,
  onRowClick,
}) => {
  const { dialstack } = useDialstackComponents();
  const { containerRef, componentInstance } = useCreateComponent(dialstack, 'call-logs');

  // Sync data props to Web Component (type-safe callbacks)
  useUpdateWithSetter(componentInstance, dateRange, (comp, val) => comp.setDateRange(val));
  useUpdateWithSetter(componentInstance, limit, (comp, val) => comp.setLimit(val));
  useUpdateWithSetter(componentInstance, paginationOptions, (comp, val) => comp.setPaginationOptions(val));

  // Sync configuration props
  useUpdateWithSetter(componentInstance, locale, (comp, val) => comp.setLocale(val));
  useUpdateWithSetter(componentInstance, formatting, (comp, val) => comp.setFormatting(val));
  useUpdateWithSetter(componentInstance, icons, (comp, val) => comp.setIcons(val));
  useUpdateWithSetter(componentInstance, layoutVariant, (comp, val) => comp.setLayoutVariant(val));
  useUpdateWithSetter(componentInstance, classes, (comp, val) => comp.setClasses(val));
  useUpdateWithSetter(componentInstance, displayOptions, (comp, val) => comp.setDisplayOptions(val));
  useUpdateWithSetter(componentInstance, customRowRenderer, (comp, val) => comp.setCustomRowRenderer(val));

  // Sync callbacks to Web Component
  useUpdateWithSetter(componentInstance, onLoaderStart, (comp, val) => comp.setOnLoaderStart(val));
  useUpdateWithSetter(componentInstance, onLoadError, (comp, val) => comp.setOnLoadError(val));
  useUpdateWithSetter(componentInstance, onPageChange, (comp, val) => comp.setOnPageChange(val));
  useUpdateWithSetter(componentInstance, onRowClick, (comp, val) => comp.setOnRowClick(val));

  return <div ref={containerRef} className={className} style={style} />;
};
