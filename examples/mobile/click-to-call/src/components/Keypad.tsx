import { AsYouType } from 'libphonenumber-js';
import { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { toE164 } from '../phone';
import { card, colors } from '../theme';

const KEYS = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '*', '0', '#'];

interface Props {
  /** False until the user has a mobile profile: there is no phone to ring yet. */
  enabled: boolean;
  /** An E.164 number, or the digits as typed (an extension, say). */
  onCall: (destination: string) => void;
}

// A stand-in: the SDK's dial pad is tied to a softphone session today. Swap
// this for the SDK component once it ships one that can be used without one.
export function Keypad({ enabled, onCall }: Props) {
  const [digits, setDigits] = useState('');
  // No validation beyond "something was typed": DialStack decides whether it is
  // an extension or an outside number. A full phone number goes out as E.164;
  // anything else — an extension like 1001 — goes out as typed.
  const destination = toE164(digits) ?? digits;
  const canCall = enabled && digits.length > 0;

  return (
    <View style={styles.card}>
      <Text style={styles.number} numberOfLines={1}>
        {digits ? new AsYouType('US').input(digits) : ' '}
      </Text>
      <View style={styles.grid}>
        {KEYS.map((k) => (
          <Pressable
            key={k}
            style={({ pressed }) => [styles.key, pressed && styles.pressed]}
            onPress={() => setDigits((d) => d + k)}
          >
            <Text style={styles.keyText}>{k}</Text>
          </Pressable>
        ))}
      </View>
      <View style={styles.row}>
        <View style={styles.side} />
        <Pressable
          style={[styles.key, styles.call, !canCall && styles.callDisabled]}
          disabled={!canCall}
          onPress={() => onCall(destination)}
        >
          <Text style={styles.callText}>Call</Text>
        </Pressable>
        <Pressable
          style={styles.side}
          onPress={() => setDigits((d) => d.slice(0, -1))}
          onLongPress={() => setDigits('')}
          hitSlop={8}
        >
          <Text style={styles.back}>⌫</Text>
        </Pressable>
      </View>
      {!enabled ? (
        <Text style={styles.hint}>Add your mobile number above to place calls.</Text>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  card: { ...card, gap: 12, alignItems: 'center' },
  number: { fontSize: 28, color: colors.text, minHeight: 36 },
  grid: { flexDirection: 'row', flexWrap: 'wrap', width: 252, gap: 12 },
  key: {
    width: 76,
    height: 60,
    borderRadius: 30,
    backgroundColor: colors.bg,
    alignItems: 'center',
    justifyContent: 'center',
  },
  pressed: { backgroundColor: colors.border },
  keyText: { fontSize: 26, color: colors.text },
  row: { flexDirection: 'row', alignItems: 'center', width: 252, justifyContent: 'space-between' },
  side: { width: 76, alignItems: 'center' },
  call: { backgroundColor: colors.primary },
  callDisabled: { opacity: 0.4 },
  callText: { color: colors.primaryText, fontWeight: '600', fontSize: 16 },
  back: { fontSize: 24, color: colors.muted },
  hint: { fontSize: 14, color: colors.muted },
});
