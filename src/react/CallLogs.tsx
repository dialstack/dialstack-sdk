/**
 * React wrapper for CallLogs Web Component
 */

import React from 'react';
import { useDialstackComponents } from './DialstackComponentsProvider';
import { useCreateComponent } from './useCreateComponent';

export interface CallLogsProps {
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
 * CallLogs component displays a list of call logs for the authenticated account
 *
 * Must be used within a DialstackComponentsProvider.
 *
 * @example
 * ```tsx
 * <DialstackComponentsProvider dialstack={dialstack}>
 *   <CallLogs className="my-call-logs" />
 * </DialstackComponentsProvider>
 * ```
 */
export const CallLogs: React.FC<CallLogsProps> = ({ className, style }) => {
  const { dialstack } = useDialstackComponents();
  const containerRef = useCreateComponent(dialstack, 'call-logs');

  return <div ref={containerRef} className={className} style={style} />;
};
