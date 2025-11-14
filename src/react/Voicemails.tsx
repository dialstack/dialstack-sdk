/**
 * React wrapper for Voicemails Web Component
 */

import React from 'react';
import { useDialstackComponents } from './DialstackComponentsProvider';
import { useCreateComponent } from './useCreateComponent';
import { VoicemailsComponent } from '../components/voicemails';

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
 */
export const Voicemails: React.FC<VoicemailsProps> = ({ className, style }) => {
  const { clientSecret } = useDialstackComponents();

  if (!clientSecret) {
    throw new Error('Voicemails: clientSecret is required');
  }

  const containerRef = useCreateComponent(VoicemailsComponent, { clientSecret });

  return <div ref={containerRef} className={className} style={style} />;
};
