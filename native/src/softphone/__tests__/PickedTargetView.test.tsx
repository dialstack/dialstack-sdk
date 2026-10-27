import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import { defaultLocale, resolveSoftphonePalette } from '@dialstack/sdk-react/core';

import { PickedTargetView } from '../views/PickedTargetView';
import { makeStyles } from '../primitives';

// Rendered through react-native-web, as the native Storybook does.
jest.mock('react-native', () => jest.requireActual('react-native-web'));
jest.mock('react-native-svg', () => ({ __esModule: true, default: () => null, Path: () => null }));

const palette = resolveSoftphonePalette(undefined);
const t = (k: keyof (typeof defaultLocale)['softphone']) => defaultLocale.softphone[k];

describe('native PickedTargetView', () => {
  it('shows the pick and clears it from its ×', () => {
    const onClear = jest.fn();
    render(
      <PickedTargetView
        palette={palette}
        styles={makeStyles(palette)}
        t={t}
        entry={{ id: 'ana', label: 'Ana Diaz', destination: '1001', presence: 'on_call' }}
        onClear={onClear}
      />
    );
    expect(screen.getByText('Ana Diaz')).toBeTruthy();
    // The same summary as the directory row, status spelled out.
    expect(screen.getByText('1001 · On a call')).toBeTruthy();
    expect(screen.getAllByTestId('directory-presence')).toHaveLength(1);
    fireEvent.click(screen.getByLabelText('Clear selection'));
    expect(onClear).toHaveBeenCalledTimes(1);
  });
});
