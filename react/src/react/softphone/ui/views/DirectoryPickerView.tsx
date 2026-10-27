import React, { useId, useRef } from 'react';
import { softphoneGlyphs } from '../../core/icons';
import type { DirectoryContact } from '../../core/view-model';
import { useDirectorySearch } from '../../hooks';
import { Glyph } from '../Glyph';
import { DirectoryContactView } from './DirectoryContactView';
import type { SoftphoneViewChrome } from './types';

export interface DirectoryPickerViewProps extends Pick<SoftphoneViewChrome, 't'> {
  destinations: readonly DirectoryContact[];
  /** Whether the number field currently holds this entry's destination. */
  isSelected: (destination: DirectoryContact) => boolean;
  onPick: (destination: DirectoryContact) => void;
}

/** The host's directory as a searchable list. */
export const DirectoryPickerView: React.FC<DirectoryPickerViewProps> = ({
  destinations,
  isSelected,
  onPick,
  t,
}) => {
  const { query, setQuery, groups } = useDirectorySearch(destinations, t);
  const listId = useId();
  const searchRef = useRef<HTMLInputElement>(null);

  return (
    <div className="ds-directory">
      <div className="ds-directory-search">
        <span className="ds-directory-search-icon" aria-hidden="true">
          <Glyph glyph={softphoneGlyphs.search} />
        </span>
        <input
          ref={searchRef}
          className="ds-transfer-input ds-directory-search-input"
          type="search"
          value={query}
          placeholder={t('directorySearchPlaceholder')}
          aria-label={t('directorySearchPlaceholder')}
          aria-controls={listId}
          autoComplete="off"
          onChange={(e) => setQuery(e.target.value)}
        />
        {query && (
          <button
            type="button"
            className="ds-directory-search-clear"
            aria-label={t('directoryClearSearch')}
            onClick={() => {
              setQuery('');
              searchRef.current?.focus();
            }}
          >
            <Glyph glyph={softphoneGlyphs.close} />
          </button>
        )}
      </div>
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
                <DirectoryContactView entry={entry} t={t} />
              </button>
            ))}
          </div>
        ))}
      </div>
    </div>
  );
};
