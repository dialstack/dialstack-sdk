import React from 'react';
import { ActionButton } from '../../../call-ui/ActionButton';
import { ControlsSlot } from '../ControlsSlot';
import { PeerAvatar } from '../../../call-ui/PeerAvatar';
import { useRoomyHost } from './useRoomyHost';
import type { PeerSummary, SoftphoneViewChrome } from './types';

export interface IncomingCallCardViewProps extends Pick<SoftphoneViewChrome, 't'> {
  name: string;
  number?: string | null;
  /** The host's avatar from `resolvePeer`, on the full card only: the compact one has no room. */
  avatar?: PeerSummary['avatar'];
  compact?: boolean;
  onAnswer: () => void;
  onDecline: () => void;
}

export const IncomingCallCardView: React.FC<IncomingCallCardViewProps> = ({
  name,
  number = null,
  avatar,
  compact = false,
  onAnswer,
  onDecline,
  t,
}) => {
  const { ref, roomy } = useRoomyHost<HTMLDivElement>();
  return (
    <div ref={ref} className={`ds-incoming-card ${compact ? 'ds-incoming-card-compact' : ''}`}>
      <div className="ds-peer ds-incoming-card-info">
        {!compact && roomy && <PeerAvatar avatar={avatar} />}
        <div className="ds-peer-name">{name}</div>
        {number && <div className="ds-peer-number">{number}</div>}
        <div className="ds-callstate">
          <div className="ds-incoming-label">{t('incomingCall')}</div>
          <span className="ds-duration" aria-hidden="true">
            {' '}
          </span>
        </div>
      </div>
      {!compact && <ControlsSlot />}

      <div className="ds-actions ds-actions-incoming">
        <ActionButton variant="decline" label={t('decline')} onClick={onDecline} />
        <ActionButton variant="answer" label={t('answer')} onClick={onAnswer} />
      </div>
    </div>
  );
};
