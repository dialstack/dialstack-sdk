/**
 * IncomingCallCard — one ringing inbound call's card: caller name/number and
 * answer/decline buttons, driven by a SPECIFIC call (not the foreground one) so
 * several can render at once. `compact` shrinks it for the stacked / call-waiting
 * presentations.
 *
 * Answering routes through the context's `answerCall` (which auto-holds the
 * current active call), not the raw per-call action, so accepting an interrupt
 * behaves the same as switching. Declining is a plain per-call reject.
 *
 * Must be rendered inside a `<SoftphoneProvider>`.
 */

import React from 'react';
import { useSoftphone } from '../provider/SoftphoneProvider';
import { softphoneGlyphs } from '../core/icons';
import { callPeerName, callPeerNumber } from '../hooks';
import { Glyph } from './Glyph';
import type { Call } from '../../../webrtc';

export const IncomingCallCard: React.FC<{
  call: Call;
  compact?: boolean;
}> = ({ call, compact = false }) => {
  const { answerCall, actions, t, displayNumber } = useSoftphone();
  const peer = callPeerNumber(call);
  const name = callPeerName(call) || displayNumber(peer) || t('unknownCaller');

  return (
    <div className={`ds-incoming-card ${compact ? 'ds-incoming-card-compact' : ''}`}>
      <div className="ds-incoming-card-info">
        <div className="ds-incoming-label">{t('incomingCall')}</div>
        <div className="ds-peer-name">{name}</div>
        {callPeerName(call) && <div className="ds-peer-number">{displayNumber(peer)}</div>}
      </div>
      <div className="ds-actions ds-actions-incoming">
        <button
          type="button"
          className="ds-action ds-decline"
          aria-label={t('decline')}
          onClick={() => actions.callActionsFor(call).reject()}
        >
          <Glyph glyph={softphoneGlyphs.hangup} />
        </button>
        <button
          type="button"
          className="ds-action ds-answer"
          aria-label={t('answer')}
          onClick={() => answerCall(call)}
        >
          <Glyph glyph={softphoneGlyphs.phone} />
        </button>
      </div>
    </div>
  );
};
