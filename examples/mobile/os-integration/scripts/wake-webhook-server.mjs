#!/usr/bin/env node
/**
 * A LOCAL TEST HARNESS standing in for the integrator's backend — not reference
 * code. A real integration is a deployed server with durable token storage,
 * mandatory webhook signature verification and a stable public URL; this file
 * exists so the wake path can be exercised from a laptop behind a throwaway
 * tunnel.
 *
 * Receives DialStack's `call.mobile_push_wakeup` webhook and sends the push that
 * makes the callee's phone ring — FCM on Android, APNs on iOS. This is the piece
 * DialStack deliberately does NOT do: it stores no device tokens, so mapping a
 * DialStack `user_id` to a push token is the integrator's job
 * (docs/docs/webrtc/mobile.md).
 *
 * The two platforms need different transports AND different payload shapes, so
 * the device's registered `type` decides both. APNs config is only required once
 * an iOS device registers; an Android-only setup needs none of it.
 *
 * Endpoints:
 *   POST /devices        { user_id, token, type, device_id }  register a device (the app calls this)
 *   POST /webhooks/dialstack                  DialStack's webhook target
 *   POST /test           { user_id?, from? }  send a wake by hand, no call needed
 *   GET  /devices                             inspect the registry
 *
 * The token registry is in-memory: this is a POC harness, not a service. Restart
 * and you re-register. It holds every device a user registers and wakes all of
 * them, because a call rings all of them.
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

/**
 * user_id -> [{ token, type }]. In-memory on purpose; see header.
 *
 * A LIST because a user has as many devices as they have installs, and a call
 * rings all of them — DialStack sends one webhook per call naming the user, and
 * fanning that out to every device is the integrator's job. Keeping one token
 * per user would silently stop the previous device ringing the moment a second
 * one registered.
 *
 * `type` decides the transport and the payload shape, which differ per platform:
 * Android registers an FCM token, iOS a raw APNs VoIP token from PushKit.
 */
const devices = new Map();

/**
 * Register a device, replacing any earlier entry for the same install or the
 * same token. Keying on the token alone kept a stale entry whenever an install
 * came back with a new push token (after an update or a restore), and each call
 * then pushed to that device twice.
 */
function addDevice(userId, token, type, deviceId) {
  const list = devices.get(userId) ?? [];
  const next = list.filter((d) => d.token !== token && (!deviceId || d.deviceId !== deviceId));
  next.push({ token, type, deviceId });
  devices.set(userId, next);
  return next.length;
}

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

// A signed JWT: base64url header and claims, then the signature over both, which
// `sign` returns as base64url.
function signJwt(header, claims, sign) {
  const b64 = (o) => Buffer.from(JSON.stringify(o)).toString('base64url');
  const unsigned = `${b64(header)}.${b64(claims)}`;
  return `${unsigned}.${sign(unsigned)}`;
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
  const assertion = signJwt(
    { alg: 'RS256', typ: 'JWT' },
    {
      iss: creds.client_email,
      scope: 'https://www.googleapis.com/auth/firebase.messaging',
      aud: 'https://oauth2.googleapis.com/token',
      iat: now,
      exp: now + 3600,
    },
    (unsigned) => createSign('RSA-SHA256').update(unsigned).sign(creds.private_key, 'base64url')
  );

  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
      assertion,
    }),
  });
  if (!res.ok) throw new Error(`token exchange failed: ${res.status} ${await res.text()}`);
  const json = await res.json();
  cachedToken = { value: json.access_token, exp: now + (json.expires_in ?? 3600) };
  return cachedToken.value;
}

/**
 * The call event both platforms carry. eventId / serverCallId / caller.id are
 * required and must be non-blank, or the native side drops the push and the
 * phone never rings.
 */
async function buildEvent({ callId, from, fromName, userId }) {
  const { randomUUID } = await import('node:crypto');
  return {
    eventId: randomUUID(),
    serverCallId: callId,
    hasVideo: false,
    startedAt: new Date().toISOString(),
    caller: { id: from, displayName: fromName ?? from, phoneNumber: from },
    metadata: { dialstack_call_id: callId, user_id: userId ?? '' },
  };
}

