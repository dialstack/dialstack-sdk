/**
 * React wrapper for Voicemails Web Component
 */

import React from 'react';
import { useDialstackComponents } from './DialstackComponentsProvider';
import { useCreateComponent } from './useCreateComponent';
import { useUpdateWithSetter } from './useUpdateWithSetter';

export interface VoicemailsProps {
  /**
   * User ID to fetch voicemails for (required)
   */
  userId: string;

  /**
   * Optional CSS class name
   */
  className?: string;

  /**
   * Optional inline styles
   */
  style?: React.CSSProperties;

  /**
   * Callback when there's an error loading voicemails
   */
  onLoadError?: (error: Error) => void;
}

/**
 * Voicemails component displays a list of voicemails for a specific user
 *
 * Must be used within a DialstackComponentsProvider.
 *
 * @example
 * ```tsx
 * <DialstackComponentsProvider dialstack={dialstack}>
 *   <Voicemails
 *     userId="user-uuid-123"
 *     onLoadError={(error) => console.error(error)}
 *   />
 * </DialstackComponentsProvider>
 * ```
 */
export const Voicemails: React.FC<VoicemailsProps> = ({
  userId,
  className,
  style,
  onLoadError,
}) => {
  const { dialstack } = useDialstackComponents();
  const { containerRef, componentInstance } = useCreateComponent(dialstack, 'voicemails');

  // Sync userId prop to Web Component
  useUpdateWithSetter(componentInstance, userId, 'setUserId');

  // Note: onLoadError would require event listener on the component
  // This could be enhanced in the future if error events are added
  if (onLoadError) {
    // Placeholder for future error event handling
  }

  return <div ref={containerRef} className={className} style={style} />;
};
