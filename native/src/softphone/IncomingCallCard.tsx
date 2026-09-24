/**
 * IncomingCallCard (RN) — one ringing inbound call's card: caller name/number
 * and decline/answer, driven by a SPECIFIC call so several can render at once.
 * `compact` shrinks it (inline buttons, bordered surface) for the stacked /
 * call-waiting presentations. RN mirror of the web IncomingCallCard.
 *
 * Answering routes through the context's `answerCall` (auto-holds the current
 * call); declining is a plain per-call reject. Must be rendered inside a
 * <SoftphoneProvider>.
 */

import React from 'react';
import { callPeerName, callPeerNumber, type Call } from '@dialstack/sdk-react/core';
import { useSoftphone } from '../SoftphoneProvider';
import { IncomingCallCardView } from './views/IncomingCallCardView';

export function IncomingCallCard({
  call,
  compact = false,
}: {
  call: Call;
  compact?: boolean;
}): React.JSX.Element {
  const { answerCall, actions, displayNumber, t, palette } = useSoftphone();
  const peerRaw = callPeerNumber(call);
  const peerName = callPeerName(call);

  return (
    <IncomingCallCardView
      palette={palette}
      t={t}
      name={peerName || displayNumber(peerRaw) || t('unknownCaller')}
      number={peerName ? displayNumber(peerRaw) : null}
      compact={compact}
      onAnswer={() => answerCall(call)}
      onDecline={() => actions.callActionsFor(call).reject()}
    />
  );
}
