/**
 * Component-specific types for DialStack SDK
 */

import type { Locale } from '../locales';
import type {
  ComponentIcons,
  LayoutVariant,
  BaseComponentClasses,
  VoicemailsClasses,
  CallLogsClasses,
} from './appearance';
import type { LoaderStart, LoadError } from './callbacks';
import type { DialStackInstanceImpl } from './core';

// ============================================================================
// Display Options
// ============================================================================

/**
 * Display options for Voicemails component
 */
export interface VoicemailDisplayOptions {
  /**
   * Show voicemail duration
   * @default true
   */
  showDuration?: boolean;

  /**
   * Show transcription when available
   * @default true
   */
  showTranscription?: boolean;

  /**
   * Show callback button
   * @default true
   */
  showCallbackButton?: boolean;

  /**
   * Show delete button
   * @default true
   */
  showDeleteButton?: boolean;

  /**
   * Show progress bar in expanded view
   * @default true
   */
  showProgressBar?: boolean;

  /**
   * Show timestamp
   * @default true
   */
  showTimestamp?: boolean;
}

/**
 * Display options for CallLogs component
 */
export interface CallLogDisplayOptions {
  /**
   * Show date/time column
   * @default true
   */
  showDate?: boolean;

  /**
   * Show direction column
   * @default true
   */
  showDirection?: boolean;

  /**
   * Show from number column
   * @default true
   */
  showFrom?: boolean;

  /**
   * Show to number column
   * @default true
   */
  showTo?: boolean;

  /**
   * Show duration column
   * @default true
   */
  showDuration?: boolean;

  /**
   * Show status column
   * @default true
   */
  showStatus?: boolean;
}

// ============================================================================
// Behavior Options
// ============================================================================

/**
 * Behavior options for Voicemails component
 */
export interface VoicemailBehaviorOptions {
  /**
   * Auto-play voicemail when expanded
   * @default true
   */
  autoPlayOnExpand?: boolean;

  /**
   * Show confirmation dialog before deleting
   * @default true
   */
  confirmBeforeDelete?: boolean;

  /**
   * Mark voicemail as read when played
   * @default true
   */
  markAsReadOnPlay?: boolean;

  /**
   * Allow seeking in audio playback
   * @default true
   */
  allowSeeking?: boolean;
}

// ============================================================================
// Row Renderers
// ============================================================================

/**
 * Render function for custom voicemail row rendering
 */
export type VoicemailRowRenderer = (voicemail: {
  id: string;
  from_name: string;
  from_number: string;
  created_at: string;
  duration_seconds: number;
  is_read: boolean;
  transcription?: string;
}) => string;

/**
 * Render function for custom call log row rendering
 */
export type CallLogRowRenderer = (call: CallLog) => string;

// ============================================================================
// Data Models
// ============================================================================

/**
 * Call log data structure
 */
export interface CallLog {
  id: string;
  user_id?: string;
  endpoint_id?: string;
  did_id?: string;
  direction: 'inbound' | 'outbound' | 'internal';
  from_number: string;
  to_number: string;
  started_at: string;
  answered_at?: string;
  ended_at?: string;
  duration_seconds?: number;
  status: 'completed' | 'no-answer' | 'busy' | 'failed' | 'voicemail';
}

// ============================================================================
// Configuration Options
// ============================================================================

/**
 * Pagination options for list components
 */
export interface PaginationOptions {
  /**
   * Available page sizes for the dropdown
   * @default [10, 20, 50, 100]
   */
  pageSizes?: number[];

  /**
   * Default page size
   * @default 20
   */
  defaultPageSize?: number;
}

/**
 * Formatting options for components
 */
export interface FormattingOptions {
  /**
   * Default country code for phone number formatting (ISO 3166-1 alpha-2)
   * @default 'US'
   */
  defaultCountry?: string;

  /**
   * Locale for date/time formatting (BCP 47 language tag)
   * @default 'en-US'
   */
  dateLocale?: string;

  /**
   * Use 24-hour time format
   * @default false
   */
  use24HourTime?: boolean;

  /**
   * Show timezone in date/time display
   * @default true
   */
  showTimezone?: boolean;
}

/**
 * Component-level configuration
 */
export interface ComponentConfig {
  /**
   * Locale for UI strings
   */
  locale?: Locale;

  /**
   * Formatting options
   */
  formatting?: FormattingOptions;
}

// ============================================================================
// Component Element Interfaces
// ============================================================================

/**
 * Base component element interface with common setters
 */
export interface BaseComponentElement extends HTMLElement {
  setInstance: (instance: DialStackInstanceImpl) => void;
  setLocale: (locale: Locale) => void;
  setFormatting: (formatting: FormattingOptions) => void;
  setIcons: (icons: ComponentIcons) => void;
  setLayoutVariant: (variant: LayoutVariant) => void;
  setClasses: (classes: BaseComponentClasses) => void;
  setOnLoaderStart: (callback: (event: LoaderStart) => void) => void;
  setOnLoadError: (callback: (event: LoadError) => void) => void;
}

/**
 * Voicemails component element interface
 */
export interface VoicemailsElement extends Omit<BaseComponentElement, 'setClasses'> {
  setClasses: (classes: VoicemailsClasses) => void;
  setUserId: (userId: string) => void;
  setDisplayOptions: (options: VoicemailDisplayOptions) => void;
  setBehaviorOptions: (options: VoicemailBehaviorOptions) => void;
  setCustomRowRenderer: (renderer: VoicemailRowRenderer | undefined) => void;
  setOnVoicemailSelect: (callback: (event: { voicemailId: string }) => void) => void;
  setOnVoicemailPlay: (callback: (event: { voicemailId: string }) => void) => void;
  setOnVoicemailPause: (callback: (event: { voicemailId: string }) => void) => void;
  setOnVoicemailDelete: (callback: (event: { voicemailId: string }) => void) => void;
  setOnCallBack: (callback: (event: { phoneNumber: string }) => void) => void;
  setOnDeleteRequest: (callback: (voicemailId: string) => Promise<boolean>) => void;
}

/**
 * CallLogs component element interface
 */
export interface CallLogsElement extends Omit<BaseComponentElement, 'setClasses'> {
  setClasses: (classes: CallLogsClasses) => void;
  setDateRange: (dateRange: { start?: string; end?: string }) => void;
  setLimit: (limit: number) => void;
  setOffset: (offset: number) => void;
  setPaginationOptions: (options: PaginationOptions) => void;
  setDisplayOptions: (options: CallLogDisplayOptions) => void;
  setCustomRowRenderer: (renderer: CallLogRowRenderer | undefined) => void;
  setOnPageChange: (callback: (event: { offset: number; limit: number }) => void) => void;
  setOnRowClick: (callback: (event: { callId: string; call: CallLog }) => void) => void;
}

/**
 * Component tag names for embedded components
 */
export type ComponentTagName = 'call-logs' | 'voicemails';

/**
 * Web Component element types mapped by tag name
 */
export interface ComponentElement {
  'call-logs': CallLogsElement;
  'voicemails': VoicemailsElement;
}
