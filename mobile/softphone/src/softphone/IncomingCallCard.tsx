/**
 * IncomingCallCard (RN) — one ringing inbound call's card: caller name/number
 * and decline/answer, driven by a SPECIFIC call so several can render at once.
 * `compact` shrinks it (inline buttons, bordered surface) for the stacked /
 * call-waiting presentations. RN mirror of the web IncomingCallCard.
 *
 * Answering routes through the context's `answerCall` (auto-holds the current
 * call); declining is a plain per-call reject. Must be rendered inside a
 * <SoftphoneProvider>.
 */

import React, { useMemo } from 'react';
import { Pressable, Text, View } from 'react-native';
import { softphoneDimensions as D } from '@dialstack/sdk/components/softphone-theme';
import { softphoneGlyphs } from '@dialstack/sdk/components/softphone-icons';
import { callPeerName, callPeerNumber } from '@dialstack/sdk/react/softphone';
import type { Call } from '@dialstack/sdk/webrtc';
import { useSoftphone } from '../SoftphoneProvider';
import { Glyph, makeStyles } from './primitives';

export function IncomingCallCard({
  call,
  compact = false,
}: {
  call: Call;
  compact?: boolean;
}): React.JSX.Element {
  const { answerCall, actions, displayNumber, t, palette } = useSoftphone();
  const styles = useMemo(() => makeStyles(palette), [palette]);
  const peerRaw = callPeerNumber(call);
  const peerName = callPeerName(call);
  const name = peerName || displayNumber(peerRaw) || t('unknownCaller');
  const size = compact ? D.actionButtonSize * 0.72 : D.actionButtonSize;

  return (
    <View style={compact ? styles.incomingCardCompact : styles.incomingCard}>
      <View style={compact ? styles.incomingCardInfo : styles.peer}>
        <Text style={styles.incomingLabel}>{t('incomingCall')}</Text>
        <Text style={compact ? styles.peerNameCompact : styles.peerName} numberOfLines={1}>
          {name}
        </Text>
        {!!peerName && (
          <Text style={compact ? styles.peerNumberCompact : styles.peerNumber} numberOfLines={1}>
            {displayNumber(peerRaw)}
          </Text>
        )}
      </View>
      <View style={[styles.actions, styles.actionsSpread, compact && styles.actionsCompact]}>
        <Pressable
          onPress={() => actions.callActionsFor(call).reject()}
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
          onPress={() => answerCall(call)}
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
