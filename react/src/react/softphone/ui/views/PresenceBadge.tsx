import React from 'react';
import type { PresenceStatus } from '@dialstack/sdk-webrtc';
import { presenceGlyphs } from '../../core/icons';
import { presenceTone } from '../../core/view-model';
import { Glyph } from '../Glyph';

/** A presence state's mark on a disc in its theme colour. Decorative: the label says it. */
export const PresenceBadge: React.FC<{ presence: PresenceStatus }> = ({ presence }) => {
  const glyph = presenceGlyphs[presence];
  return (
    <span
      className="ds-directory-presence"
      data-presence={presence}
      data-tone={presenceTone(presence)}
      aria-hidden="true"
    >
      {glyph && <Glyph glyph={glyph} />}
    </span>
  );
};
