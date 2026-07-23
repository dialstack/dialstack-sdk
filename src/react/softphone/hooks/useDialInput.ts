import { useCallback } from 'react';
import { sanitizeDestination, stripToDialString, DIAL_COUNTRY } from '../core/view-model';

export interface UseDialInput {
  /**
   * Handle a per-keystroke value change: strip display separators only (typing
   * stays natural; no mid-field E.164 rewrite). Pass the raw field value.
   */
  onType: (raw: string) => void;
  /**
   * Handle a paste: a pasted value is complete, so fully normalize it — a
   * formatted `(581) 319-5082` becomes `+15813195082`, so the user sees exactly
   * what will be dialed. Pass the raw clipboard text.
   */
  onPasteText: (raw: string) => void;
}

/**
 * Shared cleaning for a dial-string input, used by BOTH the dial pad and the
 * transfer field on web + RN so the "what may I type / what does a paste become"
 * rule lives in one place. Each platform wires its native input event (web
 * onChange/onPaste, RN onChangeText) to these — the string logic never diverges.
 */
export function useDialInput(setValue: (value: string) => void): UseDialInput {
  const onType = useCallback((raw: string) => setValue(stripToDialString(raw)), [setValue]);
  const onPasteText = useCallback(
    (raw: string) => setValue(sanitizeDestination(raw, DIAL_COUNTRY)),
    [setValue]
  );
  return { onType, onPasteText };
}
