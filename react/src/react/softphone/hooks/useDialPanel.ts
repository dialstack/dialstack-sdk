import { useState } from 'react';
import { currentContact, type DirectoryContact } from '../core/view-model';

export interface UseDialPanel {
  hasDirectory: boolean;
  /** The pick as the directory has it now, so its presence keeps moving. */
  pickedNow: DirectoryContact | null;
  /** The number field is showing (typing mode, or no directory to list). */
  showField: boolean;
  /** The directory list is showing: no pick and not typing. */
  showList: boolean;
  /** A number typed before switching to the list, which the list doesn't show. */
  showTarget: boolean;
  /** Switches between the list and the number field. */
  toggleDialing: () => void;
}

/**
 * What the Transfer / Add call panel shows, shared by web and native. A pick
 * replaces the field or list with the picked contact until it is cleared;
 * `dialing` is left alone, so clearing returns to where it came from.
 */
export function useDialPanel(
  directory: readonly DirectoryContact[],
  picked: DirectoryContact | null,
  value: string
): UseDialPanel {
  const [dialing, setDialing] = useState(false);
  const hasDirectory = directory.length > 0;
  const showField = dialing || !hasDirectory;
  const showList = !picked && !showField;
  return {
    hasDirectory,
    pickedNow: currentContact(directory, picked),
    showField,
    showList,
    showTarget: showList && !!value.trim(),
    toggleDialing: () => setDialing(!dialing),
  };
}
