import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import {
  defaultLocale,
  resolveSoftphonePalette,
  type DirectoryContact,
} from '@dialstack/sdk-react/core';

import { DialPadView } from '../views/DialPadView';

// Rendered through react-native-web, as the native Storybook does.
jest.mock('react-native', () => jest.requireActual('react-native-web'));
jest.mock('react-native-svg', () => ({ __esModule: true, default: () => null, Path: () => null }));

const palette = resolveSoftphonePalette(undefined);
const t = (k: keyof (typeof defaultLocale)['softphone']) => defaultLocale.softphone[k];

const directory: DirectoryContact[] = [
  { id: 'ana', label: 'Ana Diaz', destination: '1001', presence: 'available' },
];

function renderPad(over: Partial<React.ComponentProps<typeof DialPadView>> = {}) {
  return render(
    <DialPadView
      palette={palette}
      t={t}
      connection="connected"
      destination=""
      onDestinationChange={() => {}}
      canCall={false}
      onCall={() => {}}
      {...over}
    />
  );
}

describe('native DialPadView directory', () => {
  it('offers no switch without a directory', () => {
    renderPad();
    expect(screen.queryByLabelText('Choose from directory')).toBeNull();
    expect(screen.getByLabelText('5 JKL')).toBeTruthy();
  });

  it('opens on the keypad and swaps it for the list', () => {
    const onPick = jest.fn();
    renderPad({ directory, onPick });
    expect(screen.getByLabelText('5 JKL')).toBeTruthy();
    fireEvent.click(screen.getByLabelText('Choose from directory'));
    expect(screen.queryByLabelText('5 JKL')).toBeNull();
    fireEvent.click(screen.getByText('Ana Diaz'));
    expect(onPick).toHaveBeenCalledWith(directory[0]);
    fireEvent.click(screen.getByLabelText('Enter a number'));
    expect(screen.getByLabelText('5 JKL')).toBeTruthy();
  });

  it('names the pick above the call button while the list shows', () => {
    renderPad({ directory, picked: directory[0], destination: '1001' });
    fireEvent.click(screen.getByLabelText('Choose from directory'));
    expect(screen.getByText('To: Ana Diaz · 1001')).toBeTruthy();
  });

  it('offers entries matching the typed number and picks the one tapped', () => {
    const onPick = jest.fn();
    renderPad({ directory, onPick, destination: '100' });
    fireEvent.click(screen.getByText('Ana Diaz'));
    expect(onPick).toHaveBeenCalledWith(directory[0]);
  });

  it('offers nothing before a number matches', () => {
    renderPad({ directory, destination: '9' });
    expect(screen.queryByText('Ana Diaz')).toBeNull();
    expect(screen.getByLabelText('Matching contacts')).toBeTruthy();
  });
});
