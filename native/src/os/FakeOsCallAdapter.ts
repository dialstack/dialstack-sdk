import type {
  OsActiveSession,
  OsCallAdapter,
  OsCallEventName,
  OsCallEvents,
  OsEndReason,
  OsIncomingCall,
  OsOutgoingCall,
  OsSessionId,
} from './OsCallAdapter';

/**
 * Only these survive until JS subscribes. This mirrors expo-callkit-telecom,
 * where every other event has a queue limit of 0 and is dropped if no listener
 * is mounted — the bridge must never depend on a late `setHeld` or `end`.
 */
const REPLAYED: ReadonlySet<OsCallEventName> = new Set<OsCallEventName>([
  'incomingReported',
  'answer',
  'audioSessionActivated',
]);

type Listener = (e: never) => void;

export interface FakeOsCallAdapterOptions {
  /** expo-callkit-telecom re-emits its own set* actions; default on so the bridge is tested against that. */
  echoSetActions?: boolean;
  /**
   * Whether the OS library accepts more than one concurrent call session. Default
   * false models the shipped expo-callkit-telecom / callkeep adapters, which
   * reject a second reportIncoming ("one call at a time"). Set true to model a
   * library that accepts call-waiting — used to test that the bridge itself stays
   * agnostic and reports a second call rather than enforcing single-call.
   */
  multiCall?: boolean;
}

/**
 * In-memory OS. The `os` side (`nativeReportIncoming`, `answer`, `end`, …)
 * plays the platform: it is what a test drives, and what a real adapter's
 * native code does on a device.
 */
export class FakeOsCallAdapter implements OsCallAdapter {
  private readonly listeners = new Map<OsCallEventName, Set<Listener>>();
  private readonly queued = new Map<OsCallEventName, unknown[]>();
  private readonly sessions = new Map<OsSessionId, OsActiveSession & { connected: boolean }>();
  private readonly echo: boolean;
  private readonly multiCall: boolean;
  private minted = 0;

  readonly log: string[] = [];

  constructor(options: FakeOsCallAdapterOptions = {}) {
    this.echo = options.echoSetActions ?? true;
    this.multiCall = options.multiCall ?? false;
  }

  // --- OsCallAdapter (what the bridge calls) ---

  async reportIncoming(call: OsIncomingCall): Promise<OsSessionId> {
    if (!this.multiCall && this.sessions.size > 0) {
      throw new Error('FakeOsCallAdapter: one call at a time');
    }
    this.minted += 1;
    const sessionId = `fake-session-${this.minted}`;
    this.sessions.set(sessionId, { sessionId, callId: call.callId, connected: false });
    this.log.push(`reportIncoming ${sessionId} ${call.from}`);
    this.emit('incomingReported', { sessionId, callId: call.callId });
    return sessionId;
  }

  async reportOutgoing(call: OsOutgoingCall): Promise<OsSessionId> {
    if (this.sessions.size > 0) {
      throw new Error('FakeOsCallAdapter: one call at a time');
    }
    this.minted += 1;
    const sessionId = `fake-session-${this.minted}`;
    // No callId yet — the bridge links it after phone.call() returns.
    this.sessions.set(sessionId, { sessionId, callId: null, connected: false });
    this.log.push(`reportOutgoing ${sessionId} ${call.to}`);
    return sessionId;
  }

  async reportConnected(sessionId: OsSessionId): Promise<void> {
    const s = this.require(sessionId, 'reportConnected');
    s.connected = true;
    this.log.push(`reportConnected ${sessionId}`);
  }

  async reportEnded(sessionId: OsSessionId, reason: OsEndReason): Promise<void> {
    this.require(sessionId, 'reportEnded');
    this.sessions.delete(sessionId);
    this.log.push(`reportEnded ${sessionId} ${reason}`);
  }

  async setHeld(sessionId: OsSessionId, held: boolean): Promise<void> {
    this.require(sessionId, 'setHeld');
    this.log.push(`setHeld ${sessionId} ${held}`);
    if (this.echo) this.emit('setHeld', { sessionId, held });
  }

  async setMuted(sessionId: OsSessionId, muted: boolean): Promise<void> {
    this.require(sessionId, 'setMuted');
    this.log.push(`setMuted ${sessionId} ${muted}`);
    if (this.echo) this.emit('setMuted', { sessionId, muted });
  }

  async getActiveSession(): Promise<OsActiveSession | null> {
    const first = this.sessions.values().next();
    if (first.done) return null;
    return { sessionId: first.value.sessionId, callId: first.value.callId };
  }

  on<K extends OsCallEventName>(event: K, listener: OsCallEvents[K]): () => void {
    let set = this.listeners.get(event);
    if (!set) {
      set = new Set();
      this.listeners.set(event, set);
    }
    set.add(listener as Listener);
    const pending = this.queued.get(event);
    if (pending) {
      this.queued.delete(event);
      for (const e of pending) (listener as (e: unknown) => void)(e);
    }
    return () => {
      set?.delete(listener as Listener);
    };
  }

  // --- the OS side (what native code / the user does) ---

  /** Native reported the call before any JS existed (FCM service / PushKit handler). */
  nativeReportIncoming(session: OsActiveSession): void {
    this.sessions.set(session.sessionId, { ...session, connected: false });
    this.emit('incomingReported', session);
  }

  /** The user dialled from the OS's own UI (Recents / Siri / dialer). */
  nativeCallIntent(handle: string): void {
    this.emit('callIntent', { handle });
  }

  async answer(sessionId: OsSessionId): Promise<void> {
    this.emit('answer', { sessionId });
  }

  /** The user ended/declined from the OS surface. The session is gone from the OS's view. */
  async end(sessionId: OsSessionId): Promise<void> {
    this.sessions.delete(sessionId);
    this.emit('end', { sessionId });
  }

  hold(sessionId: OsSessionId, held: boolean): void {
    this.emit('setHeld', { sessionId, held });
  }

  mute(sessionId: OsSessionId, muted: boolean): void {
    this.emit('setMuted', { sessionId, muted });
  }

  dtmf(sessionId: OsSessionId, digits: string): void {
    this.emit('dtmf', { sessionId, digits });
  }

  isConnected(sessionId: OsSessionId): boolean {
    return this.sessions.get(sessionId)?.connected ?? false;
  }

  sessionCount(): number {
    return this.sessions.size;
  }

  // --- internals ---

  private require(sessionId: OsSessionId, op: string) {
    const s = this.sessions.get(sessionId);
    if (!s) throw new Error(`FakeOsCallAdapter: ${op} on unknown session ${sessionId}`);
    return s;
  }

  private emit<K extends OsCallEventName>(event: K, e: Parameters<OsCallEvents[K]>[0]): void {
    const set = this.listeners.get(event);
    if (!set || set.size === 0) {
      if (REPLAYED.has(event)) {
        const q = this.queued.get(event) ?? [];
        q.push(e);
        this.queued.set(event, q);
      }
      return;
    }
    for (const l of [...set]) (l as (e: unknown) => void)(e);
  }
}
