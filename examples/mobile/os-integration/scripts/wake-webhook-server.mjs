#!/usr/bin/env node
/**
 * A LOCAL TEST HARNESS standing in for the integrator's backend — not reference
 * code. A real integration is a deployed server with durable token storage,
 * mandatory webhook signature verification and a stable public URL; this file
 * exists so the wake path can be exercised from a laptop behind a throwaway
 * tunnel.
 *
 * Receives DialStack's `call.mobile_push_wakeup` webhook and sends an FCM data
 * message so the callee's phone rings. This is the piece DialStack deliberately
 * does NOT do: it stores no device tokens, so mapping a DialStack `user_id` to a
 * push token is the integrator's job (docs/docs/webrtc/mobile.md).
 *
 * Endpoints:
 *   POST /devices        { user_id, token }   register a device (the app calls this)
 *   POST /webhooks/dialstack                  DialStack's webhook target
 *   POST /test           { user_id?, from? }  send a wake by hand, no call needed
 *   GET  /devices                             inspect the registry
 *
 * The token registry is in-memory: this is a POC harness, not a service. Restart
 * and you re-register.
 *
 * Usage:
 *   GOOGLE_APPLICATION_CREDENTIALS=/path/to/service-account.json \
 *     node scripts/wake-webhook-server.mjs [port]
 */
import { createServer } from 'node:http';
import { readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';

const PORT = Number(process.argv[2] ?? 8787);

/**
 * Credentials. Two modes:
 *
 *  - a service-account JSON via GOOGLE_APPLICATION_CREDENTIALS, or
 *  - Application Default Credentials via gcloud (`gcloud auth
 *    application-default login`) + FCM_PROJECT_ID.
 *
 * ADC exists because service-account KEY CREATION IS BLOCKED by org policy on
 * this GCP org ("Key creation is not allowed on this service account"), which
 * is the normal posture — long-lived downloadable keys are the thing such
 * policies exist to prevent. ADC needs no key file.
 */
const credsPath = process.env.GOOGLE_APPLICATION_CREDENTIALS;
const creds = credsPath ? JSON.parse(readFileSync(credsPath, 'utf8')) : null;
const projectId = creds?.project_id ?? process.env.FCM_PROJECT_ID;

if (!projectId) {
  console.error(
    'set GOOGLE_APPLICATION_CREDENTIALS (service-account JSON) or FCM_PROJECT_ID (with gcloud ADC)'
  );
  process.exit(2);
}

/** user_id -> push token. In-memory on purpose; see header. */
const devices = new Map();

const DS_API = process.env.DIALSTACK_API_BASE_URL ?? 'https://api.dialstack.ai';
const DS_KEY = process.env.DIALSTACK_SECRET_KEY;
const DS_ACCOUNT = process.env.DIALSTACK_ACCOUNT;

/**
 * Endpoint signing secret, optional here. DialStack returns it ONLY in the
 * /v1/webhook_endpoints create response (a later GET omits it). When set, every
 * webhook is verified; when unset, the harness accepts unsigned webhooks and says
 * so on every request — acceptable for a laptop behind a rotating tunnel, and
 * exactly what a deployed integrator server must NOT do.
 */
const WEBHOOK_SECRET = process.env.DIALSTACK_WEBHOOK_SECRET;
if (!WEBHOOK_SECRET) {
  console.warn(
    'no DIALSTACK_WEBHOOK_SECRET: accepting unsigned webhooks (local harness only — a real server verifies)'
  );
}

let cachedToken = null;
async function accessToken() {
  if (cachedToken && cachedToken.exp > Date.now() / 1000 + 60) return cachedToken.value;

  // ADC path: let gcloud mint it. Short-lived and refreshed per call, so no
  // caching beyond the process.
  if (!creds) {
    const value = execFileSync('gcloud', ['auth', 'application-default', 'print-access-token'], {
      encoding: 'utf8',
    }).trim();
    cachedToken = { value, exp: Date.now() / 1000 + 3000 };
    return value;
  }

  const { createSign } = await import('node:crypto');
  const now = Math.floor(Date.now() / 1000);
  const b64 = (o) => Buffer.from(JSON.stringify(o)).toString('base64url');
  const unsigned = `${b64({ alg: 'RS256', typ: 'JWT' })}.${b64({
    iss: creds.client_email,
    scope: 'https://www.googleapis.com/auth/firebase.messaging',
    aud: 'https://oauth2.googleapis.com/token',
    iat: now,
    exp: now + 3600,
  })}`;
  const sig = createSign('RSA-SHA256').update(unsigned).sign(creds.private_key, 'base64url');

  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
      assertion: `${unsigned}.${sig}`,
    }),
  });
  if (!res.ok) throw new Error(`token exchange failed: ${res.status} ${await res.text()}`);
  const json = await res.json();
  cachedToken = { value: json.access_token, exp: now + (json.expires_in ?? 3600) };
  return cachedToken.value;
}

