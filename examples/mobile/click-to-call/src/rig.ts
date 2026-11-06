import { RIG_URL } from '@/config';

export interface RigUser {
  id: string;
  name: string | null;
  email: string | null;
}

async function request<T>(method: string, path: string, body?: unknown): Promise<T> {
  const res = await fetch(`${RIG_URL}${path}`, {
    method,
    headers: body ? { 'Content-Type': 'application/json' } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  const json = text ? JSON.parse(text) : null;
  if (!res.ok) throw new Error(json?.error ?? `rig returned ${res.status}`);
  return json as T;
}

export async function listUsers(): Promise<RigUser[]> {
  return (await request<{ users: RigUser[] }>('GET', '/users')).users;
}

/** The user's cell, and whether incoming calls ring it too. */
export interface MobileProfile {
  number: string | null;
  inbound: boolean;
}

export function getMobileProfile(userId: string): Promise<MobileProfile> {
  return request('GET', `/users/${userId}/mobile`);
}

export function setMobileNumber(userId: string, number: string): Promise<MobileProfile> {
  return request('POST', `/users/${userId}/mobile`, { number });
}

export function setInboundToCell(userId: string, inbound: boolean): Promise<MobileProfile> {
  return request('POST', `/users/${userId}/mobile`, { inbound });
}

export function removeMobileNumber(userId: string): Promise<MobileProfile> {
  return request('DELETE', `/users/${userId}/mobile`);
}

/**
 * Only the destination travels. The number that rings is the one stored on the
 * user's mobile profile, so the app never tells the backend which phone to call.
 */
export async function clickToCall(userId: string, to: string): Promise<void> {
  await request('POST', '/calls', { user_id: userId, to });
}

export type CallPhase = 'calling_you' | 'dialing' | 'connected' | 'ended' | 'not_answered';

export type CallVerb = 'hangup' | 'hold' | 'unhold';

/**
 * Hold, resume or hang up the user's current call. Accepted at once; the
 * result comes back on the call record, as `pending` clearing.
 */
export async function controlCall(userId: string, verb: CallVerb): Promise<void> {
  await request('POST', `/users/${userId}/call/${verb}`);
}

/** The rig's view of the call placed from this app, advanced by DialStack webhooks. */
export interface CallRecord {
  to: string;
  phase: CallPhase;
  requestedAt: string;
  connectedAt?: string;
  status?: string;
  durationSeconds?: number;
  /** The destination is on hold. */
  held?: boolean;
  /** A command sent and not yet confirmed. A hang-up stays pending until the call ends. */
  pending?: CallVerb | null;
  /** Why the last command failed, or "timeout" if it never reported. */
  error?: string | null;
}

/** The call is over: it ended, or was never connected. */
export const isFinished = (call: CallRecord) =>
  call.phase === 'ended' || call.phase === 'not_answered';

/**
 * Watches the user's call over a WebSocket; commands go out over HTTP
 * (controlCall) and come back here as changes to the record. Reconnects while subscribed — the socket drops when the app backgrounds or
 * Wi-Fi blips — and the first message after a reconnect is the current state.
 */
export function subscribeToCall(
  userId: string,
  onUpdate: (call: CallRecord | null) => void
): () => void {
  let socket: WebSocket | null = null;
  let retry: ReturnType<typeof setTimeout> | undefined;
  let closed = false;

  const connect = () => {
    socket = new WebSocket(`${RIG_URL.replace(/^http/, 'ws')}/users/${userId}/call/stream`);
    socket.onmessage = (e) => onUpdate(JSON.parse(String(e.data)) as CallRecord | null);
    socket.onclose = () => {
      if (!closed) retry = setTimeout(connect, 2000);
    };
  };
  connect();

  return () => {
    closed = true;
    clearTimeout(retry);
    socket?.close();
  };
}
