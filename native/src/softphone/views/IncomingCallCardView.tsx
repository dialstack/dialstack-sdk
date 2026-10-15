import React, { useMemo } from 'react';
import { Pressable, Text, View } from 'react-native';
import { softphoneGlyphs, type Locale, type SoftphonePalette } from '@dialstack/sdk-react/core';
import { ControlsSlot, Glyph, makeStyles } from '../primitives';
import type { PeerSummary } from './OngoingCallView';
import { PeerAvatar } from './PeerAvatar';
import { useRoomyHost } from './useRoomyHost';

export interface IncomingCallCardViewProps {
  palette: SoftphonePalette;
  t: (key: keyof Locale['softphone']) => string;
  name: string;
  number?: string | null;
  /** The host's avatar from `resolvePeer`, on the full card only: the compact one has no room. */
  avatar?: PeerSummary['avatar'];
  compact?: boolean;
  onAnswer: () => void;
  onDecline: () => void;
}

export function IncomingCallCardView({
  palette,
  t,
  name,
  number = null,
  avatar,
  compact = false,
  onAnswer,
  onDecline,
}: IncomingCallCardViewProps): React.JSX.Element {
  const { roomy, onLayout } = useRoomyHost();
  const styles = useMemo(() => makeStyles(palette, !roomy), [palette, roomy]);
  const size = (styles.action.width as number) * (compact ? 0.72 : 1);

  return (
    <View style={compact ? styles.incomingCardCompact : styles.incomingCard} onLayout={onLayout}>
      <View
        style={compact ? [styles.incomingCardInfo, styles.incomingCardInfoCompact] : styles.peer}
      >
        {!compact && roomy && <PeerAvatar palette={palette} avatar={avatar} />}
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
