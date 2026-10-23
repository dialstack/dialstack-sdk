/**
 * OngoingCall (RN) — the in-call screen: peer + state + duration, optional DTMF
 * keypad / transfer / add-call overlays, the control row (mute/hold/keypad/
 * transfer/add call), and hang up. Renders nothing when there is no active call.
 * Owns its transient transfer + add-call text; reads the call/actions/duration
 * from context.
 *
 * Must be rendered inside a <SoftphoneProvider>.
 */
import React, { useEffect, useState } from 'react';
import type { Call } from '@dialstack/sdk-react/core';
import {
  peerDisplay,
  callStateLabelKey,
  isCallActive,
  useDialTarget,
  MAX_CALLS,
} from '@dialstack/sdk-react/core';
import { useSoftphone } from '../SoftphoneProvider';
import { CallErrorChip } from './CallErrorChip';
import { OngoingCallView, type OverlayPanel, type PeerSummary } from './views/OngoingCallView';

export function OngoingCall(): React.JSX.Element | null {
  const {
    activeCall: call,
    actions,
    overlays,
    duration,
    consultCall,
    transferOriginal,
    heldCalls,
    incomingCalls,
    switchToCall,
    startAttendedTransfer,
    completeAttendedTransfer,
    cancelAttendedTransfer,
    placeCall,
    calls,
    displayNumber,
    peerInfo,
    t,
    palette,
    audio,
    directory,
  } = useSoftphone();
  const { showKeypad, showTransfer, showAddCall } = overlays;
  const [dtmfEntered, setDtmfEntered] = useState('');
  const transferTarget = useDialTarget();
  const addCallTarget = useDialTarget();
  const transferTo = transferTarget.value;
  const addCallTo = addCallTarget.value;
  const { clear: clearTransfer } = transferTarget;
  const { clear: clearAddCall } = addCallTarget;

  const callId = call?.id ?? null;
  useEffect(() => {
    setDtmfEntered('');
    clearTransfer();
    clearAddCall();
  }, [callId, clearTransfer, clearAddCall]);

  if (!call) return null;

  const summarize = (c: Call): PeerSummary => ({
    id: c.id,
    ...peerDisplay(c, peerInfo(c), displayNumber, t('unknownCaller')),
  });

  const inTransfer = consultCall !== null && transferOriginal !== null;
  const focusInTransfer = inTransfer && (call === consultCall || call === transferOriginal);
  const transferOther = focusInTransfer
    ? call === consultCall
      ? transferOriginal
      : consultCall
    : null;
  const switchableHeld = heldCalls.filter((c: Call) => c !== transferOther);
  const canAddCall = calls.length < MAX_CALLS;
  const addCallValue = canAddCall ? addCallTo : '';

  const overlay: OverlayPanel = showKeypad
    ? 'keypad'
    : showTransfer
      ? 'transfer'
      : showAddCall
        ? 'addcall'
        : null;

  return (
    <OngoingCallView
      palette={palette}
      t={t}
      peer={summarize(call)}
      stateLabel={t(callStateLabelKey(call.state))}
      duration={duration}
      showDuration={call.state === 'active'}
      isActive={isCallActive(call)}
      isMuted={call.isMuted}
      isHeld={call.state === 'held'}
      transferOther={transferOther ? summarize(transferOther) : null}
      canCompleteTransfer={focusInTransfer && consultCall !== null && consultCall.isConnected}
      onSwitchToTransferOther={() => transferOther && switchToCall(transferOther)}
      onCancelTransfer={cancelAttendedTransfer}
      onCompleteTransfer={completeAttendedTransfer}
      switchableHeld={switchableHeld.map(summarize)}
      onSwitchToCall={(id: string) => {
        const target = switchableHeld.find((c: Call) => c.id === id);
        if (target) switchToCall(target);
      }}
      overlay={overlay}
      canSendDtmf={call.canSendDtmf}
      onSendDtmf={(digit) => {
        setDtmfEntered((prev) => prev + digit);
        actions.sendDtmf(digit);
      }}
      dtmfEntered={dtmfEntered}
      transferTo={transferTo}
      onTransferToChange={transferTarget.onType}
      onBlindTransfer={() => {
        if (actions.transfer(transferTo)) {
          clearTransfer();
          overlays.closeTransfer();
        }
      }}
      onConsultTransfer={() => void startAttendedTransfer(transferTo)}
      addCallTo={addCallValue}
      onAddCallToChange={addCallTarget.onType}
      onSubmitAddCall={() => {
        const target = addCallValue.trim();
        if (!target) return;
        void placeCall(target);
        clearAddCall();
        overlays.closeAddCall();
      }}
      directory={directory}
      onPickTransferContact={transferTarget.pick}
      pickedTransferContact={transferTarget.picked}
      onPickAddCallContact={addCallTarget.pick}
      pickedAddCallContact={canAddCall ? addCallTarget.picked : null}
      canStartTransfer={!inTransfer && heldCalls.length + incomingCalls.length === 0}
      canAddCall={canAddCall}
      onToggleMute={actions.toggleMute}
      onToggleHold={actions.toggleHold}
      speakerOn={audio.speakerOn}
      canToggleSpeaker={audio.supported}
      onToggleSpeaker={audio.toggleSpeaker}
      onToggleOverlay={(panel) => {
        // Closing a panel cancels it, so reopening never finds an old
        // destination armed behind the directory list.
        if (panel === overlay && panel === 'transfer') clearTransfer();
        if (panel === overlay && panel === 'addcall') clearAddCall();
        if (panel === 'keypad') overlays.toggleKeypad();
        else if (panel === 'transfer') overlays.toggleTransfer();
        else overlays.toggleAddCall();
      }}
      onHangup={actions.hangup}
      errorChip={<CallErrorChip />}
    />
  );
}
