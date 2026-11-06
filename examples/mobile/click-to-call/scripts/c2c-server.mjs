#!/usr/bin/env node
/**
 * A LOCAL TEST HARNESS standing in for the integrator's backend — not reference
 * code. It trusts whatever `user_id` the app sends; a real backend derives the
 * user from its own authenticated session and never lets a client pick one.
 *
 * It exists because the app cannot call DialStack itself: placing a
 * click-to-call and writing a user's routing both need the account's secret
 * key, which must never ship on a device.
 *
 * Endpoints:
 *   GET    /users                 the account's users, for the demo's user picker
 *   GET    /users/:id/mobile      { number, inbound } of the user's mobile profile
 *   POST   /users/:id/mobile      { number?, inbound? }  change the number, or whether
 *                                 incoming calls ring it too
 *   DELETE /users/:id/mobile      remove the mobile profile (and the cell from incoming calls)
 *   POST   /calls                 { user_id, to }  click-to-call through the mobile profile
 *   POST   /users/:id/call/hangup end the user's current call
 *   POST   /users/:id/call/hold   put the other party on hold
 *   POST   /users/:id/call/unhold take them off hold
 *   WS     /users/:id/call/stream the user's current call, then every change to it
 *
 * And on WEBHOOK_PORT (default 8789), the only port to expose on a tunnel:
 *   POST   /webhooks/dialstack    DialStack's webhook target (call.initiated/answered/end,
 *                                 call.command_succeeded/failed)
 *
 * Call status is in memory, one call per user: restart and it is gone.
 *
 * Usage: scripts/start-rig.sh (reads .env.local), or
 *   DIALSTACK_SECRET_KEY=… DIALSTACK_ACCOUNT=… node scripts/c2c-server.mjs [port]
 */
import { createHmac, timingSafeEqual } from 'node:crypto';
import { createServer } from 'node:http';
import { WebSocketServer } from 'ws';

const PORT = Number(process.argv[2] ?? 8788);
// Loopback by default: this process holds the secret key and authenticates no
// one, so anything that can reach it can rewrite routing and bridge two
// arbitrary numbers on the account. The emulator and `adb reverse` only need
// loopback; set HOST=0.0.0.0 only for a phone on your LAN, and only on a network
// you trust.
const HOST = process.env.HOST ?? '127.0.0.1';
const WEBHOOK_PORT = Number(process.env.WEBHOOK_PORT ?? 8789);
const DS_API = process.env.DIALSTACK_API_BASE_URL ?? 'https://api.dialstack.ai';
const DS_KEY = process.env.DIALSTACK_SECRET_KEY;
const DS_ACCOUNT = process.env.DIALSTACK_ACCOUNT;

// Optional for a local rig; a deployed backend must verify (see .env.example).
const WEBHOOK_SECRET = process.env.DIALSTACK_WEBHOOK_SECRET;

/** How long the mobile profile rings the user's cell. */
const MOBILE_RING_SECONDS = 30;

/** How long an incoming call rings the user's devices and cell together. */
const INBOUND_RING_SECONDS = 25;

/**
 * When a call still ringing the user's cell reads as not answered. No event
 * fires while it rings, and none at all if they never pick up, so this is the
 * only way the app learns the attempt is over. The margin covers carrier setup.
 */
const RING_TIMEOUT_MS = Number(
  process.env.C2C_RING_TIMEOUT_MS ?? (MOBILE_RING_SECONDS + 15) * 1000
);

/**
 * How long a hold, resume or hang-up waits for its outcome webhook. A command
 * DialStack accepted but could not deliver to the call reports nothing, so
 * without this the button would stay pending forever.
 */
const COMMAND_TIMEOUT_MS = Number(process.env.C2C_COMMAND_TIMEOUT_MS ?? 10_000);

if (!DS_KEY || !DS_ACCOUNT) {
  console.error('set DIALSTACK_SECRET_KEY and DIALSTACK_ACCOUNT');
  process.exit(2);
}

/**
 * The key the app's click-to-call names. It is yours to choose; hardcoding one
 * constant in both the backend and the call request is the point — nothing has
 * to look up or cache an id.
 */
