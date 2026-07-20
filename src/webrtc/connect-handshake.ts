import { PhoneError } from './errors';

// All state for the single in-flight connect(), in one object so the three guards
// that used to be loose fields on DialStackPhone move together. connect() spans
// two windows no single signal covers, plus the promise waiter:
//   1. `token`     — the pre-socket ICE-fetch window (no frame exists yet, so a
//      mid-fetch disconnect() is detected by object identity). Also the
//      concurrent-connect guard.
//   2. `authReqId` — the post-open authenticate wait; the `authenticated`/`error`
//      must echo it to be ours.
//   3. `resolvers` — the connect() promise, settled on the correlated reply.
export class ConnectHandshake {
  private token: object | null = null;
  private authReqId: string | null = null;
  private resolvers: { resolve: () => void; reject: (err: PhoneError) => void } | null = null;

  begin(): object {
    const token = {};
    this.token = token;
    return token;
  }

  get inFlight(): boolean {
    return this.token !== null;
  }

  isTokenCurrent(token: object): boolean {
    return this.token === token;
  }

  // No-op if a later begin() already replaced the token (its window owns it now).
  releaseToken(token: object): void {
    if (this.token === token) this.token = null;
  }

  stampAuth(reqId: string): void {
    this.authReqId = reqId;
  }

  matches(reqId: string | null | undefined): boolean {
    return this.authReqId !== null && reqId === this.authReqId;
  }

  // A frame is a stale echo only if it carries a DIFFERENT id than the outstanding
  // one. A frame omitting req_id is NOT stale — the server echoes it only when
  // present, and dropping an unattributed frame would hang connect() to its timeout.
  isStaleEcho(reqId: string | null | undefined): boolean {
    return this.authReqId !== null && reqId != null && reqId !== this.authReqId;
  }

  get isAuthOutstanding(): boolean {
    return this.authReqId !== null;
  }

  clearAuth(): void {
    this.authReqId = null;
  }

  // `onSettle` (clears the timeout/token) is a callback so the timeout wiring stays
  // in connect().
  awaitAuth(resolve: () => void, reject: (err: PhoneError) => void, onSettle: () => void): void {
    this.resolvers = {
      resolve: () => {
        onSettle();
        this.resolvers = null;
        resolve();
      },
      reject: (err) => {
        onSettle();
        this.resolvers = null;
        reject(err);
      },
    };
  }

  get hasWaiter(): boolean {
    return this.resolvers !== null;
  }

  resolve(): void {
    this.resolvers?.resolve();
  }

  reject(err: PhoneError): void {
    this.resolvers?.reject(err);
  }

  // Detach the waiter without settling it, so the caller can reject with a specific
  // error after tearing the socket down (else disconnect()'s abort() would reject
  // it first with a generic transport_closed).
  takeWaiter(): { resolve: () => void; reject: (err: PhoneError) => void } | null {
    const r = this.resolvers;
    this.resolvers = null;
    return r;
  }

  // Abort any in-flight connect() from disconnect(): a resumed connect() bails on
  // the cleared token, no late frame matches the cleared id, and the waiter rejects.
  abort(): void {
    this.token = null;
    this.authReqId = null;
    this.reject(
      new PhoneError({
        code: 'transport_closed',
        message: 'Disconnected before the softphone finished connecting',
      })
    );
  }
}
