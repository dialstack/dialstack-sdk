/**
 * RN dismissible error banner for the dial + in-call screens. Reads the last
 * error from the softphone context and maps its code to a generic (or, for a
 * denied mic, actionable) message via the shared errorMessageKey — raw server
 * text is never shown. Renders nothing when there's no error. The web sibling is
 * softphone/CallErrorChip.tsx.
 */

import React, { useMemo } from 'react';
import { Pressable, Text } from 'react-native';
import { errorMessageKey } from '@dialstack/sdk/react/softphone';
import { useSoftphone } from '../SoftphoneProvider';
import { makeStyles } from './primitives';

export function CallErrorChip(): React.JSX.Element | null {
  const { lastError, clearError, t, palette } = useSoftphone();
  const styles = useMemo(() => makeStyles(palette), [palette]);
  if (!lastError) return null;
  return (
    <Pressable
      onPress={clearError}
      accessibilityRole="alert"
      accessibilityLabel={t('dismiss')}
      style={[styles.chip, styles.chipError, styles.callError]}
    >
      <Text style={[styles.chipText, styles.chipErrorText]}>
        {t(errorMessageKey(lastError.code))}
      </Text>
      <Text style={[styles.chipText, styles.chipErrorText]}>✕</Text>
    </Pressable>
  );
}
