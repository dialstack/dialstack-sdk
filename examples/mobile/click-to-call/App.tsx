import { StatusBar } from 'expo-status-bar';
import { useCallback, useEffect, useState } from 'react';
import { Alert, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context';

import { CallStatusCard } from './src/components/CallStatusCard';
import { ContactList } from './src/components/ContactList';
import { Keypad } from './src/components/Keypad';
import { MobileProfileCard } from './src/components/MobileProfileCard';
import { UserPicker } from './src/components/UserPicker';
import { CONTACTS, type Contact } from './src/contacts';
import { useActiveCall } from './src/hooks/useActiveCall';
import { formatForDisplay } from './src/phone';
import {
  clickToCall,
  getMobileNumber,
  removeMobileNumber,
  setMobileNumber,
  type RigUser,
} from './src/rig';
import { colors } from './src/theme';

export default function App() {
  const [user, setUser] = useState<RigUser | null>(null);

  return (
    <SafeAreaProvider>
      <SafeAreaView style={styles.screen}>
        <StatusBar style="dark" />
        {user ? (
          <Home user={user} onSignOut={() => setUser(null)} />
        ) : (
          <UserPicker onPick={setUser} />
        )}
      </SafeAreaView>
    </SafeAreaProvider>
  );
}

type Tab = 'patients' | 'keypad';

function Home({ user, onSignOut }: { user: RigUser; onSignOut: () => void }) {
  const [mobile, setMobile] = useState<string | null | undefined>(undefined);
  const [tab, setTab] = useState<Tab>('patients');
  const call = useActiveCall(user.id);
  // A finished call stays on screen until dismissed; keyed by when it was placed.
  const [dismissed, setDismissed] = useState<string | null>(null);

  useEffect(() => {
    getMobileNumber(user.id)
      .then(setMobile)
      .catch((err: Error) => {
        setMobile(null);
        Alert.alert('Could not load your mobile profile', err.message);
      });
  }, [user.id]);

  const place = useCallback(
    (to: string) => {
      clickToCall(user.id, to).catch((err: Error) => Alert.alert('Call failed', err.message));
    },
    [user.id]
  );

  const callContact = useCallback(
    (contact: Contact) => {
      if (!mobile) return;
      Alert.alert(
        `Call ${contact.name}?`,
        `We'll ring your phone at ${formatForDisplay(mobile)}. Answer to be connected.`,
        [
          { text: 'Cancel', style: 'cancel' },
          { text: 'Call', onPress: () => place(contact.phone) },
        ]
      );
    },
    [mobile, place]
  );

  return (
    <ScrollView contentContainerStyle={styles.content}>
      <View style={styles.header}>
        <Text style={styles.title}>{user.name ?? user.email ?? user.id}</Text>
        <Pressable onPress={onSignOut} hitSlop={8}>
          <Text style={styles.link}>Switch user</Text>
        </Pressable>
      </View>
      <MobileProfileCard
        number={mobile}
        onSave={async (e164) => setMobile(await setMobileNumber(user.id, e164))}
        onRemove={async () => {
          await removeMobileNumber(user.id);
          setMobile(null);
        }}
      />
      {call && call.requestedAt !== dismissed ? (
        <CallStatusCard
          call={call}
          mobile={mobile ?? null}
          onDismiss={() => setDismissed(call.requestedAt)}
        />
      ) : null}
      <View style={styles.tabs}>
        {(['patients', 'keypad'] as const).map((t) => (
          <Pressable
            key={t}
            style={[styles.tab, tab === t && styles.tabActive]}
            onPress={() => setTab(t)}
          >
            <Text style={[styles.tabText, tab === t && styles.tabTextActive]}>
              {t === 'patients' ? 'Patients' : 'Keypad'}
            </Text>
          </Pressable>
        ))}
      </View>
      {tab === 'patients' ? (
        <ContactList contacts={CONTACTS} enabled={!!mobile} onCall={callContact} />
      ) : (
        <Keypad enabled={!!mobile} onCall={place} />
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  content: { padding: 16, gap: 16 },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  title: { fontSize: 22, fontWeight: '600', color: colors.text, flexShrink: 1 },
  link: { color: colors.primary, fontWeight: '600' },
  tabs: {
    flexDirection: 'row',
    backgroundColor: colors.border,
    borderRadius: 10,
    padding: 3,
  },
  tab: { flex: 1, paddingVertical: 8, borderRadius: 8, alignItems: 'center' },
  tabActive: { backgroundColor: colors.card },
  tabText: { color: colors.muted, fontWeight: '600' },
  tabTextActive: { color: colors.text },
});
