import Constants from 'expo-constants';

import { getSessionToken, setSessionToken } from './storage';

type Extra = {
  dialstackToken?: string;
  dialstackApiBaseUrl?: string;
  dialstackUserId?: string;
};

const extra = (Constants.expoConfig?.extra ?? {}) as Extra;

export const API_BASE_URL =
  process.env.EXPO_PUBLIC_DIALSTACK_API_BASE_URL ??
  extra.dialstackApiBaseUrl ??
  'https://api.dialstack.ai';

export const USER_ID = process.env.EXPO_PUBLIC_DIALSTACK_USER_ID ?? extra.dialstackUserId ?? '';

/** The integrator backend / wake rig that mints a fresh client_secret (POST /session). */
export const WAKE_REGISTRY_URL = process.env.EXPO_PUBLIC_WAKE_REGISTRY_URL ?? '';

// Baked in at build time (env inlined by Metro, `extra` from app.json), so unlike
// the stored token this one cannot change while the process runs.
const BUNDLED_TOKEN = process.env.EXPO_PUBLIC_DIALSTACK_TOKEN ?? extra.dialstackToken ?? '';

/**
 * The user session token (`client_secret` from POST /v1/user_sessions).
 *
 * A function, not a constant: a module-level constant captures whatever was on
 * disk at first import, and the wake path can import it before a fresher token
 * is written.
 */
export function sessionToken(): string {
  const stored = getSessionToken();
  // An expired stored token must not shadow a fresher bundled one, or the seed
  // below latches the first token forever (storage always wins) and every wake
  // 401s silently.
  if (stored && !isExpired(stored)) return stored;

  // Only reached when storage holds nothing usable, so writing unconditionally is
  // safe: a live stored token already returned above and is never clobbered.
  if (BUNDLED_TOKEN) setSessionToken(BUNDLED_TOKEN);
  return BUNDLED_TOKEN;
}

// Treats an unparseable token as NOT expired: the server is the authority, and
// guessing "expired" would discard a token that might work.
function isExpired(token: string): boolean {
  try {
    const part = token.split('.')[1];
    if (!part) return false;
    const json = decodeBase64Url(part);
    const exp = (JSON.parse(json) as { exp?: number }).exp;
    return typeof exp === 'number' && exp * 1000 <= Date.now();
  } catch {
    return false;
  }
}

// Pure-JS base64url decode: `globalThis.atob` is absent/unreliable on Hermes
// (it threw, so isExpired's catch treated an EXPIRED stored token as valid) and
// `Buffer` isn't shipped by RN.
const B64_ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
function decodeBase64Url(seg: string): string {
  const b64 = seg.replace(/-/g, '+').replace(/_/g, '/').replace(/=+$/, '');
  let bits = 0;
  let acc = 0;
  let out = '';
  for (const ch of b64) {
    const v = B64_ALPHABET.indexOf(ch);
    if (v < 0) continue;
    acc = (acc << 6) | v;
    bits += 6;
    if (bits >= 8) {
      bits -= 8;
      out += String.fromCharCode((acc >> bits) & 0xff);
    }
  }
  return out;
}

export async function refreshSessionToken(): Promise<string> {
  if (!WAKE_REGISTRY_URL || !USER_ID) {
    throw new Error('no token-refresh source (set EXPO_PUBLIC_WAKE_REGISTRY_URL + USER_ID)');
  }
  const res = await fetch(`${WAKE_REGISTRY_URL}/session`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ user_id: USER_ID }),
  });
  if (!res.ok) throw new Error(`token refresh failed: HTTP ${res.status}`);
  const { client_secret } = (await res.json()) as { client_secret?: string };
  if (!client_secret) throw new Error('token refresh: no client_secret in response');
  setSessionToken(client_secret);
  return client_secret;
}
