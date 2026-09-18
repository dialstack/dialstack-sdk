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
// guessing "expired" would discard a token that might work. `leadMs` treats a
// token dying within that window as already expired.
function isExpired(token: string, leadMs = 0): boolean {
  try {
    const part = token.split('.')[1];
    if (!part) return false;
    const json = decodeBase64Url(part);
    const exp = (JSON.parse(json) as { exp?: number }).exp;
    return typeof exp === 'number' && exp * 1000 <= Date.now() + leadMs;
  } catch {
    return false;
  }
}

// The pre-connect freshness gate needs headroom: connect() registers with the
// token and the server's in-band refresh only arms once connected, so a token
// with seconds left passes an exact check and dies mid-handshake (auth_expired,
// parked call lost). Also absorbs device clock skew. Matches the SDK's own
// refresh lead. Applied to the gate only — not to sessionToken()'s storage-vs-
// seed choice, where it would discard a nearly-live stored token for a stale
// bundled one.
const FRESHNESS_LEAD_MS = 60_000;

// Pure-JS base64url decode: `globalThis.atob` is absent/unreliable on Hermes
// (it threw, so isExpired's catch treated an EXPIRED token as valid and the
// pre-connect mint never ran) and `Buffer` isn't shipped by RN.
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

/** Is the current stored/seed token expired, or about to be (within the lead)? */
export function isSessionTokenExpired(): boolean {
  const t = getSessionToken() ?? BUNDLED_TOKEN;
  return !t || isExpired(t, FRESHNESS_LEAD_MS);
}

/**
 * Return a valid session token, minting a fresh one only if the current is
 * expired. The async counterpart to the sync `sessionToken()` — call it before
 * connecting where awaiting a mint is allowed.
 */
export async function ensureFreshSessionToken(): Promise<string> {
  if (!isSessionTokenExpired()) return sessionToken();
  return refreshSessionToken();
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