/**
 * Send the wake. The payload shape is dictated by expo-callkit-telecom's Kotlin
 * parser: `messageType` plus `incomingCall` as a JSON STRING (FCM data values
 * are strings), with eventId / serverCallId / caller.id required and non-blank —
 * otherwise the native side drops it and the phone never rings.
 *
 * Data-only and high-priority: a `notification` block would route to
 * expo-notifications instead of the call service, and normal priority is
 * deferred in Doze.
 */
async function sendWake({ token, callId, from, fromName, userId }) {
  const { randomUUID } = await import('node:crypto');
  const incomingCall = {
    eventId: randomUUID(),
    serverCallId: callId,
    hasVideo: false,
    startedAt: new Date().toISOString(),
    caller: { id: from, displayName: fromName ?? from, phoneNumber: from },
    metadata: { dialstack_call_id: callId, user_id: userId ?? '' },
  };

  const at = await accessToken();
  const res = await fetch(`https://fcm.googleapis.com/v1/projects/${projectId}/messages:send`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${at}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      message: {
        token,
        data: { messageType: 'incomingCall', incomingCall: JSON.stringify(incomingCall) },
        android: { priority: 'HIGH', ttl: '30s' },
        apns: {
          headers: {
            'apns-push-type': 'voip',
            'apns-priority': '10',
            // An absolute UNIX timestamp, not a TTL (a bare '30' means 1970 —
            // "already expired", so APNs tries once and never stores/retries).
            'apns-expiration': String(Math.floor(Date.now() / 1000) + 30),
          },
          // FCM rejects an apns payload with no `aps` key ("Payload of Apple Push
          // Notification Service must contain an [aps] key"). A VoIP push needs no
          // alert/badge/sound — an empty aps satisfies the schema while the custom
          // incomingCall key carries the event.
          payload: { aps: {}, incomingCall },
        },
      },
    }),
  });
  const body = await res.text();
  return { ok: res.ok, status: res.status, body };
}

// Concatenate the raw chunks BEFORE decoding: `raw += chunk` decodes each Buffer
// on its own, so a multi-byte character split across chunks becomes U+FFFD and
// the body no longer matches the bytes DialStack signed.
const readBody = (req) =>
  new Promise((resolve, reject) => {
    const chunks = [];
    req.on('data', (c) => chunks.push(c));
    req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
    req.on('error', reject);
    req.on('aborted', () => reject(new Error('request aborted')));
  });

const parse = (raw) => {
  try {
    return JSON.parse(raw || '{}');
  } catch {
    return {};
  }
};

const readJson = async (req) => parse(await readBody(req));

/**
 * Verify `X-DialStack-Signature: t=<unix>,v1=<hex>`.
 *
 * HMAC-SHA256 over `{timestamp}.{raw_body}` with the endpoint's secret, which
 * DialStack returns ONLY in the create response. The body must be the raw bytes
 * as received — re-serializing the parsed JSON changes key order and spacing and
 * the HMAC will not match.
 *
 * A public tunnel URL is unauthenticated, so without this anyone who learns the
 * URL can forge a wake and ring the device. Timestamp tolerance bounds replay.
 */
async function verifySignature(header, rawBody, secret) {
  if (!secret) return { ok: true, reason: 'no secret configured — verification skipped' };
  if (!header) return { ok: false, reason: 'missing X-DialStack-Signature' };

  const parts = Object.fromEntries(
    header.split(',').map((kv) => {
      const i = kv.indexOf('=');
      return [kv.slice(0, i).trim(), kv.slice(i + 1).trim()];
    })
  );
  const t = parts.t;
  const v1 = parts.v1;
  if (!t || !v1) return { ok: false, reason: 'malformed signature header' };

  const age = Math.abs(Date.now() / 1000 - Number(t));
  if (!Number.isFinite(age) || age > 300) {
    return { ok: false, reason: `timestamp outside tolerance (${Math.round(age)}s)` };
  }

  const { createHmac, timingSafeEqual } = await import('node:crypto');
  const expected = createHmac('sha256', secret).update(`${t}.${rawBody}`).digest('hex');
  const a = Buffer.from(expected, 'utf8');
  const b = Buffer.from(v1, 'utf8');
  if (a.length !== b.length || !timingSafeEqual(a, b)) {
    return { ok: false, reason: 'signature mismatch' };
  }
  return { ok: true };
}

