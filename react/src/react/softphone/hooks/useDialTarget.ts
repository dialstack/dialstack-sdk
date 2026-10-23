import { useCallback, useState } from 'react';
import {
  sanitizeDestination,
  stripToDialString,
  DIAL_COUNTRY,
  type DirectoryContact,
} from '../core/view-model';

export interface UseDialTarget {
  /** What the panel's buttons act on: typed, pasted or picked. */
  value: string;
  /**
   * The directory contact the value came from, or null when it was typed.
   * The panel marks it by `id`, so two contacts sharing a destination are
   * told apart.
   */
  picked: DirectoryContact | null;
  /** Per-keystroke change: display separators stripped, the pick forgotten. */
  onType: (raw: string) => void;
  /** A paste is complete, so it is fully normalized, as `useDialInput` does. */
  onPasteText: (raw: string) => void;
  /** Use a directory contact; its destination is cleaned like a paste. */
  pick: (contact: DirectoryContact) => void;
  clear: () => void;
}

/**
 * The destination of a transfer or add-call panel, shared by web and React
 * Native so the rules for typing, pasting and picking from the directory
 * can't drift apart.
 */
export function useDialTarget(): UseDialTarget {
  const [value, setValue] = useState('');
  const [picked, setPicked] = useState<DirectoryContact | null>(null);
  const onType = useCallback((raw: string) => {
    setPicked(null);
    setValue(stripToDialString(raw));
  }, []);
  const onPasteText = useCallback((raw: string) => {
    setPicked(null);
    setValue(sanitizeDestination(raw, DIAL_COUNTRY));
  }, []);
  const pick = useCallback((contact: DirectoryContact) => {
    setPicked(contact);
    setValue(sanitizeDestination(contact.destination, DIAL_COUNTRY));
  }, []);
  const clear = useCallback(() => {
    setPicked(null);
    setValue('');
  }, []);
  return { value, picked, onType, onPasteText, pick, clear };
}