const MOBILE_KEY = 'mobile';

/**
 * The mobile profile: one step ringing only the user's cell. Fallback is
 * hangup: the user asked to place a call, so if they don't pick up, sending the
 * attempt to their own voicemail makes no sense.
 */
function mobileProfile(number) {
  return {
    key: MOBILE_KEY,
    steps: [{ targets: [{ type: 'external', number }], timeout: MOBILE_RING_SECONDS }],
    fallback: 'hangup',
  };
}

class ApiError extends Error {
  constructor(status, body) {
    super(body?.error?.message ?? body?.message ?? `DialStack returned ${status}`);
    this.status = status;
  }
}

async function ds(method, path, body) {
  const res = await fetch(`${DS_API}${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${DS_KEY}`,
      'DialStack-Account': DS_ACCOUNT,
      ...(body ? { 'Content-Type': 'application/json' } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  const json = parseJson(text);
  // A proxy in front of the API can answer with an HTML or plain-text error, so
  // a body that is not JSON still reports the real status.
  if (!res.ok) throw new ApiError(res.status, json ?? { message: text || undefined });
  return json;
}

function parseJson(text) {
  try {
    return text ? JSON.parse(text) : null;
  } catch {
    return null;
  }
}

function mobileNumberOf(user) {
  const alt = user.config?.find_me_follow_me?.alternates?.find((a) => a.key === MOBILE_KEY);
  return alt?.steps?.[0]?.targets?.[0]?.number ?? null;
}

const isCell = (number) => (t) => t.type === 'external' && t.number === number;

/** Whether incoming calls ring the cell: it sits in the primary ladder's first step. */
function rings(user, number) {
  const first = user.config?.find_me_follow_me?.steps?.[0];
  return !!number && !!first?.targets?.some(isCell(number));
}

function profileOf(user) {
  const number = mobileNumberOf(user);
  return { number, inbound: rings(user, number) };
}

/**
 * The ladder this rig writes for a user on default routing is one step ringing
 * the user's own devices and their cell. Once the cell is taken out of it, what
 * is left is that step with the user alone. Recognised only together with the
 * removal, so an admin's ladder that merely looks like it is never touched.
 */
function isOurLadderWithoutCell(userId, steps) {
  const [only] = steps;
  return (
    steps.length === 1 &&
    only.targets.length === 1 &&
    only.targets[0].type === 'user' &&
    only.targets[0].id === userId
  );
}

/**
 * Sets the user's cell number and whether incoming calls ring it, keeping the
 * outbound alternate and the incoming step on the same number.
 *
 * Writing find_me_follow_me replaces the whole object, primary ladder and every
 * alternate. So read it, change only our parts, and send the rest back as it
 * was — anything else would wipe routing someone else configured.
 *
 * - The alternate is outbound only: inbound calls never read it.
 * - Incoming calls ring the cell only for a user on default routing (no
 *   steps): they get one step ringing their own devices and the cell together.
 *   confirm_external makes the cell press a key to take the call, so its
 *   voicemail cannot answer for the user. It applies to every external number
 *   on a ladder, so a user with custom routing is refused instead.
 * - A user on default routing with no cell for incoming calls keeps `steps: []`,
 *   which leaves their default routing exactly as it was.
 */
async function writeRouting(userId, change) {
  const user = await ds('GET', `/v1/users/${userId}`);
  const current = user.config?.find_me_follow_me ?? { steps: [] };
  const before = profileOf(user);
  const number = 'number' in change ? change.number : before.number;
  const inbound = !!number && (change.inbound ?? before.inbound);

  const others = (current.alternates ?? []).filter((a) => a.key !== MOBILE_KEY);
  const alternates = number ? [...others, mobileProfile(number)] : others;

  // Take the old cell out of the first step, then put the current one back.
  let steps = structuredClone(current.steps ?? []);
  if (before.inbound) {
    steps[0].targets = steps[0].targets.filter((t) => !isCell(before.number)(t));
    if (steps[0].targets.length === 0) steps.shift();
    if (isOurLadderWithoutCell(userId, steps)) steps = [];
  }

  let primary;
  if (inbound && steps.length === 0) {
    primary = {
      steps: [
        {
          targets: [
            { type: 'user', id: userId },
            { type: 'external', number },
          ],
          timeout: INBOUND_RING_SECONDS,
        },
      ],
      fallback: 'voicemail',
      confirm_external: true,
    };
  } else if (inbound) {
    // confirm_external covers every external number on the ladder, so turning
    // it on would change how someone else's targets answer. Custom routing is
    // the admin portal's to edit.
    throw new ApiError(409, {
      message: 'this user has custom call routing; add the cell to it in the admin portal',
    });
  } else if (steps.length > 0) {
    primary = { ...current, steps };
  } else {
    primary = { steps: [] }; // Default routing: no fallback or confirm_external.
  }

  let fmfm;
  if (alternates.length > 0 || primary.steps.length > 0) {
    fmfm = { ...primary, alternates };
  } else {
    fmfm = null; // Nothing left: clear it rather than store an empty object.
  }
  const updated = await ds('POST', `/v1/users/${userId}`, { config: { find_me_follow_me: fmfm } });
  return profileOf(updated);
}

// Concatenate the raw chunks BEFORE decoding: decoding each chunk on its own
// turns a multi-byte character split across chunks into U+FFFD, and a webhook
// body then no longer matches the bytes DialStack signed.
async function readBody(req) {
  const chunks = [];
  for await (const chunk of req) chunks.push(chunk);
  return Buffer.concat(chunks).toString('utf8');
}

async function readJson(req) {
  const raw = await readBody(req);
  const json = parseJson(raw);
  if (raw && json === null) throw new ApiError(400, { message: 'request body must be JSON' });
  return json ?? {};
}

/**
 * Verify `X-DialStack-Signature: t=<unix>,v1=<hex>`: HMAC-SHA256 over
 * `{timestamp}.{raw_body}` with the endpoint secret, over the raw bytes as
 * received. The timestamp tolerance bounds replay.
 */
function verifySignature(header, rawBody, secret) {
  if (!secret) return { ok: true };
  if (!header) return { ok: false, reason: 'missing X-DialStack-Signature' };
  const parts = Object.fromEntries(
    header.split(',').map((kv) => {
      const i = kv.indexOf('=');
      return [kv.slice(0, i).trim(), kv.slice(i + 1).trim()];
    })
  );
  if (!parts.t || !parts.v1) return { ok: false, reason: 'malformed signature header' };
  const age = Math.abs(Date.now() / 1000 - Number(parts.t));
  if (!Number.isFinite(age) || age > 300) {
    return { ok: false, reason: `timestamp outside tolerance (${Math.round(age)}s)` };
  }
  const expected = Buffer.from(
    createHmac('sha256', secret).update(`${parts.t}.${rawBody}`).digest('hex')
  );
  const got = Buffer.from(parts.v1);
  if (expected.length !== got.length || !timingSafeEqual(expected, got)) {
    return { ok: false, reason: 'signature mismatch' };
  }
  return { ok: true };
}

/**
 * user_id -> the call placed from the app, advanced by webhooks.
 *
 * POST /v1/calls returns no call id, so the record is bound to one when the
 * first event arrives: call.initiated for this user, to the number we dialed.
 * Everything after that matches on call_id.
 */
const calls = new Map();
/** user_id -> open WebSockets watching that user's call. */
const watchers = new Map();
const ringTimers = new Map();
/**
 * Users whose POST /v1/calls is still awaiting DialStack. Kept apart from
 * `calls` so the apps never see a phase they don't know.
 */
const placing = new Set();
/**
 * user_id -> the command in flight: its token and its timeout. The token rides
 * in the command's metadata and comes back on its outcome, so a late outcome or
 * timeout from an earlier command can never settle a newer one.
 */
const commands = new Map();
let lastCommand = 0;

const snapshot = (userId) => JSON.stringify(calls.get(userId) ?? null);

function replace(userId, record) {
  calls.set(userId, record);
  const message = snapshot(userId);
  for (const ws of watchers.get(userId) ?? []) ws.send(message);
}

const update = (userId, patch) => replace(userId, { ...calls.get(userId), ...patch });

function stopRingTimer(userId) {
  clearTimeout(ringTimers.get(userId));
  ringTimers.delete(userId);
}

function stopCommand(userId) {
  clearTimeout(commands.get(userId)?.timer);
  commands.delete(userId);
}

const isCurrentCommand = (userId, token) => commands.get(userId)?.token === token;

function startCall(userId, to) {
  stopRingTimer(userId);
  stopCommand(userId);
  replace(userId, { to, phase: 'calling_you', requestedAt: new Date().toISOString() });
  ringTimers.set(
    userId,
    setTimeout(() => {
      ringTimers.delete(userId);
      if (calls.get(userId)?.phase === 'calling_you') update(userId, { phase: 'not_answered' });
    }, RING_TIMEOUT_MS)
  );
}

/**
 * DialStack normalizes the dial string before reporting it, so "2025550101"
 * comes back as "+12025550101" while an extension comes back as typed. Compare
 * digits, allowing for the NANP country code the normalization adds.
 */
function sameDestination(dialed, reported) {
  const a = dialed.replace(/\D/g, '');
  const b = (reported ?? '').replace(/\D/g, '');
  return a === b || `1${a}` === b;
}

function recordFor(callId) {
  for (const [userId, call] of calls) if (call.callId === callId) return userId;
  return null;
}

/** Applies one webhook; returns the user whose call it moved, or null. */
function applyEvent(type, d) {
  if (type === 'call.initiated') {
    const call = calls.get(d.user);
    if (call?.phase !== 'calling_you' || !sameDestination(call.to, d.to_number)) return null;
    stopRingTimer(d.user);
    update(d.user, { phase: 'dialing', callId: d.call_id });
    return d.user;
  }
  const userId = recordFor(d.call_id);
  // Webhooks are not delivered in order, and a retry can arrive late: nothing
  // after call.end may bring the call back.
  if (!userId || calls.get(userId).phase === 'ended') return null;
  if (type === 'call.answered') {
    if (calls.get(userId).phase !== 'dialing') return null;
    update(userId, { phase: 'connected', connectedAt: d.connected_at ?? d.answered_at });
  } else if (type === 'call.command_succeeded' || type === 'call.command_failed') {
    return applyOutcome(userId, type === 'call.command_succeeded', d);
  } else if (type === 'call.end') {
    stopCommand(userId);
    // A destination that never picks up still ends as `completed`, with a
    // duration counted from when the user answered their own phone. Report it
    // as what it was, so no consumer of this record has to know the trick.
    const connectedAt = d.connected_at ?? calls.get(userId).connectedAt;
    const noAnswer = !connectedAt && d.status === 'completed';
    update(userId, {
      phase: 'ended',
      status: noAnswer ? 'no-answer' : d.status,
      durationSeconds: noAnswer ? undefined : d.duration_seconds,
      connectedAt,
      held: false,
      pending: null,
    });
  } else {
    return null;
  }
  return userId;
}

/**
 * Which verbs each phase accepts. The call id only exists once the user has
 * answered their own phone (call.initiated), so nothing can be sent while it
 * rings. Hold needs both parties: before the destination answers there is no
 * one to hold.
 */
const VERBS_BY_PHASE = {
  dialing: ['hangup'],
  connected: ['hangup', 'hold', 'unhold'],
};

/**
 * Sends hold, unhold or hangup for the user's current call. DialStack answers
 * 202 at once and reports the result later as call.command_succeeded or
 * call.command_failed, so the record carries the verb as `pending` until then.
 * Hold always names the destination (`callee`): the user is on their own cell,
 * so it is the other side that should hear hold music.
 */
async function sendVerb(userId, verb) {
  const call = calls.get(userId);
  if (!call?.callId || !VERBS_BY_PHASE[call.phase]?.includes(verb)) {
    throw new ApiError(409, {
      message: `cannot ${verb} a call that is ${call?.phase ?? 'not placed'}`,
    });
  }
  const token = String(++lastCommand);
  const body = { metadata: { user_id: userId, command: token } };
  if (verb !== 'hangup') body.party = 'callee';

  // Pending and timed BEFORE the request: the outcome webhook can arrive
  // before DialStack's 202 does.
  stopCommand(userId);
  commands.set(userId, {
    token,
    timer: setTimeout(() => {
      if (!isCurrentCommand(userId, token)) return;
      commands.delete(userId);
      if (verb === 'hangup') endUnconfirmed(userId);
      else update(userId, { pending: null, error: 'timeout' });
    }, COMMAND_TIMEOUT_MS),
  });
  update(userId, { pending: verb, error: null });
  try {
    await ds('POST', `/v1/calls/${call.callId}/${verb}`, body);
  } catch (err) {
    if (isCurrentCommand(userId, token)) {
      stopCommand(userId);
      update(userId, { pending: null });
    }
    throw err;
  }
}

/**
 * A hang-up that fails or goes unanswered most likely means the call is already
 * gone and its call.end never reached the rig (a dropped tunnel, say). End the
 * record anyway: a call that looks live blocks every new one, and if it really
 * is still up, the user can hang up on their own phone.
 */
function endUnconfirmed(userId) {
  update(userId, { phase: 'ended', held: false, pending: null });
}

/**
 * A hang-up's success is not the end of the call; call.end is. So it stays
 * pending ("Ending…") until that arrives, and only its failure clears it here.
 */
function applyOutcome(userId, succeeded, d) {
  if (!isCurrentCommand(userId, d.metadata?.command)) return null;
  if (succeeded && d.verb === 'hangup') return userId;
  stopCommand(userId);
  if (!succeeded && d.verb === 'hangup') {
    endUnconfirmed(userId);
  } else if (!succeeded) {
    update(userId, { pending: null, error: d.reason ?? 'failed' });
  } else {
    update(userId, { pending: null, held: d.verb === 'hold' });
  }
  return userId;
}

function send(res, status, body) {
  res.writeHead(status, { 'Content-Type': 'application/json' });
  res.end(body === undefined ? '' : JSON.stringify(body));
}

const MOBILE_PATH = /^\/users\/(user_[a-z0-9]+)\/mobile$/;
const CALL_STREAM_PATH = /^\/users\/(user_[a-z0-9]+)\/call\/stream$/;
const CALL_VERB_PATH = /^\/users\/(user_[a-z0-9]+)\/call\/(hangup|hold|unhold)$/;

const server = createServer(async (req, res) => {
  const url = new URL(req.url, 'http://localhost');
  console.log(`${req.method} ${url.pathname}`);
  try {
    if (req.method === 'GET' && url.pathname === '/users') {
      // First page only, display-safe fields only. A real product never hands a
      // client the account's user list — this is the demo's picker.
      const list = await ds('GET', '/v1/users?limit=100');
      return send(res, 200, {
        users: list.data.map((u) => ({ id: u.id, name: u.name ?? null, email: u.email ?? null })),
      });
    }

    const mobile = url.pathname.match(MOBILE_PATH);
    if (mobile) {
      const userId = mobile[1];
      if (req.method === 'GET') {
        return send(res, 200, profileOf(await ds('GET', `/v1/users/${userId}`)));
      }
      if (req.method === 'POST') {
        const { number, inbound } = await readJson(req);
        const change = {};
        if (number !== undefined) {
          if (typeof number !== 'string' || !number.startsWith('+')) {
            return send(res, 400, { error: 'number must be E.164, e.g. +14165551234' });
          }
          change.number = number;
        }
        if (inbound !== undefined) {
          if (typeof inbound !== 'boolean') {
            return send(res, 400, { error: 'inbound must be true or false' });
          }
          change.inbound = inbound;
        }
        return send(res, 200, await writeRouting(userId, change));
      }
      if (req.method === 'DELETE') {
        return send(res, 200, await writeRouting(userId, { number: null }));
      }
    }

    if (req.method === 'POST' && url.pathname === '/calls') {
      const { user_id: userId, to } = await readJson(req);
      if (!userId || !to) return send(res, 400, { error: 'user_id and to are required' });
      // The record is the only handle on a live call: replacing it would leave
      // that call with nothing to hold or end it from. A call still ringing the
      // cell has no id yet, so a new one may take its place. A request still
      // awaiting DialStack counts as in progress, so a double tap can't place two.
      if (placing.has(userId) || calls.get(userId)?.phase in VERBS_BY_PHASE) {
        throw new ApiError(409, { message: 'a call is already in progress' });
      }
      placing.add(userId);
      try {
        // The request names the profile, never a phone number: the cell number
        // is stored on the user, so no client can make the account dial an
        // arbitrary PSTN number. An unknown key is a 400 from DialStack, never a
        // silent fall back to ringing the user's desk phone.
        await ds('POST', '/v1/calls', {
          user: userId,
          dial_string: to,
          find_me_follow_me_key: MOBILE_KEY,
        });
        // 202 with no body: DialStack returns no call id to track. The status
        // record starts here and webhooks advance it.
        startCall(userId, to);
      } finally {
        placing.delete(userId);
      }
      return send(res, 202);
    }

    const verb = url.pathname.match(CALL_VERB_PATH);
    if (verb && req.method === 'POST') {
      await sendVerb(verb[1], verb[2]);
      return send(res, 202);
    }

    send(res, 404, { error: 'not found' });
  } catch (err) {
    console.error(`  -> ${err.status ?? 500} ${err.message}`);
    send(res, err instanceof ApiError ? err.status : 500, { error: err.message });
  }
});

// The app watches its user's call over a WebSocket: webhooks arrive here, not
// on the phone, so the rig relays each change. The first message is the current
// state, which is also how a reconnecting app catches up.
const wss = new WebSocketServer({ noServer: true });
server.on('upgrade', (req, socket, head) => {
  const match = new URL(req.url, 'http://localhost').pathname.match(CALL_STREAM_PATH);
  if (!match) return socket.destroy();
  const userId = match[1];
  wss.handleUpgrade(req, socket, head, (ws) => {
    const set = watchers.get(userId) ?? new Set();
    set.add(ws);
    watchers.set(userId, set);
    ws.on('close', () => {
      set.delete(ws);
      if (!set.size) watchers.delete(userId);
    });
    ws.send(snapshot(userId));
  });
});

/**
 * DialStack's webhooks arrive on a listener of their own, so a public tunnel
 * pointed at it reaches this one route and nothing else. Tunnel the main port
 * and anyone with the URL could rewrite routing and place calls on the account.
 */
const webhookServer = createServer(async (req, res) => {
  const url = new URL(req.url, 'http://localhost');
  if (req.method !== 'POST' || url.pathname !== '/webhooks/dialstack') {
    return send(res, 404, { error: 'not found' });
  }
  try {
    const raw = await readBody(req);
    const check = verifySignature(req.headers['x-dialstack-signature'], raw, WEBHOOK_SECRET);
    if (!check.ok) {
      console.warn(`webhook REJECTED: ${check.reason}`);
      return send(res, 400, { error: `signature: ${check.reason}` });
    }
    const evt = parseJson(raw) ?? {};
    const moved = applyEvent(evt.type, evt.data ?? {});
    console.log(
      `webhook ${evt.type ?? 'unknown'} ${evt.data?.call_id ?? ''} -> ${moved ? calls.get(moved).phase : 'ignored'}`
    );
    send(res, 200, moved ? { ok: true } : { ignored: evt.type });
  } catch (err) {
    console.error(`webhook -> 500 ${err.message}`);
    send(res, 500, { error: err.message });
  }
});

if (!WEBHOOK_SECRET) {
  console.warn('no DIALSTACK_WEBHOOK_SECRET: accepting unsigned webhooks (local rig only)');
}

server.listen(PORT, HOST, () => {
  console.log(`click-to-call rig on ${HOST}:${PORT} → ${DS_API} (account ${DS_ACCOUNT})`);
});
webhookServer.listen(WEBHOOK_PORT, '127.0.0.1', () => {
  console.log(`webhooks on 127.0.0.1:${WEBHOOK_PORT}/webhooks/dialstack — tunnel this port only`);
});
