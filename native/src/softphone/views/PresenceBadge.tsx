import React from 'react';
import { View } from 'react-native';
import { presenceGlyphs, presenceTone, type SoftphonePalette } from '@dialstack/sdk-react/core';
import type { PresenceStatus } from '@dialstack/sdk-webrtc';
import { Glyph, type makeStyles } from '../primitives';

const TONE_COLOR = {
  success: 'success',
  warning: 'warning',
  danger: 'danger',
  muted: 'textSecondary',
} as const;

// The same badge as the web picker: the state's mark on a disc in its theme
// colour, hollow for offline.
export function PresenceBadge({
  palette,
  styles,
  presence,
}: {
  palette: SoftphonePalette;
  styles: ReturnType<typeof makeStyles>;
  presence: PresenceStatus;
}): React.JSX.Element {
  const tone = palette[TONE_COLOR[presenceTone(presence)]];
  const offline = presence === 'offline';
  const glyph = presenceGlyphs[presence];
  return (
    <View
      testID="directory-presence"
      importantForAccessibility="no"
      style={[
        styles.directoryPresence,
        offline ? { borderWidth: 1.5, borderColor: tone } : { backgroundColor: tone },
      ]}
    >
      {glyph && <Glyph glyph={glyph} size={12} color={offline ? tone : palette.background} />}
    </View>
  );
}
