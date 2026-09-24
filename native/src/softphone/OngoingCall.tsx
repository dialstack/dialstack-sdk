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
  callPeerNumber,
  callPeerName,
  callStateLabelKey,
  isCallActive,
  useDialInput,
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
    t,
    palette,
  } = useSoftphone();
  const { showKeypad, showTransfer, showAddCall } = overlays;
  const [dtmfEntered, setDtmfEntered] = useState('');
  const [transferTo, setTransferTo] = useState('');
  const { onType: onTransferType } = useDialInput(setTransferTo);
  const [addCallTo, setAddCallTo] = useState('');
  const { onType: onAddCallType } = useDialInput(setAddCallTo);

  const callId = call?.id ?? null;
  useEffect(() => {
    setDtmfEntered('');
    setTransferTo('');
    setAddCallTo('');
  }, [callId]);

  if (!call) return null;

  const summarize = (c: Call): PeerSummary => {
    const cName = callPeerName(c);
    const cNumber = callPeerNumber(c);
    return {
      id: c.id,
      name: cName || displayNumber(cNumber) || t('unknownCaller'),
      number: cName ? displayNumber(cNumber) : null,
    };
  };

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
      onTransferToChange={onTransferType}
      onBlindTransfer={() => {
        if (actions.transfer(transferTo)) {
          setTransferTo('');
          overlays.closeTransfer();
        }
      }}
      onConsultTransfer={() => void startAttendedTransfer(transferTo)}
      addCallTo={addCallValue}
      onAddCallToChange={onAddCallType}
      onSubmitAddCall={() => {
        const target = addCallValue.trim();
        if (!target) return;
        void placeCall(target);
        setAddCallTo('');
        overlays.closeAddCall();
      }}
      canStartTransfer={!inTransfer && heldCalls.length + incomingCalls.length === 0}
      canAddCall={canAddCall}
      onToggleMute={actions.toggleMute}
      onToggleHold={actions.toggleHold}
      onToggleOverlay={(panel) => {
        if (panel === 'keypad') overlays.toggleKeypad();
        else if (panel === 'transfer') overlays.toggleTransfer();
        else overlays.toggleAddCall();
      }}
      onHangup={actions.hangup}
      errorChip={<CallErrorChip />}
    />
  );
}
