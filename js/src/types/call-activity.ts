/**
 * Types for the call activity components (To call back, Unread voicemail, Call
 * analytics, Devices offline) and the API reads behind them.
 */

import type { BaseComponentElement, CallLogFilters } from './components';
import type { CallActivityClasses } from './appearance';

// ============================================================================
// API shapes
// ============================================================================

/** Query parameters for `quality.summary`. Mirrors `GET /v1/quality/summary`. */
export interface QualitySummaryParams {
  /** ISO 8601 */
  from: string;
  /** ISO 8601 */
  to: string;
  granularity: 'hourly' | 'daily';
}

/** Call quality over a window: averages, and calls per quality tier per bucket. */
export interface QualitySummary {
  kpi: {
    avg_mos: number | null;
    avg_jitter_ms: number | null;
    avg_packet_loss_pct: number | null;
    total_calls: number;
  };
  time_series: Array<{
    bucket: string;
    /** Calls with an estimated MOS of 4.0 or higher */
    good_count: number;
    /** Calls with an estimated MOS from 3.5 up to 4.0 */
    fair_count: number;
    /** Calls with an estimated MOS below 3.5 */
    poor_count: number;
  }>;
}

/** Query parameters for `voicemails.list`. Mirrors `GET /v1/voicemails`. */
export interface VoicemailListParams {
  /** A user id or a shared voicemail box id */
  owner?: string;
  is_read?: boolean;
  /** ISO 8601; voicemails received on or after */
  from_date?: string;
  /** ISO 8601; voicemails received on or before */
  to_date?: string;
  limit?: number;
  /** Opaque cursor from a page URL */
  page?: string;
}

/** A voicemail as `GET /v1/voicemails` lists it. */
export interface VoicemailItem {
  id: string;
  /** The mailbox: a user id or a shared voicemail box id */
  owner: string;
  from_number: string | null;
  from_name: string | null;
  duration_seconds: number;
  audio_url: string;
  is_read: boolean;
  created_at: string;
  summary?: string | null;
}

// ============================================================================
// Component options
// ============================================================================

/** Windows the Call analytics component offers. Days start at the viewer's midnight. */
export type CallAnalyticsRangePreset =
  'last1h' | 'last4h' | 'last8h' | 'today' | 'yesterday' | 'last7d';

/**
 * How an inbound call that reached nobody ended.
 *
 * - `missed`: it rang and nobody picked up, including a caller who hung up at
 *   the voicemail greeting
 * - `abandoned`: the caller hung up in a menu or a queue
 * - `voicemail`: the caller left a message
 * - `failed`: busy, or the call could not be completed
 */
export type CallOutcome = 'missed' | 'abandoned' | 'voicemail' | 'failed';

/** Shared by every call activity component. */
interface PollingCardElement extends Omit<BaseComponentElement, 'setClasses'> {
  setClasses: (classes: CallActivityClasses) => void;
  /**
   * How often to check for new activity, in milliseconds; `null` turns it off.
   * Each check reads counts only. The lists, which show who called, are read
   * again only when those counts change, at least hourly, or on `refresh()`.
   * @default 60000
   */
  setPollInterval: (ms: number | null) => void;
  /** Read everything again now, lists included. */
  refresh: () => void;
}

/** `<dialstack-to-call-back>`: callers from the last 7 days nobody has reached since. */
export interface ToCallBackElement extends PollingCardElement {
  /** Called when a caller's row is chosen, e.g. to open their calls. */
  setOnCallerSelect: (callback: ((event: { phoneNumber: string }) => void) | undefined) => void;
}

/** `<dialstack-call-analytics>`: how calls went over a chosen window. */
export interface CallAnalyticsElement extends PollingCardElement {
  setRange: (preset: CallAnalyticsRangePreset) => void;
  setOnRangeChange: (callback: ((preset: CallAnalyticsRangePreset) => void) | undefined) => void;
  /**
   * Called with call-list filters (and their date window) when a count is
   * chosen; pass them to `<dialstack-call-logs>`. Without it counts are plain text.
   */
  setOnViewCalls: (callback: ((filters: CallLogFilters) => void) | undefined) => void;
  /** Called with the window when Call quality is chosen. Without it there is no link. */
  setOnViewQuality: (callback: ((range: { from: string; to: string }) => void) | undefined) => void;
}

/** `<dialstack-devices-offline>`: desk phones and DECT bases that are not registered. */
export interface DevicesOfflineElement extends PollingCardElement {
  setOnDeviceSelect: (callback: ((event: { deviceId: string }) => void) | undefined) => void;
}
