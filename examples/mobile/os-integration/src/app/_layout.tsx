import { useEffect } from 'react';
import { StyleSheet } from 'react-native';
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { SoftphoneProvider } from '@dialstack/sdk-native';

import { bridge, phone } from '../callBridge';
import { API_BASE_URL, sessionToken } from '../config';
import { requestMicrophonePermission } from '../permissions';
import { registerForWakePush } from '../pushRegistration';
import { storage } from '../storage';

// Matches the SDK's dark palette (theme.ts) so the safe-area frame behind the
// notch/home-indicator is the same colour as the softphone card.
const THEME_BG = '#1a1a1a';

export default function RootLayout() {
  useEffect(() => {
    // Request permissions SERIALLY, not concurrently: Android's PermissionsAndroid
    // serves one request at a time, so firing the mic and the notification prompts
    // together drops the second (it returns without a dialog). Mic first so a woken
    // call can take audio without a mid-answer prompt (the SDK leaves the mic
    // request to the host), then the notification permission the wake path needs.
    void (async () => {
      // Skip the mic probe when a call is already live: the common way to reach
      // this mount is answering a push-woken call from the notification, and
      // probing then opens a second capture over the live one (iOS re-negotiates
      // the AVAudioSession CallKit owns; Android shifts audio focus) — a dropout
      // or muted mic mid-conversation. The call already has the mic.
      if (phone.activeCalls.length === 0) {
        const mic = await requestMicrophonePermission();
        console.log(`[perm] microphone ${mic ? 'granted' : 'not granted'}`);
      } else {
        console.log('[perm] call already live — skipping the microphone prompt');
      }
      await registerForWakePush((m) => console.log(`[push] ${m}`));
    })();
  }, []);

  // The UI adopts the process's phone; it never creates one.
  return (
    <SafeAreaProvider>
      <StatusBar style="light" />
      <SafeAreaView style={styles.safe}>
        <SoftphoneProvider
          existingPhone={phone}
          token={sessionToken()}
          storage={storage}
          apiBaseUrl={API_BASE_URL}
          appearance={{ theme: 'dark' }}
          // Route the softphone's dial through the bridge so an outbound call is
          // reported to the OS and survives backgrounding, like an incoming one.
          bridge={bridge}
          onError={(e) => console.log(`[sdk] error ${e.code ?? '?'}: ${e.message ?? ''}`)}
        >
          <Stack screenOptions={{ headerShown: false, contentStyle: styles.safe }} />
        </SoftphoneProvider>
      </SafeAreaView>
    </SafeAreaProvider>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: THEME_BG },
});
