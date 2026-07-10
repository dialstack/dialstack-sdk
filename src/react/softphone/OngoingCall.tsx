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
import { useSoftphone } from '../SoftphoneProvider';
import { callPeerNumber, callPeerName, callStateLabelKey, useDialInput } from '../softphone-hooks';
import { dialPadKeys } from '../../components/softphone-theme';
import { softphoneGlyphs } from '../../components/softphone-icons';
import { Glyph } from './Glyph';
import { CallErrorChip } from './CallErrorChip';

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
    t,
    displayNumber,
    scope,
  } = useSoftphone();
  const { showKeypad, showTransfer } = actions;
  const [dtmfEntered, setDtmfEntered] = useState('');
  const [transferTo, setTransferTo] = useState('');
  const { onType: onTransferType, onPasteText: onTransferPaste } = useDialInput(setTransferTo);

  // Clear the per-call transient text when the foreground call changes. (The
  // overlay flags themselves reset inside useCallActions so web + RN match.)
  const callId = call?.id ?? null;
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- reset transient text on foreground-call change
    setDtmfEntered('');
    setTransferTo('');
  }, [callId]);

  // Attended-transfer "consulting" screen: the original party is held while we
  // talk to the consult target, then bridge (complete) or drop back (cancel).
  // Checked BEFORE `if (!call)` so the consult UI stays reachable even if the
  // held original drops mid-consult (the surviving consult is then the active
  // call and this screen falls through to the normal in-call view below).
  if (consultCall && transferOriginal) {
    const heldPeer = callPeerNumber(transferOriginal);
    const heldName =
      callPeerName(transferOriginal) || displayNumber(heldPeer) || t('unknownCaller');
    const consultPeer = callPeerNumber(consultCall);
    const consultName =
      callPeerName(consultCall) || displayNumber(consultPeer) || t('unknownCaller');
    // Only bridge once the consult target has actually answered.
    const canComplete = consultCall.state === 'active';
    return (
      <div className={`${scope} ds-softphone`}>
        <div className="ds-screen ds-screen-consult">
          <div className="ds-consult-party ds-consult-held">
            <div className="ds-peer-name">{heldName}</div>
            <div className="ds-callstate-text">{t('transferOriginalOnHold')}</div>
          </div>
          <div className="ds-consult-party ds-consult-active">
            <div className="ds-peer-name">{consultName}</div>
            <div className="ds-callstate">
              <span className="ds-callstate-text">{t(callStateLabelKey(consultCall.state))}</span>
            </div>
          </div>
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
      </div>
    );
  }

  if (!call) return null;

  const peer = callPeerNumber(call);
  const peerName = callPeerName(call);
  const isActive = call.state === 'active' || call.state === 'held';
  const name = peerName || displayNumber(peer) || t('unknownCaller');
  // Hide the DTMF keypad where the platform can't send DTMF (react-native-webrtc
  // has no RTCDTMFSender) — otherwise the taps would each throw. Web browsers
  // support it, so the keypad stays.
  const canSendDtmf = call.canSendDtmf;

  const sendDtmf = (digit: string) => {
    actions.sendDtmf(digit);
    setDtmfEntered((prev) => prev + digit);
  };

  return (
    <div className={`${scope} ds-softphone`}>
      <div className="ds-screen ds-screen-incall">
        <div className="ds-peer">
          <div className="ds-peer-name">{name}</div>
          {peerName && <div className="ds-peer-number">{displayNumber(peer)}</div>}
          <div className="ds-callstate">
            <span className="ds-callstate-text">{t(callStateLabelKey(call.state))}</span>
            {isActive && <span className="ds-duration">{duration}</span>}
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

        {isActive && showTransfer && (
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
                  actions.transfer(transferTo);
                  setTransferTo('');
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
                onClick={actions.toggleKeypad}
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
              onClick={actions.toggleTransfer}
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
}
