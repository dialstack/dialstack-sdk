import { isAvailableAsync, showPhoneNumberHintAsync } from 'expo-phone-number-hint';
import { useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';

import { formatForDisplay, toE164 } from '../phone';
import { card, colors } from '../theme';

interface Props {
  /** undefined while loading, null when the user has no mobile profile yet. */
  number: string | null | undefined;
  onSave: (e164: string) => Promise<void>;
  onRemove: () => Promise<void>;
}

/**
 * The one-time setup: the user gives their own cell number. No app can read
 * it silently on either platform, but each can offer it: iOS AutoFill suggests
 * it from the user's contact card (autoComplete="tel"), and on Android the
 * system picker lists the SIM's numbers for the user to choose from. Either
 * way it is the user's pick, not proof they own it.
 */
export function MobileProfileCard({ number, onSave, onRemove }: Props) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Android with Google Play services only; false on iOS.
  const [canPickFromSim, setCanPickFromSim] = useState(false);

  useEffect(() => {
    void isAvailableAsync().then(setCanPickFromSim);
  }, []);

  const pickFromSim = async () => {
    setError(null);
    try {
      const result = await showPhoneNumberHintAsync();
      if (!result.canceled) setDraft(result.hint.e164 ?? result.hint.number);
    } catch {
      // Most often the SIM doesn't carry its own number.
      setError('This phone didn’t offer a number. Type it instead.');
    }
  };

  const run = async (action: () => Promise<void>) => {
    setBusy(true);
    setError(null);
    try {
      await action();
      setEditing(false);
      setDraft('');
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  };

  // Drop the abandoned draft and any error with it, so Change starts clean.
  const cancel = () => {
    setEditing(false);
    setDraft('');
    setError(null);
  };

  const save = () => {
    const e164 = toE164(draft);
    if (!e164) {
      setError('Enter a valid phone number');
      return;
    }
    void run(() => onSave(e164));
  };

  if (number === undefined) {
    return (
      <View style={styles.card}>
        <ActivityIndicator />
      </View>
    );
  }

  const showForm = number === null || editing;

  return (
    <View style={styles.card}>
      <Text style={styles.label}>Mobile profile</Text>
      {showForm ? (
        <>
          <Text style={styles.help}>
            Calls you place from this app ring this phone first, then connect when you answer.
          </Text>
          <TextInput
            style={styles.input}
            placeholder="Your cell number"
            keyboardType="phone-pad"
            autoComplete="tel"
            value={draft}
            onChangeText={setDraft}
            editable={!busy}
          />
          {canPickFromSim ? (
            <Pressable onPress={() => void pickFromSim()} disabled={busy} hitSlop={8}>
              <Text style={styles.secondaryText}>Use this phone’s number</Text>
            </Pressable>
          ) : null}
          <View style={styles.actions}>
            {number !== null ? (
              <Pressable style={styles.secondary} onPress={cancel}>
                <Text style={styles.secondaryText}>Cancel</Text>
              </Pressable>
            ) : null}
            <Pressable style={styles.primary} onPress={save} disabled={busy}>
              <Text style={styles.primaryText}>{busy ? 'Saving…' : 'Save'}</Text>
            </Pressable>
          </View>
        </>
      ) : (
        <>
          <Text style={styles.number}>{formatForDisplay(number)}</Text>
          <Text style={styles.help}>Calls ring this phone first.</Text>
          <View style={styles.actions}>
            <Pressable style={styles.secondary} onPress={() => void run(onRemove)} disabled={busy}>
              <Text style={[styles.secondaryText, { color: colors.danger }]}>Remove</Text>
            </Pressable>
            <Pressable style={styles.secondary} onPress={() => setEditing(true)} disabled={busy}>
              <Text style={styles.secondaryText}>Change</Text>
            </Pressable>
          </View>
        </>
      )}
      {error ? <Text style={styles.error}>{error}</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  card: { ...card, gap: 8 },
  label: { fontSize: 13, fontWeight: '600', color: colors.muted, textTransform: 'uppercase' },
  number: { fontSize: 22, fontWeight: '600', color: colors.text },
  help: { fontSize: 14, color: colors.muted },
  input: {
    borderColor: colors.border,
    borderWidth: 1,
    borderRadius: 8,
    padding: 12,
    fontSize: 16,
    color: colors.text,
  },
  actions: { flexDirection: 'row', justifyContent: 'flex-end', gap: 8 },
  primary: {
    backgroundColor: colors.primary,
    borderRadius: 8,
    paddingVertical: 10,
    paddingHorizontal: 16,
  },
  primaryText: { color: colors.primaryText, fontWeight: '600' },
  secondary: { paddingVertical: 10, paddingHorizontal: 12 },
  secondaryText: { color: colors.primary, fontWeight: '600' },
  error: { color: colors.danger },
});
