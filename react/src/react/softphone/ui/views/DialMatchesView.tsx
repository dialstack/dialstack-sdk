import React from 'react';
import {
  currentContact,
  matchDirectoryByNumber,
  type DirectoryContact,
} from '../../core/view-model';
import { DirectoryContactView } from './DirectoryContactView';
import type { SoftphoneViewChrome } from './types';

export interface DialMatchesViewProps extends Pick<SoftphoneViewChrome, 't'> {
  directory: readonly DirectoryContact[];
  /** What the number field holds. */
  value: string;
  /** The contact `value` came from: shown alone, marked, in place of matches. */
  picked: DirectoryContact | null;
  onPick: (entry: DirectoryContact) => void;
}

/**
 * The row above a number field: entries whose number contains what was typed,
 * or the picked one. Always rendered, so the field below stays put as matches
 * come and go.
 */
export const DialMatchesView: React.FC<DialMatchesViewProps> = ({
  directory,
  value,
  picked,
  onPick,
  t,
}) => {
  // The pick as the directory has it now, so its presence keeps moving.
  const pickedNow = currentContact(directory, picked);
  return (
    <div className="ds-dial-matches" role="group" aria-label={t('directoryMatches')}>
      {(pickedNow ? [pickedNow] : matchDirectoryByNumber(directory, value)).map((entry) => (
        <button
          type="button"
          key={entry.id}
          className="ds-dial-match"
          aria-pressed={entry.id === picked?.id}
          onClick={() => onPick(entry)}
        >
          <DirectoryContactView entry={entry} t={t} inline />
        </button>
      ))}
    </div>
  );
};
