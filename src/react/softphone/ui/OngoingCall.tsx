/**
 * OngoingCall — the in-call screen: peer + call-state + live duration, the
 * optional DTMF keypad and transfer overlays, the control row (mute / hold /
 * keypad / transfer), and hang up. Renders nothing when there is no active call.
 *
 * Reads the active call, actions, and duration from the softphone context; owns
 * only its own transient DTMF-readout and transfer-input text. Must be rendered
 * inside a `<SoftphoneProvider>`.
 */

import React, { useEffect, useState } from 'react';
import { useSoftphone } from '../provider/SoftphoneProvider';
import {
  callPeerNumber,
  callPeerName,
  callStateLabelKey,
  isCallActive,
  useDialInput,
} from '../hooks';
import { dialPadKeys } from '../core/theme';
import { softphoneGlyphs } from '../core/icons';
import { Glyph } from './Glyph';
import { CallErrorChip } from './CallErrorChip';

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
    t,
    displayNumber,
    scope,
  } = useSoftphone();
  const { showKeypad, showTransfer } = overlays;
  const [dtmfEntered, setDtmfEntered] = useState('');
  const [transferTo, setTransferTo] = useState('');
  const { onType: onTransferType, onPasteText: onTransferPaste } = useDialInput(setTransferTo);

  // Clear the per-call transient text when the foreground call changes. (The
  // overlay flags themselves reset inside useCallOverlays so web + RN match.)
  const callId = call?.id ?? null;
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- reset transient text on foreground-call change
    setDtmfEntered('');
    setTransferTo('');
  }, [callId]);

  if (!call) return null;

  const peer = callPeerNumber(call);
  const peerName = callPeerName(call);
  const isActive = isCallActive(call);
  const name = peerName || displayNumber(peer) || t('unknownCaller');
  // Hide the DTMF keypad where the platform can't send DTMF (react-native-webrtc
  // has no RTCDTMFSender) — otherwise the taps would each throw. Web browsers
  // support it, so the keypad stays.
  const canSendDtmf = call.canSendDtmf;

  const sendDtmf = (digit: string) => {
    actions.sendDtmf(digit);
    setDtmfEntered((prev) => prev + digit);
  };

  // An attended transfer is just two switchable calls + a transfer flag, so it
  // renders the normal in-call view (controls + switch cards). On top we show a
  // banner for the OTHER transfer leg (the one not currently focused) plus the
  // Complete/Cancel actions. Its card is excluded from the plain held-calls list
  // below so it isn't shown twice.
  const inTransfer = consultCall !== null && transferOriginal !== null;
  // The banner + Complete belong ONLY when the FOCUSED call is one of the two
  // transfer legs. With switchable focus the active call can be a third unrelated
  // call — showing the banner then would name the wrong "other leg" and Complete
  // would bridge legs the user isn't looking at. When focused elsewhere the two
  // transfer legs just appear as ordinary switch cards below.
  const focusInTransfer = inTransfer && (call === consultCall || call === transferOriginal);
  const transferOther = focusInTransfer
    ? call === consultCall
      ? transferOriginal
      : consultCall
    : null;
  // Bridge only once the consult target is answered — active OR held (the user
  // may have switched focus, holding the consult). Not while it's still ringing.
  // Only offer Complete when focused on a transfer leg.
  const canComplete = focusInTransfer && consultCall !== null && consultCall.isConnected;
  const switchableHeld = heldCalls.filter((c) => c !== transferOther);

  // Transfer is disabled while a transfer is already in progress OR more than one
  // call is live (held/ringing besides the active one). A new transfer in either
  // situation is ambiguous (which call? on top of the existing consult?), so the
  // control is shown greyed rather than allowing an invalid/confusing action.
  const otherLiveCalls = heldCalls.length + incomingCalls.length;
  const canStartTransfer = !inTransfer && otherLiveCalls === 0;

  return (
    <div className={`${scope} ds-softphone`}>
      <div className="ds-screen ds-screen-incall">
        {/* Attended-transfer banner: the OTHER leg (tap to switch to it) plus
            Cancel / Complete. The normal in-call view (controls, etc.) renders
            below, so mute/hold/keypad stay available while transferring. */}
        {focusInTransfer && transferOther && (
          <div className="ds-transfer-banner">
            {(() => {
              const otherPeer = callPeerNumber(transferOther);
              const otherName =
                callPeerName(transferOther) || displayNumber(otherPeer) || t('unknownCaller');
              return (
                <button
                  type="button"
                  className="ds-held-call ds-consult-held"
                  aria-label={`${t('switchToCall')}: ${otherName}`}
                  onClick={() => switchToCall(transferOther)}
                >
                  <div className="ds-peer-name">{otherName}</div>
                  <div className="ds-callstate-text">{t('transferOriginalOnHold')}</div>
                </button>
              );
            })()}
            <div className="ds-consult-actions">
              <button
                type="button"
                className="ds-e911-btn ds-e911-btn-secondary"
                onClick={cancelAttendedTransfer}
              >
                {t('cancel')}
              </button>
              <button
                type="button"
                className="ds-e911-btn"
                disabled={!canComplete}
                onClick={completeAttendedTransfer}
              >
                {t('transferComplete')}
              </button>
            </div>
          </div>
        )}

        {/* Other backgrounded calls the user can switch to — click a card to
            hold the current call and resume that one. Rendered ABOVE the active
            peer (same as the transfer banner) so the backgrounded call sits above
            and the active/current call below, consistently. Excludes the transfer
            leg shown in the banner above (so it isn't listed twice). */}
        {switchableHeld.length > 0 && (
          <div className="ds-held-calls" role="group" aria-label={t('heldCallsLabel')}>
            {switchableHeld.map((held) => {
              const heldPeer = callPeerNumber(held);
              const heldName = callPeerName(held) || displayNumber(heldPeer) || t('unknownCaller');
              return (
                <button
                  type="button"
                  key={held.id}
                  className="ds-held-call ds-consult-held"
                  aria-label={`${t('switchToCall')}: ${heldName}`}
                  onClick={() => switchToCall(held)}
                >
                  <div className="ds-peer-name">{heldName}</div>
                  <div className="ds-callstate-text">{t('heldCallsLabel')}</div>
                </button>
              );
            })}
          </div>
        )}

        <div className="ds-peer">
          <div className="ds-peer-name">{name}</div>
          {peerName && <div className="ds-peer-number">{displayNumber(peer)}</div>}
          <div className="ds-callstate">
            <span className="ds-callstate-text">{t(callStateLabelKey(call.state))}</span>
            {/* Duration ticks only while truly live. A held foreground call (e.g.
                promoted when the active call ended, or held during a switch) shows
                its "On hold" state + the Resume control below, never a running
                timer implying live audio. */}
            {call.state === 'active' && <span className="ds-duration">{duration}</span>}
          </div>
        </div>

        <CallErrorChip />

        {isActive && showKeypad && canSendDtmf && (
          <div className="ds-dtmf">
            <div className="ds-dtmf-readout">{dtmfEntered || ' '}</div>
            <div className="ds-keypad ds-keypad-dtmf" role="group" aria-label={t('keypad')}>
              {dialPadKeys.map(({ digit }) => (
                <button
                  type="button"
                  key={digit}
                  className="ds-key"
                  aria-label={digit}
                  onClick={() => sendDtmf(digit)}
                >
                  <span className="ds-key-digit">{digit}</span>
                </button>
              ))}
            </div>
          </div>
        )}

        {isActive && showTransfer && canStartTransfer && (
          <div className="ds-transfer">
            <input
              className="ds-transfer-input"
              type="tel"
              inputMode="tel"
              value={transferTo}
              placeholder={t('transferPlaceholder')}
              aria-label={t('transferPlaceholder')}
              autoComplete="off"
              onChange={(e) => onTransferType(e.target.value)}
              onPaste={(e) => {
                e.preventDefault();
                onTransferPaste(e.clipboardData.getData('text'));
              }}
            />
            <div className="ds-transfer-actions">
              {/* Blind: hand off immediately. */}
              <button
                type="button"
                className="ds-transfer-send ds-transfer-send-secondary"
                disabled={!transferTo.trim()}
                onClick={() => {
                  // Close the transfer overlay only if the hand-off succeeded; a
                  // failed transfer (routed to onError) leaves it open to retry.
                  if (actions.transfer(transferTo)) {
                    setTransferTo('');
                    overlays.closeTransfer();
                  }
                }}
              >
                {t('transferNow')}
              </button>
              {/* Attended: hold the caller and consult the target first. */}
              <button
                type="button"
                className="ds-transfer-send"
                disabled={!transferTo.trim()}
                onClick={() => void startAttendedTransfer(transferTo)}
              >
                {t('transferConsult')}
              </button>
            </div>
          </div>
        )}

        {isActive && (
          <div className="ds-controls" role="group">
            <button
              type="button"
              className={`ds-control ${call.isMuted ? 'ds-control-on' : ''}`}
              aria-pressed={call.isMuted}
              aria-label={call.isMuted ? t('unmute') : t('mute')}
              onClick={actions.toggleMute}
            >
              <span className="ds-control-glyph">
                <Glyph glyph={call.isMuted ? softphoneGlyphs.micOff : softphoneGlyphs.mic} />
              </span>
              <span className="ds-control-label">{call.isMuted ? t('unmute') : t('mute')}</span>
            </button>
            <button
              type="button"
              className={`ds-control ${call.state === 'held' ? 'ds-control-on' : ''}`}
              aria-pressed={call.state === 'held'}
              aria-label={call.state === 'held' ? t('resume') : t('hold')}
              onClick={actions.toggleHold}
            >
              <span className="ds-control-glyph">
                <Glyph glyph={softphoneGlyphs.pause} />
              </span>
              <span className="ds-control-label">
                {call.state === 'held' ? t('resume') : t('hold')}
              </span>
            </button>
            {canSendDtmf && (
              <button
                type="button"
                className={`ds-control ${showKeypad ? 'ds-control-on' : ''}`}
                aria-pressed={showKeypad}
                aria-label={t('keypad')}
                onClick={overlays.toggleKeypad}
              >
                <span className="ds-control-glyph">
                  <Glyph glyph={softphoneGlyphs.keypad} />
                </span>
                <span className="ds-control-label">{t('keypad')}</span>
              </button>
            )}
            <button
              type="button"
              className={`ds-control ${showTransfer ? 'ds-control-on' : ''}`}
              aria-pressed={showTransfer}
              aria-label={t('transfer')}
              disabled={!canStartTransfer}
              onClick={overlays.toggleTransfer}
            >
              <span className="ds-control-glyph">
                <Glyph glyph={softphoneGlyphs.transfer} />
              </span>
              <span className="ds-control-label">{t('transfer')}</span>
            </button>
          </div>
        )}

        <div className="ds-actions">
          <button
            type="button"
            className="ds-action ds-hangup"
            aria-label={t('hangUp')}
            onClick={actions.hangup}
          >
            <Glyph glyph={softphoneGlyphs.hangup} />
          </button>
        </div>
      </div>
    </div>
  );
};
