import { NativeCallBridge, appLifecycle, createPhone } from '@dialstack/sdk-native';

import { backgroundTimers } from '../modules/background-timers';

import { API_BASE_URL, refreshSessionToken, sessionToken } from './config';
import { expoCallKitTelecom } from './os/expoCallKitTelecomAdapter';
import { storage } from './storage';

/**
 * Composition root. Module scope on purpose: the app window and a push-woken
 * headless task run in the same JS runtime, so importing this module from either
 * entry yields the same phone and the same bridge.
 */
const { os, ringback, audioOutput } = expoCallKitTelecom();

export const phone = createPhone({
  token: sessionToken(),
  apiBaseUrl: API_BASE_URL,
  storage,
  // Mints a fresh client_secret. The phone calls it whenever the token it is about
  // to use is expired or close to it: before connecting, before every reconnect's
  // authenticate, on resume, and ahead of exp on a live session.
  onTokenExpiring: refreshSessionToken,
  // Through the call library, not InCallManager: InCallManager's tone runs its
  // own device selection and moves the audio to the speaker behind Telecom.
  ringback,
});

export const bridge = new NativeCallBridge({
  phone,
  os,
  lifecycle: appLifecycle,
  log: (m) => console.log(`[call] ${m}`),
  // One call on the OS surface at a time: this example doesn't support
  // multi-call yet. Spelled out rather than left to the default because it is
  // the thing to change first for OS call-waiting.
  maxOsCalls: 1,
  // Native, so a wake's deadlines fire in a backgrounded app (see the module).
  timers: backgroundTimers,
});

export { audioOutput };
