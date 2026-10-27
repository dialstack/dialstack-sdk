import React, { useMemo, useRef } from 'react';
import { Keyboard, Pressable, Text, TextInput, View } from 'react-native';
import {
  softphoneGlyphs,
  useDialBrowse,
  type DirectoryContact,
  type Locale,
  type SoftphonePalette,
} from '@dialstack/sdk-react/core';
import type { ConnectionState } from '../../SoftphoneProvider';
import { Chip, Glyph, KeyboardDoneBar, makeStyles } from '../primitives';
import { DialMatchesView } from './DialMatchesView';
import { DirectoryPickerView } from './DirectoryPickerView';
import { KeypadView } from './KeypadView';
import { useRoomyHost } from './useRoomyHost';

const KEYBOARD_ID = 'dialstack-softphone-dial-keyboard';

export interface DialPadViewProps {
  palette: SoftphonePalette;
  t: (key: keyof Locale['softphone']) => string;
  connection: ConnectionState;
  destination: string;
  onDestinationChange: (next: string) => void;
  canCall: boolean;
  onCall: () => void;
  autoFocusDestination?: boolean;
  errorChip?: React.ReactNode;
  compact?: boolean;
  /**
   * When not empty: entries matching the typed number are offered above it,
   * and a button beside Call swaps the keypad for the whole list.
   */
  directory?: readonly DirectoryContact[];
  /** The contact `destination` came from, or null when it was typed. */
  picked?: DirectoryContact | null;
  onPick?: (entry: DirectoryContact) => void;
}

const NO_DIRECTORY: readonly DirectoryContact[] = [];

export function DialPadView({
  palette,
  t,
  connection,
  destination,
  onDestinationChange,
  canCall,
  onCall,
  compact = false,
  autoFocusDestination = false,
  errorChip = null,
  directory = NO_DIRECTORY,
  picked = null,
  onPick = () => {},
}: DialPadViewProps): React.JSX.Element {
  const hasDirectory = directory.length > 0;
  const bodyHeight = useRef(0);
  const browse = useDialBrowse(hasDirectory, onPick);
  const { showList, pickAndClose, listMinHeight } = browse;
  const toggleList = () => browse.toggleList(bodyHeight.current);
  const { roomy, onLayout } = useRoomyHost();
  const styles = useMemo(() => makeStyles(palette, !roomy), [palette, roomy]);

  const chipKey: Partial<Record<ConnectionState, keyof Locale['softphone']>> = {
    connecting: 'connecting',
    reconnecting: 'reconnecting',
    disconnected: 'disconnected',
    error: 'connectionError',
  };
  const key = chipKey[connection];
  const label = key ? t(key) : undefined;

  return (
    // A tap outside the field closes the keyboard, as in other apps.
    <Pressable
      style={styles.dialScreen}
      onPress={Keyboard.dismiss}
      onLayout={onLayout}
      accessible={false}
    >
      {label ? (
        <Chip styles={styles} tone={connection === 'error' ? 'error' : 'info'} label={label} />
      ) : null}
      {errorChip}
      {showList ? (
        <View style={[styles.dialBody, { minHeight: listMinHeight }]}>
          <View style={styles.dialDirectory}>
            <DirectoryPickerView
              palette={palette}
              styles={styles}
              t={t}
              directory={directory}
              isSelected={(entry) => entry.id === picked?.id}
              onPick={pickAndClose}
              keyboardId={KEYBOARD_ID}
            />
          </View>
          {destination ? (
            <Text style={styles.dialPanelTarget} numberOfLines={1}>
              {t('dialTarget')}: {picked ? `${picked.label} · ${destination}` : destination}
            </Text>
          ) : null}
        </View>
      ) : (
        <View
          style={styles.dialBody}
          onLayout={(e) => {
            bodyHeight.current = e.nativeEvent.layout.height;
          }}
        >
          {hasDirectory && (
            <DialMatchesView
              palette={palette}
              styles={styles}
              t={t}
              directory={directory}
              value={destination}
              picked={picked}
              onPick={onPick}
            />
          )}
          <View style={styles.display}>
            {}
            {destination.length > 0 && <View style={styles.displaySpacer} />}
            <TextInput
              style={styles.destination}
              value={destination}
              onChangeText={onDestinationChange}
              placeholder={t('destinationPlaceholder')}
              placeholderTextColor={palette.textSecondary}
              keyboardType="phone-pad"
              inputAccessoryViewID={KEYBOARD_ID}
              autoCorrect={false}
              autoFocus={autoFocusDestination}
              textAlign="center"
              accessibilityLabel={t('destinationPlaceholder')}
            />
            {destination.length > 0 && (
              <Pressable
                onPress={() => onDestinationChange(destination.slice(0, -1))}
                hitSlop={8}
                accessibilityLabel={t('backspace')}
                style={styles.backspace}
              >
                <Text style={styles.backspaceText}>⌫</Text>
              </Pressable>
            )}
          </View>
          <KeypadView
            styles={styles}
            compact={compact}
            onKey={(digit) => onDestinationChange(destination + digit)}
          />
        </View>
      )}
      <View style={[styles.actions, hasDirectory && styles.actionsColumns]}>
        {hasDirectory && (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={showList ? t('enterNumber') : t('chooseFromDirectory')}
            onPress={toggleList}
            style={({ pressed }: { pressed: boolean }) => [
              styles.actionSide,
              pressed && styles.actionPressed,
            ]}
          >
            <Glyph
              glyph={showList ? softphoneGlyphs.keypad : softphoneGlyphs.contacts}
              size={(styles.actionSide.width as number) * 0.5}
              color={palette.text}
            />
          </Pressable>
        )}
        <Pressable
          onPress={onCall}
          disabled={!canCall}
          accessibilityLabel={t('call')}
          style={({ pressed }: { pressed: boolean }) => [
            styles.action,
            styles.actionSuccess,
            !canCall && styles.actionDisabled,
            pressed && styles.actionPressed,
          ]}
        >
          <Glyph
            glyph={softphoneGlyphs.phone}
            size={(styles.action.width as number) * 0.46}
            color={palette.onAccent}
          />
        </Pressable>
        {/* Balances the side button so Call stays centred. */}
        {hasDirectory && <View style={[styles.actionSide, styles.actionSideSpacer]} />}
      </View>
      <KeyboardDoneBar id={KEYBOARD_ID} label={t('done')} styles={styles} />
    </Pressable>
  );
}
