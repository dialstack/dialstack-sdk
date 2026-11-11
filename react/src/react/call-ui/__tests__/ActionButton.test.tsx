import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import { ActionButton, type ActionButtonVariant } from '../ActionButton';
import { callGlyphs, type CallGlyph } from '../core/glyphs';

const variants: Array<[ActionButtonVariant, string, CallGlyph]> = [
  ['call', 'ds-call', callGlyphs.phone],
  ['answer', 'ds-answer', callGlyphs.phone],
  ['decline', 'ds-decline', callGlyphs.hangup],
  ['hangup', 'ds-hangup', callGlyphs.hangup],
  ['close', 'ds-keypad-close', callGlyphs.close],
];

describe('ActionButton', () => {
  it.each(variants)('%s renders as .%s with its glyph', (variant, className, glyph) => {
    render(<ActionButton variant={variant} label="Do it" onClick={() => {}} />);

    const button = screen.getByRole('button', { name: 'Do it' });
    expect(button.className).toBe(`ds-action ${className}`);
    const path = button.querySelector('path');
    expect(path?.getAttribute('d')).toBe(glyph.path);
    expect(path?.getAttribute('transform')).toBe(glyph.transform ?? null);
  });

  it('fires onClick, and not while disabled', () => {
    const onClick = jest.fn();
    const { rerender } = render(<ActionButton variant="hangup" label="End" onClick={onClick} />);
    fireEvent.click(screen.getByRole('button', { name: 'End' }));
    expect(onClick).toHaveBeenCalledTimes(1);

    rerender(<ActionButton variant="hangup" label="End" disabled onClick={onClick} />);
    const button = screen.getByRole<HTMLButtonElement>('button', { name: 'End' });
    expect(button.disabled).toBe(true);
    fireEvent.click(button);
    expect(onClick).toHaveBeenCalledTimes(1);
  });

  // The softphone's keypad swaps close for hang up in one slot. Focus survives
  // the swap only because both are this component, so React keeps the node.
  it('keeps its node, and focus, when the variant changes', () => {
    const { rerender } = render(<ActionButton variant="close" label="Keypad" onClick={() => {}} />);
    const close = screen.getByRole('button', { name: 'Keypad' });
    close.focus();

    rerender(<ActionButton variant="hangup" label="Hang up" onClick={() => {}} />);

    const hangup = screen.getByRole('button', { name: 'Hang up' });
    expect(hangup).toBe(close);
    expect(document.activeElement).toBe(hangup);
  });
});
