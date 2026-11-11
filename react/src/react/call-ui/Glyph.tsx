/** Renders a call UI glyph as an inline SVG, so the icon markup is single-sourced. */

import React from 'react';
import type { CallGlyph } from './core/glyphs';

export const Glyph: React.FC<{ glyph: CallGlyph }> = ({ glyph }) => {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <path d={glyph.path} transform={glyph.transform} />
    </svg>
  );
};
