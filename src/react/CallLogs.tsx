/**
 * React wrapper for CallLogs Web Component
 */

import React from 'react';
import { useDialstackComponents } from './DialstackComponentsProvider';
import { useCreateComponent } from './useCreateComponent';
import { CallLogsComponent } from '../components/call-logs';

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
 */
export const CallLogs: React.FC<CallLogsProps> = ({ className, style }) => {
  const { clientSecret } = useDialstackComponents();

  if (!clientSecret) {
    throw new Error('CallLogs: clientSecret is required');
  }

  const containerRef = useCreateComponent(CallLogsComponent, { clientSecret });

  return <div ref={containerRef} className={className} style={style} />;
};