/**
 * Android. FCM data values are strings, so the event is JSON-ENCODED and paired
 * with a `messageType` discriminator — the Kotlin parser requires both.
 *
 * Data-only and high-priority: a `notification` block would route to
 * expo-notifications instead of the call service, and normal priority is
 * deferred in Doze.
 */
async function sendFcm({ token, event }) {
  const at = await accessToken();
  const res = await fetch(`https://fcm.googleapis.com/v1/projects/${projectId}/messages:send`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${at}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      message: {
        token,
        data: { messageType: 'incomingCall', incomingCall: JSON.stringify(event) },
        android: { priority: 'HIGH', ttl: '30s' },
      },
    }),
  });
  return { ok: res.ok, status: res.status, body: await res.text() };
}

/**
 * APNs provider JWT (ES256). Apple rejects a token refreshed more often than
 * every 20 minutes AND one older than 60, so mint once and reuse for 40.
 *
 * `dsaEncoding: 'ieee-p1363'` is load-bearing: Node's default for ECDSA is DER,
 * which JWT verifiers reject — JOSE wants the raw r||s pair.
 */
let apnsJwt = null;
async function providerToken() {
  const now = Math.floor(Date.now() / 1000);
  if (apnsJwt && apnsJwt.iat > now - 2400) return apnsJwt.value;

  const missing = ['APNS_KEY_PATH', 'APNS_KEY_ID', 'APNS_TEAM_ID'].filter((k) => !process.env[k]);
  if (missing.length) throw new Error(`iOS device registered but ${missing.join(', ')} unset`);

  const { sign } = await import('node:crypto');
  const key = readFileSync(process.env.APNS_KEY_PATH.replace(/^~/, process.env.HOME), 'utf8');
  const value = signJwt(
    { alg: 'ES256', kid: process.env.APNS_KEY_ID },
    { iss: process.env.APNS_TEAM_ID, iat: now },
    (unsigned) =>
      sign('SHA256', Buffer.from(unsigned), { key, dsaEncoding: 'ieee-p1363' }).toString(
        'base64url'
      )
  );

  apnsJwt = { value, iat: now };
  return apnsJwt.value;
}

/**
 * iOS. PushKit wants `incomingCall` as a nested OBJECT — the Swift parser casts
 * it to a dictionary and has no fallback to a flat or stringified shape.
 *
 * The topic carries a `.voip` SUFFIX on the bundle id; without it APNs answers
 * 400 TopicDisallowed. `aps` is empty on purpose: a VoIP push shows no alert,
 * but the key has to be present.
 */
// Well under the relay's own ~30s webhook timeout, so a stuck push fails loudly
// here with a message naming the host rather than being swallowed upstream.
const APNS_TIMEOUT_MS = 10_000;

async function sendApns({ token, event }) {
  const jwt = await providerToken();
  const bundleId = process.env.APNS_BUNDLE_ID ?? 'ai.dialstack.osintegration.example';
  const host = process.env.APNS_HOST ?? 'api.sandbox.push.apple.com';
  const http2 = await import('node:http2');

  return new Promise((resolve, reject) => {
    const client = http2.connect(`https://${host}`);

    // Every exit destroys the session. Without this the push leaks a TLS socket
    // on any path but a clean response, and — worse — APNs sends GOAWAY to shed
    // connections, which settles NEITHER 'end' nor 'error': the promise hangs,
    // Promise.all never resolves, and the webhook never replies, so the wake is
    // silently lost. The timeout is the backstop for that and for a blackholed
    // 443 (a typo'd APNS_HOST otherwise sits for the ~2min OS TCP timeout).
    let settled = false;
    const finish = (fn) => (value) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      client.destroy();
      fn(value);
    };
    const done = finish(resolve);
    const fail = finish(reject);
    const timer = setTimeout(
      () => fail(new Error(`APNs request to ${host} timed out after ${APNS_TIMEOUT_MS}ms`)),
      APNS_TIMEOUT_MS
    );

    client.on('error', fail);
    // 'close' covers a session that ends without answering.
    client.on('goaway', () => fail(new Error('APNs sent GOAWAY with no response')));
    client.on('close', () => fail(new Error('APNs closed the connection with no response')));
    const req = client.request({
      ':method': 'POST',
      ':path': `/3/device/${token}`,
      authorization: `bearer ${jwt}`,
      'apns-topic': `${bundleId}.voip`,
      'apns-push-type': 'voip',
      'apns-priority': '10',
      // An absolute UNIX timestamp, not a TTL (a bare '30' means 1970 —
      // "already expired", so APNs tries once and never stores/retries).
      'apns-expiration': String(Math.floor(Date.now() / 1000) + 30),
    });

    let status = 0;
    let body = '';
    req.on('response', (h) => {
      status = h[':status'];
    });
    req.setEncoding('utf8');
    req.on('data', (c) => {
      body += c;
    });
    req.on('end', () => {
      // APNs answers 200 with an EMPTY body on success; the body only carries a
      // `reason` when it rejects.
      done({ ok: status === 200, status, body: body || '(empty)' });
    });
    req.on('error', fail);
    req.end(JSON.stringify({ aps: {}, incomingCall: event }));
  });
}

