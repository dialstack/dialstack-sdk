import React from 'react';
import { dialPadKeys } from '../../core/theme';
import { softphoneGlyphs } from '../../core/icons';
import { Glyph } from '../Glyph';
import { CallErrorChipView, type CallErrorChipViewProps } from './CallErrorChipView';
import { DEFAULT_SCOPE, type SoftphoneViewChrome } from './types';
import type { SoftphoneConnectionState } from '../../hooks';

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
}

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
  scope = DEFAULT_SCOPE,
  t,
}) => (
  <div className={`${scope} ds-softphone`}>
    <div className="ds-screen ds-screen-dial">
      <StatusChipView connection={connection} t={t} />
      <CallErrorChipView error={error} onDismiss={onDismissError} t={t} />
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
      <div className="ds-keypad" role="group" aria-label={t('title')}>
        {dialPadKeys.map(({ digit, letters }) => (
          <button
            type="button"
            key={digit}
            className="ds-key"
            aria-label={`${digit}${letters ? ' ' + letters : ''}`}
            onClick={() => onDestinationChange(destination + digit)}
          >
            <span className="ds-key-digit">{digit}</span>
            <span className="ds-key-letters">{letters || ' '}</span>
          </button>
        ))}
      </div>
      <div className="ds-actions">
        <button
          type="button"
          className="ds-action ds-call"
          aria-label={t('call')}
          disabled={!canCall}
          onClick={onCall}
        >
          <Glyph glyph={softphoneGlyphs.phone} />
        </button>
      </div>
    </div>
  </div>
);

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
