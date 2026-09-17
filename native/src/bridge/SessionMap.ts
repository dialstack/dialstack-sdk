/**
 * Bijection between DialStack call ids and OS session ids.
 *
 * One map, scanned for the reverse lookup rather than mirrored into a second
 * one: at most a handful of calls are ever live, so the scan is free, and a
 * single source of truth cannot drift into a half-updated pair that maps a
 * session to the wrong call.
 */
export class SessionMap {
  private readonly sessionByCall = new Map<string, string>();

  /** Any pairing either side already had is broken to keep the mapping a bijection. */
  link(callId: string, sessionId: string): void {
    this.forgetSession(sessionId);
    this.sessionByCall.set(callId, sessionId);
  }

  sessionFor(callId: string): string | undefined {
    return this.sessionByCall.get(callId);
  }

  callFor(sessionId: string): string | undefined {
    for (const [call, session] of this.sessionByCall) {
      if (session === sessionId) return call;
    }
    return undefined;
  }

  forgetCall(callId: string): void {
    this.sessionByCall.delete(callId);
  }

  forgetSession(sessionId: string): void {
    const callId = this.callFor(sessionId);
    if (callId !== undefined) this.sessionByCall.delete(callId);
  }
}
