/**
 * One button in the in-call control row (mute, hold, keypad, …).
 *
 * Single-sourced so the pressed state stays paired: `ds-control-on` and
 * `aria-pressed` are one prop here rather than two hand-written attributes at
 * every call site. Mirrors `ControlButton` in the native package.
 */

import React from 'react';
import type { SoftphoneGlyph } from '../core/icons';
import { Glyph } from './Glyph';

export const ControlButton: React.FC<{
  label: string;
  glyph: SoftphoneGlyph;
  on?: boolean;
  disabled?: boolean;
  onClick: () => void;
}> = ({ label, glyph, on = false, disabled = false, onClick }) => (
  <button
    type="button"
    className={`ds-control ${on ? 'ds-control-on' : ''}`}
    aria-pressed={on}
    aria-label={label}
    disabled={disabled}
    onClick={onClick}
  >
    <span className="ds-control-glyph">
      <Glyph glyph={glyph} />
    </span>
    <span className="ds-control-label">{label}</span>
  </button>
);
