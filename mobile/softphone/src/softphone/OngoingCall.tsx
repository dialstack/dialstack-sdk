/**
 * OngoingCall (RN) — the in-call screen: peer + state + duration, optional DTMF
 * keypad and transfer overlays, the control row (mute/hold/keypad/transfer), and
 * hang up. Renders nothing when there is no active call. Owns its transient DTMF
 * and transfer text; reads the call/actions/duration from context.
 *
 * Must be rendered inside a <SoftphoneProvider>.
 */

import React, { useEffect, useMemo, useState } from 'react';
import { Pressable, Text, TextInput, View } from 'react-native';
import type { CallState } from '@dialstack/sdk/webrtc';
import { callPeerNumber, callPeerName, callStateLabelKey } from '@dialstack/sdk/react/softphone';
import { dialPadKeys, softphoneDimensions as D } from '@dialstack/sdk/components/softphone-theme';
import { softphoneGlyphs } from '@dialstack/sdk/components/softphone-icons';
import { useSoftphone } from '../SoftphoneProvider';
import { Glyph, ControlButton, chunk, makeStyles, STATE_LABEL } from './primitives';

export function OngoingCall(): React.JSX.Element | null {
  const { activeCall: call, actions, duration, displayNumber, palette } = useSoftphone();
  const styles = useMemo(() => makeStyles(palette), [palette]);
  const { showKeypad, showTransfer } = actions;
  const [transferTo, setTransferTo] = useState('');

  const callId = call?.id ?? null;
  useEffect(() => {
    setTransferTo('');
  }, [callId]);

  if (!call) return null;

  const peerRaw = callPeerNumber(call);
  const peerName = callPeerName(call);
  const isActive = call.state === 'active' || call.state === 'held';
  // react-native-webrtc exposes no RTCDTMFSender, so DTMF can't be sent on
  // native — hide the keypad rather than throw on each tap.
  const canSendDtmf = call.canSendDtmf;

  return (
    <>
      <View style={styles.peer}>
        <Text style={styles.peerName}>{peerName || displayNumber(peerRaw) || 'Unknown'}</Text>
        {!!peerName && <Text style={styles.peerNumber}>{displayNumber(peerRaw)}</Text>}
        <View style={styles.callState}>
          <Text style={styles.callStateText}>
            {STATE_LABEL[callStateLabelKey(call.state as CallState)] ?? ''}
          </Text>
          {isActive && <Text style={styles.duration}>{duration}</Text>}
        </View>
      </View>

      {isActive && showKeypad && canSendDtmf && (
        <View style={styles.dtmfPad}>
          {chunk(dialPadKeys, 3).map((row, i) => (
            <View key={i} style={styles.keyRow}>
              {row.map(({ digit }) => (
                <Pressable
                  key={digit}
                  onPress={() => actions.sendDtmf(digit)}
                  accessibilityLabel={digit}
                  style={({ pressed }: { pressed: boolean }) => [
                    styles.key,
                    styles.keyDtmf,
                    pressed && styles.keyPressed,
                  ]}
                >
                  <Text style={styles.keyDigit}>{digit}</Text>
                </Pressable>
              ))}
            </View>
          ))}
        </View>
      )}

      {isActive && showTransfer && (
        <View style={styles.transfer}>
          <TextInput
            style={styles.transferInput}
            value={transferTo}
            onChangeText={setTransferTo}
            placeholder="Transfer to…"
            placeholderTextColor={palette.textSecondary}
            keyboardType="phone-pad"
            autoCorrect={false}
          />
          <Pressable
            onPress={() => {
              actions.transfer(transferTo);
              setTransferTo('');
            }}
            style={styles.transferSend}
          >
            <Text style={styles.transferSendText}>Transfer</Text>
          </Pressable>
        </View>
      )}

      {isActive && (
        <View style={styles.controls}>
          <ControlButton
            label={call.isMuted ? 'Unmute' : 'Mute'}
            glyph={call.isMuted ? softphoneGlyphs.micOff : softphoneGlyphs.mic}
            on={call.isMuted}
            onPress={actions.toggleMute}
            palette={palette}
            styles={styles}
          />
          <ControlButton
            label={call.state === 'held' ? 'Resume' : 'Hold'}
            glyph={softphoneGlyphs.pause}
            on={call.state === 'held'}
            onPress={actions.toggleHold}
            palette={palette}
            styles={styles}
          />
          {canSendDtmf && (
            <ControlButton
              label="Keypad"
              glyph={softphoneGlyphs.keypad}
              on={showKeypad}
              onPress={actions.toggleKeypad}
              palette={palette}
              styles={styles}
            />
          )}
          <ControlButton
            label="Transfer"
            glyph={softphoneGlyphs.transfer}
            on={showTransfer}
            onPress={actions.toggleTransfer}
            palette={palette}
            styles={styles}
          />
        </View>
      )}

      <View style={styles.actions}>
        <Pressable
          onPress={actions.hangup}
          accessibilityLabel="Hang up"
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
      </View>
    </>
  );
}
