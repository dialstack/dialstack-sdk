import React from 'react';
import { softphoneGlyphs } from '../../core/icons';
import { Glyph } from '../Glyph';
import { ControlsSlot } from '../ControlsSlot';
import type { SoftphoneViewChrome } from './types';

export interface IncomingCallCardViewProps extends Pick<SoftphoneViewChrome, 't'> {
  name: string;
  number?: string | null;
  compact?: boolean;
  onAnswer: () => void;
  onDecline: () => void;
}

export const IncomingCallCardView: React.FC<IncomingCallCardViewProps> = ({
  name,
  number = null,
  compact = false,
  onAnswer,
  onDecline,
  t,
}) => (
  <div className={`ds-incoming-card ${compact ? 'ds-incoming-card-compact' : ''}`}>
    <div className="ds-peer ds-incoming-card-info">
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
      <button
        type="button"
        className="ds-action ds-decline"
        aria-label={t('decline')}
        onClick={onDecline}
      >
        <Glyph glyph={softphoneGlyphs.hangup} />
      </button>
      <button
        type="button"
        className="ds-action ds-answer"
        aria-label={t('answer')}
        onClick={onAnswer}
      >
        <Glyph glyph={softphoneGlyphs.phone} />
      </button>
    </div>
  </div>
);
