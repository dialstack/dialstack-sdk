import React from 'react';
import { Pressable, View } from 'react-native';
import {
  softphoneGlyphs,
  type DirectoryContact,
  type Locale,
  type SoftphonePalette,
} from '@dialstack/sdk-react/core';
import { Glyph, type makeStyles } from '../primitives';
import { DirectoryContactView } from './DirectoryContactView';

/** The contact a panel will act on, in place of the field or list it came from. */
export function PickedTargetView({
  palette,
  styles,
  t,
  entry,
  onClear,
}: {
  palette: SoftphonePalette;
  styles: ReturnType<typeof makeStyles>;
  t: (key: keyof Locale['softphone']) => string;
  entry: DirectoryContact;
  onClear: () => void;
}): React.JSX.Element {
  return (
    <View style={styles.dialPick}>
      <View style={styles.dialPickContact}>
        <DirectoryContactView palette={palette} styles={styles} t={t} entry={entry} />
      </View>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={t('directoryClearPick')}
        onPress={onClear}
        hitSlop={8}
        style={({ pressed }: { pressed: boolean }) => [
          styles.dialPickClear,
          pressed && styles.directoryOptionPressed,
        ]}
      >
        <Glyph glyph={softphoneGlyphs.close} size={14} color={palette.textSecondary} />
      </Pressable>
    </View>
  );
}
