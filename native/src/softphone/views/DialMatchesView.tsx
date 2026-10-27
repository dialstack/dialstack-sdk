import React from 'react';
import { Pressable, ScrollView } from 'react-native';
import {
  currentContact,
  matchDirectoryByNumber,
  type DirectoryContact,
  type Locale,
  type SoftphonePalette,
} from '@dialstack/sdk-react/core';
import type { makeStyles } from '../primitives';
import { DirectoryContactView } from './DirectoryContactView';

export interface DialMatchesViewProps {
  palette: SoftphonePalette;
  styles: ReturnType<typeof makeStyles>;
  t: (key: keyof Locale['softphone']) => string;
  directory: readonly DirectoryContact[];
  /** What the number field holds. */
  value: string;
  /** The contact `value` came from: shown alone, marked, in place of matches. */
  picked: DirectoryContact | null;
  onPick: (entry: DirectoryContact) => void;
}

/**
 * The row above a number field: entries whose number contains what was typed,
 * or the picked one. Always rendered, so the field below stays put as matches
 * come and go.
 */
export function DialMatchesView({
  palette,
  styles,
  t,
  directory,
  value,
  picked,
  onPick,
}: DialMatchesViewProps): React.JSX.Element {
  // The pick as the directory has it now, so its presence keeps moving.
  const pickedNow = currentContact(directory, picked);
  const offered = pickedNow ? [pickedNow] : matchDirectoryByNumber(directory, value);
  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      keyboardShouldPersistTaps="handled"
      style={styles.dialMatches}
      contentContainerStyle={styles.dialMatchesContent}
      accessibilityLabel={t('directoryMatches')}
    >
      {offered.map((entry) => {
        const selected = entry.id === picked?.id;
        return (
          <Pressable
            key={entry.id}
            accessibilityRole="button"
            accessibilityState={{ selected }}
            onPress={() => onPick(entry)}
            style={({ pressed }: { pressed: boolean }) => [
              styles.dialMatch,
              pressed && styles.directoryOptionPressed,
              selected && styles.directoryOptionSelected,
            ]}
          >
            <DirectoryContactView palette={palette} styles={styles} t={t} entry={entry} inline />
          </Pressable>
        );
      })}
    </ScrollView>
  );
}
