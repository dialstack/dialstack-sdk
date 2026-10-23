import React, { useState } from 'react';
import { Pressable, ScrollView, Text, TextInput, View } from 'react-native';
import {
  directoryContactTags,
  filterDirectory,
  type DirectoryContact,
  type Locale,
  type SoftphonePalette,
} from '@dialstack/sdk-react/core';
import type { makeStyles } from '../primitives';

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

/**
 * The host's directory as a searchable list. The search text is its own: the
 * number field only takes dial characters, so it can't double as a name search.
 */
export function DirectoryPickerView({
  palette,
  styles,
  t,
  directory,
  isSelected,
  onPick,
  keyboardId,
}: DirectoryPickerViewProps): React.JSX.Element {
  const [query, setQuery] = useState('');
  const groups = filterDirectory(directory, query);

  return (
    <View style={styles.directory}>
      <TextInput
        style={styles.transferInput}
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
                  <View style={styles.directoryOptionTitle}>
                    <Text style={styles.directoryOptionLabel}>{entry.label}</Text>
                    {directoryContactTags(entry).map((tag, j) => (
                      <View key={`${tag}|${j}`} style={styles.directoryTag}>
                        <Text style={styles.directoryTagText}>{tag}</Text>
                      </View>
                    ))}
                  </View>
                  <Text style={styles.directoryOptionDetail}>
                    {entry.description || entry.destination}
                  </Text>
                </Pressable>
              );
            })}
          </View>
        ))}
      </ScrollView>
    </View>
  );
}
