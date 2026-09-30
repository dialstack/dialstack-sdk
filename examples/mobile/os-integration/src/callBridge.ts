import { NativeCallBridge, appLifecycle, createPhone } from '@dialstack/sdk-native';

import { backgroundTimers } from '../modules/background-timers';

import { API_BASE_URL, refreshSessionToken, sessionToken } from './config';
import { expoCallKitTelecomAdapter } from './os/expoCallKitTelecomAdapter';
import { ringback } from './ringback';
import { storage } from './storage';

/**
 * Composition root. Module scope on purpose: the app window and a push-woken
 * headless task run in the same JS runtime, so importing this module from either
 * entry yields the same phone and the same bridge.
 */
export const phone = createPhone({
  token: sessionToken(),
  apiBaseUrl: API_BASE_URL,
  storage,
  // Mints a fresh client_secret. The phone calls it whenever the token it is about
  // to use is expired or close to it: before connecting, before every reconnect's
  // authenticate, on resume, and ahead of exp on a live session.
  onTokenExpiring: refreshSessionToken,
  ringback,
});

export const bridge = new NativeCallBridge({
  phone,
  os: expoCallKitTelecomAdapter(),
  lifecycle: appLifecycle,
  log: (m) => console.log(`[call] ${m}`),
  // One call on the OS surface at a time: this example doesn't support
  // multi-call yet. Spelled out rather than left to the default because it is
  // the thing to change first for OS call-waiting.
  maxOsCalls: 1,
  // Native, so a wake's deadlines fire in a backgrounded app (see the module).
  timers: backgroundTimers,
});
