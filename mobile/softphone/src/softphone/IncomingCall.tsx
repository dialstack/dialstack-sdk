/**
 * IncomingCall (RN) — the ringing screen: caller name/number, a pulse, and
 * decline/answer. Renders nothing when there is no ringing inbound call.
 *
 * Must be rendered inside a <SoftphoneProvider>.
 */

import React, { useMemo } from 'react';
import { Pressable, Text, View } from 'react-native';
import { softphoneDimensions as D } from '@dialstack/sdk/components/softphone-theme';
import { softphoneGlyphs } from '@dialstack/sdk/components/softphone-icons';
import { callPeerName, callPeerNumber } from '@dialstack/sdk/react/softphone';
import { useSoftphone, useIncomingCall } from '../SoftphoneProvider';
import { Glyph, PulseDot, makeStyles } from './primitives';

export function IncomingCall(): React.JSX.Element | null {
  const { actions, displayNumber, palette } = useSoftphone();
  const call = useIncomingCall();
  const styles = useMemo(() => makeStyles(palette), [palette]);
  if (!call) return null;

  const peerRaw = callPeerNumber(call);
  const peerName = callPeerName(call);

  return (
    <>
      <Text style={styles.incomingLabel}>INCOMING CALL</Text>
      <View style={styles.peer}>
        <Text style={styles.peerName}>{peerName || displayNumber(peerRaw) || 'Unknown'}</Text>
        {!!peerName && <Text style={styles.peerNumber}>{displayNumber(peerRaw)}</Text>}
      </View>
      <PulseDot color={palette.success} />
      <View style={[styles.actions, styles.actionsSpread]}>
        <Pressable
          onPress={actions.reject}
          accessibilityLabel="Decline"
          style={({ pressed }: { pressed: boolean }) => [
            styles.action,
            styles.actionDanger,
            pressed && styles.actionPressed,
          ]}
        >
          <Glyph
            glyph={softphoneGlyphs.hangup}
            size={D.actionButtonSize * 0.46}
            color={palette.onAccent}
          />
        </Pressable>
        <Pressable
          onPress={actions.answer}
          accessibilityLabel="Answer"
          style={({ pressed }: { pressed: boolean }) => [
            styles.action,
            styles.actionSuccess,
            pressed && styles.actionPressed,
          ]}
        >
          <Glyph
            glyph={softphoneGlyphs.phone}
            size={D.actionButtonSize * 0.46}
            color={palette.onAccent}
          />
        </Pressable>
      </View>
    </>
  );
}
