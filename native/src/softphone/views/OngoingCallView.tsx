import React, { useMemo } from 'react';
import { Pressable, Text, TextInput, View } from 'react-native';
import {
  dialPadKeys,
  softphoneDimensions as D,
  softphoneGlyphs,
  type Locale,
  type SoftphonePalette,
} from '@dialstack/sdk-react/core';
import { Glyph, ControlButton, chunk, makeStyles, ControlsSlot } from '../primitives';

export interface PeerSummary {
  id: string;
  name: string;
  number?: string | null;
}

export type OverlayPanel = 'keypad' | 'transfer' | 'addcall' | null;

export interface OngoingCallViewProps {
  palette: SoftphonePalette;
  t: (key: keyof Locale['softphone']) => string;

  peer: PeerSummary;
  stateLabel: string;
  duration: string;
  showDuration: boolean;
  isActive: boolean;
  isMuted: boolean;
  isHeld: boolean;

  transferOther: PeerSummary | null;
  canCompleteTransfer: boolean;
  onSwitchToTransferOther: () => void;
  onCancelTransfer: () => void;
  onCompleteTransfer: () => void;

  switchableHeld: PeerSummary[];
  onSwitchToCall: (id: string) => void;

  overlay: OverlayPanel;
  canSendDtmf: boolean;
  onSendDtmf: (digit: string) => void;
  dtmfEntered: string;
  transferTo: string;
  onTransferToChange: (value: string) => void;
  onBlindTransfer: () => void;
  onConsultTransfer: () => void;
  addCallTo: string;
  onAddCallToChange: (value: string) => void;
  onSubmitAddCall: () => void;

  canStartTransfer: boolean;
  canAddCall: boolean;
  onToggleMute: () => void;
  onToggleHold: () => void;
  onToggleOverlay: (panel: Exclude<OverlayPanel, null>) => void;
  onHangup: () => void;

  errorChip?: React.ReactNode;
}