const server = createServer(async (req, res) => {
  const reply = (code, obj) => {
    res.writeHead(code, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(obj));
  };
  const url = new URL(req.url, `http://localhost:${PORT}`);

  try {
    if (req.method === 'GET' && url.pathname === '/devices') {
      return reply(200, {
        devices: [...devices.entries()].map(([u, t]) => ({
          user_id: u,
          token: `${t.slice(0, 16)}…`,
        })),
      });
    }

    if (req.method === 'POST' && url.pathname === '/devices') {
      const { user_id, token } = await readJson(req);
      if (!user_id || !token) return reply(400, { error: 'user_id and token required' });
      devices.set(user_id, token);
      console.log(`[devices] registered ${user_id} -> ${token.slice(0, 16)}…`);
      return reply(200, { ok: true });
    }

    // Mint a fresh user-session client_secret. Stands in for the integrator's
    // backend: the app calls this from onTokenExpiring (and on boot if its
    // stored token is expired) so a ~24h dev token no longer kills the session.
    // Uses the same dev sk + account the rig already holds. A real integrator
    // mints this server-side from their own sk_live and never ships the key to
    // the client.
    if (req.method === 'POST' && url.pathname === '/session') {
      if (!DS_KEY || !DS_ACCOUNT)
        return reply(500, { error: 'rig missing DIALSTACK_SECRET_KEY/ACCOUNT' });
      const { user_id } = await readJson(req);
      if (!user_id) return reply(400, { error: 'user_id required' });
      const r = await fetch(`${DS_API}/v1/user_sessions`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${DS_KEY}`,
          'DialStack-Account': DS_ACCOUNT,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ user: user_id }),
      });
      const body = await r.json().catch(() => ({}));
      if (!r.ok || !body.client_secret) {
        console.log(`[session] mint FAILED ${r.status} ${JSON.stringify(body).slice(0, 200)}`);
        return reply(502, { error: 'mint failed', status: r.status });
      }
      console.log(`[session] minted client_secret for ${user_id}`);
      return reply(200, { client_secret: body.client_secret });
    }

    // DialStack's webhook. Verified against the endpoint secret when one is
    // configured; otherwise accepted with a warning (see WEBHOOK_SECRET).
    if (req.method === 'POST' && url.pathname === '/webhooks/dialstack') {
      const rawBody = await readBody(req);
      const check = await verifySignature(
        req.headers['x-dialstack-signature'],
        rawBody,
        WEBHOOK_SECRET
      );
      if (!check.ok) {
        console.warn(`[webhook] REJECTED: ${check.reason}`);
        return reply(400, { error: `signature: ${check.reason}` });
      }
      if (check.reason) console.warn(`[webhook] ${check.reason}`);

      const evt = parse(rawBody);
      console.log(`[webhook] ${evt.type ?? 'unknown'} ${JSON.stringify(evt.data ?? {})}`);

      if (evt.type !== 'call.mobile_push_wakeup') return reply(200, { ignored: evt.type });

      const d = evt.data ?? {};
      const token = devices.get(d.user_id);
      if (!token) {
        console.warn(`[webhook] no device for ${d.user_id} — cannot wake`);
        return reply(200, { ok: false, reason: 'no device registered' });
      }

      const out = await sendWake({
        token,
        callId: d.call_id,
        from: d.from_number,
        fromName: d.from_name,
        userId: d.user_id,
      });
      console.log(
        `[webhook] push ${out.ok ? 'sent' : `FAILED ${out.status}`} ${out.body.slice(0, 200)}`
      );
      return reply(200, { ok: out.ok });
    }

    // Manual trigger: fake the webhook without placing a real call. Useful when
    // the real webhook isn't reachable (no public tunnel) — send the same FCM
    // payload directly.
    if (req.method === 'POST' && url.pathname === '/test') {
      const b = await readJson(req);
      const userId = b.user_id ?? [...devices.keys()][0];
      const token = devices.get(userId);
      if (!token) return reply(400, { error: 'no device registered' });
      const out = await sendWake({
        token,
        callId: b.call_id ?? `call_test_${Date.now()}`,
        from: b.from ?? '+14165551234',
        fromName: b.from_name ?? 'Jane Smith',
        userId,
      });
      console.log(
        `[test] push ${out.ok ? 'sent' : `FAILED ${out.status}`} ${out.body.slice(0, 300)}`
      );
      return reply(out.ok ? 200 : 502, { ok: out.ok, status: out.status, body: out.body });
    }

    reply(404, { error: 'not found' });
  } catch (err) {
    console.error('[error]', err);
    reply(500, { error: String(err) });
  }
});

server.listen(PORT, () => {
  console.log(`wake webhook server on http://localhost:${PORT}`);
  console.log(`  project: ${projectId} (${creds ? 'service account' : 'gcloud ADC'})`);
  console.log(`  POST /devices  {user_id, token}`);
  console.log(`  POST /webhooks/dialstack   (DialStack webhook target)`);
  console.log(`  POST /test     {user_id?, from?}`);
  console.log(`  POST /session  {user_id}  mint a fresh client_secret`);
});
