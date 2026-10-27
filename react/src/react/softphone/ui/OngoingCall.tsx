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
  peerDisplay,
  callStateLabelKey,
  isCallActive,
  callOrPick,
  useDialTarget,
  MAX_CALLS,
  type DirectoryContact,
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
    peerInfo,
    scope,
    lastError,
    clearError,
    directory,
    connection,
    emergency,
  } = useSoftphone();
  const { showKeypad, showTransfer, showDevices, showAddCall } = overlays;
  const [dtmfEntered, setDtmfEntered] = useState('');
  const transferTarget = useDialTarget();
  const addCallTarget = useDialTarget();
  const transferTo = transferTarget.value;
  const addCallTo = addCallTarget.value;
  const { clear: clearTransfer } = transferTarget;
  const { clear: clearAddCall } = addCallTarget;

  const callId = call?.id ?? null;
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- reset transient text on foreground-call change
    setDtmfEntered('');
    clearTransfer();
    clearAddCall();
  }, [callId, clearTransfer, clearAddCall]);

  if (!call) return null;

  const isActive = isCallActive(call);
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
    clearAddCall();
    overlays.closeAddCall();
  };

  // Add call has a single action, so a tapped entry is called right away (unlike
  // Transfer, which still has to choose between transferring and consulting).
  const pickAddCall = (entry: DirectoryContact) =>
    callOrPick(entry, {
      connection,
      emergencySubmitting: emergency.submitting,
      allowed: canAddCall,
      placeCall,
      pick: addCallTarget.pick,
      onCalled: () => {
        clearAddCall();
        overlays.closeAddCall();
      },
    });

  const summarize = (c: Call): PeerSummary => ({
    id: c.id,
    ...peerDisplay(c, peerInfo(c), displayNumber, t('unknownCaller')),
  });

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
    // Closing a panel cancels it, so reopening never finds an old destination
    // armed behind the directory list.
    if (panel === overlay && panel === 'transfer') clearTransfer();
    if (panel === overlay && panel === 'addcall') clearAddCall();
    if (panel === 'keypad') overlays.toggleKeypad();
    else if (panel === 'transfer') overlays.toggleTransfer();
    else if (panel === 'devices') overlays.toggleDevices();
    else overlays.toggleAddCall();
  };

  return (
    <OngoingCallView
      peer={summarize(call)}
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
      onTransferToChange={transferTarget.onType}
      onTransferToPaste={transferTarget.onPasteText}
      directory={directory}
      onPickTransferContact={transferTarget.pick}
      pickedTransferContact={transferTarget.picked}
      onClearTransferContact={clearTransfer}
      onPickAddCallContact={pickAddCall}
      pickedAddCallContact={canAddCall ? addCallTarget.picked : null}
      onClearAddCallContact={clearAddCall}
      onBlindTransfer={() => {
        if (actions.transfer(transferTo)) {
          clearTransfer();
          overlays.closeTransfer();
        }
      }}
      onConsultTransfer={() => void startAttendedTransfer(transferTo)}
      addCallTo={addCallValue}
      onAddCallToChange={addCallTarget.onType}
      onAddCallToPaste={addCallTarget.onPasteText}
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
