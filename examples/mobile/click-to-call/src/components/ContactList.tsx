import { Pressable, StyleSheet, Text, View } from 'react-native';

import type { Contact } from '../contacts';
import { formatForDisplay } from '../phone';
import { card, colors } from '../theme';

interface Props {
  contacts: Contact[];
  onCall: (contact: Contact) => void;
}

export function ContactList({ contacts, onCall }: Props) {
  return (
    <View style={styles.card}>
      <Text style={styles.label}>Patients</Text>
      {contacts.map((c) => (
        <View key={c.id} style={styles.row}>
          <View style={styles.who}>
            <Text style={styles.name}>{c.name}</Text>
            <Text style={styles.detail}>{c.detail}</Text>
          </View>
          <Pressable onPress={() => onCall(c)} hitSlop={8}>
            <Text style={styles.phone}>{formatForDisplay(c.phone)}</Text>
          </Pressable>
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  card: { ...card },
  label: {
    fontSize: 13,
    fontWeight: '600',
    color: colors.muted,
    textTransform: 'uppercase',
    marginBottom: 4,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    borderTopColor: colors.border,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  who: { flex: 1 },
  name: { fontSize: 16, color: colors.text },
  detail: { fontSize: 13, color: colors.muted, marginTop: 2 },
  phone: { fontSize: 15, color: colors.primary, fontWeight: '600' },
});
