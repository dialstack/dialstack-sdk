import React from 'react';
import { softphoneGlyphs } from '../../core/icons';
import { Glyph } from '../Glyph';
import { ControlButton } from '../ControlButton';
import { ControlsSlot } from '../ControlsSlot';
import { CallErrorChipView, type CallErrorChipViewProps } from './CallErrorChipView';
import { PeerAvatar, PeerRow } from './PeerAvatar';
import { DialPanelView } from './DialPanelView';
import { KeypadView } from './KeypadView';
import type { DirectoryContact } from '../../core/view-model';
import { useRoomyHost } from './useRoomyHost';
import {
  DEFAULT_SCOPE,
  type OverlayPanel,
  type PeerSummary,
  type SoftphoneViewChrome,
} from './types';

export interface OngoingCallViewProps extends Omit<SoftphoneViewChrome, 'displayNumber'> {
  peer: PeerSummary;
  stateLabel: string;
  duration: string;
  showDuration: boolean;
  isActive: boolean;
  isMuted: boolean;
  isHeld: boolean;

  isMerged: boolean;
  conferenceParties: PeerSummary[];
  conferenceLabel: string;

  transferOther: PeerSummary | null;
  canCompleteTransfer: boolean;
  onSwitchToTransferOther: () => void;
  onCancelTransfer: () => void;
  onCompleteTransfer: () => void;

  switchableHeld: PeerSummary[];
  onSwitchToCall: (id: string) => void;

  error?: CallErrorChipViewProps['error'];
  onDismissError?: () => void;

  overlay: OverlayPanel;
  canSendDtmf: boolean;
  dtmfEntered: string;
  onSendDtmf: (digit: string) => void;
  transferTo: string;
  onTransferToChange: (value: string) => void;
  onTransferToPaste: (text: string) => void;
  /** The host's directory, offered by the transfer and add-call panels. */
  directory?: readonly DirectoryContact[];
  onPickTransferContact?: (entry: DirectoryContact) => void;
  /** The contact `transferTo` came from, or null when it was typed. */
  pickedTransferContact?: DirectoryContact | null;
  onClearTransferContact?: () => void;
  onPickAddCallContact?: (entry: DirectoryContact) => void;
  pickedAddCallContact?: DirectoryContact | null;
  onClearAddCallContact?: () => void;
  onBlindTransfer: () => void;
  onConsultTransfer: () => void;
  addCallTo: string;
  onAddCallToChange: (value: string) => void;
  onAddCallToPaste: (text: string) => void;
  onSubmitAddCall: () => void;
  devicesPanel?: React.ReactNode;

  canStartTransfer: boolean;
  canAddCall: boolean;
  canMerge: boolean;
  onToggleMute: () => void;
  onToggleHold: () => void;
  onToggleOverlay: (panel: Exclude<OverlayPanel, null>) => void;
  onMergeOrSplit: () => void;
  onHangup: () => void;
}

const NO_DIRECTORY: readonly DirectoryContact[] = [];

