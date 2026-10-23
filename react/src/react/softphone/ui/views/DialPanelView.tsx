import React, { useState } from 'react';
import { softphoneGlyphs } from '../../core/icons';
import type { DirectoryContact } from '../../core/view-model';
import { Glyph } from '../Glyph';
import { DirectoryPickerView } from './DirectoryPickerView';
import type { SoftphoneViewChrome } from './types';

export interface DialPanelViewProps extends Pick<SoftphoneViewChrome, 't'> {
  title: string;
  /** Who the panel acts on, shown under the title. */
  peerName: string;
  /** The host's directory; empty leaves only the number field. */
  directory: readonly DirectoryContact[];
  /** The contact `value` came from, or null when it was typed. */
  picked: DirectoryContact | null;
  onPick: (entry: DirectoryContact) => void;
  value: string;
  /** The field's placeholder, also its accessible name. */
  placeholder: string;
  onChange: (value: string) => void;
  onPaste: (text: string) => void;
  /** The buttons that act on `value`, pinned just above hang up. */
  actions: React.ReactNode;
  onClose: () => void;
}

/**
 * The screen for choosing who to transfer to or call next. It replaces
 * everything on the in-call screen except hang up: a directory doesn't fit
 * beside the call controls, and the plain field shares the layout so the two
 * cases don't look like different features. With a directory it opens on the
 * list each time; typing a number is the fallback mode.
 */
export const DialPanelView: React.FC<DialPanelViewProps> = ({
  title,
  peerName,
  directory,
  picked,
  onPick,
  value,
  placeholder,
  onChange,
  onPaste,
  actions,
  onClose,
  t,
}) => {
  const [dialing, setDialing] = useState(false);
  const hasDirectory = directory.length > 0;
  const showField = dialing || !hasDirectory;

  return (
    <div className="ds-dial-panel">
      <div className={`ds-dial-panel-main${showField ? '' : ' ds-dial-panel-main-list'}`}>
        <div className="ds-dial-panel-header">
          <div className="ds-dial-panel-heading">
            <div className="ds-dial-panel-title">{title}</div>
            <div className="ds-dial-panel-peer">{peerName}</div>
          </div>
          <button
            type="button"
            className="ds-dial-panel-close"
            aria-label={t('cancel')}
            onClick={onClose}
          >
            <Glyph glyph={softphoneGlyphs.close} />
          </button>
        </div>

        {showField ? (
          <input
            className="ds-transfer-input"
            type="tel"
            inputMode="tel"
            value={value}
            placeholder={placeholder}
            aria-label={placeholder}
            autoComplete="off"
            autoFocus
            onChange={(e) => onChange(e.target.value)}
            onPaste={(e) => {
              e.preventDefault();
              onPaste(e.clipboardData.getData('text'));
            }}
          />
        ) : (
          <DirectoryPickerView
            destinations={directory}
            isSelected={(entry) => entry.id === picked?.id}
            onPick={onPick}
            t={t}
          />
        )}

        {hasDirectory && (
          <button type="button" className="ds-dial-panel-mode" onClick={() => setDialing(!dialing)}>
            {dialing ? t('chooseFromDirectory') : t('enterNumber')}
          </button>
        )}
      </div>

      {/* The list doesn't show the destination the buttons will act on (a typed
          number, or a pick the search has hidden), so it is spelled out. */}
      {!showField && value.trim() && (
        <div className="ds-dial-panel-target">
          {t('dialTarget')}: {picked ? `${picked.label} · ${value}` : value}
        </div>
      )}

      <div className="ds-transfer-actions">{actions}</div>
    </div>
  );
};
