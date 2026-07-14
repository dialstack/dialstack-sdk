/**
 * DialStack mobile Softphone example (Expo + react-native-webrtc).
 *
 * Foreground calling end to end: request the mic, then render the Softphone,
 * which owns a DialStackPhone and reuses the SDK's headless calling core.
 *
 * For a real product you would fetch the WebRTC token from your backend (as the
 * web example does via /api/session). To keep this example self-contained, the
 * setup screen lets you paste a token + API base URL.
 *
 * TODO: Backgrounded / locked-screen incoming calls are out of scope here. They
 * require native call UI + push wake-up — iOS PushKit + CallKit, Android FCM
 * high-priority data messages + ConnectionService — which is a separate, larger
 * integration. This example handles foreground calling only.
 */

import React, { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  PermissionsAndroid,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import { mediaDevices } from 'react-native-webrtc';
import { Softphone, SoftphoneProvider } from '../softphone/src';

const DEFAULT_API_BASE_URL = 'https://api.dialstack.ai';
const THEME_BG = '#1a1a1a';

// Optional gitignored local prefill so you can skip the setup screen during
// development (see README). Absent in normal use.
let devSession: { token?: string; apiBaseUrl?: string; autoConnect?: boolean } = {};
try {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  devSession = require('./dev-session.local.json');
} catch {
  // No local dev session — use the setup screen.
}

async function ensureMicPermission(): Promise<boolean> {
  if (Platform.OS === 'android') {
    const result = await PermissionsAndroid.request(PermissionsAndroid.PERMISSIONS.RECORD_AUDIO, {
      title: 'Microphone permission',
      message: 'DialStack needs the microphone to place and receive calls.',
      buttonPositive: 'OK',
    });
    if (result !== PermissionsAndroid.RESULTS.GRANTED) return false;
  }
  // On iOS the system prompt is raised by the first getUserMedia; trigger it now
  // (and immediately release) so the prompt appears before the first call.
  try {
    const stream = await mediaDevices.getUserMedia({ audio: true });
    stream.getTracks().forEach((t) => t.stop());
    return true;
  } catch {
    return false;
  }
}

export default function App(): React.JSX.Element {
  const [micReady, setMicReady] = useState<boolean | null>(null);
  const [token, setToken] = useState(devSession.token ?? '');
  const [apiBaseUrl, setApiBaseUrl] = useState(devSession.apiBaseUrl ?? DEFAULT_API_BASE_URL);
  const [connected, setConnected] = useState(!!devSession.autoConnect && !!devSession.token);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    ensureMicPermission().then(setMicReady);
  }, []);

  return (
    <SafeAreaProvider>
      <StatusBar style="light" />
      <SafeAreaView style={styles.safe}>
        <KeyboardAvoidingView
          style={styles.flex}
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        >
          {micReady === null ? (
            <View style={styles.center}>
              <ActivityIndicator color="#fff" />
            </View>
          ) : micReady === false ? (
            <View style={styles.center}>
              <Text style={styles.title}>Microphone access is required</Text>
              <Text style={styles.hint}>
                Enable microphone access for this app in Settings, then reopen.
              </Text>
            </View>
          ) : connected ? (
            <SoftphoneProvider
              token={token}
              apiBaseUrl={apiBaseUrl}
              appearance={{ theme: 'dark' }}
              onError={(e: { code: string; message: string }) =>
                setError(`${e.code} — ${e.message}`)
              }
            >
              <Softphone />
            </SoftphoneProvider>
          ) : (
            <View style={styles.setup}>
              <Text style={styles.title}>DialStack Softphone</Text>
              <Text style={styles.hint}>Paste a WebRTC user token to connect.</Text>
              <TextInput
                style={styles.input}
                value={token}
                onChangeText={setToken}
                placeholder="WebRTC token"
                placeholderTextColor="#888"
                autoCapitalize="none"
                autoCorrect={false}
                multiline
              />
              <TextInput
                style={styles.input}
                value={apiBaseUrl}
                onChangeText={setApiBaseUrl}
                placeholder="API base URL"
                placeholderTextColor="#888"
                autoCapitalize="none"
                autoCorrect={false}
              />
              <Pressable
                style={[styles.connect, !token && styles.connectDisabled]}
                disabled={!token}
                onPress={() => setConnected(true)}
              >
                <Text style={styles.connectText}>Connect</Text>
              </Pressable>
              {!!error && <Text style={styles.error}>{error}</Text>}
            </View>
          )}
        </KeyboardAvoidingView>
      </SafeAreaView>
    </SafeAreaProvider>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: THEME_BG },
  flex: { flex: 1 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 8, padding: 24 },
  setup: { flex: 1, justifyContent: 'center', padding: 24, gap: 12 },
  title: { color: '#fff', fontSize: 22, fontWeight: '600', textAlign: 'center' },
  hint: { color: 'rgba(255,255,255,0.6)', fontSize: 14, textAlign: 'center' },
  input: {
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.15)',
    borderRadius: 12,
    padding: 14,
    color: '#fff',
    fontSize: 15,
  },
  connect: {
    backgroundColor: '#6772e5',
    borderRadius: 12,
    padding: 16,
    alignItems: 'center',
    marginTop: 4,
  },
  connectDisabled: { opacity: 0.4 },
  connectText: { color: '#fff', fontWeight: '600', fontSize: 16 },
  error: { color: '#ff6369', textAlign: 'center', fontSize: 13 },
});
