/**
 * React wrapper for Voicemails Web Component
 */

import React from 'react';
import { useDialstackComponents } from './DialstackComponentsProvider';
import { useCreateComponent } from './useCreateComponent';

export interface VoicemailsProps {
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
 * Voicemails component displays a list of voicemails for the authenticated account
 *
 * Must be used within a DialstackComponentsProvider.
 *
 * @example
 * ```tsx
 * <DialstackComponentsProvider dialstack={dialstack}>
 *   <Voicemails className="my-voicemails" />
 * </DialstackComponentsProvider>
 * ```
 */
export const Voicemails: React.FC<VoicemailsProps> = ({ className, style }) => {
  const { dialstack } = useDialstackComponents();
  const containerRef = useCreateComponent(dialstack, 'voicemails');

  return <div ref={containerRef} className={className} style={style} />;
};
