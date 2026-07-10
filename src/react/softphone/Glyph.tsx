/**
 * Renders a softphone icon glyph as an inline SVG. Shared by the softphone
 * components so the icon markup is single-sourced.
 */

import React from 'react';
import type { SoftphoneGlyph } from '../../components/softphone-icons';

export function Glyph({ glyph }: { glyph: SoftphoneGlyph }): React.JSX.Element {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <path d={glyph.path} transform={glyph.transform} />
    </svg>
  );
}
