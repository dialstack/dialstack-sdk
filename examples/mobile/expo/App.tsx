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

import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Modal,
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
import { Softphone, SoftphoneProvider } from '@dialstack/sdk-native';
import { mmkvStorage } from './mmkvStorage';
import { getCurrentEmergencyAddress } from './locationProvider';

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
  try {
    if (Platform.OS === 'android') {
      // PermissionsAndroid needs the Activity attached; on a cold start the
      // request can fire a tick too early ("not attached to an Activity"). Wait
      // a frame so the Activity is ready before requesting.
      await new Promise<void>((r) => setTimeout(() => r(), 0));
      const result = await PermissionsAndroid.request(
        PermissionsAndroid.PERMISSIONS.RECORD_AUDIO,
        {
          title: 'Microphone permission',
          message: 'DialStack needs the microphone to place and receive calls.',
          buttonPositive: 'OK',
        }
      );
      if (result !== PermissionsAndroid.RESULTS.GRANTED) return false;
    }
    // On iOS the system prompt is raised by the first getUserMedia; trigger it
    // now (and immediately release) so the prompt appears before the first call.
    const stream = await mediaDevices.getUserMedia({ audio: true });
    stream.getTracks().forEach((t) => t.stop());
    return true;
  } catch {
    // Any failure (permission denied, Activity not ready, no mic) resolves to
    // false rather than leaving the app hung on the loading spinner.
    return false;
  }
}

export default function App(): React.JSX.Element {
  const [micReady, setMicReady] = useState<boolean | null>(null);
  const [token, setToken] = useState(devSession.token ?? '');
  const [apiBaseUrl, setApiBaseUrl] = useState(devSession.apiBaseUrl ?? DEFAULT_API_BASE_URL);
  const [connected, setConnected] = useState(!!devSession.autoConnect && !!devSession.token);
  const [error, setError] = useState<string | null>(null);
  // Set while the SDK is awaiting a fresh token (onTokenExpiring). We prompt for
  // a new paste with an overlay ON TOP of the still-mounted provider — the phone
  // never disconnects, so submitting the token lets the SDK swap it in-band.
  const [refreshToken, setRefreshToken] = useState('');
  const refreshPromiseRef = useRef<{
    resolve: (token: string) => void;
    reject: (err: Error) => void;
  } | null>(null);
  const [awaitingRefresh, setAwaitingRefresh] = useState(false);

  useEffect(() => {
    ensureMicPermission().then(setMicReady, () => setMicReady(false));
  }, []);

  // The SDK calls this ~60s before the token expires. A real app fetches a fresh
  // token from its backend here; this paste-a-token demo has none, so it prompts
  // for a new one without tearing down the connection.
  const onTokenExpiring = useCallback(
    () =>
      new Promise<string>((resolve, reject) => {
        setRefreshToken('');
        setAwaitingRefresh(true);
        refreshPromiseRef.current = { resolve, reject };
      }),
    []
  );

  const submitRefreshToken = useCallback(() => {
    const pending = refreshPromiseRef.current;
    if (!pending || !refreshToken) return;
    refreshPromiseRef.current = null;
    setAwaitingRefresh(false);
    // Hand the token straight to the SDK, which adopts it over the live
    // connection. Do NOT setToken(refreshToken): `token` is the provider's
    // connect credential, and changing it would tear the socket down and
    // reconnect — the opposite of the in-band swap we're demonstrating.
    pending.resolve(refreshToken);
  }, [refreshToken]);

  // Dismiss without a token: reject so the SDK surfaces the failure (it keeps the
  // still-valid connection up rather than hanging on a promise that never settles).
  const cancelRefresh = useCallback(() => {
    const pending = refreshPromiseRef.current;
    if (!pending) return;
    refreshPromiseRef.current = null;
    setAwaitingRefresh(false);
    pending.reject(new Error('Token refresh dismissed'));
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
              storage={mmkvStorage}
              locationProvider={getCurrentEmergencyAddress}
              apiBaseUrl={apiBaseUrl}
              appearance={{ theme: 'dark' }}
              onTokenExpiring={onTokenExpiring}
              onError={(e: { code: string; message: string }) =>
                setError(`${e.code} — ${e.message}`)
              }
            >
              <Softphone />
              <Modal
                visible={awaitingRefresh}
                transparent
                animationType="fade"
                onRequestClose={cancelRefresh}
              >
                <View style={styles.refreshBackdrop}>
                  <View style={styles.refreshCard}>
                    <Text style={styles.title}>Session expiring</Text>
                    <Text style={styles.hint}>
                      Paste a fresh WebRTC token to keep the call connected.
                    </Text>
                    <TextInput
                      style={styles.input}
                      value={refreshToken}
                      onChangeText={setRefreshToken}
                      placeholder="WebRTC token"
                      placeholderTextColor="#888"
                      autoCapitalize="none"
                      autoCorrect={false}
                      multiline
                    />
                    <Pressable
                      style={[styles.connect, !refreshToken && styles.connectDisabled]}
                      disabled={!refreshToken}
                      onPress={submitRefreshToken}
                    >
                      <Text style={styles.connectText}>Refresh token</Text>
                    </Pressable>
                    <Pressable onPress={cancelRefresh}>
                      <Text style={styles.dismiss}>Dismiss</Text>
                    </Pressable>
                  </View>
                </View>
              </Modal>
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
  refreshBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.6)',
    justifyContent: 'center',
    padding: 24,
  },
  refreshCard: { backgroundColor: THEME_BG, borderRadius: 16, padding: 24, gap: 12 },
  dismiss: { color: 'rgba(255,255,255,0.6)', textAlign: 'center', fontSize: 14 },
});
