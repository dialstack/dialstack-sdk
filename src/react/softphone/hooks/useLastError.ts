import { useCallback, useState } from 'react';

export interface SoftphoneError {
  code: string;
  message: string;
}

export interface UseLastError {
  /** The last error surfaced to the user, or null. Drives the built-in banner. */
  lastError: SoftphoneError | null;
  /**
   * Error handler to pass into `useCalls`/`useCallActions`. It forwards to the
   * host's `onError` AND stores the error locally so the built-in UI can show it.
   */
  handleError: (event: SoftphoneError) => void;
  /** Dismiss the current error. */
  clearError: () => void;
}

/**
 * Owns the softphone's "last error" state, shared by the web and RN providers so
 * the error-surfacing behavior can't drift between platforms (the same reason
 * shouldRingIncoming was extracted). Wraps the host `onError`: it still fires for
 * the host, and the error is also kept locally for the built-in error banner.
 */
export function useLastError(onError?: (event: SoftphoneError) => void): UseLastError {
  const [lastError, setLastError] = useState<SoftphoneError | null>(null);
  const handleError = useCallback(
    (event: SoftphoneError) => {
      setLastError(event);
      onError?.(event);
    },
    [onError]
  );
  const clearError = useCallback(() => setLastError(null), []);
  return { lastError, handleError, clearError };
}
