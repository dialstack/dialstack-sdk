import { StatusBar } from 'expo-status-bar';
import { useCallback, useEffect, useState } from 'react';
import { Alert, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context';

import { ContactList } from './src/components/ContactList';
import { Dialer } from './src/components/Dialer';
import { MobileProfileCard } from './src/components/MobileProfileCard';
import { UserPicker } from './src/components/UserPicker';
import { CONTACTS, type Contact } from './src/contacts';
import { useShownCall } from './src/hooks/useShownCall';
import { formatForDisplay } from './src/phone';
import {
  clickToCall,
  controlCall,
  getMobileProfile,
  removeMobileNumber,
  setInboundToCell,
  setMobileNumber,
  type CallVerb,
  type MobileProfile,
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
  const [profile, setProfile] = useState<MobileProfile | undefined>(undefined);
  const mobile = profile?.number;
  const [tab, setTab] = useState<Tab>('keypad');
  const [editing, setEditing] = useState(false);
  const { call, dismiss } = useShownCall(user.id);

  useEffect(() => {
    getMobileProfile(user.id)
      .then(setProfile)
      .catch((err: Error) => {
        setProfile({ number: null, inbound: false });
        Alert.alert('Could not load your mobile profile', err.message);
      });
  }, [user.id]);

  const place = useCallback(
    (to: string) => {
      setTab('keypad'); // the dialer shows the call
      clickToCall(user.id, to).catch((err: Error) => Alert.alert('Call failed', err.message));
    },
    [user.id]
  );

  const control = useCallback(
    (verb: CallVerb) => {
      controlCall(user.id, verb).catch((err: Error) =>
        Alert.alert('Couldn’t do that', err.message)
      );
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

  const profileCard = (
    <MobileProfileCard
      number={mobile}
      inbound={profile?.inbound ?? false}
      onSave={async (e164) => {
        setProfile(await setMobileNumber(user.id, e164));
        setEditing(false);
      }}
      onRemove={async () => setProfile(await removeMobileNumber(user.id))}
      onInboundChange={async (on) => setProfile(await setInboundToCell(user.id, on))}
    />
  );

  const header = (
    <View style={styles.header}>
      <Text style={styles.title}>{user.name ?? user.email ?? user.id}</Text>
      <Pressable onPress={onSignOut} hitSlop={8}>
        <Text style={styles.link}>Switch user</Text>
      </Pressable>
    </View>
  );

  // Setup: until the user has given their cell there is nothing to call from.
  if (!mobile) {
    return (
      <ScrollView contentContainerStyle={styles.content}>
        {header}
        {profileCard}
      </ScrollView>
    );
  }

  return (
    <View style={styles.home}>
      <View style={styles.top}>
        {header}
        {editing ? (
          <>
            {profileCard}
            <Pressable onPress={() => setEditing(false)} hitSlop={8}>
              <Text style={styles.link}>Done</Text>
            </Pressable>
          </>
        ) : (
          <View style={styles.cell}>
            <Text style={styles.cellText}>Your cell {formatForDisplay(mobile)}</Text>
            <Pressable onPress={() => setEditing(true)} hitSlop={8}>
              <Text style={styles.link}>Edit</Text>
            </Pressable>
          </View>
        )}
        <View style={styles.tabs}>
          {(['keypad', 'patients'] as const).map((t) => (
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
      </View>
      {tab === 'patients' ? (
        <ScrollView contentContainerStyle={styles.content}>
          <ContactList contacts={CONTACTS} onCall={callContact} />
        </ScrollView>
      ) : (
        // The dialer takes the rest of the screen, like a phone's, and shows the call too.
        <View style={styles.dialer}>
          <Dialer
            mobile={mobile}
            call={call}
            onCall={place}
            onControl={control}
            onClose={dismiss}
          />
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  home: { flex: 1 },
  top: { padding: 16, paddingBottom: 0, gap: 16 },
  content: { padding: 16, gap: 16 },
  dialer: { flex: 1, padding: 16, gap: 16 },
  cell: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  cellText: { color: colors.muted, fontSize: 15 },
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
