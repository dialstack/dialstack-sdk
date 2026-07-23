/**
 * DialPad (RN) — the idle/outbound screen: connection status chip, a destination
 * field, the keypad, and the call button. Reads connection + placeCall from the
 * softphone context; owns its own destination.
 *
 * The E911 prompt is NOT rendered here — <EmergencyBanner> is a separate
 * component so a modular consumer can place it anywhere (or omit it when the host
 * manages E911). The batteries-included <Softphone> renders the banner above this
 * pad itself, so its look is unchanged.
 *
 * Must be rendered inside a <SoftphoneProvider>.
 */

import React, { useMemo, useState } from 'react';
import { Pressable, Text, TextInput, View } from 'react-native';
import { dialPadKeys, softphoneDimensions as D, softphoneGlyphs } from '@dialstack/sdk/react/core';
import { useDialInput, canPlaceCall, type Locale } from '@dialstack/sdk/react/core';
import { useSoftphone, type ConnectionState } from '../SoftphoneProvider';
import { CallErrorChip } from './CallErrorChip';
import { Glyph, chunk, makeStyles } from './primitives';

export interface DialPadProps {
  /** Autofocus the destination field on mount. */
  autoFocusDestination?: boolean;
}

export function DialPad({ autoFocusDestination = false }: DialPadProps): React.JSX.Element {
  const { connection, placeCall, emergency, t, palette } = useSoftphone();
  const styles = useMemo(() => makeStyles(palette), [palette]);
  const [destination, setDestination] = useState('');
  const { onType } = useDialInput(setDestination);

  const canCall = canPlaceCall(connection, destination, emergency.submitting);
  const rows = chunk(dialPadKeys, 3);

  // Connection-state chip label, via the shared locale table (same keys the web
  // StatusChip uses; `error` maps to the connectionError string).
  const chipKey: Partial<Record<ConnectionState, keyof Locale['softphone']>> = {
    connecting: 'connecting',
    reconnecting: 'reconnecting',
    disconnected: 'disconnected',
    error: 'connectionError',
  };
  const key = chipKey[connection];
  const label = key ? t(key) : undefined;

  return (
    <>
      {label ? (
        <View style={[styles.chip, connection === 'error' && styles.chipError]}>
          <Text style={[styles.chipText, connection === 'error' && styles.chipErrorText]}>
            {label}
          </Text>
        </View>
      ) : (
        <View style={styles.chipSpacer} />
      )}
      <CallErrorChip />
      <View style={styles.display}>
        <TextInput
          style={styles.destination}
          value={destination}
          onChangeText={onType}
          placeholder={t('destinationPlaceholder')}
          placeholderTextColor={palette.textSecondary}
          keyboardType="phone-pad"
          autoCorrect={false}
          autoFocus={autoFocusDestination}
          textAlign="center"
          accessibilityLabel={t('destinationPlaceholder')}
        />
        {destination.length > 0 && (
          <Pressable
            onPress={() => setDestination((p) => p.slice(0, -1))}
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
    </>
  );
}
