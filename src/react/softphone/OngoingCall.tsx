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
import { callPeerNumber, callPeerName, callStateLabelKey } from '../softphone-hooks';
import { dialPadKeys } from '../../components/softphone-theme';
import { softphoneGlyphs } from '../../components/softphone-icons';
import { Glyph } from './Glyph';
import type { Locale } from '../../locales';

export function OngoingCall(): React.JSX.Element | null {
  const { activeCall: call, actions, duration, t, displayNumber, scope } = useSoftphone();
  const { showKeypad, showTransfer } = actions;
  const [dtmfEntered, setDtmfEntered] = useState('');
  const [transferTo, setTransferTo] = useState('');

  // Clear the per-call transient text when the foreground call changes. (The
  // overlay flags themselves reset inside useCallActions so web + RN match.)
  const callId = call?.id ?? null;
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- reset transient text on foreground-call change
    setDtmfEntered('');
    setTransferTo('');
  }, [callId]);

  if (!call) return null;

  const peer = callPeerNumber(call);
  const peerName = callPeerName(call);
  const isActive = call.state === 'active' || call.state === 'held';
  const name = peerName || displayNumber(peer) || t('unknownCaller');
  // Hide the DTMF keypad where the platform can't send DTMF (react-native-webrtc
  // has no RTCDTMFSender) — otherwise the keypad taps would each throw. Web
  // browsers support it, so the keypad stays.
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
            <span className="ds-callstate-text">
              {t(callStateLabelKey(call.state) as keyof Locale['softphone'])}
            </span>
            {isActive && <span className="ds-duration">{duration}</span>}
          </div>
        </div>

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
              onChange={(e) => setTransferTo(e.target.value)}
            />
            <button
              type="button"
              className="ds-transfer-send"
              onClick={() => {
                actions.transfer(transferTo);
                setTransferTo('');
              }}
            >
              {t('transferSend')}
            </button>
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
