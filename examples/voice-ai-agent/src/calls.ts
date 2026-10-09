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

const pending = new Map<string, CallerDetails>();

export function rememberCall(callId: string, details: CallerDetails): void {
  pending.set(callId, details);
  setTimeout(() => pending.delete(callId), TTL_MS).unref();
}

export function takeCall(callId: string): CallerDetails | undefined {
  const details = pending.get(callId);
  pending.delete(callId);
  return details;
}
