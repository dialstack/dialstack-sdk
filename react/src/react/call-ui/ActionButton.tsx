import React from 'react';
import { callGlyphs, type CallGlyph } from './core/glyphs';
import { Glyph } from './Glyph';

export type ActionButtonVariant = 'call' | 'answer' | 'decline' | 'hangup' | 'close';

// The class names predate this component: hosts and tests select on them.
const VARIANTS: Record<ActionButtonVariant, { className: string; glyph: CallGlyph }> = {
  call: { className: 'ds-call', glyph: callGlyphs.phone },
  answer: { className: 'ds-answer', glyph: callGlyphs.phone },
  decline: { className: 'ds-decline', glyph: callGlyphs.hangup },
  hangup: { className: 'ds-hangup', glyph: callGlyphs.hangup },
  close: { className: 'ds-keypad-close', glyph: callGlyphs.close },
};

/**
 * The round primary action of a call screen: place, answer, decline or end a
 * call, or `close` whatever took the screen over.
 *
 * A slot that swaps between two actions must render both through this
 * component: React then keeps the button's node, and keyboard focus with it.
 */
export const ActionButton: React.FC<{
  variant: ActionButtonVariant;
  label: string;
  disabled?: boolean;
  onClick: () => void;
}> = ({ variant, label, disabled, onClick }) => {
  const { className, glyph } = VARIANTS[variant];
  return (
    <button
      type="button"
      className={`ds-action ${className}`}
      aria-label={label}
      disabled={disabled}
      onClick={onClick}
    >
      <Glyph glyph={glyph} />
    </button>
  );
};
