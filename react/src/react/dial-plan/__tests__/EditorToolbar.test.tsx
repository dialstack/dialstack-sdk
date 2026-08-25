/**
 * The Save button is the last thing standing between a rejected entry and a
 * plan that reports success while routing nowhere, so its disabled conditions
 * are worth pinning directly.
 */

import React from 'react';
import { render, screen } from '@testing-library/react';
import { EditorToolbar } from '../EditorToolbar';

const toolbar = (props: Partial<React.ComponentProps<typeof EditorToolbar>> = {}) =>
  render(<EditorToolbar onAutoLayout={jest.fn()} onSave={jest.fn()} {...props} />);

describe('EditorToolbar', () => {
  it('enables Save on a dirty graph', () => {
    toolbar({ isDirty: true });

    expect(screen.getByTitle('Save')).not.toBeDisabled();
  });

  it('disables Save on a clean graph', () => {
    toolbar({ isDirty: false });

    expect(screen.getByTitle('Save')).toBeDisabled();
  });

  it('disables Save while a config panel holds a rejected entry', () => {
    // Dirty on its own would be enough — a node added to the canvas makes the
    // graph dirty before anything is typed into it.
    toolbar({ isDirty: true, hasInvalidDraft: true });

    expect(screen.getByTitle('Save')).toBeDisabled();
  });
});
