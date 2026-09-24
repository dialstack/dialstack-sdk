import { useEffect, useState } from 'react';
import { ActivityIndicator, FlatList, Pressable, StyleSheet, Text, View } from 'react-native';

import { listUsers, type RigUser } from '../rig';
import { colors } from '../theme';

/**
 * Stands in for your own sign-in: the demo lets you pick any user on the
 * account. A real app knows who is signed in and never sees this list.
 */
export function UserPicker({ onPick }: { onPick: (user: RigUser) => void }) {
  const [users, setUsers] = useState<RigUser[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    listUsers()
      .then(setUsers)
      .catch((err: Error) => setError(err.message));
  }, []);

  if (error) {
    return (
      <View style={styles.center}>
        <Text style={styles.error}>Could not reach the rig: {error}</Text>
      </View>
    );
  }
  if (!users) return <ActivityIndicator style={styles.center} />;

  return (
    <FlatList
      data={users}
      keyExtractor={(u) => u.id}
      contentContainerStyle={styles.list}
      ListHeaderComponent={<Text style={styles.title}>Sign in as</Text>}
      renderItem={({ item }) => (
        <Pressable style={styles.row} onPress={() => onPick(item)}>
          <Text style={styles.name}>{item.name ?? item.email ?? item.id}</Text>
          {item.email ? <Text style={styles.muted}>{item.email}</Text> : null}
        </Pressable>
      )}
    />
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, justifyContent: 'center', padding: 24 },
  list: { padding: 16, gap: 8 },
  title: { fontSize: 22, fontWeight: '600', color: colors.text, marginBottom: 8 },
  row: {
    backgroundColor: colors.card,
    borderColor: colors.border,
    borderWidth: 1,
    borderRadius: 10,
    padding: 14,
  },
  name: { fontSize: 16, color: colors.text },
  muted: { fontSize: 13, color: colors.muted, marginTop: 2 },
  error: { color: colors.danger, textAlign: 'center' },
});
