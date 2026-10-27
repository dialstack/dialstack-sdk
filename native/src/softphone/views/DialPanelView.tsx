import React from 'react';
import { Pressable, Text, TextInput, View } from 'react-native';
import {
  softphoneGlyphs,
  useDialPanel,
  type DirectoryContact,
  type Locale,
  type SoftphonePalette,
} from '@dialstack/sdk-react/core';
import { Glyph, type makeStyles } from '../primitives';
import { DialMatchesView } from './DialMatchesView';
import { DirectoryPickerView } from './DirectoryPickerView';
import { PickedTargetView } from './PickedTargetView';

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
  /** Drops `picked`, and the value it set. */
  onClearPick?: () => void;
  value: string;
  /** Says what the field or the picked contact is for ("Transfer to"). */
  targetLabel: string;
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
  onClearPick = () => {},
  value,
  targetLabel,
  placeholder,
  onChange,
  actions,
  onClose,
  keyboardId,
}: DialPanelViewProps): React.JSX.Element {
  const { hasDirectory, pickedNow, showField, showList, showTarget, toggleDialing } = useDialPanel(
    directory,
    picked,
    value
  );

  return (
    <View style={styles.dialPanel}>
      {/* Only the list expands to the top; the field and a pick sit lower. */}
      <View style={[styles.dialPanelMain, showList && styles.dialPanelMainList]}>
        <View style={styles.dialPanelHeader}>
          <View style={styles.dialPanelHeading}>
            <Text style={styles.dialPanelTitle}>{title}</Text>
            <Text style={styles.dialPanelPeer} numberOfLines={1}>
              {peerName}
            </Text>
          </View>
          {hasDirectory && !picked && (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={showField ? t('chooseFromDirectory') : t('enterNumber')}
              onPress={toggleDialing}
              style={({ pressed }: { pressed: boolean }) => [
                styles.dialPanelClose,
                pressed && styles.directoryOptionPressed,
              ]}
            >
              <Glyph
                glyph={showField ? softphoneGlyphs.contacts : softphoneGlyphs.keypad}
                size={(styles.dialPanelClose.width as number) * 0.55}
                color={palette.text}
              />
            </Pressable>
          )}
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

        {!showList && <Text style={styles.dialPanelLabel}>{targetLabel}</Text>}
        {pickedNow ? (
          <PickedTargetView
            palette={palette}
            styles={styles}
            t={t}
            entry={pickedNow}
            onClear={onClearPick}
          />
        ) : (
          <>
            {showField && hasDirectory && (
              <DialMatchesView
                palette={palette}
                styles={styles}
                t={t}
                directory={directory}
                value={value}
                picked={null}
                onPick={onPick}
              />
            )}
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
                isSelected={() => false}
                onPick={onPick}
                keyboardId={keyboardId}
              />
            )}
          </>
        )}
      </View>

      {/* A number typed before switching to the list is still what the buttons
          act on, and the list doesn't show it, so it is spelled out. */}
      {showTarget && (
        <Text style={[styles.dialPanelTarget, styles.dialPanelActions]} numberOfLines={1}>
          {t('dialTarget')}: {value}
        </Text>
      )}

      <View
        style={[
          styles.transferActions,
          // The target line, when shown, already takes the free space above.
          !showTarget && styles.dialPanelActions,
        ]}
      >
        {actions}
      </View>
    </View>
  );
}
