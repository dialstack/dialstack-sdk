// The media WebSocket isn't authenticated; the signed `call.received` webhook
// is. Only a call ID we attached from a verified webhook gets a session, and
// its account and caller details come from that webhook, never from the
// socket's `begin` message. Entries are held briefly, until DialStack opens
// the media socket.

const TTL_MS = 60_000;

interface CallerDetails {
  accountId: string;
  fromNumber: string;
  toNumber: string;
}

// Each entry owns its expiry, so remembering a call again (attaching its
// agent a second time) is never cut short by the earlier entry's timer.
const pending = new Map<string, { details: CallerDetails; expiry: NodeJS.Timeout }>();

export function rememberCall(callId: string, details: CallerDetails): void {
  clearTimeout(pending.get(callId)?.expiry);
  const expiry = setTimeout(() => pending.delete(callId), TTL_MS);
  expiry.unref?.();
  pending.set(callId, { details, expiry });
}

export function takeCall(callId: string): CallerDetails | undefined {
  const entry = pending.get(callId);
  if (!entry) return undefined;
  clearTimeout(entry.expiry);
  pending.delete(callId);
  return entry.details;
}
