import React, { useMemo } from 'react';
import { Keyboard, Pressable, Text, TextInput, View } from 'react-native';
import {
  dialPadKeys,
  softphoneDimensions as D,
  softphoneGlyphs,
  type Locale,
  type SoftphonePalette,
} from '@dialstack/sdk-react/core';
import type { ConnectionState } from '../../SoftphoneProvider';
import { Chip, Glyph, KeyboardDoneBar, chunk, makeStyles } from '../primitives';

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
}

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
}: DialPadViewProps): React.JSX.Element {
  const styles = useMemo(() => makeStyles(palette), [palette]);
  const rows = chunk(dialPadKeys, 3);

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
    <Pressable style={styles.dialScreen} onPress={Keyboard.dismiss} accessible={false}>
      {label ? (
        <Chip styles={styles} tone={connection === 'error' ? 'error' : 'info'} label={label} />
      ) : null}
      {errorChip}
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
      <View style={styles.keypad}>
        {rows.map((row, i) => (
          <View key={i} style={styles.keyRow}>
            {row.map(({ digit, letters }) => (
              <Pressable
                key={digit}
                onPress={() => onDestinationChange(destination + digit)}
                accessibilityLabel={`${digit}${letters ? ' ' + letters : ''}`}
                style={({ pressed }: { pressed: boolean }) => [
                  styles.key,
                  compact && styles.keyCompact,
                  pressed && styles.keyPressed,
                ]}
              >
                <Text style={styles.keyDigit}>{digit}</Text>
                <Text style={styles.keyLetters}>{letters || ' '}</Text>
              </Pressable>
            ))}
          </View>
        ))}
      </View>
      <View style={styles.actions}>
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
            size={D.actionButtonSize * 0.46}
            color={palette.onAccent}
          />
        </Pressable>
      </View>
      <KeyboardDoneBar id={KEYBOARD_ID} label={t('done')} styles={styles} />
    </Pressable>
  );
}
