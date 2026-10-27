import React from 'react';
import { dialPadKeys } from '../../core/theme';

export interface KeypadViewProps {
  /** The group's accessible name. */
  label: string;
  onKey: (digit: string) => void;
  /** A key's accessible name; defaults to the digit and its letters. */
  keyLabel?: (key: { digit: string; letters: string }) => string;
}

/**
 * The 12-key pad, shared by the dial pad and the in-call keypad so they look
 * and size the same: one centred 3x4 block whose keys fit both the width and
 * the height they are given, with gaps that scale with the keys (styles.ts).
 */
export const KeypadView: React.FC<KeypadViewProps> = ({
  label,
  onKey,
  keyLabel = ({ digit, letters }) => `${digit}${letters ? ' ' + letters : ''}`,
}) => (
  <div className="ds-keypad" role="group" aria-label={label}>
    <div className="ds-keypad-keys">
      {dialPadKeys.map((key) => (
        <button
          type="button"
          key={key.digit}
          className="ds-key"
          aria-label={keyLabel(key)}
          onClick={() => onKey(key.digit)}
        >
          <span className="ds-key-digit">{key.digit}</span>
          <span className="ds-key-letters">{key.letters || ' '}</span>
        </button>
      ))}
    </div>
  </div>
);
