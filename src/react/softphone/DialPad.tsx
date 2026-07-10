/**
 * DialPad — the idle/outbound screen of the softphone: connection status chip,
 * the built-in E911 banner, a destination field, the 12-key pad, and the call
 * button. Reads connection + `placeCall` from the softphone context and owns only
 * its own `destination` text.
 *
 * Must be rendered inside a `<SoftphoneProvider>`.
 */

import React, { useEffect, useRef, useState } from 'react';
import { useSoftphone } from '../SoftphoneProvider';
import { useDialInput } from '../softphone-hooks';
import { dialPadKeys } from '../../components/softphone-theme';
import { softphoneGlyphs } from '../../components/softphone-icons';
import { Glyph } from './Glyph';
import { EmergencyBanner } from './EmergencyBanner';
import { CallErrorChip } from './CallErrorChip';

export interface DialPadProps {
  /**
   * Focus the destination field on mount so the user can type immediately (e.g.
   * when the dial pad opens in a drawer). Off by default to avoid stealing focus.
   */
  autoFocusDestination?: boolean;
}

export function DialPad({ autoFocusDestination = false }: DialPadProps): React.JSX.Element {
  const { connection, placeCall, t, scope } = useSoftphone();
  const [destination, setDestination] = useState('');
  const { onType, onPasteText } = useDialInput(setDestination);
  const destinationRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    if (autoFocusDestination) destinationRef.current?.focus();
  }, [autoFocusDestination]);

  const canCall = connection === 'connected' && destination.length > 0;

  return (
    <div className={`${scope} ds-softphone`}>
      <div className="ds-screen ds-screen-dial">
        <EmergencyBanner />
        <StatusChip />
        <CallErrorChip />
        <div className="ds-display">
          <input
            ref={destinationRef}
            className="ds-destination"
            type="tel"
            inputMode="tel"
            value={destination}
            placeholder={t('destinationPlaceholder')}
            aria-label={t('destinationPlaceholder')}
            autoComplete="off"
            onChange={(e) => onType(e.target.value)}
            onPaste={(e) => {
              e.preventDefault();
              onPasteText(e.clipboardData.getData('text'));
            }}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                if (canCall) void placeCall(destination);
              }
            }}
          />
          {destination.length > 0 && (
            <button
              type="button"
              className="ds-backspace"
              aria-label={t('backspace')}
              onClick={() => setDestination((p) => p.slice(0, -1))}
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
              onClick={() => setDestination((p) => p + digit)}
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
            onClick={() => void placeCall(destination)}
          >
            <Glyph glyph={softphoneGlyphs.phone} />
          </button>
        </div>
      </div>
    </div>
  );
}

/** Connection-state chip shown at the top of the dial screen. */
function StatusChip(): React.JSX.Element {
  const { connection, t } = useSoftphone();
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
}
