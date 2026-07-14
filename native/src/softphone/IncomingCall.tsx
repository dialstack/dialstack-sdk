/**
 * IncomingCall / IncomingStack (RN) — the ringing inbound UI.
 *
 * `IncomingCall` is the single full-screen incoming screen (idle, one caller);
 * it renders the first ringing call as a full-size card, nothing when none is
 * ringing. `IncomingStack` renders ALL ringing calls, compact when >1 — what the
 * RN <Softphone> layers over the base for call-waiting / multiple inbound.
 *
 * Both read from context and must be rendered inside a <SoftphoneProvider>.
 */

import React, { useMemo } from 'react';
import { View } from 'react-native';
import { useSoftphone } from '../SoftphoneProvider';
import { IncomingCallCard } from './IncomingCallCard';
import { makeStyles } from './primitives';

export function IncomingCall(): React.JSX.Element | null {
  const { incomingCalls } = useSoftphone();
  const call = incomingCalls[0];
  if (!call) return null;
  return <IncomingCallCard call={call} />;
}

/**
 * All ringing inbound calls, stacked. Compact when >1 (or when the caller forces
 * it for the overlay case) so a burst of calls stays small and non-intrusive.
 * Renders nothing when none is ringing.
 */
export function IncomingStack({ compact }: { compact?: boolean }): React.JSX.Element | null {
  const { incomingCalls, palette } = useSoftphone();
  const styles = useMemo(() => makeStyles(palette), [palette]);
  if (incomingCalls.length === 0) return null;
  const isCompact = compact ?? incomingCalls.length > 1;

  return (
    <View style={styles.incomingStack}>
      {incomingCalls.map((call) => (
        <IncomingCallCard key={call.id} call={call} compact={isCompact} />
      ))}
    </View>
  );
}
