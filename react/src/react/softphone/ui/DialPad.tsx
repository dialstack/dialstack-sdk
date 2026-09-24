/**
 * DialPad — the idle/outbound screen of the softphone: connection status chip, a
 * destination field, the 12-key pad, and the call button. Reads connection +
 * `placeCall` from the softphone context and owns only its own `destination` text.
 *
 * The E911 prompt is NOT rendered here — `<EmergencyBanner>` is a separate
 * component so a modular consumer can place it wherever their layout wants (or
 * omit it when the host manages E911). The batteries-included `<Softphone>`
 * renders the banner above this pad itself, so its look is unchanged.
 *
 * Must be rendered inside a `<SoftphoneProvider>`.
 */

import React, { useEffect, useRef, useState } from 'react';
import { useSoftphone } from '../provider/SoftphoneProvider';
import { useDialInput, canPlaceCall } from '../hooks';
import { DialPadView } from './views/DialPadView';

export interface DialPadProps {
  /**
   * Focus the destination field on mount so the user can type immediately (e.g.
   * when the dial pad opens in a drawer). Off by default to avoid stealing focus.
   */
  autoFocusDestination?: boolean;
}

export const DialPad: React.FC<DialPadProps> = ({ autoFocusDestination = false }) => {
  const { connection, placeCall, emergency, lastError, clearError, t, scope } = useSoftphone();
  const [destination, setDestination] = useState('');
  const { onType, onPasteText } = useDialInput(setDestination);
  const destinationRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    if (autoFocusDestination) destinationRef.current?.focus();
  }, [autoFocusDestination]);

  const canCall = canPlaceCall(connection, destination, emergency.submitting);

  return (
    <DialPadView
      connection={connection}
      destination={destination}
      onDestinationChange={onType}
      onDestinationPaste={onPasteText}
      canCall={canCall}
      onCall={() => void placeCall(destination)}
      destinationRef={destinationRef}
      error={lastError}
      onDismissError={clearError}
      scope={scope}
      t={t}
    />
  );
};
