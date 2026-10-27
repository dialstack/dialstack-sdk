import React, { useMemo } from 'react';
import { Keyboard, Pressable, Text, View } from 'react-native';
import {
  softphoneGlyphs,
  type DirectoryContact,
  type Locale,
  type SoftphonePalette,
} from '@dialstack/sdk-react/core';
import { Glyph, ControlButton, KeyboardDoneBar, makeStyles, ControlsSlot } from '../primitives';
import { DialPanelView } from './DialPanelView';
import { KeypadView } from './KeypadView';
import { PeerAvatar, PeerRow } from './PeerAvatar';
import { useRoomyHost } from './useRoomyHost';

const KEYBOARD_ID = 'dialstack-softphone-call-keyboard';

export interface PeerSummary {
  id: string;
  name: string;
  number?: string | null;
  /** The host's avatar from `resolvePeer`, drawn above the name. */
  avatar?: { initials?: string; uri?: string };
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
  /** The host's directory, offered by the transfer and add-call panels. */
  directory?: readonly DirectoryContact[];
  onPickTransferContact?: (entry: DirectoryContact) => void;
  /** The contact `transferTo` came from, or null when it was typed. */
  pickedTransferContact?: DirectoryContact | null;
  onClearTransferContact?: () => void;
  onPickAddCallContact?: (entry: DirectoryContact) => void;
  pickedAddCallContact?: DirectoryContact | null;
  onClearAddCallContact?: () => void;

  canStartTransfer: boolean;
  canAddCall: boolean;
  onToggleMute: () => void;
  onToggleHold: () => void;
  speakerOn: boolean;
  canToggleSpeaker: boolean;
  onToggleSpeaker: () => void;
  onToggleOverlay: (panel: Exclude<OverlayPanel, null>) => void;
  onHangup: () => void;

  errorChip?: React.ReactNode;
}

const NO_DIRECTORY: readonly DirectoryContact[] = [];

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
  directory = NO_DIRECTORY,
  onPickTransferContact = () => {},
  pickedTransferContact = null,
  onClearTransferContact = () => {},
  onPickAddCallContact = () => {},
  pickedAddCallContact = null,
  onClearAddCallContact = () => {},
  canStartTransfer,
  canAddCall,
  onToggleMute,
  onToggleHold,
  speakerOn,
  canToggleSpeaker,
  onToggleSpeaker,
  onToggleOverlay,
  onHangup,
  errorChip = null,
}: OngoingCallViewProps): React.JSX.Element {
  const { roomy, onLayout } = useRoomyHost();
  const styles = useMemo(() => makeStyles(palette, !roomy), [palette, roomy]);
  const inKeypadMode = isActive && overlay === 'keypad' && canSendDtmf;
  const transferOpen = isActive && overlay === 'transfer' && canStartTransfer;
  const addCallOpen = isActive && overlay === 'addcall' && canAddCall;
  // Both panels take over the screen above hang up (see DialPanelView).
  const panelOpen = transferOpen || addCallOpen;

  return (
    // A tap outside the field closes the keyboard, as in other apps.
    <Pressable
      style={styles.screen}
      onPress={Keyboard.dismiss}
      onLayout={onLayout}
      accessible={false}
    >
      {}
      {transferOther && !panelOpen && (
        <>
          {(() => {
            const otherName = transferOther.name;
            return (
              <Pressable
                accessibilityLabel={`${t('switchToCall')}: ${otherName}`}
                onPress={onSwitchToTransferOther}
                style={[styles.heldCall, styles.consultHeld]}
              >
                <PeerRow palette={palette} avatar={transferOther.avatar}>
                  <Text style={styles.rowName}>{otherName}</Text>
                  <Text style={styles.callStateText}>{t('transferOriginalOnHold')}</Text>
                </PeerRow>
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
      {switchableHeld.length > 0 && !panelOpen && (
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
                <PeerRow palette={palette} avatar={held.avatar}>
                  <Text style={styles.rowName}>{hn}</Text>
                  <Text style={styles.callStateText}>{t('heldCallsLabel')}</Text>
                </PeerRow>
              </Pressable>
            );
          })}
        </View>
      )}

      {!panelOpen && (
        <View style={[styles.peer, inKeypadMode && styles.peerCompact]}>
          {roomy && !inKeypadMode && <PeerAvatar palette={palette} avatar={peer.avatar} />}
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
      )}

      {errorChip}

      {isActive && overlay === 'keypad' && canSendDtmf && (
        <KeypadView styles={styles} onKey={onSendDtmf} keyLabel={({ digit }) => digit} />
      )}

      {transferOpen && (
        <DialPanelView
          palette={palette}
          styles={styles}
          t={t}
          title={t('transfer')}
          targetLabel={t('transferToLabel')}
          peerName={peer.name}
          directory={directory}
          picked={pickedTransferContact}
          onPick={onPickTransferContact}
          onClearPick={onClearTransferContact}
          value={transferTo}
          placeholder={t('transferPlaceholder')}
          onChange={onTransferToChange}
          keyboardId={KEYBOARD_ID}
          actions={
            <>
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
              <Pressable
                disabled={!transferTo.trim()}
                onPress={onConsultTransfer}
                style={[styles.transferSend, !transferTo.trim() && styles.transferSendDisabled]}
              >
                <Text style={styles.transferSendText}>{t('transferConsult')}</Text>
              </Pressable>
            </>
          }
          onClose={() => onToggleOverlay('transfer')}
        />
      )}

      {addCallOpen && (
        <DialPanelView
          palette={palette}
          styles={styles}
          t={t}
          title={t('addCall')}
          targetLabel={t('addCallToLabel')}
          peerName={peer.name}
          directory={directory}
          picked={pickedAddCallContact}
          onPick={onPickAddCallContact}
          onClearPick={onClearAddCallContact}
          value={addCallTo}
          placeholder={t('addCallPlaceholder')}
          onChange={onAddCallToChange}
          keyboardId={KEYBOARD_ID}
          actions={
            <Pressable
              disabled={!addCallTo.trim()}
              onPress={onSubmitAddCall}
              style={[styles.transferSend, !addCallTo.trim() && styles.transferSendDisabled]}
            >
              <Text style={styles.transferSendText}>{t('addCallSend')}</Text>
            </Pressable>
          }
          onClose={() => onToggleOverlay('addcall')}
        />
      )}

      {!isActive && <ControlsSlot styles={styles} />}

      {isActive && !inKeypadMode && !panelOpen && (
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
          <ControlButton
            label={t('audioSpeaker')}
            glyph={softphoneGlyphs.speaker}
            on={speakerOn}
            onPress={onToggleSpeaker}
            palette={palette}
            styles={styles}
            disabled={!canToggleSpeaker}
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
              size={(styles.action.width as number) * 0.46}
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
              size={(styles.action.width as number) * 0.46}
              color={palette.onAccent}
            />
          </Pressable>
        )}
      </View>
      <KeyboardDoneBar id={KEYBOARD_ID} label={t('done')} styles={styles} />
    </Pressable>
  );
}
