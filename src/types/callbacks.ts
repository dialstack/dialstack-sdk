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
