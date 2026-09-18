import { NativeCallBridge, appLifecycle, createPhone } from '@dialstack/sdk-native';

import { API_BASE_URL, ensureFreshSessionToken, refreshSessionToken, sessionToken } from './config';
import { expoCallKitTelecomAdapter } from './os/expoCallKitTelecomAdapter';
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
  // Mint a fresh client_secret before the current one lapses (the SDK fires this
  // ahead of exp). Without it a ~24h dev token dies with a fatal auth_expired.
  onTokenExpiring: refreshSessionToken,
});

export const bridge = new NativeCallBridge({
  phone,
  os: expoCallKitTelecomAdapter(),
  lifecycle: appLifecycle,
  log: (m) => console.log(`[call] ${m}`),
  // Before registering (boot, push-wake, or a foreground resume), mint a fresh
  // client_secret if the current one is expired and put it on the phone —
  // otherwise the register would carry a dead token and the parked call is lost.
  // onTokenExpiring only covers a LIVE session, so it cannot help here.
  ensureFreshToken: async () => {
    // config decides whether the current token is still good or a fresh mint is
    // needed; the bridge just puts the result on the phone before it registers.
    phone.setToken(await ensureFreshSessionToken());
  },
});
