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
  private readonly sessions = new Map<
    OsSessionId,
    OsActiveSession & { connected: boolean; answerRequested: boolean; onHold?: boolean }
  >();
  private readonly echo: boolean;
  private readonly multiCall: boolean;
  private minted = 0;

  readonly log: string[] = [];
  private readonly injectedFailures = new Map<string, number>();
  private readonly ignored = new Map<string, number>();

  constructor(options: FakeOsCallAdapterOptions = {}) {
    this.echo = options.echoSetActions ?? true;
    this.multiCall = options.multiCall ?? false;
  }

  // --- OsCallAdapter (what the bridge calls) ---

  async reportIncoming(call: OsIncomingCall): Promise<OsSessionId> {
    this.maybeFail('reportIncoming');
    if (!this.multiCall && this.sessions.size > 0) {
      throw new Error('FakeOsCallAdapter: one call at a time');
    }
    this.minted += 1;
    const sessionId = `fake-session-${this.minted}`;
    this.sessions.set(sessionId, {
      sessionId,
      callId: call.callId,
      connected: false,
      answerRequested: false,
    });
    this.log.push(`reportIncoming ${sessionId} ${call.from}`);
    this.emit('incomingReported', { sessionId, callId: call.callId });
    return sessionId;
  }

  async reportOutgoing(call: OsOutgoingCall): Promise<OsSessionId> {
    this.maybeFail('reportOutgoing');
    if (this.sessions.size > 0) {
      throw new Error('FakeOsCallAdapter: one call at a time');
    }
    this.minted += 1;
    const sessionId = `fake-session-${this.minted}`;
    // No callId yet — the bridge links it after phone.call() returns.
    this.sessions.set(sessionId, {
      sessionId,
      callId: null,
      connected: false,
      answerRequested: false,
    });
    this.log.push(`reportOutgoing ${sessionId} ${call.to}`);
    return sessionId;
  }

  async reportConnected(sessionId: OsSessionId): Promise<void> {
    const s = this.require(sessionId, 'reportConnected');
    if (!this.takeIgnored('reportConnected')) s.connected = true;
    this.log.push(`reportConnected ${sessionId}`);
  }

  async reportEnded(sessionId: OsSessionId, reason: OsEndReason): Promise<void> {
    this.require(sessionId, 'reportEnded');
    this.sessions.delete(sessionId);
    this.log.push(`reportEnded ${sessionId} ${reason}`);
  }

  async setHeld(sessionId: OsSessionId, held: boolean): Promise<void> {
    const s = this.require(sessionId, 'setHeld');
    if (!this.takeIgnored('setHeld')) s.onHold = held;
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
    return this.view(first.value);
  }

  private view(
    s: OsActiveSession & { connected: boolean; answerRequested: boolean; onHold?: boolean }
  ): OsActiveSession {
    const status = s.connected ? 'connected' : s.answerRequested ? 'connecting' : 'ringing';
    return { sessionId: s.sessionId, callId: s.callId, status, held: s.onHold ?? false };
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

  /**
   * Native reported the call before any JS existed (FCM service / PushKit handler).
   *
   * `callId` is the call_id the wake push carried, reported on
   * `incomingReported` so the bridge can pair the session with its call. Pass
   * `callId: null` for a push that carried none.
   */
  nativeReportIncoming(session: OsActiveSession): void {
    this.sessions.set(session.sessionId, {
      ...session,
      connected: false,
      answerRequested: false,
    });
    this.emit('incomingReported', session);
  }

  /** The user dialled from the OS's own UI (Recents / Siri / dialer). */
  nativeCallIntent(handle: string): void {
    this.emit('callIntent', { handle });
  }

  /**
   * The user answered, from the OS surface or via the adapter's `answer`.
   *
   * Modelled as a REQUEST, which is what both platforms do: CallKit's
   * CXAnswerCallAction and Telecom's answer leave the call alerting until the
   * app reports it connected. Forgetting that report is invisible in a unit test
   * that only checks the SDK call answered — but on a device it is a phone that
   * never stops ringing, so the fake tracks it and `stillAlerting()` asserts it.
   */
  async answer(sessionId: OsSessionId): Promise<void> {
    this.maybeFail('answer');
    const s = this.sessions.get(sessionId);
    if (s) s.answerRequested = true;
    this.emit('answer', { sessionId });
  }

  /**
   * Sessions the user answered that were never reported connected — the OS is
   * still showing its incoming UI for each one.
   */
  stillAlerting(): OsSessionId[] {
    return [...this.sessions.values()]
      .filter((s) => s.answerRequested && !s.connected)
      .map((s) => s.sessionId);
  }

  /** The user ended/declined from the OS surface. The session is gone from the OS's view. */
  async end(sessionId: OsSessionId): Promise<void> {
    this.maybeFail('end');
    this.sessions.delete(sessionId);
    this.emit('end', { sessionId });
  }

  hold(sessionId: OsSessionId, held: boolean): void {
    const s = this.sessions.get(sessionId);
    if (s) s.onHold = held;
    this.emit('setHeld', { sessionId, held });
  }

  mute(sessionId: OsSessionId, muted: boolean): void {
    this.emit('setMuted', { sessionId, muted });
  }

  dtmf(sessionId: OsSessionId, digits: string): void {
    this.emit('dtmf', { sessionId, digits });
  }

  /**
   * The OS dropped a report it accepted: the session stays where it was, as iOS
   * leaves an incoming call ringing after a connected report.
   */
  ignoreNext(op: 'reportConnected' | 'setHeld', times = 1): void {
    this.ignored.set(op, times);
  }

  isConnected(sessionId: OsSessionId): boolean {
    return this.sessions.get(sessionId)?.connected ?? false;
  }

  sessionCount(): number {
    return this.sessions.size;
  }

  // --- internals ---

  /** Make the next `times` calls to adapter method `op` reject, as a real OS layer can. */
  failNext(op: keyof OsCallAdapter, times = 1): void {
    this.injectedFailures.set(op, times);
  }

  private maybeFail(op: string): void {
    const left = this.injectedFailures.get(op) ?? 0;
    if (left <= 0) return;
    this.injectedFailures.set(op, left - 1);
    throw new Error(`FakeOsCallAdapter: injected ${op} failure`);
  }

  private takeIgnored(op: string): boolean {
    const left = this.ignored.get(op) ?? 0;
    if (left <= 0) return false;
    this.ignored.set(op, left - 1);
    return true;
  }

  private require(sessionId: OsSessionId, op: string) {
    this.maybeFail(op);
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
