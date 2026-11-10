/**
 * React wrapper for Voicemails Web Component
 */

import React from 'react';
import { useDialstackComponents } from './DialstackComponentsProvider';
import { useCreateComponent } from './useCreateComponent';
import { useUpdateHandlerWithSetter, useUpdateWithSetter } from './useUpdateWithSetter';
import {
  type LoaderStart,
  type LoadError,
  type FormattingOptions,
  type ComponentIcons,
  type LayoutVariant,
  type VoicemailDisplayOptions,
  type VoicemailBehaviorOptions,
  type VoicemailListOptions,
  type VoicemailRowRenderer,
  type VoicemailsClasses,
  type Locale,
} from '@dialstack/sdk-js';

export interface VoicemailsProps {
  /**
   * The mailbox to list: a user id or a shared voicemail box id, or `null` for
   * every mailbox in the account. Nothing is read until this or `userId` is set.
   */
  mailbox?: string | null;

  /**
   * User ID to fetch voicemails for.
   * @deprecated Use `mailbox`, which also takes a shared voicemail box or every
   * mailbox. Removed in the next major version.
   */
  userId?: string;

  /**
   * Which voicemails to list, and in what order: unread only, oldest first,
   * received in the last few days.
   */
  listOptions?: VoicemailListOptions;

  /**
   * How often to check for new messages, in milliseconds. Each check reads
   * counts only; the list is read again only when they change. Off by default.
   */
  pollInterval?: number | null;

  /** Change this to read the list again now. */
  refreshKey?: string | number;

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
   *
   * A new function re-renders the list, since it may draw rows differently.
   * Written inline, that happens on every render of your component; wrap it in
   * `useCallback` so the list re-renders only when the renderer changes.
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
  mailbox,
  userId,
  listOptions,
  pollInterval,
  refreshKey,
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
  // NEXT MAJOR: drop userId; mailbox covers it.
  useUpdateWithSetter(componentInstance, userId, (comp, val) => comp.setUserId(val));
  // null is a value here (every mailbox), and undefined means "not given".
  React.useEffect(() => {
    if (componentInstance && mailbox !== undefined) componentInstance.setMailbox(mailbox);
  }, [componentInstance, mailbox]);
  useUpdateWithSetter(componentInstance, listOptions, (comp, val) => comp.setListOptions(val));
  React.useEffect(() => {
    if (componentInstance) componentInstance.setPollInterval(pollInterval ?? null);
  }, [componentInstance, pollInterval]);
  const firstRefreshKey = React.useRef(refreshKey);
  React.useEffect(() => {
    if (componentInstance && refreshKey !== firstRefreshKey.current) componentInstance.refresh();
  }, [componentInstance, refreshKey]);

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
  useUpdateHandlerWithSetter(componentInstance, customRowRenderer, (comp, val) =>
    comp.setCustomRowRenderer(val)
  );

  // Sync callbacks to Web Component
  useUpdateHandlerWithSetter(componentInstance, onLoaderStart, (comp, val) =>
    comp.setOnLoaderStart(val)
  );
  useUpdateHandlerWithSetter(componentInstance, onLoadError, (comp, val) =>
    comp.setOnLoadError(val)
  );
  useUpdateHandlerWithSetter(componentInstance, onVoicemailSelect, (comp, val) =>
    comp.setOnVoicemailSelect(val)
  );
  useUpdateHandlerWithSetter(componentInstance, onVoicemailPlay, (comp, val) =>
    comp.setOnVoicemailPlay(val)
  );
  useUpdateHandlerWithSetter(componentInstance, onVoicemailPause, (comp, val) =>
    comp.setOnVoicemailPause(val)
  );
  useUpdateHandlerWithSetter(componentInstance, onVoicemailDelete, (comp, val) =>
    comp.setOnVoicemailDelete(val)
  );
  useUpdateHandlerWithSetter(componentInstance, onCallBack, (comp, val) => comp.setOnCallBack(val));
  useUpdateHandlerWithSetter(componentInstance, onDeleteRequest, (comp, val) =>
    comp.setOnDeleteRequest(val)
  );

  return <div ref={containerRef} className={className} style={style} />;
};
