/**
 * Callback and event types for DialStack SDK components
 */

import type { CallLog } from './components';

/**
 * Event fired when a component starts loading
 */
export interface LoaderStart {
  elementTagName: string;
}

/**
 * Event fired when a component fails to load
 */
export interface LoadError {
  error: string;
  elementTagName: string;
}

/**
 * Common callbacks shared by all components
 */
export interface CommonComponentCallbacks {
  onLoaderStart?: (event: LoaderStart) => void;
  onLoadError?: (event: LoadError) => void;
}

/**
 * Voicemails component callbacks
 */
export interface VoicemailsCallbacks extends CommonComponentCallbacks {
  onVoicemailSelect?: (event: { voicemailId: string }) => void;
  onVoicemailPlay?: (event: { voicemailId: string }) => void;
  onVoicemailPause?: (event: { voicemailId: string }) => void;
  onVoicemailDelete?: (event: { voicemailId: string }) => void;
  onCallBack?: (event: { phoneNumber: string }) => void;
  /**
   * Custom delete confirmation handler. Return true to proceed with deletion.
   * If not provided, uses built-in confirmation based on confirmBeforeDelete setting.
   */
  onDeleteRequest?: (voicemailId: string) => Promise<boolean>;
}

/**
 * CallLogs component callbacks
 */
export interface CallLogsCallbacks extends CommonComponentCallbacks {
  onPageChange?: (event: { offset: number; limit: number }) => void;
  onRowClick?: (event: { callId: string; call: CallLog }) => void;
}

// ============================================================================
// Real-time Call Events (SSE)
// ============================================================================

/**
 * Event fired when a call starts ringing
 */
export interface IncomingCallEvent {
  /** Caller phone number */
  from_number: string;
  /** Caller ID name (if available) */
  from_name: string | null;
  /** Called phone number (DID) */
  to_number: string;
  /**
   * User the call is routed to. Set only when the DID targets a single user
   * directly; omitted for ring groups, voice apps, dial plans, and other
   * shared destinations where no single user is known at ring time.
   */
  user?: string;
  /**
   * @deprecated Use `user`. Retained for backwards compatibility.
   */
  user_id?: string;
  /** When the call started ringing */
  timestamp: Date;
}

/**
 * Event fired once for each user whose phones are about to ring for a call,
 * including calls that reach the user through a ring group or dial plan
 */
export interface RingingCallEvent {
  /** Call identifier */
  call_id: string;
  /** User whose phones are ringing */
  user: string;
  /** The call's direction: `inbound`, `outbound` or `internal` (when known) */
  direction?: 'inbound' | 'outbound' | 'internal';
  /** Caller phone number */
  from_number: string;
  /** Caller ID name (if available) */
  from_name: string | null;
  /** Called phone number */
  to_number: string;
  /** When the user started being rung */
  ringing_at: Date;
  /** When the event was sent */
  timestamp: Date;
}

/**
 * Call event type names for on()/off() methods
 */
export type CallEventType = 'call.incoming' | 'call.ringing';

/**
 * Map of call event types to their event data
 */
export interface CallEventMap {
  'call.incoming': IncomingCallEvent;
  'call.ringing': RingingCallEvent;
}

/**
 * Event handler function type
 */
export type CallEventHandler<T> = (event: T) => void;
