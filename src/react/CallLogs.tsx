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
  onLoaderStart,
  onLoadError,
  onPageChange,
  onRowClick,
}) => {
  const { dialstack } = useDialstackComponents();
  const { containerRef, componentInstance } = useCreateComponent(dialstack, 'call-logs');

  // Sync data props to Web Component
  useUpdateWithSetter(componentInstance, dateRange, 'setDateRange');
  useUpdateWithSetter(componentInstance, limit, 'setLimit');
  useUpdateWithSetter(componentInstance, paginationOptions, 'setPaginationOptions');

  // Sync configuration props
  useUpdateWithSetter(componentInstance, locale, 'setLocale');
  useUpdateWithSetter(componentInstance, formatting, 'setFormatting');

  // Sync callbacks to Web Component
  useUpdateWithSetter(componentInstance, onLoaderStart, 'setOnLoaderStart');
  useUpdateWithSetter(componentInstance, onLoadError, 'setOnLoadError');
  useUpdateWithSetter(componentInstance, onPageChange, 'setOnPageChange');
  useUpdateWithSetter(componentInstance, onRowClick, 'setOnRowClick');

  return <div ref={containerRef} className={className} style={style} />;
};
