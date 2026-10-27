import React from 'react';
import { softphoneGlyphs } from '../../core/icons';
import type { DirectoryContact } from '../../core/view-model';
import { useDialPanel } from '../../hooks';
import { Glyph } from '../Glyph';
import { DialMatchesView } from './DialMatchesView';
import { DirectoryPickerView } from './DirectoryPickerView';
import { PickedTargetView } from './PickedTargetView';
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
  /** Drops `picked`, and the value it set. */
  onClearPick?: () => void;
  value: string;
  /** Says what the field or the picked contact is for ("Transfer to"). */
  targetLabel: string;
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
  onClearPick = () => {},
  value,
  targetLabel,
  placeholder,
  onChange,
  onPaste,
  actions,
  onClose,
  t,
}) => {
  const { hasDirectory, pickedNow, showField, showList, showTarget, toggleDialing } = useDialPanel(
    directory,
    picked,
    value
  );

  return (
    <div className="ds-dial-panel">
      {/* Only the list expands to the top; the field and a pick sit lower. */}
      <div className={`ds-dial-panel-main${showList ? ' ds-dial-panel-main-list' : ''}`}>
        <div className="ds-dial-panel-header">
          <div className="ds-dial-panel-heading">
            <div className="ds-dial-panel-title">{title}</div>
            <div className="ds-dial-panel-peer">{peerName}</div>
          </div>
          {hasDirectory && !picked && (
            <button
              type="button"
              className="ds-dial-panel-close"
              aria-label={showField ? t('chooseFromDirectory') : t('enterNumber')}
              onClick={toggleDialing}
            >
              <Glyph glyph={showField ? softphoneGlyphs.contacts : softphoneGlyphs.keypad} />
            </button>
          )}
          <button
            type="button"
            className="ds-dial-panel-close"
            aria-label={t('cancel')}
            onClick={onClose}
          >
            <Glyph glyph={softphoneGlyphs.close} />
          </button>
        </div>

        {!showList && <div className="ds-dial-panel-label">{targetLabel}</div>}
        {pickedNow ? (
          <PickedTargetView entry={pickedNow} onClear={onClearPick} t={t} />
        ) : (
          <>
            {showField && hasDirectory && (
              <DialMatchesView
                directory={directory}
                value={value}
                picked={null}
                onPick={onPick}
                t={t}
              />
            )}
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
                isSelected={() => false}
                onPick={onPick}
                t={t}
              />
            )}
          </>
        )}
      </div>

      {/* A number typed before switching to the list is still what the buttons
          act on, and the list doesn't show it, so it is spelled out. */}
      {showTarget && (
        <div className="ds-dial-panel-target">
          {t('dialTarget')}: {value}
        </div>
      )}

      <div className="ds-transfer-actions">{actions}</div>
    </div>
  );
};