/** Dispatch on the transport the device registered with. */
async function sendWake({ token, type, callId, from, fromName, userId }) {
  const event = await buildEvent({ callId, from, fromName, userId });
  if (type !== 'APNS_VOIP') return sendFcm({ token, event });
  return sendApns({ token, event });
}

/**
 * Wake every device the user has. A call rings all of them, so one failing
 * device must not stop the others — hence the per-device catch and the
 * `some(ok)` the callers use. They are sent concurrently because the ring is
 * what the caller is waiting on.
 */
async function wakeAll(list, call, tag = 'webhook') {
  return Promise.all(
    list.map(async ({ token, type }) => {
      const label = `${type} ${token.slice(0, 12)}…`;
      try {
        const out = await sendWake({ token, type, ...call });
        console.log(
          `[${tag}] push ${out.ok ? 'sent' : `FAILED ${out.status}`} to ${label} ${out.body.slice(0, 160)}`
        );
        return { device: label, ok: out.ok, status: out.status };
      } catch (err) {
        console.warn(`[${tag}] push ERROR to ${label}: ${String(err)}`);
        return { device: label, ok: false, error: String(err) };
      }
    })
  );
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
        devices: [...devices.entries()].flatMap(([u, list]) =>
          list.map((d) => ({
            user_id: u,
            type: d.type,
            device_id: d.deviceId ?? null,
            token: `${d.token.slice(0, 16)}…`,
          }))
        ),
      });
    }

    if (req.method === 'POST' && url.pathname === '/devices') {
      const { user_id, token, type, device_id } = await readJson(req);
      if (!user_id || !token) return reply(400, { error: 'user_id and token required' });
      const n = addDevice(user_id, token, type ?? 'FCM', device_id);
      console.log(
        `[devices] registered ${user_id} (${type ?? 'FCM'}) -> ${token.slice(0, 16)}… (${n} device${n === 1 ? '' : 's'})`
      );
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
      const list = devices.get(d.user_id) ?? [];
      if (list.length === 0) {
        console.warn(`[webhook] no device for ${d.user_id} — cannot wake`);
        return reply(200, { ok: false, reason: 'no device registered' });
      }

      const results = await wakeAll(list, {
        callId: d.call_id,
        from: d.from_number,
        fromName: d.from_name,
        userId: d.user_id,
      });
      return reply(200, { ok: results.some((r) => r.ok) });
    }

    // Manual trigger: fake the webhook without placing a real call. Useful when
    // the real webhook isn't reachable (no public tunnel) — send the same FCM
    // payload directly.
    if (req.method === 'POST' && url.pathname === '/test') {
      const b = await readJson(req);
      const userId = b.user_id ?? [...devices.keys()][0];
      const list = devices.get(userId) ?? [];
      if (list.length === 0) return reply(400, { error: 'no device registered' });
      const results = await wakeAll(
        list,
        {
          callId: b.call_id ?? `call_test_${Date.now()}`,
          from: b.from ?? '+14165551234',
          fromName: b.from_name ?? 'Jane Smith',
          userId,
        },
        'test'
      );
      const ok = results.some((r) => r.ok);
      return reply(ok ? 200 : 502, { ok, results });
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
