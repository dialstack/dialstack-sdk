import React, { useMemo } from 'react';
import { Pressable, Text, View } from 'react-native';
import {
  softphoneDimensions as D,
  softphoneGlyphs,
  type Locale,
  type SoftphonePalette,
} from '@dialstack/sdk-react/core';
import { ControlsSlot, Glyph, makeStyles } from '../primitives';

export interface IncomingCallCardViewProps {
  palette: SoftphonePalette;
  t: (key: keyof Locale['softphone']) => string;
  name: string;
  number?: string | null;
  compact?: boolean;
  onAnswer: () => void;
  onDecline: () => void;
}

export function IncomingCallCardView({
  palette,
  t,
  name,
  number = null,
  compact = false,
  onAnswer,
  onDecline,
}: IncomingCallCardViewProps): React.JSX.Element {
  const styles = useMemo(() => makeStyles(palette), [palette]);
  const size = compact ? D.actionButtonSize * 0.72 : D.actionButtonSize;

  return (
    <View style={compact ? styles.incomingCardCompact : styles.incomingCard}>
      <View
        style={compact ? [styles.incomingCardInfo, styles.incomingCardInfoCompact] : styles.peer}
      >
        <Text style={compact ? styles.peerNameCompact : styles.peerName} numberOfLines={1}>
          {name}
        </Text>
        {!!number && (
          <Text style={compact ? styles.peerNumberCompact : styles.peerNumber} numberOfLines={1}>
            {number}
          </Text>
        )}
        <Text
          style={
            compact ? [styles.incomingLabel, styles.incomingLabelCompact] : styles.incomingLabel
          }
        >
          {t('incomingCall')}
        </Text>
      </View>
      {}
      {!compact && <ControlsSlot styles={styles} />}
      <View style={[styles.actions, styles.actionsSpread, compact && styles.actionsCompact]}>
        <Pressable
          onPress={onDecline}
          accessibilityLabel={t('decline')}
          style={({ pressed }: { pressed: boolean }) => [
            styles.action,
            compact && styles.actionCompact,
            styles.actionDanger,
            pressed && styles.actionPressed,
          ]}
        >
          <Glyph glyph={softphoneGlyphs.hangup} size={size * 0.46} color={palette.onAccent} />
        </Pressable>
        <Pressable
          onPress={onAnswer}
          accessibilityLabel={t('answer')}
          style={({ pressed }: { pressed: boolean }) => [
            styles.action,
            compact && styles.actionCompact,
            styles.actionSuccess,
            pressed && styles.actionPressed,
          ]}
        >
          <Glyph glyph={softphoneGlyphs.phone} size={size * 0.46} color={palette.onAccent} />
        </Pressable>
      </View>
    </View>
  );
}
