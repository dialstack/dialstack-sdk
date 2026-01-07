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
  VoicemailsClasses,
} from '../types';
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
   * Custom CSS classes for styling integration
   *
   * @example
   * ```tsx
   * <Voicemails
   *   classes={{
   *     base: 'rounded-lg border',
   *     loading: 'animate-pulse',
   *     item: 'hover:bg-gray-50',
   *     itemUnread: 'font-bold'
   *   }}
   * />
   * ```
   */
  classes?: VoicemailsClasses;

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
  classes,
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

  // Sync data props to Web Component (type-safe callbacks)
  useUpdateWithSetter(componentInstance, userId, (comp, val) => comp.setUserId(val));

  // Sync configuration props
  useUpdateWithSetter(componentInstance, locale, (comp, val) => comp.setLocale(val));
  useUpdateWithSetter(componentInstance, formatting, (comp, val) => comp.setFormatting(val));
  useUpdateWithSetter(componentInstance, icons, (comp, val) => comp.setIcons(val));
  useUpdateWithSetter(componentInstance, layoutVariant, (comp, val) => comp.setLayoutVariant(val));
  useUpdateWithSetter(componentInstance, classes, (comp, val) => comp.setClasses(val));
  useUpdateWithSetter(componentInstance, displayOptions, (comp, val) =>
    comp.setDisplayOptions(val)
  );
  useUpdateWithSetter(componentInstance, behaviorOptions, (comp, val) =>
    comp.setBehaviorOptions(val)
  );
  useUpdateWithSetter(componentInstance, customRowRenderer, (comp, val) =>
    comp.setCustomRowRenderer(val)
  );

  // Sync callbacks to Web Component
  useUpdateWithSetter(componentInstance, onLoaderStart, (comp, val) => comp.setOnLoaderStart(val));
  useUpdateWithSetter(componentInstance, onLoadError, (comp, val) => comp.setOnLoadError(val));
  useUpdateWithSetter(componentInstance, onVoicemailSelect, (comp, val) =>
    comp.setOnVoicemailSelect(val)
  );
  useUpdateWithSetter(componentInstance, onVoicemailPlay, (comp, val) =>
    comp.setOnVoicemailPlay(val)
  );
  useUpdateWithSetter(componentInstance, onVoicemailPause, (comp, val) =>
    comp.setOnVoicemailPause(val)
  );
  useUpdateWithSetter(componentInstance, onVoicemailDelete, (comp, val) =>
    comp.setOnVoicemailDelete(val)
  );
  useUpdateWithSetter(componentInstance, onCallBack, (comp, val) => comp.setOnCallBack(val));
  useUpdateWithSetter(componentInstance, onDeleteRequest, (comp, val) =>
    comp.setOnDeleteRequest(val)
  );

  return <div ref={containerRef} className={className} style={style} />;
};
