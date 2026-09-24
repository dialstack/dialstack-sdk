import { RIG_URL } from './config';

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

export async function getMobileNumber(userId: string): Promise<string | null> {
  return (await request<{ number: string | null }>('GET', `/users/${userId}/mobile`)).number;
}

export async function setMobileNumber(userId: string, number: string): Promise<string | null> {
  return (await request<{ number: string | null }>('POST', `/users/${userId}/mobile`, { number }))
    .number;
}

export async function removeMobileNumber(userId: string): Promise<void> {
  await request('DELETE', `/users/${userId}/mobile`);
}

/**
 * Only the destination travels. The number that rings is the one stored on the
 * user's mobile profile, so the app never tells the backend which phone to call.
 */
export async function clickToCall(userId: string, to: string): Promise<void> {
  await request('POST', '/calls', { user_id: userId, to });
}

export type CallPhase = 'calling_you' | 'dialing' | 'connected' | 'ended' | 'not_answered';

/** The rig's view of the call placed from this app, advanced by DialStack webhooks. */
export interface CallRecord {
  to: string;
  phase: CallPhase;
  requestedAt: string;
  connectedAt?: string;
  status?: string;
  durationSeconds?: number;
}

/**
 * Watches the user's call over a WebSocket. Read-only: the call itself is
 * controlled from the phone's own call screen, so nothing is ever sent back.
 * Reconnects while subscribed — the socket drops when the app backgrounds or
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
