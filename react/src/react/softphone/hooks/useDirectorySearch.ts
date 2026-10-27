import { useState } from 'react';
import type { Locale } from '@dialstack/sdk-js';
import {
  filterDirectory,
  presenceLabelKey,
  type DirectoryContact,
  type DirectoryContactGroup,
} from '../core/view-model';

export interface UseDirectorySearch {
  query: string;
  setQuery: (query: string) => void;
  /** The entries matching `query`, grouped for display. */
  groups: DirectoryContactGroup[];
}

/**
 * The directory picker's search, shared by web and native. The search text is
 * its own: the number field only takes dial characters, so it can't double as a
 * name search. Statuses match by their label in the UI's language.
 */
export function useDirectorySearch(
  destinations: readonly DirectoryContact[],
  t: (key: keyof Locale['softphone']) => string
): UseDirectorySearch {
  const [query, setQuery] = useState('');
  const groups = filterDirectory(destinations, query, (presence) => t(presenceLabelKey(presence)));
  return { query, setQuery, groups };
}
