import React, { useState } from 'react';
import { Pressable, Text, TextInput, View } from 'react-native';
import {
  softphoneGlyphs,
  type DirectoryContact,
  type Locale,
  type SoftphonePalette,
} from '@dialstack/sdk-react/core';
import { Glyph, type makeStyles } from '../primitives';
import { DirectoryPickerView } from './DirectoryPickerView';

export interface DialPanelViewProps {
  palette: SoftphonePalette;
  styles: ReturnType<typeof makeStyles>;
  t: (key: keyof Locale['softphone']) => string;
  title: string;
  /** Who the panel acts on, shown under the title. */
  peerName: string;
  /** The host's directory; empty leaves only the number field. */
  directory: readonly DirectoryContact[];
  /** The contact `value` came from, or null when it was typed. */
  picked: DirectoryContact | null;
  onPick: (entry: DirectoryContact) => void;
  value: string;
  /** The field's placeholder, also its accessible name. */
  placeholder: string;
  onChange: (value: string) => void;
  /** The buttons that act on `value`, pinned just above hang up. */
  actions: React.ReactNode;
  onClose: () => void;
  /** Lets the shared Done bar close the keyboard. */
  keyboardId: string;
}

/**
 * The screen for choosing who to transfer to or call next. It replaces
 * everything on the in-call screen except hang up: a directory doesn't fit
 * beside the call controls, and the plain field shares the layout so the two
 * cases don't look like different features. With a directory it opens on the
 * list each time; typing a number is the fallback mode.
 */
export function DialPanelView({
  palette,
  styles,
  t,
  title,
  peerName,
  directory,
  picked,
  onPick,
  value,
  placeholder,
  onChange,
  actions,
  onClose,
  keyboardId,
}: DialPanelViewProps): React.JSX.Element {
  const [dialing, setDialing] = useState(false);
  const hasDirectory = directory.length > 0;
  const showField = dialing || !hasDirectory;

  return (
    <View style={styles.dialPanel}>
      <View style={[styles.dialPanelMain, !showField && styles.dialPanelMainList]}>
        <View style={styles.dialPanelHeader}>
          <View style={styles.dialPanelHeading}>
            <Text style={styles.dialPanelTitle}>{title}</Text>
            <Text style={styles.dialPanelPeer} numberOfLines={1}>
              {peerName}
            </Text>
          </View>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={t('cancel')}
            onPress={onClose}
            style={({ pressed }: { pressed: boolean }) => [
              styles.dialPanelClose,
              pressed && styles.directoryOptionPressed,
            ]}
          >
            <Glyph
              glyph={softphoneGlyphs.close}
              size={(styles.dialPanelClose.width as number) * 0.55}
              color={palette.text}
            />
          </Pressable>
        </View>

        {showField ? (
          <TextInput
            style={styles.transferInput}
            value={value}
            onChangeText={onChange}
            placeholder={placeholder}
            placeholderTextColor={palette.textSecondary}
            accessibilityLabel={placeholder}
            keyboardType="phone-pad"
            inputAccessoryViewID={keyboardId}
            autoCorrect={false}
            autoFocus
          />
        ) : (
          <DirectoryPickerView
            palette={palette}
            styles={styles}
            t={t}
            directory={directory}
            isSelected={(entry) => entry.id === picked?.id}
            onPick={onPick}
            keyboardId={keyboardId}
          />
        )}

        {hasDirectory && (
          <Pressable
            accessibilityRole="button"
            onPress={() => setDialing(!dialing)}
            style={styles.dialPanelMode}
          >
            <Text style={styles.dialPanelModeText}>
              {dialing ? t('chooseFromDirectory') : t('enterNumber')}
            </Text>
          </Pressable>
        )}
      </View>

      {/* The list doesn't show the destination the buttons will act on (a typed
          number, or a pick the search has hidden), so it is spelled out. */}
      {!showField && !!value.trim() && (
        <Text style={[styles.dialPanelTarget, styles.dialPanelActions]} numberOfLines={1}>
          {t('dialTarget')}: {picked ? `${picked.label} · ${value}` : value}
        </Text>
      )}

      <View
        style={[
          styles.transferActions,
          // The target line, when shown, already takes the free space above.
          !(!showField && !!value.trim()) && styles.dialPanelActions,
        ]}
      >
        {actions}
      </View>
    </View>
  );
}
