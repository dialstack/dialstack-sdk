import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import {
  defaultLocale,
  resolveSoftphonePalette,
  type DirectoryContact,
} from '@dialstack/sdk-react/core';

import { DirectoryPickerView } from '../views/DirectoryPickerView';
import { makeStyles } from '../primitives';

// Rendered through react-native-web, as the native Storybook does, so the
// view's own markup is what's asserted.
jest.mock('react-native', () => jest.requireActual('react-native-web'));
jest.mock('react-native-svg', () => ({ __esModule: true, default: () => null, Path: () => null }));

const palette = resolveSoftphonePalette(undefined);
const t = (k: keyof (typeof defaultLocale)['softphone']) => defaultLocale.softphone[k];

const directory: DirectoryContact[] = [
  { id: 'ana', label: 'Ana Diaz', destination: '1001', presence: 'available' },
  { id: 'bo', label: 'Bo Chen', destination: '1002', presence: 'offline' },
  { id: 'desk', label: 'Front desk', destination: '100' },
];

function renderPicker() {
  return render(
    <DirectoryPickerView
      palette={palette}
      styles={makeStyles(palette)}
      t={t}
      directory={directory}
      isSelected={() => false}
      onPick={() => {}}
      keyboardId="kb"
    />
  );
}

describe('native DirectoryPickerView', () => {
  it('draws a dot in the theme colour and names the state beside the destination', () => {
    renderPicker();
    const dots = screen.getAllByTestId('directory-presence');
    expect(dots).toHaveLength(2);
    expect(getComputedStyle(dots[0]).backgroundColor).toBe('rgb(48, 164, 108)');
    expect(screen.getByText('1001 · Available')).toBeTruthy();
    expect(screen.getByText('1002 · Offline')).toBeTruthy();
    // An entry without presence keeps its plain second line.
    expect(screen.getByText('100')).toBeTruthy();
  });

  it('finds entries by their presence', () => {
    renderPicker();
    fireEvent.change(screen.getByLabelText('Search directory'), { target: { value: 'offline' } });
    expect(screen.getByText('Bo Chen')).toBeTruthy();
    expect(screen.queryByText('Ana Diaz')).toBeNull();
  });
});
