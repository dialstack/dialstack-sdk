/**
 * IncomingCall / IncomingStack — the ringing inbound UI.
 *
 * `IncomingCall` is the single full-screen incoming screen (the idle,
 * one-caller case) — it renders the first ringing call as a full-size card, and
 * nothing when none is ringing. `IncomingStack` renders ALL ringing calls as
 * stacked cards, compact when there's more than one; it's what `<Softphone>`
 * layers over the base screen for call-waiting and multiple concurrent inbound.
 *
 * Both read from the softphone context and must be rendered inside a
 * `<SoftphoneProvider>`.
 */

import React from 'react';
import { useSoftphone } from '../provider/SoftphoneProvider';
import { IncomingCallCard } from './IncomingCallCard';

export const IncomingCall: React.FC = () => {
  const { incomingCalls, scope } = useSoftphone();
  const call = incomingCalls[0];
  if (!call) return null;

  return (
    <div className={`${scope} ds-softphone`}>
      <div className="ds-screen ds-screen-incoming">
        <IncomingCallCard call={call} />
      </div>
    </div>
  );
};

/**
 * All ringing inbound calls, stacked. Compact when >1 so a burst of calls (or a
 * call-waiting interrupt over an active call) stays small and non-intrusive.
 * Renders nothing when none is ringing.
 */
export const IncomingStack: React.FC<{ compact?: boolean }> = ({ compact }) => {
  const { incomingCalls, scope } = useSoftphone();
  if (incomingCalls.length === 0) return null;
  // Compact whenever the caller asks (overlay case) or there's more than one.
  const isCompact = compact ?? incomingCalls.length > 1;

  // Self-wrap in the scope so the stack renders correctly when dropped in
  // standalone. When `<Softphone>` composes it inside another scoped wrapper the
  // nested `.ds-softphone` collapses its box (see styles.ts), so this is safe.
  return (
    <div className={`${scope} ds-softphone`}>
      <div className="ds-incoming-stack">
        {incomingCalls.map((call) => (
          <IncomingCallCard key={call.id} call={call} compact={isCompact} />
        ))}
      </div>
    </div>
  );
};