export const OngoingCallView: React.FC<OngoingCallViewProps> = ({
  peer,
  stateLabel,
  duration,
  showDuration,
  isActive,
  isMuted,
  isHeld,
  isMerged,
  conferenceParties,
  conferenceLabel,
  transferOther,
  canCompleteTransfer,
  onSwitchToTransferOther,
  onCancelTransfer,
  onCompleteTransfer,
  switchableHeld,
  onSwitchToCall,
  error = null,
  onDismissError = () => {},
  overlay,
  canSendDtmf,
  dtmfEntered,
  onSendDtmf,
  transferTo,
  onTransferToChange,
  onTransferToPaste,
  directory = NO_DIRECTORY,
  onPickTransferContact = () => {},
  pickedTransferContact = null,
  onClearTransferContact = () => {},
  onPickAddCallContact = () => {},
  pickedAddCallContact = null,
  onClearAddCallContact = () => {},
  onBlindTransfer,
  onConsultTransfer,
  addCallTo,
  onAddCallToChange,
  onAddCallToPaste,
  onSubmitAddCall,
  devicesPanel = null,
  canStartTransfer,
  canAddCall,
  canMerge,
  onToggleMute,
  onToggleHold,
  onToggleOverlay,
  onMergeOrSplit,
  onHangup,
  scope = DEFAULT_SCOPE,
  t,
}) => {
  const inKeypadMode = isActive && overlay === 'keypad' && canSendDtmf;
  const transferOpen = isActive && overlay === 'transfer' && canStartTransfer;
  const addCallOpen = isActive && overlay === 'addcall' && canAddCall;
  // Both panels take over the screen above hang up (see DialPanelView).
  const panelOpen = transferOpen || addCallOpen;

  const { ref: hostRef, roomy } = useRoomyHost<HTMLDivElement>();

  return (
    <div ref={hostRef} className={`${scope} ds-softphone`}>
      <div
        className={`ds-screen ds-screen-incall ${isActive ? 'ds-screen-active' : 'ds-screen-outgoing'}`}
      >
        {}
        {transferOther && !panelOpen && (
          <div className="ds-transfer-banner">
            <button
              type="button"
              className="ds-held-call ds-consult-held"
              aria-label={`${t('switchToCall')}: ${transferOther.name}`}
              onClick={onSwitchToTransferOther}
            >
              <PeerRow avatar={transferOther.avatar}>
                <div className="ds-peer-name">{transferOther.name}</div>
                <div className="ds-callstate-text">{t('transferOriginalOnHold')}</div>
              </PeerRow>
            </button>
            <div className="ds-consult-actions">
              <button
                type="button"
                className="ds-e911-btn ds-e911-btn-secondary"
                onClick={onCancelTransfer}
              >
                {t('cancel')}
              </button>
              <button
                type="button"
                className="ds-e911-btn"
                disabled={!canCompleteTransfer}
                onClick={onCompleteTransfer}
              >
                {t('transferComplete')}
              </button>
            </div>
          </div>
        )}

        {}
        {switchableHeld.length > 0 && !panelOpen && (
          <div className="ds-held-calls" role="group" aria-label={t('heldCallsLabel')}>
            {switchableHeld.map((held) => (
              <button
                type="button"
                key={held.id}
                className="ds-held-call ds-consult-held"
                aria-label={`${t('switchToCall')}: ${held.name}`}
                onClick={() => onSwitchToCall(held.id)}
              >
                <PeerRow avatar={held.avatar}>
                  <div className="ds-peer-name">{held.name}</div>
                  <div className="ds-callstate-text">{t('heldCallsLabel')}</div>
                </PeerRow>
              </button>
            ))}
          </div>
        )}

        {}
        {panelOpen ? null : isMerged ? (
          <div className="ds-peer ds-peer-conference">
            <div className="ds-callstate-text">{conferenceLabel}</div>
            <div className="ds-conference-parties">
              {conferenceParties.map((party) => (
                <div key={party.id} className="ds-conference-party">
                  <PeerAvatar avatar={party.avatar} size="sm" />
                  <div className="ds-conference-party-name">{party.name}</div>
                </div>
              ))}
            </div>
            <div className="ds-callstate">
              <span className="ds-duration">{duration}</span>
            </div>
          </div>
        ) : (
          <div className="ds-peer">
            {roomy && !inKeypadMode && <PeerAvatar avatar={peer.avatar} />}
            <div className="ds-peer-name">{peer.name}</div>
            {peer.number && <div className="ds-peer-number">{peer.number}</div>}
            <div className="ds-callstate">
              {inKeypadMode ? (
                <span className="ds-dtmf-readout">{dtmfEntered || '\u00a0'}</span>
              ) : (
                <span className="ds-callstate-text">{stateLabel}</span>
              )}
              {}
              {!inKeypadMode && (
                <span className="ds-duration" aria-hidden={!showDuration}>
                  {showDuration ? duration : ' '}
                </span>
              )}
            </div>
          </div>
        )}

        <CallErrorChipView error={error} onDismiss={onDismissError} t={t} />

        {isActive && overlay === 'keypad' && canSendDtmf && (
          <div className="ds-dtmf">
            <KeypadView label={t('keypad')} onKey={onSendDtmf} keyLabel={({ digit }) => digit} />
          </div>
        )}

        {transferOpen && (
          <DialPanelView
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
            onPaste={onTransferToPaste}
            actions={
              <>
                <button
                  type="button"
                  className="ds-transfer-send ds-transfer-send-secondary"
                  disabled={!transferTo.trim()}
                  onClick={onBlindTransfer}
                >
                  {t('transferNow')}
                </button>
                <button
                  type="button"
                  className="ds-transfer-send"
                  disabled={!transferTo.trim()}
                  onClick={onConsultTransfer}
                >
                  {t('transferConsult')}
                </button>
              </>
            }
            onClose={() => onToggleOverlay('transfer')}
            t={t}
          />
        )}

        {addCallOpen && (
          <DialPanelView
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
            onPaste={onAddCallToPaste}
            actions={
              <button
                type="button"
                className="ds-transfer-send"
                disabled={!addCallTo.trim()}
                onClick={onSubmitAddCall}
              >
                {t('addCallSend')}
              </button>
            }
            onClose={() => onToggleOverlay('addcall')}
            t={t}
          />
        )}

        {isActive && overlay === 'devices' && devicesPanel}

        {!isActive && <ControlsSlot />}

        {isActive && !inKeypadMode && !panelOpen && (
          <div className="ds-controls" role="group">
            <ControlButton
              label={isMuted ? t('unmute') : t('mute')}
              glyph={isMuted ? softphoneGlyphs.micOff : softphoneGlyphs.mic}
              on={isMuted}
              onClick={onToggleMute}
            />
            <ControlButton
              label={isHeld ? t('resume') : t('hold')}
              glyph={softphoneGlyphs.pause}
              on={isHeld}
              onClick={onToggleHold}
            />
            {canSendDtmf && (
              <ControlButton
                label={t('keypad')}
                glyph={softphoneGlyphs.keypad}
                on={overlay === 'keypad'}
                onClick={() => onToggleOverlay('keypad')}
              />
            )}
            <ControlButton
              label={t('addCall')}
              glyph={softphoneGlyphs.addCall}
              on={overlay === 'addcall'}
              disabled={!canAddCall || isMerged}
              onClick={() => onToggleOverlay('addcall')}
            />
            {}
            {canMerge || isMerged ? (
              <ControlButton
                label={isMerged ? t('split') : t('merge')}
                glyph={softphoneGlyphs.merge}
                on={isMerged}
                onClick={onMergeOrSplit}
              />
            ) : (
              <ControlButton
                label={t('transfer')}
                glyph={softphoneGlyphs.transfer}
                on={overlay === 'transfer'}
                disabled={!canStartTransfer}
                onClick={() => onToggleOverlay('transfer')}
              />
            )}
            <ControlButton
              label={t('audioDevices')}
              glyph={softphoneGlyphs.speaker}
              on={overlay === 'devices'}
              onClick={() => onToggleOverlay('devices')}
            />
          </div>
        )}

        <div className="ds-actions">
          {}
          {inKeypadMode ? (
            <button
              type="button"
              className="ds-action ds-keypad-close"
              aria-label={t('keypad')}
              onClick={() => onToggleOverlay('keypad')}
            >
              <Glyph glyph={softphoneGlyphs.close} />
            </button>
          ) : (
            <button
              type="button"
              className="ds-action ds-hangup"
              aria-label={t('hangUp')}
              onClick={onHangup}
            >
              <Glyph glyph={softphoneGlyphs.hangup} />
            </button>
          )}
        </div>
      </div>
    </div>
  );
};
