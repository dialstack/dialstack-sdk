/**
 * React wrapper for CallLogs Web Component
 */

import React from 'react';
import { useDialstackComponents } from './DialstackComponentsProvider';
import { useCreateComponent } from './useCreateComponent';
import { useUpdateWithSetter } from './useUpdateWithSetter';
import type { DateRange } from '../components/call-logs';

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
   * Callback when there's an error loading call logs
   */
  onLoadError?: (error: Error) => void;
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
 *     onLoadError={(error) => console.error(error)}
 *   />
 * </DialstackComponentsProvider>
 * ```
 */
export const CallLogs: React.FC<CallLogsProps> = ({
  className,
  style,
  dateRange,
  limit,
  onLoadError,
}) => {
  const { dialstack } = useDialstackComponents();
  const { containerRef, componentInstance } = useCreateComponent(dialstack, 'call-logs');

  // Sync dateRange prop to Web Component
  useUpdateWithSetter(componentInstance, dateRange, 'setDateRange');

  // Sync limit prop to Web Component
  useUpdateWithSetter(componentInstance, limit, 'setLimit');

  // Note: onLoadError would require event listener on the component
  // This could be enhanced in the future if error events are added
  if (onLoadError) {
    // Placeholder for future error event handling
  }

  return <div ref={containerRef} className={className} style={style} />;
};
