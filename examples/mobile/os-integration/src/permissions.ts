import { PermissionsAndroid, Platform } from 'react-native';
import { mediaDevices } from '@livekit/react-native-webrtc';

/**
 * Request POST_NOTIFICATIONS (Android 13+ / API 33). Without it the
 * incoming-call notification is silently suppressed (importance=NONE) — the push
 * arrives, the call is reported, and the user sees NOTHING, invisibly to logs.
 * Below API 33 it doesn't exist and is implicitly granted.
 */
export async function requestNotificationPermission(): Promise<boolean> {
  if (Platform.OS !== 'android') return true;
  if (Number(Platform.Version) < 33) return true;

  const permission = PermissionsAndroid.PERMISSIONS.POST_NOTIFICATIONS;
  if (!permission) return true;

  try {
    if (await PermissionsAndroid.check(permission)) return true;
    const result = await PermissionsAndroid.request(permission);
    return result === PermissionsAndroid.RESULTS.GRANTED;
  } catch {
    // A denied permission must not block startup; calls still work without a
    // notification.
    return false;
  }
}

/**
 * Request the microphone up front so the prompt appears at launch, not the
 * instant a call connects (a denied prompt mid-answer drops the call). The SDK
 * does NOT request mic itself. Without this, a woken call fails first run with
 * "Microphone unavailable ... Permission denied".
 */
export async function requestMicrophonePermission(): Promise<boolean> {
  try {
    if (Platform.OS === 'android') {
      // On a cold start the request can fire before the Activity is attached
      // ("not attached to an Activity"); wait a frame so it's ready.
      await new Promise<void>((r) => setTimeout(() => r(), 0));
      const result = await PermissionsAndroid.request(PermissionsAndroid.PERMISSIONS.RECORD_AUDIO, {
        title: 'Microphone permission',
        message: 'This app needs the microphone to place and receive calls.',
        buttonPositive: 'OK',
      });
      // The permission result is authoritative here; probing getUserMedia on top
      // would open and drop a capture track (an audio-focus/mode change).
      return result === PermissionsAndroid.RESULTS.GRANTED;
    }
    // iOS has no separate permission API: the prompt is raised by the first
    // getUserMedia, so trigger it now (and release) so it appears before the
    // first call rather than mid-answer.
    const stream = await mediaDevices.getUserMedia({ audio: true });
    stream.getTracks().forEach((t) => t.stop());
    return true;
  } catch {
    // Failure must not block startup — the wake path still rings; only audio is
    // missing until granted.
    return false;
  }
}
