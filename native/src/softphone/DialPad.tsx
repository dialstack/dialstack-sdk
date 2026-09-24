/**
 * DialPad (RN) — the idle/outbound screen: connection status chip, a destination
 * field, the keypad, and the call button. Reads connection + placeCall from the
 * softphone context; owns its own destination.
 *
 * The E911 prompt is NOT rendered here — <EmergencyBanner> is a separate
 * component so a modular consumer can place it anywhere (or omit it when the host
 * manages E911). The batteries-included <Softphone> renders the banner above this
 * pad itself, so its look is unchanged.
 *
 * Must be rendered inside a <SoftphoneProvider>.
 */
import React, { useState } from 'react';
import { useDialInput, canPlaceCall } from '@dialstack/sdk-react/core';
import { useSoftphone } from '../SoftphoneProvider';
import { CallErrorChip } from './CallErrorChip';
import { DialPadView } from './views/DialPadView';

export interface DialPadProps {
  autoFocusDestination?: boolean;
  compact?: boolean;
}

export function DialPad({
  autoFocusDestination = false,
  compact = false,
}: DialPadProps): React.JSX.Element {
  const { connection, placeCall, emergency, t, palette } = useSoftphone();
  const [destination, setDestination] = useState('');
  const { onType } = useDialInput(setDestination);

  return (
    <DialPadView
      palette={palette}
      t={t}
      connection={connection}
      destination={destination}
      onDestinationChange={onType}
      canCall={canPlaceCall(connection, destination, emergency.submitting)}
      onCall={() => void placeCall(destination)}
      autoFocusDestination={autoFocusDestination}
      compact={compact}
      errorChip={<CallErrorChip />}
    />
  );
}
