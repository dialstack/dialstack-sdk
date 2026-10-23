import React, { useId, useState } from 'react';
import {
  directoryContactTags,
  filterDirectory,
  type DirectoryContact,
} from '../../core/view-model';
import type { SoftphoneViewChrome } from './types';

export interface DirectoryPickerViewProps extends Pick<SoftphoneViewChrome, 't'> {
  destinations: readonly DirectoryContact[];
  /** Whether the number field currently holds this entry's destination. */
  isSelected: (destination: DirectoryContact) => boolean;
  onPick: (destination: DirectoryContact) => void;
}

/**
 * The host's directory as a searchable list. The search text is its own: the
 * number field only takes dial characters, so it can't double as a name search.
 */
export const DirectoryPickerView: React.FC<DirectoryPickerViewProps> = ({
  destinations,
  isSelected,
  onPick,
  t,
}) => {
  const [query, setQuery] = useState('');
  const listId = useId();
  const groups = filterDirectory(destinations, query);

  return (
    <div className="ds-directory">
      <input
        className="ds-transfer-input ds-directory-search"
        type="search"
        value={query}
        placeholder={t('directorySearchPlaceholder')}
        aria-label={t('directorySearchPlaceholder')}
        aria-controls={listId}
        autoComplete="off"
        onChange={(e) => setQuery(e.target.value)}
      />
      <div id={listId} className="ds-directory-options" aria-label={t('directoryLabel')}>
        {groups.length === 0 && <div className="ds-directory-empty">{t('directoryNoMatches')}</div>}
        {groups.map(({ group, destinations: entries }) => (
          <div key={group ?? ''} role="group" aria-label={group}>
            {group && (
              <div className="ds-directory-group" aria-hidden="true">
                {group}
              </div>
            )}
            {entries.map((entry) => (
              <button
                type="button"
                key={entry.id}
                className="ds-directory-option"
                aria-pressed={isSelected(entry)}
                onClick={() => onPick(entry)}
              >
                <span className="ds-directory-option-title">
                  <span className="ds-directory-option-label">{entry.label}</span>
                  {directoryContactTags(entry).map((tag, j) => (
                    <span key={`${tag}|${j}`} className="ds-directory-tag">
                      {tag}
                    </span>
                  ))}
                </span>
                <span className="ds-directory-option-detail">
                  {entry.description || entry.destination}
                </span>
              </button>
            ))}
          </div>
        ))}
      </div>
    </div>
  );
};
