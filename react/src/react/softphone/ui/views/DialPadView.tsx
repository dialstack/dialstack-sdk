import React, { useRef } from 'react';
import { softphoneGlyphs } from '../../core/icons';
import { Glyph } from '../Glyph';
import { CallErrorChipView, type CallErrorChipViewProps } from './CallErrorChipView';
import { DEFAULT_SCOPE, type SoftphoneViewChrome } from './types';
import { useRoomyHost } from './useRoomyHost';
import { useDialBrowse, type SoftphoneConnectionState } from '../../hooks';
import type { DirectoryContact } from '../../core/view-model';
import { DirectoryPickerView } from './DirectoryPickerView';
import { KeypadView } from './KeypadView';
import { DialMatchesView } from './DialMatchesView';

export interface DialPadViewProps extends Omit<SoftphoneViewChrome, 'displayNumber'> {
  connection: SoftphoneConnectionState;
  destination: string;
  onDestinationChange: (next: string) => void;
  onDestinationPaste: (text: string) => void;
  canCall: boolean;
  onCall: () => void;
  autoFocusDestination?: boolean;
  destinationRef?: React.Ref<HTMLInputElement>;
  error?: CallErrorChipViewProps['error'];
  onDismissError?: () => void;
  /**
   * When not empty: entries matching the typed number are offered above it,
   * and a button beside Call swaps the keypad for the whole list.
   */
  directory?: readonly DirectoryContact[];
  /** The contact `destination` came from, or null when it was typed. */
  picked?: DirectoryContact | null;
  onPick?: (entry: DirectoryContact) => void;
}

const NO_DIRECTORY: readonly DirectoryContact[] = [];

export const DialPadView: React.FC<DialPadViewProps> = ({
  connection,
  destination,
  onDestinationChange,
  onDestinationPaste,
  canCall,
  onCall,
  destinationRef,
  error = null,
  onDismissError = () => {},
  directory = NO_DIRECTORY,
  picked = null,
  onPick = () => {},
  scope = DEFAULT_SCOPE,
  t,
}) => {
  // Tags the host for the compact size tier when it is small.
  const { ref } = useRoomyHost<HTMLDivElement>();
  const hasDirectory = directory.length > 0;
  const bodyRef = useRef<HTMLDivElement>(null);
  const browse = useDialBrowse(hasDirectory, onPick);
  const { showList, pickAndClose, listMinHeight } = browse;
  const toggleList = () => browse.toggleList(bodyRef.current?.offsetHeight);
  return (
    <div ref={ref} className={`${scope} ds-softphone`}>
      <div className="ds-screen ds-screen-dial">
        <StatusChipView connection={connection} t={t} />
        <CallErrorChipView error={error} onDismiss={onDismissError} t={t} />
        {showList ? (
          <div className="ds-dial-body" style={{ minHeight: listMinHeight }}>
            <div className="ds-dial-directory">
              <DirectoryPickerView
                destinations={directory}
                isSelected={(entry) => entry.id === picked?.id}
                onPick={pickAndClose}
                t={t}
              />
            </div>
            {destination && (
              <div className="ds-dial-panel-target">
                {t('dialTarget')}: {picked ? `${picked.label} · ${destination}` : destination}
              </div>
            )}
          </div>
        ) : (
          <div className="ds-dial-body" ref={bodyRef}>
            {hasDirectory && (
              <DialMatchesView
                directory={directory}
                value={destination}
                picked={picked}
                onPick={onPick}
                t={t}
              />
            )}
            <div className="ds-display">
              {}
              {destination.length > 0 && <span className="ds-display-spacer" aria-hidden="true" />}
              <input
                ref={destinationRef}
                className="ds-destination"
                type="tel"
                inputMode="tel"
                value={destination}
                placeholder={t('destinationPlaceholder')}
                aria-label={t('destinationPlaceholder')}
                autoComplete="off"
                onChange={(e) => onDestinationChange(e.target.value)}
                onPaste={(e) => {
                  e.preventDefault();
                  onDestinationPaste(e.clipboardData.getData('text'));
                }}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    if (canCall) onCall();
                  }
                }}
              />
              {destination.length > 0 && (
                <button
                  type="button"
                  className="ds-backspace"
                  aria-label={t('backspace')}
                  onClick={() => onDestinationChange(destination.slice(0, -1))}
                >
                  ⌫
                </button>
              )}
            </div>
            <KeypadView
              label={t('title')}
              onKey={(digit) => onDestinationChange(destination + digit)}
            />
          </div>
        )}
        <div className="ds-actions">
          {hasDirectory && (
            <button
              type="button"
              className="ds-action-side"
              aria-label={showList ? t('enterNumber') : t('chooseFromDirectory')}
              onClick={toggleList}
            >
              <Glyph glyph={showList ? softphoneGlyphs.keypad : softphoneGlyphs.contacts} />
            </button>
          )}
          <button
            type="button"
            className="ds-action ds-call"
            aria-label={t('call')}
            disabled={!canCall}
            onClick={onCall}
          >
            <Glyph glyph={softphoneGlyphs.phone} />
          </button>
          {/* Balances the side button so Call stays centred. */}
          {hasDirectory && <span className="ds-action-side" aria-hidden="true" />}
        </div>
      </div>
    </div>
  );
};

export const StatusChipView: React.FC<{
  connection: SoftphoneConnectionState;
  t: SoftphoneViewChrome['t'];
}> = ({ connection, t }) => {
  switch (connection) {
    case 'connecting':
      return (
        <div className="ds-chip ds-chip-pending" role="status">
          {t('connecting')}
        </div>
      );
    case 'reconnecting':
      return (
        <div className="ds-chip ds-chip-pending" role="status">
          {t('reconnecting')}
        </div>
      );
    case 'disconnected':
      return (
        <div className="ds-chip ds-chip-off" role="status">
          {t('disconnected')}
        </div>
      );
    case 'error':
      return (
        <div className="ds-chip ds-chip-error" role="status">
          {t('connectionError')}
        </div>
      );
    default:
      return <div className="ds-chip ds-chip-spacer" aria-hidden="true" />;
  }
};