export function OngoingCallView({
  palette,
  t,
  peer,
  stateLabel,
  duration,
  showDuration,
  isActive,
  isMuted,
  isHeld,
  transferOther,
  canCompleteTransfer,
  onSwitchToTransferOther,
  onCancelTransfer,
  onCompleteTransfer,
  switchableHeld,
  onSwitchToCall,
  overlay,
  canSendDtmf,
  onSendDtmf,
  dtmfEntered,
  transferTo,
  onTransferToChange,
  onBlindTransfer,
  onConsultTransfer,
  addCallTo,
  onAddCallToChange,
  onSubmitAddCall,
  canStartTransfer,
  canAddCall,
  onToggleMute,
  onToggleHold,
  onToggleOverlay,
  onHangup,
  errorChip = null,
}: OngoingCallViewProps): React.JSX.Element {
  const styles = useMemo(() => makeStyles(palette), [palette]);
  const inKeypadMode = isActive && overlay === 'keypad' && canSendDtmf;

  return (
    <View style={styles.screen}>
      {}
      {transferOther && (
        <>
          {(() => {
            const otherName = transferOther.name;
            return (
              <Pressable
                accessibilityLabel={`${t('switchToCall')}: ${otherName}`}
                onPress={onSwitchToTransferOther}
                style={[styles.heldCall, styles.consultHeld]}
              >
                <Text style={styles.peerName}>{otherName}</Text>
                <Text style={styles.callStateText}>{t('transferOriginalOnHold')}</Text>
              </Pressable>
            );
          })()}
          <View style={styles.transferActions}>
            <Pressable
              onPress={onCancelTransfer}
              style={[styles.transferSend, styles.transferSendSecondary]}
            >
              <Text style={styles.transferSendSecondaryText}>{t('cancel')}</Text>
            </Pressable>
            <Pressable
              onPress={onCompleteTransfer}
              disabled={!canCompleteTransfer}
              style={[styles.transferSend, !canCompleteTransfer && styles.transferSendDisabled]}
            >
              <Text style={styles.transferSendText}>{t('transferComplete')}</Text>
            </Pressable>
          </View>
        </>
      )}

      {}
      {switchableHeld.length > 0 && (
        <View style={styles.heldCalls}>
          {switchableHeld.map((held) => {
            const hn = held.name;
            return (
              <Pressable
                key={held.id}
                onPress={() => onSwitchToCall(held.id)}
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

      <View style={[styles.peer, inKeypadMode && styles.peerCompact]}>
        <Text style={styles.peerName}>{peer.name}</Text>
        {!!peer.number && <Text style={styles.peerNumber}>{peer.number}</Text>}
        <View style={styles.callState}>
          {inKeypadMode ? (
            <Text style={styles.dtmfReadout}>{dtmfEntered || ' '}</Text>
          ) : (
            <Text style={styles.callStateText}>{stateLabel}</Text>
          )}
          {}
          {!inKeypadMode && <Text style={styles.duration}>{showDuration ? duration : ' '}</Text>}
        </View>
      </View>

      {errorChip}

      {isActive && overlay === 'keypad' && canSendDtmf && (
        <View style={styles.keypad}>
          {chunk(dialPadKeys, 3).map((row, i) => (
            <View key={i} style={styles.keyRow}>
              {row.map(({ digit }) => (
                <Pressable
                  key={digit}
                  onPress={() => onSendDtmf(digit)}
                  accessibilityLabel={digit}
                  style={({ pressed }: { pressed: boolean }) => [
                    styles.key,
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

      {isActive && overlay === 'transfer' && canStartTransfer && (
        <View style={styles.transfer}>
          <TextInput
            style={styles.transferInput}
            value={transferTo}
            onChangeText={onTransferToChange}
            placeholder={t('transferPlaceholder')}
            placeholderTextColor={palette.textSecondary}
            keyboardType="phone-pad"
            autoCorrect={false}
          />
          <View style={styles.transferActions}>
            {}
            <Pressable
              disabled={!transferTo.trim()}
              onPress={onBlindTransfer}
              style={[
                styles.transferSend,
                styles.transferSendSecondary,
                !transferTo.trim() && styles.transferSendDisabled,
              ]}
            >
              <Text style={styles.transferSendSecondaryText}>{t('transferNow')}</Text>
            </Pressable>
            {}
            <Pressable
              disabled={!transferTo.trim()}
              onPress={onConsultTransfer}
              style={[styles.transferSend, !transferTo.trim() && styles.transferSendDisabled]}
            >
              <Text style={styles.transferSendText}>{t('transferConsult')}</Text>
            </Pressable>
          </View>
        </View>
      )}

      {isActive && overlay === 'addcall' && canAddCall && (
        <View style={styles.transfer}>
          <TextInput
            style={styles.transferInput}
            value={addCallTo}
            onChangeText={onAddCallToChange}
            placeholder={t('addCallPlaceholder')}
            placeholderTextColor={palette.textSecondary}
            keyboardType="phone-pad"
            autoCorrect={false}
          />
          <View style={styles.transferActions}>
            {}
            <Pressable
              disabled={!addCallTo.trim()}
              onPress={onSubmitAddCall}
              style={[styles.transferSend, !addCallTo.trim() && styles.transferSendDisabled]}
            >
              <Text style={styles.transferSendText}>{t('addCallSend')}</Text>
            </Pressable>
          </View>
        </View>
      )}

      {!isActive && <ControlsSlot styles={styles} />}

      {isActive && !inKeypadMode && (
        <View style={styles.controls}>
          <ControlButton
            label={isMuted ? t('unmute') : t('mute')}
            glyph={isMuted ? softphoneGlyphs.micOff : softphoneGlyphs.mic}
            on={isMuted}
            onPress={onToggleMute}
            palette={palette}
            styles={styles}
          />
          <ControlButton
            label={isHeld ? t('resume') : t('hold')}
            glyph={softphoneGlyphs.pause}
            on={isHeld}
            onPress={onToggleHold}
            palette={palette}
            styles={styles}
          />
          {canSendDtmf && (
            <ControlButton
              label={t('keypad')}
              glyph={softphoneGlyphs.keypad}
              on={overlay === 'keypad'}
              onPress={() => onToggleOverlay('keypad')}
              palette={palette}
              styles={styles}
            />
          )}
          <ControlButton
            label={t('transfer')}
            glyph={softphoneGlyphs.transfer}
            on={overlay === 'transfer'}
            onPress={() => onToggleOverlay('transfer')}
            palette={palette}
            styles={styles}
            disabled={!canStartTransfer}
          />
          <ControlButton
            label={t('addCall')}
            glyph={softphoneGlyphs.addCall}
            on={overlay === 'addcall'}
            onPress={() => onToggleOverlay('addcall')}
            palette={palette}
            styles={styles}
            disabled={!canAddCall}
          />
          {}
          <ControlButton
            label={t('audioDevices')}
            glyph={softphoneGlyphs.speaker}
            on={false}
            onPress={() => {}}
            palette={palette}
            styles={styles}
            disabled
          />
        </View>
      )}

      <View style={[styles.actions, isActive && styles.actionsInCall]}>
        {inKeypadMode ? (
          <Pressable
            onPress={() => onToggleOverlay('keypad')}
            accessibilityLabel={t('keypad')}
            style={({ pressed }: { pressed: boolean }) => [
              styles.action,
              styles.actionNeutral,
              pressed && styles.actionPressed,
            ]}
          >
            <Glyph
              glyph={softphoneGlyphs.close}
              size={D.actionButtonSize * 0.46}
              color={palette.text}
            />
          </Pressable>
        ) : (
          <Pressable
            onPress={onHangup}
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
        )}
      </View>
    </View>
  );
}
