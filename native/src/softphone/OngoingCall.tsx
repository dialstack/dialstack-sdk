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
import type { Call, CallState } from '@dialstack/sdk/react/core';
import {
  callPeerNumber,
  callPeerName,
  callStateLabelKey,
  isCallActive,
  useDialInput,
} from '@dialstack/sdk/react/core';
import { dialPadKeys, softphoneDimensions as D, softphoneGlyphs } from '@dialstack/sdk/react/core';
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
    heldCalls,
    incomingCalls,
    switchToCall,
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

  if (!call) return null;

  const peerRaw = callPeerNumber(call);
  const peerName = callPeerName(call);
  const isActive = isCallActive(call);
  const name = peerName || displayNumber(peerRaw) || t('unknownCaller');
  // react-native-webrtc exposes no RTCDTMFSender, so DTMF can't be sent on
  // native — hide the keypad rather than throw on each tap.
  const canSendDtmf = call.canSendDtmf;

  // An attended transfer is just two switchable calls + a transfer flag, so it
  // renders the normal in-call view (controls + switch cards). On top we show a
  // banner for the OTHER transfer leg (tap to switch to it) plus Complete/Cancel.
  // That leg is excluded from the plain held-calls list so it isn't shown twice.
  const inTransfer = consultCall !== null && transferOriginal !== null;
  // Banner + Complete belong ONLY when the FOCUSED call is one of the two transfer
  // legs (parity with web). With switchable focus the active call can be a third
  // unrelated call — the banner would then name the wrong leg and Complete would
  // bridge legs the user isn't looking at.
  const focusInTransfer = inTransfer && (call === consultCall || call === transferOriginal);
  const transferOther = focusInTransfer
    ? call === consultCall
      ? transferOriginal
      : consultCall
    : null;
  const canComplete = focusInTransfer && consultCall !== null && consultCall.isConnected;
  const switchableHeld = heldCalls.filter((c: Call) => c !== transferOther);
  // Disable Transfer while a transfer is already in progress OR more than one
  // call is live (parity with web) — a new transfer in either case is ambiguous.
  const canStartTransfer = !inTransfer && heldCalls.length + incomingCalls.length === 0;

  return (
    <>
      {/* Attended-transfer banner: the OTHER leg (tap to switch to it) + Cancel /
          Complete. The normal in-call view (controls, etc.) renders below, so
          mute/hold stay available while transferring. */}
      {focusInTransfer && transferOther && (
        <>
          {(() => {
            const otherName =
              callPeerName(transferOther) ||
              displayNumber(callPeerNumber(transferOther)) ||
              t('unknownCaller');
            return (
              <Pressable
                accessibilityLabel={`${t('switchToCall')}: ${otherName}`}
                onPress={() => switchToCall(transferOther)}
                style={[styles.heldCall, styles.consultHeld]}
              >
                <Text style={styles.peerName}>{otherName}</Text>
                <Text style={styles.callStateText}>{t('transferOriginalOnHold')}</Text>
              </Pressable>
            );
          })()}
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
      )}

      <View style={styles.peer}>
        <Text style={styles.peerName}>{name}</Text>
        {!!peerName && <Text style={styles.peerNumber}>{displayNumber(peerRaw)}</Text>}
        <View style={styles.callState}>
          <Text style={styles.callStateText}>
            {t(callStateLabelKey(call.state as CallState))}
          </Text>
          {/* Duration ticks only while truly live; a held foreground call shows
              its "On hold" state + Resume control, never a running timer. */}
          {call.state === 'active' && <Text style={styles.duration}>{duration}</Text>}
        </View>
      </View>

      <CallErrorChip />

      {/* Other backgrounded calls the user can switch to — tap a card to hold
          the current call and resume that one. Excludes the transfer leg shown
          in the banner above (so it isn't listed twice). */}
      {switchableHeld.length > 0 && (
        <View style={styles.heldCalls}>
          {switchableHeld.map((held: Call) => {
            const hp = callPeerNumber(held);
            const hn = callPeerName(held) || displayNumber(hp) || t('unknownCaller');
            return (
              <Pressable
                key={held.id}
                onPress={() => switchToCall(held)}
                accessibilityLabel={`${t('switchToCall')}: ${hn}`}
                style={({ pressed }: { pressed: boolean }) => [
                  styles.heldCall,
                  styles.consultHeld,
                  pressed && styles.keyPressed,
                ]}
              >
                <Text style={styles.peerName}>{hn}</Text>
                <Text style={styles.callStateText}>{t('heldCallsLabel')}</Text>
              </Pressable>
            );
          })}
        </View>
      )}

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

      {isActive && showTransfer && canStartTransfer && (
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
            disabled={!canStartTransfer}
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
