/**
 * DialPad (RN) — the idle/outbound screen: connection status chip, the built-in
 * E911 banner, a destination field, the keypad, and the call button. Reads
 * connection + placeCall from the softphone context; owns its own destination.
 *
 * Must be rendered inside a <SoftphoneProvider>.
 */

import React, { useMemo, useState } from 'react';
import { Pressable, Text, TextInput, View } from 'react-native';
import { dialPadKeys, softphoneDimensions as D } from '@dialstack/sdk/components/softphone-theme';
import { softphoneGlyphs } from '@dialstack/sdk/components/softphone-icons';
import { useSoftphone } from '../SoftphoneProvider';
import { EmergencyBanner } from './EmergencyBanner';
import { Glyph, chunk, makeStyles } from './primitives';

export interface DialPadProps {
  /** Autofocus the destination field on mount. */
  autoFocusDestination?: boolean;
}

export function DialPad({ autoFocusDestination = false }: DialPadProps): React.JSX.Element {
  const { connection, placeCall, palette } = useSoftphone();
  const styles = useMemo(() => makeStyles(palette), [palette]);
  const [destination, setDestination] = useState('');

  const canCall = connection === 'connected' && destination.length > 0;
  const rows = chunk(dialPadKeys, 3);

  const chipLabel: Partial<Record<string, string>> = {
    connecting: 'Connecting…',
    reconnecting: 'Reconnecting…',
    disconnected: 'Disconnected',
    error: 'Connection error',
  };
  const label = chipLabel[connection];

  return (
    <>
      <EmergencyBanner />
      {label ? (
        <View style={[styles.chip, connection === 'error' && styles.chipError]}>
          <Text style={[styles.chipText, connection === 'error' && styles.chipErrorText]}>
            {label}
          </Text>
        </View>
      ) : (
        <View style={styles.chipSpacer} />
      )}
      <View style={styles.display}>
        <TextInput
          style={styles.destination}
          value={destination}
          onChangeText={setDestination}
          placeholder="Enter a number"
          placeholderTextColor={palette.textSecondary}
          keyboardType="phone-pad"
          autoCorrect={false}
          autoFocus={autoFocusDestination}
          textAlign="center"
          accessibilityLabel="Destination"
        />
        {destination.length > 0 && (
          <Pressable
            onPress={() => setDestination((p) => p.slice(0, -1))}
            hitSlop={8}
            accessibilityLabel="Delete"
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
                onPress={() => setDestination((p) => p + digit)}
                accessibilityLabel={`${digit}${letters ? ' ' + letters : ''}`}
                style={({ pressed }: { pressed: boolean }) => [
                  styles.key,
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
          onPress={() => void placeCall(destination)}
          disabled={!canCall}
          accessibilityLabel="Call"
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
    </>
  );
}
