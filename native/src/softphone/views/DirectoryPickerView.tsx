import React from 'react';
import { Pressable, ScrollView, Text, TextInput, View } from 'react-native';
import {
  softphoneGlyphs,
  useDirectorySearch,
  type DirectoryContact,
  type Locale,
  type SoftphonePalette,
} from '@dialstack/sdk-react/core';
import { Glyph, type makeStyles } from '../primitives';
import { DirectoryContactView } from './DirectoryContactView';

export interface DirectoryPickerViewProps {
  palette: SoftphonePalette;
  styles: ReturnType<typeof makeStyles>;
  t: (key: keyof Locale['softphone']) => string;
  directory: readonly DirectoryContact[];
  /** Whether the number field currently holds this entry's destination. */
  isSelected: (entry: DirectoryContact) => boolean;
  onPick: (entry: DirectoryContact) => void;
  /** Lets the shared Done bar close the search keyboard. */
  keyboardId: string;
}

/** The host's directory as a searchable list. */
export function DirectoryPickerView({
  palette,
  styles,
  t,
  directory,
  isSelected,
  onPick,
  keyboardId,
}: DirectoryPickerViewProps): React.JSX.Element {
  const { query, setQuery, groups } = useDirectorySearch(directory, t);

  return (
    <View style={styles.directory}>
      <View style={styles.directorySearch}>
        <View style={styles.directorySearchIcon} importantForAccessibility="no">
          <Glyph glyph={softphoneGlyphs.search} size={18} color={palette.textSecondary} />
        </View>
        <TextInput
          style={[styles.transferInput, styles.directorySearchInput]}
          value={query}
          onChangeText={setQuery}
          placeholder={t('directorySearchPlaceholder')}
          placeholderTextColor={palette.textSecondary}
          accessibilityLabel={t('directorySearchPlaceholder')}
          inputAccessoryViewID={keyboardId}
          autoCorrect={false}
          autoCapitalize="none"
          returnKeyType="search"
        />
        {query !== '' && (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={t('directoryClearSearch')}
            onPress={() => setQuery('')}
            hitSlop={8}
            style={({ pressed }: { pressed: boolean }) => [
              styles.directorySearchClear,
              pressed && styles.directoryOptionPressed,
            ]}
          >
            <Glyph glyph={softphoneGlyphs.close} size={14} color={palette.textSecondary} />
          </Pressable>
        )}
      </View>
      <ScrollView
        style={styles.directoryOptions}
        contentContainerStyle={styles.directoryOptionsContent}
        accessibilityLabel={t('directoryLabel')}
        // A tap on an entry must land while the search keyboard is still up.
        keyboardShouldPersistTaps="handled"
      >
        {groups.length === 0 && (
          <Text style={styles.directoryEmpty}>{t('directoryNoMatches')}</Text>
        )}
        {groups.map(({ group, destinations }) => (
          <View key={group ?? ''} accessibilityRole="list" accessibilityLabel={group}>
            {group && (
              <Text style={styles.directoryGroup} importantForAccessibility="no">
                {group}
              </Text>
            )}
            {destinations.map((entry) => {
              const selected = isSelected(entry);
              return (
                <Pressable
                  key={entry.id}
                  accessibilityRole="button"
                  accessibilityState={{ selected }}
                  onPress={() => onPick(entry)}
                  style={({ pressed }: { pressed: boolean }) => [
                    styles.directoryOption,
                    pressed && styles.directoryOptionPressed,
                    selected && styles.directoryOptionSelected,
                  ]}
                >
                  <DirectoryContactView palette={palette} styles={styles} t={t} entry={entry} />
                </Pressable>
              );
            })}
          </View>
        ))}
      </ScrollView>
    </View>
  );
}
