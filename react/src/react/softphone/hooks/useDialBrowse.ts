import { useState } from 'react';
import type { DirectoryContact } from '../core/view-model';

export interface UseDialBrowse {
  /** Whether the directory list is showing in place of the keypad. */
  showList: boolean;
  /** Switches between keypad and list. Pass the body's current height when opening. */
  toggleList: (bodyHeight?: number) => void;
  /** Picks an entry and closes the list. */
  pickAndClose: (entry: DirectoryContact) => void;
  /** The height the list keeps while open, captured from the keypad's. */
  listMinHeight: number | undefined;
}

/**
 * The dial pad's keypad/list switch, shared by web and native, which differ
 * only in how they measure the body.
 */
export function useDialBrowse(
  hasDirectory: boolean,
  onPick: (entry: DirectoryContact) => void
): UseDialBrowse {
  const [browsing, setBrowsing] = useState(false);
  // An emptied directory (a new phone, a host clearing it) closes the list, so
  // it doesn't reopen over the keypad on its own when entries come back.
  if (browsing && !hasDirectory) setBrowsing(false);
  const showList = browsing && hasDirectory;
  // The list holds at least the height the number and keypad had. Without it a
  // host sized by its content shrinks when the list opens, can drop into the
  // compact tier, and then stays there: the compact keypad is smaller too.
  const [listMinHeight, setListMinHeight] = useState<number | undefined>(undefined);
  const toggleList = (bodyHeight?: number) => {
    if (!showList) setListMinHeight(bodyHeight || undefined);
    setBrowsing(!browsing);
  };
  // A pick closes the list, so one the host could only fill in (not call yet)
  // shows above the number, waiting for Call.
  const pickAndClose = (entry: DirectoryContact) => {
    onPick(entry);
    setBrowsing(false);
  };
  return { showList, toggleList, pickAndClose, listMinHeight };
}
