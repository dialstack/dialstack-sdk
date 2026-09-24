/**
 * The dismissible error banner shown on the dial + in-call screens when a call or
 * connection fails. Reads the last error from the softphone context and maps its
 * code to a generic (or, for a denied mic, actionable) localized message — the
 * raw server text is never shown. Renders nothing when there's no error.
 */

import React from 'react';
import { useSoftphone } from '../provider/SoftphoneProvider';
import { CallErrorChipView } from './views/CallErrorChipView';

export const CallErrorChip: React.FC = () => {
  const { lastError, clearError, t } = useSoftphone();
  return <CallErrorChipView error={lastError} onDismiss={clearError} t={t} />;
};
