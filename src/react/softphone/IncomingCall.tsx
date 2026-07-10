/**
 * IncomingCall — the ringing screen: caller name/number, a pulse, and
 * decline/answer buttons. Renders nothing when there is no ringing inbound call.
 *
 * Reads the ringing call + actions from the softphone context. Must be rendered
 * inside a `<SoftphoneProvider>`.
 */

import React from 'react';
import { useSoftphone, useIncomingCall } from '../SoftphoneProvider';
import { softphoneGlyphs } from '../../components/softphone-icons';
import { Glyph } from './Glyph';

export function IncomingCall(): React.JSX.Element | null {
  const { actions, t, displayNumber, scope } = useSoftphone();
  const call = useIncomingCall();
  if (!call) return null;

  const name = call.fromName || displayNumber(call.from) || t('unknownCaller');

  return (
    <div className={`${scope} ds-softphone`}>
      <div className="ds-screen ds-screen-incoming">
        <div className="ds-incoming-label">{t('incomingCall')}</div>
        <div className="ds-peer">
          <div className="ds-peer-name">{name}</div>
          {call.fromName && <div className="ds-peer-number">{displayNumber(call.from)}</div>}
        </div>
        <div className="ds-incoming-pulse" aria-hidden="true" />
        <div className="ds-actions ds-actions-incoming">
          <button
            type="button"
            className="ds-action ds-decline"
            aria-label={t('decline')}
            onClick={actions.reject}
          >
            <Glyph glyph={softphoneGlyphs.hangup} />
          </button>
          <button
            type="button"
            className="ds-action ds-answer"
            aria-label={t('answer')}
            onClick={actions.answer}
          >
            <Glyph glyph={softphoneGlyphs.phone} />
          </button>
        </div>
      </div>
    </div>
  );
}
