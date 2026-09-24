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
import { callPeerName, callPeerNumber } from '../hooks';
import { IncomingCallCardView } from './views/IncomingCallCardView';
import type { Call } from '@dialstack/sdk-webrtc';

export const IncomingCallCard: React.FC<{
  call: Call;
  compact?: boolean;
}> = ({ call, compact = false }) => {
  const { answerCall, actions, t, displayNumber } = useSoftphone();
  const peer = callPeerNumber(call);
  const resolvedName = callPeerName(call);

  return (
    <IncomingCallCardView
      name={resolvedName || displayNumber(peer) || t('unknownCaller')}
      number={resolvedName ? displayNumber(peer) : null}
      compact={compact}
      onAnswer={() => answerCall(call)}
      onDecline={() => actions.callActionsFor(call).reject()}
      t={t}
    />
  );
};
