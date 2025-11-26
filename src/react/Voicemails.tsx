/**
 * React wrapper for Voicemails Web Component
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
  VoicemailDisplayOptions,
  VoicemailBehaviorOptions,
  VoicemailRowRenderer,
} from '../core/types';
import type { Locale } from '../locales';

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
   * Display options for controlling field visibility
   */
  displayOptions?: VoicemailDisplayOptions;

  /**
   * Behavior options for controlling component behavior
   */
  behaviorOptions?: VoicemailBehaviorOptions;

  /**
   * Custom row renderer for collapsed voicemail items
   */
  customRowRenderer?: VoicemailRowRenderer;

  /**
   * Callback when component starts loading
   */
  onLoaderStart?: (event: LoaderStart) => void;

  /**
   * Callback when there's an error loading voicemails
   */
  onLoadError?: (event: LoadError) => void;

  /**
   * Callback when a voicemail is selected
   */
  onVoicemailSelect?: (event: { voicemailId: string }) => void;

  /**
   * Callback when a voicemail starts playing
   */
  onVoicemailPlay?: (event: { voicemailId: string }) => void;

  /**
   * Callback when a voicemail is paused
   */
  onVoicemailPause?: (event: { voicemailId: string }) => void;

  /**
   * Callback when a voicemail is deleted
   */
  onVoicemailDelete?: (event: { voicemailId: string }) => void;

  /**
   * Callback when call back button is clicked
   */
  onCallBack?: (event: { phoneNumber: string }) => void;

  /**
   * Custom delete confirmation handler. Return true to proceed with deletion.
   */
  onDeleteRequest?: (voicemailId: string) => Promise<boolean>;
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
 *     onLoadError={(e) => console.error(e.error)}
 *     onVoicemailSelect={(e) => console.log('Selected:', e.voicemailId)}
 *     onCallBack={(e) => initiateCall(e.phoneNumber)}
 *   />
 * </DialstackComponentsProvider>
 * ```
 */
export const Voicemails: React.FC<VoicemailsProps> = ({
  userId,
  className,
  style,
  locale,
  formatting,
  icons,
  layoutVariant,
  displayOptions,
  behaviorOptions,
  customRowRenderer,
  onLoaderStart,
  onLoadError,
  onVoicemailSelect,
  onVoicemailPlay,
  onVoicemailPause,
  onVoicemailDelete,
  onCallBack,
  onDeleteRequest,
}) => {
  const { dialstack } = useDialstackComponents();
  const { containerRef, componentInstance } = useCreateComponent(dialstack, 'voicemails');

  // Sync data props to Web Component
  useUpdateWithSetter(componentInstance, userId, 'setUserId');

  // Sync configuration props
  useUpdateWithSetter(componentInstance, locale, 'setLocale');
  useUpdateWithSetter(componentInstance, formatting, 'setFormatting');
  useUpdateWithSetter(componentInstance, icons, 'setIcons');
  useUpdateWithSetter(componentInstance, layoutVariant, 'setLayoutVariant');
  useUpdateWithSetter(componentInstance, displayOptions, 'setDisplayOptions');
  useUpdateWithSetter(componentInstance, behaviorOptions, 'setBehaviorOptions');
  useUpdateWithSetter(componentInstance, customRowRenderer, 'setCustomRowRenderer');

  // Sync callbacks to Web Component
  useUpdateWithSetter(componentInstance, onLoaderStart, 'setOnLoaderStart');
  useUpdateWithSetter(componentInstance, onLoadError, 'setOnLoadError');
  useUpdateWithSetter(componentInstance, onVoicemailSelect, 'setOnVoicemailSelect');
  useUpdateWithSetter(componentInstance, onVoicemailPlay, 'setOnVoicemailPlay');
  useUpdateWithSetter(componentInstance, onVoicemailPause, 'setOnVoicemailPause');
  useUpdateWithSetter(componentInstance, onVoicemailDelete, 'setOnVoicemailDelete');
  useUpdateWithSetter(componentInstance, onCallBack, 'setOnCallBack');
  useUpdateWithSetter(componentInstance, onDeleteRequest, 'setOnDeleteRequest');

  return <div ref={containerRef} className={className} style={style} />;
};
