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
import {
  callPeerNumber,
  callPeerName,
  callStateLabelKey,
  useDialInput,
} from '@dialstack/sdk/react/softphone';
import { dialPadKeys, softphoneDimensions as D } from '@dialstack/sdk/components/softphone-theme';
import { softphoneGlyphs } from '@dialstack/sdk/components/softphone-icons';
import { useSoftphone } from '../SoftphoneProvider';
import { CallErrorChip } from './CallErrorChip';
import { Glyph, ControlButton, chunk, makeStyles } from './primitives';

export function OngoingCall(): React.JSX.Element | null {
  const {
    activeCall: call,
    actions,
    duration,
    consultCall,
    transferOriginal,
    startAttendedTransfer,
    completeAttendedTransfer,
    cancelAttendedTransfer,
    displayNumber,
    t,
    palette,
  } = useSoftphone();
  const styles = useMemo(() => makeStyles(palette), [palette]);
  const { showKeypad, showTransfer } = actions;
  const [transferTo, setTransferTo] = useState('');
  const { onType: onTransferType } = useDialInput(setTransferTo);

  const callId = call?.id ?? null;
  useEffect(() => {
    setTransferTo('');
  }, [callId]);

  // Attended-transfer "consulting" screen: the original party is held while we
  // talk to the consult target, then bridge (complete) or drop back (cancel).
  // Checked BEFORE `if (!call)` so the consult UI stays reachable if the held
  // original drops mid-consult.
  if (consultCall && transferOriginal) {
    const heldPeer = callPeerNumber(transferOriginal);
    const heldName =
      callPeerName(transferOriginal) || displayNumber(heldPeer) || t('unknownCaller');
    const consultPeer = callPeerNumber(consultCall);
    const consultName =
      callPeerName(consultCall) || displayNumber(consultPeer) || t('unknownCaller');
    const canComplete = consultCall.state === 'active';
    return (
      <>
        <View style={[styles.consultParty, styles.consultHeld]}>
          <Text style={styles.peerName}>{heldName}</Text>
          <Text style={styles.callStateText}>{t('transferOriginalOnHold')}</Text>
        </View>
        <View style={[styles.consultParty, styles.consultActive]}>
          <Text style={styles.peerName}>{consultName}</Text>
          <Text style={styles.callStateText}>
            {t(callStateLabelKey(consultCall.state as CallState))}
          </Text>
        </View>
        <View style={styles.consultActions}>
          <Pressable onPress={cancelAttendedTransfer} style={styles.e911BtnSecondary}>
            <Text style={styles.e911BtnSecondaryText}>{t('cancel')}</Text>
          </Pressable>
          <Pressable
            onPress={completeAttendedTransfer}
            disabled={!canComplete}
            style={[styles.e911Btn, !canComplete && styles.e911BtnDisabled]}
          >
            <Text style={styles.e911BtnText}>{t('transferComplete')}</Text>
          </Pressable>
        </View>
      </>
    );
  }

  if (!call) return null;

  const peerRaw = callPeerNumber(call);
  const peerName = callPeerName(call);
  const isActive = call.state === 'active' || call.state === 'held';
  const name = peerName || displayNumber(peerRaw) || t('unknownCaller');
  // react-native-webrtc exposes no RTCDTMFSender, so DTMF can't be sent on
  // native — hide the keypad rather than throw on each tap.
  const canSendDtmf = call.canSendDtmf;

  return (
    <>
      <View style={styles.peer}>
        <Text style={styles.peerName}>{name}</Text>
        {!!peerName && <Text style={styles.peerNumber}>{displayNumber(peerRaw)}</Text>}
        <View style={styles.callState}>
          <Text style={styles.callStateText}>
            {t(callStateLabelKey(call.state as CallState))}
          </Text>
          {isActive && <Text style={styles.duration}>{duration}</Text>}
        </View>
      </View>

      <CallErrorChip />

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
            onChangeText={onTransferType}
            placeholder={t('transferPlaceholder')}
            placeholderTextColor={palette.textSecondary}
            keyboardType="phone-pad"
            autoCorrect={false}
          />
          <View style={styles.transferActions}>
            {/* Blind: hand off immediately. */}
            <Pressable
              disabled={!transferTo.trim()}
              onPress={() => {
                actions.transfer(transferTo);
                setTransferTo('');
              }}
              style={[styles.transferSend, styles.transferSendSecondary]}
            >
              <Text style={styles.transferSendSecondaryText}>{t('transferNow')}</Text>
            </Pressable>
            {/* Attended: hold the caller and consult the target first. */}
            <Pressable
              disabled={!transferTo.trim()}
              onPress={() => void startAttendedTransfer(transferTo)}
              style={styles.transferSend}
            >
              <Text style={styles.transferSendText}>{t('transferConsult')}</Text>
            </Pressable>
          </View>
        </View>
      )}

      {isActive && (
        <View style={styles.controls}>
          <ControlButton
            label={call.isMuted ? t('unmute') : t('mute')}
            glyph={call.isMuted ? softphoneGlyphs.micOff : softphoneGlyphs.mic}
            on={call.isMuted}
            onPress={actions.toggleMute}
            palette={palette}
            styles={styles}
          />
          <ControlButton
            label={call.state === 'held' ? t('resume') : t('hold')}
            glyph={softphoneGlyphs.pause}
            on={call.state === 'held'}
            onPress={actions.toggleHold}
            palette={palette}
            styles={styles}
          />
          {canSendDtmf && (
            <ControlButton
              label={t('keypad')}
              glyph={softphoneGlyphs.keypad}
              on={showKeypad}
              onPress={actions.toggleKeypad}
              palette={palette}
              styles={styles}
            />
          )}
          <ControlButton
            label={t('transfer')}
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
          accessibilityLabel={t('hangUp')}
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
