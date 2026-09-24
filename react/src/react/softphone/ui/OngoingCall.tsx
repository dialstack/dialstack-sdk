/**
 * OngoingCall — the in-call screen: peer + call-state + live duration, the
 * optional DTMF keypad / transfer / add-call / audio-device overlays, the control
 * row (mute / hold / keypad / transfer / add call / audio), and hang up. Renders
 * nothing when there is no active call.
 *
 * Reads the active call, actions, and duration from the softphone context; owns
 * only its own transient DTMF-readout, transfer-input and add-call text. Must be
 * rendered inside a `<SoftphoneProvider>`.
 */
import React, { useEffect, useState } from 'react';
import { useSoftphone } from '../provider/SoftphoneProvider';
import {
  callPeerNumber,
  callPeerName,
  callStateLabelKey,
  isCallActive,
  useDialInput,
  MAX_CALLS,
} from '../hooks';
import { AudioDevicePicker } from './AudioDevicePicker';
import { OngoingCallView } from './views/OngoingCallView';
import type { OverlayPanel, PeerSummary } from './views/types';
import type { Call } from '@dialstack/sdk-webrtc';

export const OngoingCall: React.FC = () => {
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
    mergedCalls,
    isMerged,
    canMerge,
    mergeCalls,
    splitMerge,
    hangupConference,
    holdConference,
    t,
    displayNumber,
    scope,
    lastError,
    clearError,
  } = useSoftphone();
  const { showKeypad, showTransfer, showDevices, showAddCall } = overlays;
  const [dtmfEntered, setDtmfEntered] = useState('');
  const [transferTo, setTransferTo] = useState('');
  const [addCallTo, setAddCallTo] = useState('');
  const { onType: onTransferType, onPasteText: onTransferPaste } = useDialInput(setTransferTo);
  const { onType: onAddCallType, onPasteText: onAddCallPaste } = useDialInput(setAddCallTo);

  const callId = call?.id ?? null;
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- reset transient text on foreground-call change
    setDtmfEntered('');
    setTransferTo('');
    setAddCallTo('');
  }, [callId]);

  if (!call) return null;

  const peer = callPeerNumber(call);
  const peerName = callPeerName(call);
  const isActive = isCallActive(call);
  const name = peerName || displayNumber(peer) || t('unknownCaller');
  // Hide the DTMF keypad where the platform can't send DTMF — otherwise the taps
  // would each throw. Browsers always expose RTCDTMFSender, so on web the keypad
  // stays; on React Native it depends on which WebRTC build the app installed.
  const canSendDtmf = call.canSendDtmf;

  const sendDtmf = (digit: string) => {
    actions.sendDtmf(digit);
    setDtmfEntered((prev) => prev + digit);
  };

  const inTransfer = consultCall !== null && transferOriginal !== null;
  // The banner + Complete belong ONLY when the FOCUSED call is one of the two
  // transfer legs. With switchable focus the active call can be a third unrelated
  // call — showing the banner then would name the wrong "other leg" and Complete
  // would bridge legs the user isn't looking at.
  const focusInTransfer = inTransfer && (call === consultCall || call === transferOriginal);
  const transferOther = focusInTransfer
    ? call === consultCall
      ? transferOriginal
      : consultCall
    : null;
  // Bridge only once the consult target is answered — active OR held (the user
  // may have switched focus, holding the consult). Not while it's still ringing.
  const canComplete = focusInTransfer && consultCall !== null && consultCall.isConnected;
  // A merged leg is un-held, so it normally wouldn't be here — but the server's
  // resume echo lands a beat later, and without this the other party flickers as
  // an "On hold" card in between.
  const switchableHeld = heldCalls.filter((c) => c !== transferOther && !mergedCalls.includes(c));

  const otherLiveCalls = heldCalls.length + incomingCalls.length;
  // Disabled while a transfer is already in progress OR more than one call is
  // live: a new transfer in either situation is ambiguous (which call? on top of
  // the existing consult?). Barred while merged — transferring one leg out of a
  // conference is ambiguous too.
  const canStartTransfer = !inTransfer && !isMerged && otherLiveCalls === 0;

  // The legs are held and resumed together, so any one of them answers for the
  // conference. Read from a leg rather than the focused call: focus can sit on
  // a leg whose own echo has not landed yet.
  const conferenceHeld = isMerged && mergedCalls.some((c) => c.state === 'held');

  const canAddCall = calls.length < MAX_CALLS;

  const addCallValue = canAddCall ? addCallTo : '';

  const submitAddCall = () => {
    const target = addCallValue.trim();
    if (!target) return;
    void placeCall(target);
    setAddCallTo('');
    overlays.closeAddCall();
  };

  const summarize = (c: Call): PeerSummary => {
    const cName = callPeerName(c);
    const cNumber = callPeerNumber(c);
    return {
      id: c.id,
      name: cName || displayNumber(cNumber) || t('unknownCaller'),
      number: cName ? displayNumber(cNumber) : null,
    };
  };

  const overlay: OverlayPanel = showKeypad
    ? 'keypad'
    : showTransfer
      ? 'transfer'
      : showDevices
        ? 'devices'
        : showAddCall
          ? 'addcall'
          : null;

  const toggleOverlay = (panel: Exclude<OverlayPanel, null>): void => {
    if (panel === 'keypad') overlays.toggleKeypad();
    else if (panel === 'transfer') overlays.toggleTransfer();
    else if (panel === 'devices') overlays.toggleDevices();
    else overlays.toggleAddCall();
  };

  return (
    <OngoingCallView
      peer={{ id: call.id, name, number: peerName ? displayNumber(peer) : null }}
      stateLabel={t(callStateLabelKey(call.state))}
      duration={duration}
      showDuration={call.state === 'active'}
      isActive={isActive}
      isMuted={call.isMuted}
      isHeld={conferenceHeld || call.state === 'held'}
      isMerged={isMerged}
      conferenceParties={mergedCalls.map(summarize)}
      conferenceLabel={t('conferenceLabel')}
      transferOther={focusInTransfer && transferOther ? summarize(transferOther) : null}
      canCompleteTransfer={canComplete}
      onSwitchToTransferOther={() => transferOther && switchToCall(transferOther)}
      onCancelTransfer={cancelAttendedTransfer}
      onCompleteTransfer={completeAttendedTransfer}
      switchableHeld={switchableHeld.map(summarize)}
      onSwitchToCall={(id) => {
        const target = switchableHeld.find((c) => c.id === id);
        if (target) switchToCall(target);
      }}
      error={lastError}
      onDismissError={clearError}
      overlay={overlay}
      canSendDtmf={canSendDtmf}
      dtmfEntered={dtmfEntered}
      onSendDtmf={sendDtmf}
      transferTo={transferTo}
      onTransferToChange={onTransferType}
      onTransferToPaste={onTransferPaste}
      onBlindTransfer={() => {
        if (actions.transfer(transferTo)) {
          setTransferTo('');
          overlays.closeTransfer();
        }
      }}
      onConsultTransfer={() => void startAttendedTransfer(transferTo)}
      addCallTo={addCallValue}
      onAddCallToChange={onAddCallType}
      onAddCallToPaste={onAddCallPaste}
      onSubmitAddCall={submitAddCall}
      devicesPanel={<AudioDevicePicker />}
      canStartTransfer={canStartTransfer}
      canAddCall={canAddCall}
      canMerge={canMerge}
      onToggleMute={actions.toggleMute}
      onToggleHold={isMerged ? () => holdConference(!conferenceHeld) : actions.toggleHold}
      onToggleOverlay={toggleOverlay}
      onMergeOrSplit={isMerged ? splitMerge : mergeCalls}
      // While merged, hang up ends the whole conference rather than one leg —
      // the legs are one conversation to the user, so dropping a single one
      // would leave the others live with no way back to them.
      onHangup={isMerged ? hangupConference : actions.hangup}
      scope={scope}
      t={t}
    />
  );
};
