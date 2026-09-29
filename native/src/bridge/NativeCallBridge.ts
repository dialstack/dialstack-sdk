import type { CallEndReason, CallState, HeldBy } from '@dialstack/sdk-webrtc';

import type { OsActiveSession, OsCallAdapter, OsEndReason, OsSessionId } from '../os/OsCallAdapter';
import { RuntimeHold } from './RuntimeHold';
import { SessionMap } from './SessionMap';
import { jsTimers, type BridgeTimers } from './timers';

/**
 * What the bridge needs from a call. Overloads rather than a generic `on`: a
 * generic over a narrower event map is not assignable from the SDK's wider one.
 */
export interface BridgeCall {
  readonly id: string;
  readonly from: string;
  readonly fromName: string | null;
  readonly state: CallState;
  readonly isMuted: boolean;
  answer(): void;
  reject(reason?: 'busy' | 'decline'): void;
  // Each sends one frame and throws if the socket is closed. The outcome arrives
  // as an event (held, resumed, ended) or as a phone 'error' naming the call.
  hangup(): void;
  hold(): void;
  resume(): void;
  mute(): void;
  unmute(): void;
  sendDtmf(digits: string): void;
  on(event: 'answered' | 'resumed', handler: () => void): void;
  on(event: 'held', handler: (by: HeldBy) => void): void;
  on(event: 'ended', handler: (reason: CallEndReason) => void): void;
  off(event: 'held' | 'resumed' | 'ended', handler: (...args: never[]) => void): void;
}

export interface BridgePhoneError {
  code?: string;
  message?: string;
  fatal?: boolean;
  // The call whose action the server refused, when it can be told.
  callId?: string | null;
}
/** What the bridge needs from the phone — `DialStackPhone` satisfies it. */
export interface BridgePhone {
  readonly isConnected: boolean;
  connect(): Promise<void>;
  disconnect(): void;
  setToken(token: string): void;
  /** Place an outbound call. The bridge reports it to the OS around this. */
  call(destination: string): Promise<BridgeCall>;
  on(event: 'connected' | 'reconnected', handler: () => void): void;
  on(event: 'disconnected', handler: (error?: unknown) => void): void;
  on(event: 'reconnecting', handler: (attempt: number, delayMs: number) => void): void;
  on(event: 'incoming', handler: (call: BridgeCall) => void): void;
  on(event: 'error', handler: (err: BridgePhoneError) => void): void;
}

export type AppLifecycleState = 'active' | 'background' | 'inactive' | 'unknown' | 'extension';
/** Foreground/background as a port so the bridge has no react-native import. */
export interface AppLifecycle {
  onChange(listener: (state: AppLifecycleState) => void): () => void;
}

export interface NativeCallBridgeOptions {
  phone: BridgePhone;
  os: OsCallAdapter;
  lifecycle?: AppLifecycle;
  hold?: RuntimeHold;
  log?: (message: string) => void;
  /** From the OS report until `connect()` resolves: a socket that never comes up. */
  registrationDeadlineMs?: number;
  /**
   * From `connect()` resolving until `incoming`. The proxy resumes a parked INVITE
   * on REGISTER or within its 1s poll, so after this nothing is coming.
   */
  deliveryDeadlineMs?: number;
  /** An OS answer held for a call that has not arrived yet is stale past this. */
  answerTtlMs?: number;
  /**
   * How many calls the integration puts on the OS call screen at once (default 1).
   * A second concurrent call past the cap is NOT reported to the OS but still
   * rings and is answerable in-app; it just gets no OS session. Calls pair with
   * sessions by call_id, so any value is safe; raising it is a product choice
   * (OS call-waiting) and needs an adapter whose library holds several sessions.
   */
  maxOsCalls?: number;
  /** Defaults to the JS timers; see `BridgeTimers` for when to pass native ones. */
  timers?: BridgeTimers;
  now?: () => number;
}

export function toOsEndReason(reason: CallEndReason): OsEndReason {
  switch (reason) {
    case 'no-answer':
      return 'unanswered';
    case 'rejected':
      return 'declinedElsewhere';
    case 'failed':
      return 'failed';
    case 'busy':
    case 'hangup':
    case 'transferred':
      return 'remoteEnded';
    default:
      return 'unknown';
  }
}

const TRACE_LIMIT = 200;

// Retries of an OS report the bridge cannot afford to lose (the end of a call,
// the connected report that stops the ringing). Equal jitter, like the SDK's.
const OS_REPORT_BACKOFF_MS = [250, 500, 1000];
const OS_REPORT_ATTEMPTS = OS_REPORT_BACKOFF_MS.length + 1;

// Confirming a hangup or a hold the SDK sent. The server acknowledges a hangup
// with call.ended as soon as it has the frame, so its wait is short. Hold and
// resume are a re-INVITE, which the server gives up on after 10s against an
// unreachable far end; wait a little past that for its error.
const HANGUP_ATTEMPTS = 5;
const HANGUP_ATTEMPT_TIMEOUT_MS = 3_000;
const HOLD_ATTEMPTS = 3;
const HOLD_ATTEMPT_TIMEOUT_MS = 12_000;

// How long after a change the bridge checks that the OS followed it. The OS
// applies an answer, a connected report or a hold asynchronously, so a check
// right away would read the state it is still leaving and act twice.
const RECONCILE_DELAY_MS = 1_500;

// `unsent`: the socket was closed. `rejected`: the server answered with an error
// naming the call. `timeout`: no reply at all.
type ActionOutcome =
  { ok: true } | { ok: false; kind: 'unsent' | 'rejected' | 'timeout'; error: unknown };

// Read through a call so TypeScript doesn't narrow a state that events change
// across an await.
const stateOf = (call: BridgeCall): CallState => call.state;
const isEnded = (call: BridgeCall): boolean => stateOf(call) === 'ended';

function osReportDelay(attempt: number): number {
  const step = OS_REPORT_BACKOFF_MS[Math.min(attempt, OS_REPORT_BACKOFF_MS.length - 1)]!;
  return Math.round(step / 2 + Math.random() * (step / 2));
}

// One timer per session: arming replaces the one already armed.
class SessionTimers {
  private readonly handles = new Map<OsSessionId, unknown>();

  constructor(private readonly timers: BridgeTimers) {}

  arm(sessionId: OsSessionId, ms: number, onFire: () => void): void {
    this.clear(sessionId);
    this.handles.set(
      sessionId,
      this.timers.setTimeout(() => {
        this.handles.delete(sessionId);
        onFire();
      }, ms)
    );
  }

  clear(sessionId: OsSessionId): void {
    if (!this.handles.has(sessionId)) return;
    this.timers.clearTimeout(this.handles.get(sessionId));
    this.handles.delete(sessionId);
  }
}

/**
 * The bidirectional bridge between the OS call surface and the SDK (OS↔SDK
 * answer/end/mute/hold/DTMF and lifecycle), and the only thing that subscribes to
 * either. Works with no renderer: a push-woken headless runtime starts it like
 * the app window does.
 *
 * ## Pairing a session with a call
 *
 * A call has one `call_id` everywhere: on the socket, in the wake webhook and on
 * the INVITE a wake resumes. The OS mints its own session id at setup, and the
 * bridge links it to that `call_id` (`ids`) the moment it knows both: when it
 * reports a call itself, when an outbound call is placed, and when the OS
 * reports a wake push's session (`incomingReported`, carrying the `call_id` the
 * push delivered). Every lookup goes through that link; none guesses by
 * position. A second session for a `call_id` already linked is the same call
 * shown twice, and is ended.
 *
 * The contract this puts on the integrator: the wake push carries the
 * webhook's `call_id`, and the OS adapter reports it on `incomingReported`.
 */
export class NativeCallBridge {
  readonly hold: RuntimeHold;

  private readonly timers: BridgeTimers;

  private readonly phone: BridgePhone;
  private readonly os: OsCallAdapter;
  private readonly lifecycle: AppLifecycle | null;
  private readonly log: (message: string) => void;
  private readonly registrationDeadlineMs: number;
  private readonly deliveryDeadlineMs: number;
  private readonly answerTtlMs: number;
  private readonly maxOsCalls: number;
  private readonly now: () => number;

  private started = false;
  // Last state the lifecycle reported, so the end of a call can tell it is
  // ending in the background.
  private appState: AppLifecycleState | null = null;
  // The socket dropped and the transport is between automatic reconnect attempts.
  // The phone then reads neither connected nor connecting, and the next attempt
  // can be up to a backoff step away: longer than a wake can wait.
  private reconnecting = false;

  private readonly ids = new SessionMap();
  private readonly calls = new Map<string, BridgeCall>();
  // Waiters for a server error naming a call, while one of its actions awaits
  // confirmation.
  private readonly callErrorWaiters = new Map<string, Set<(err: BridgePhoneError) => void>>();
  // Calls whose hangup is being confirmed, so a second end joins it.
  private readonly ending = new Set<string>();
  // Calls with a hold or resume being confirmed. Until it lands the OS already
  // shows the new state and the SDK the old one, and that is not a mismatch.
  private readonly changingHold = new Set<string>();
  private reconcileTimer: unknown = null;
  /** Outbound calls still being placed, so not yet in `calls`. */
  private placingOutbound = 0;
  /** Calls this app placed. For these `answered` means the far end picked up. */
  private readonly outboundCalls = new Set<string>();
  /** OS sessions created by a native wake report, before their call arrives on the socket. */
  private readonly wakeSessions = new Set<OsSessionId>();
  private readonly reportedToOs = new Set<string>();
  private readonly connectedReported = new Set<string>();
  /**
   * An OS answer/decline that landed before the SDK had the call. On a wake the
   * user taps within ~200ms while connect() takes seconds, so it's applied on arrival.
   */
  private readonly pendingAnswer = new Map<OsSessionId, number>();
  private readonly pendingDecline = new Set<OsSessionId>();
  private readonly answerDeadlines: SessionTimers;
  // sessionId -> the held value we pushed to the OS, so its echo can be swallowed
  // once. A Map keyed on the value (not a Set) so a non-echoing adapter (the
  // shipped callkeep skeleton echoes nothing) doesn't strand the token: with a Set
  // a missing echo left it set, swallowing the user's next genuine Resume and
  // leaving a dead Resume button. Value-matching suppresses only the exact echo.
  private readonly suppressHoldEcho = new Map<OsSessionId, boolean>();
  private readonly wakeDeadlines: SessionTimers;
  // Calls the bridge is reporting to the OS, with the sessions the OS reported
  // for the same call_id meanwhile. One is the echo of our own report, another
  // can be a push for the same call; only once ours resolves with its session id
  // can they be told apart.
  private readonly reportingCalls = new Map<string, OsSessionId[]>();

  private readonly traceLines: string[] = [];
  // Frozen snapshot rebuilt only on mutation, so getTrace() returns a STABLE
  // reference between changes (useSyncExternalStore compares with Object.is) and a
  // NEW one after each. Returning the live array did both wrong: same identity
  // forever, so the store never re-rendered.
  private traceSnapshot: readonly string[] = Object.freeze([]);
  // A Set, not a single field: two subscribers (or a remount before cleanup) each
  // subscribe; a single field let the second replace the first, whose unsubscribe
  // then nulled the second — leaving the store with no listener.
  private readonly traceListeners = new Set<() => void>();

  constructor(options: NativeCallBridgeOptions) {
    this.phone = options.phone;
    this.os = options.os;
    this.lifecycle = options.lifecycle ?? null;
    this.timers = options.timers ?? jsTimers;
    this.hold = options.hold ?? new RuntimeHold(undefined, this.timers);
    this.answerDeadlines = new SessionTimers(this.timers);
    this.wakeDeadlines = new SessionTimers(this.timers);
    this.log = options.log ?? (() => {});
    this.registrationDeadlineMs = options.registrationDeadlineMs ?? 20_000;
    this.deliveryDeadlineMs = options.deliveryDeadlineMs ?? 5_000;
    this.answerTtlMs = options.answerTtlMs ?? 30_000;
    this.maxOsCalls = options.maxOsCalls ?? 1;
    this.now = options.now ?? Date.now;
  }

  /** Idempotent. Call from the app entry on every path (window and headless). */
  start(): void {
    if (this.started) return;
    this.started = true;
    this.subscribePhone();
    this.subscribeOs();
    this.subscribeLifecycle();
    this.trace('bridge started');
  }

  /**
   * Resolving means the SIP AOR is REGISTERed, so a parked INVITE can reach us.
   * The phone joins a connect already in flight, so this never starts a second
   * one. Never `reconnect()` here — that disposes live calls.
   *
   * `forWake` is the corpse-proofing path: when the OS freezes a backgrounded app
   * it can kill the WebSocket with no close frame reaching JS, so no `disconnected`
   * fires and `isConnected` still reads "connected" over a dead socket. Trusting them never re-REGISTERs the AOR and the parked call is never
   * re-forked. So a wake with NO live call sheds whatever socket state we hold and
   * reconnects for real. A wake WITH a live call skips this: that call proves the
   * socket and a teardown would drop it. A connect still in flight is joined, not
   * shed: it has no stale socket to distrust, and its own timeouts bound it.
   */
  ensureConnected(forWake = false): Promise<void> {
    if (forWake && this.calls.size === 0 && (this.phone.isConnected || this.reconnecting)) {
      // Can't trust the claimed connection (see forWake above). Shed it and connect
      // fresh; with no live call, disconnect() disposes nothing that matters.
      this.phone.disconnect();
    }
    if (this.phone.isConnected) return Promise.resolve();
    // The phone mints before connecting when its token is stale (onTokenExpiring),
    // so no refresh happens here: a separate one left the phone looking idle while
    // it ran, and a UI adopting the phone connected it with the old token.
    return this.phone.connect();
  }

  /** In-app Answer, routed through the OS so it converges on the one answer path. */
  answer(callId: string): void {
    void (async () => {
      const sessionId = this.ids.sessionFor(callId);
      this.trace(`in-app answer ${callId} → ${sessionId ?? 'no OS session, answering directly'}`);
      if (!sessionId) {
        this.calls.get(callId)?.answer();
        return;
      }
      try {
        await this.os.answer(sessionId);
      } catch (err) {
        // The OS refused to route it; answer here, so the tap isn't lost.
        this.trace(`os.answer failed: ${String(err)} — answering in-app`);
        const call = this.calls.get(callId);
        if (call) this.answerCall(call, sessionId, 'in-app, OS refused');
      }
    })();
  }

  /** In-app End/Decline, via the same convergence. */
  end(callId: string): void {
    void (async () => {
      const sessionId = this.ids.sessionFor(callId);
      this.trace(`in-app end ${callId} → ${sessionId ?? 'no OS session, hanging up directly'}`);
      if (!sessionId) {
        const call = this.calls.get(callId);
        if (call) this.endCall(call);
        return;
      }
      try {
        await this.os.end(sessionId);
      } catch (err) {
        // The OS refused to route it; end here, and the call's end tears the
        // session down.
        this.trace(`os.end failed: ${String(err)} — ending in-app`);
        const call = this.calls.get(callId);
        if (call) this.endCall(call);
      }
    })();
  }

  /**
   * Place an outbound call, reported to the OS FIRST so on Android the foreground
   * service starts and the call survives backgrounding mid-dial (otherwise the OS
   * reaps the process and drops the call). If placement fails we end the session
   * we opened; from then on it rides the same `watchCall` lifecycle.
   *
   * An OS-initiated dial (`callIntent`) comes through here too, so both
   * directions converge on one path.
   */
  async call(destination: string, displayName?: string | null): Promise<BridgeCall> {
    // Reporting the call to the OS can background the app (some Android skins
    // flash their own call screen), so until it is in `calls` the background
    // handler must still see it as live or it drops the registration mid-dial.
    this.placingOutbound += 1;
    try {
      await this.ensureConnected();
      const sessionId = await this.os.reportOutgoing({ to: destination, displayName });
      let call: BridgeCall;
      try {
        call = await this.phone.call(destination);
      } catch (err) {
        // The call never left: drop the OS session we opened.
        this.reportEndedReliably(sessionId, 'failed');
        this.trace(`outbound call to ${destination} failed to place: ${String(err)}`);
        throw err;
      }
      this.calls.set(call.id, call);
      this.outboundCalls.add(call.id);
      this.watchCall(call);
      this.linkOsSession(call.id, sessionId, `outbound ${call.id} → OS ${sessionId}`);
      return call;
    } finally {
      this.placingOutbound -= 1;
    }
  }

  /** Ring buffer for a debug view; one-way, `useSyncExternalStore`-shaped. */
  getTrace(): readonly string[] {
    return this.traceSnapshot;
  }

  subscribeTrace(listener: () => void): () => void {
    this.traceListeners.add(listener);
    return () => {
      this.traceListeners.delete(listener);
    };
  }

  // ------------------------------------------------------------------ SDK → OS

  private subscribePhone(): void {
    this.phone.on('connected', () => {
      this.reconnecting = false;
      this.trace('socket connected (AOR registered)');
    });
    this.phone.on('disconnected', () => {
      this.reconnecting = false;
      this.trace('socket disconnected');
    });
    this.phone.on('reconnecting', () => {
      this.reconnecting = true;
      this.trace('socket reconnecting');
    });
    this.phone.on('reconnected', () => {
      this.reconnecting = false;
      this.trace('socket reconnected');
    });
    this.phone.on('error', (err) => {
      this.trace(
        `phone error${err.fatal ? ' (fatal)' : ''}: ${err.code ?? '?'} ${err.message ?? ''}`
      );
      if (err.callId)
        for (const waiter of [...(this.callErrorWaiters.get(err.callId) ?? [])]) waiter(err);
    });
    this.phone.on('incoming', (call) => this.onIncoming(call));
  }

  private onIncoming(call: BridgeCall): void {
    // The same call_id rings again on a follow-me step or a queue re-ring, but
    // only after its previous ring ended and was torn down. One still live here
    // is a repeat delivery; replacing it would orphan the call the OS shows.
    if (this.calls.has(call.id)) {
      this.trace(`second incoming for live ${call.id} — ignored`);
      return;
    }
    this.calls.set(call.id, call);
    this.trace(`SDK incoming ${call.id} from ${call.from}`);
    this.watchCall(call);

    // A woken call arrives with the call_id its wake session was linked to.
    const sessionId = this.ids.sessionFor(call.id);
    if (sessionId && this.wakeSessions.has(sessionId)) {
      this.wakeDeadlines.clear(sessionId);
      this.trace(`delivered ${call.id} to wake session ${sessionId}`);
    }

    if (!sessionId) {
      // OS single-call cap: whichever route reports first owns the OS session, and
      // this one lost. A genuine second call is not dropped — the in-app softphone
      // still rings and can answer it; it just gets no OS session. The mirror of
      // this check is in onIncomingReported, so the rule holds whichever of the
      // two arrives first.
      if (this.liveOsCallCount() >= this.maxOsCalls) {
        this.trace(`OS at ${this.maxOsCalls}-call cap — ${call.id} handled in-app only`);
        return;
      }
      void this.reportIncoming(call);
      return;
    }
    this.applyHeld(call, sessionId);
  }

  private applyHeld(call: BridgeCall, sessionId: OsSessionId): void {
    // A decline wins over an answer: acting on the answer would revive a call the
    // user already refused.
    if (this.pendingDecline.delete(sessionId)) {
      this.dropHeldAnswer(sessionId);
      call.reject('decline');
      this.trace(`declined ${call.id} (held decline applied)`);
      return;
    }
    const tappedAt = this.pendingAnswer.get(sessionId);
    if (tappedAt === undefined) return;
    this.dropHeldAnswer(sessionId);
    // Session ids are reused across attempts, so a stale tap would auto-answer the
    // next call on that session.
    if (this.now() - tappedAt > this.answerTtlMs) {
      this.trace(`discarded stale answer tap for ${sessionId}`);
      return;
    }
    this.answerCall(call, sessionId, 'held tap applied');
  }

  private async reportIncoming(call: BridgeCall): Promise<void> {
    // Marked before the await: a second trigger mid-flight would ring twice.
    this.reportedToOs.add(call.id);
    this.reportingCalls.set(call.id, []);
    let sessionId: OsSessionId | null = null;
    try {
      sessionId = await this.os.reportIncoming({
        callId: call.id,
        from: call.from,
        displayName: call.fromName,
      });
    } catch (err) {
      this.trace(`OS report failed for ${call.id}: ${String(err)}`);
    }
    const seen = this.reportingCalls.get(call.id) ?? [];
    this.reportingCalls.delete(call.id);
    // The OS may already show this call under a session a push created; that
    // is why it refused ours (Telecom allows one) or why it now shows two.
    const shown = seen.find((id) => id !== sessionId);
    if (!this.calls.has(call.id)) {
      // Ended while the OS was still being told about it.
      for (const id of [sessionId, ...seen]) if (id) this.reportEndedReliably(id, 'remoteEnded');
      return;
    }
    if (sessionId) {
      for (const id of seen) if (id !== sessionId) this.endDuplicateSession(id, call.id);
      this.ids.link(call.id, sessionId);
      this.trace(`reported ${call.id} to the OS as ${sessionId}`);
      this.applyHeld(call, sessionId);
      return;
    }
    if (shown) {
      for (const id of seen) if (id !== shown) this.endDuplicateSession(id, call.id);
      this.linkOsSession(call.id, shown, `linked ${call.id} ⇄ ${shown} (already on the OS)`);
      this.applyHeld(call, shown);
      return;
    }
    // Nothing shows the call, so it can't be answered from the lock screen or
    // the background and the caller would ring until the server gave up.
    this.reportedToOs.delete(call.id);
    this.trace(`no OS session shows ${call.id} — rejecting it`);
    try {
      call.reject('busy');
    } catch {
      this.endCall(call);
    }
  }

  // An OS that accepts both the push's report and ours shows one call twice.
  // Keep the session the call is linked to; end the other.
  private endDuplicateSession(sessionId: OsSessionId, callId: string): void {
    this.trace(`second OS session ${sessionId} for ${callId} — ending it`);
    this.reportEndedReliably(sessionId, 'remoteEnded');
  }

  /**
   * An OS answer we could not act on yet. The OS holds its answer request open
   * meanwhile — CallKit keeps the incoming UI up, Telecom leaves the call in
   * CONNECTING — so if no call ever arrives to consume it, say so rather than
   * leaving the phone ringing until the adapter's own far longer deadline.
   *
   * Handle-stored and cleared by `forgetSession`, like the wake deadlines. It
   * has to be: session ids are recycled, so a timer left armed past its own
   * session fires against a LATER tap on the same id and reports a live call
   * failed. `armedAt` is the second half of that — it pins the timer to the one
   * tap it was armed for even if the map was refilled meanwhile.
   */
  private armAnswerDeadline(sessionId: OsSessionId, armedAt: number): void {
    this.answerDeadlines.arm(sessionId, this.answerTtlMs, () => {
      if (this.pendingAnswer.get(sessionId) !== armedAt) return;
      if (this.callForSession(sessionId)) return;
      this.trace(`held answer for ${sessionId} never found a call — failing it`);
      this.pendingAnswer.delete(sessionId);
      this.reportEndedReliably(sessionId, 'failed');
    });
  }

  // A held answer is consumed or discarded together with the deadline armed for it.
  private dropHeldAnswer(sessionId: OsSessionId): void {
    this.pendingAnswer.delete(sessionId);
    this.answerDeadlines.clear(sessionId);
  }

  private answerCall(call: BridgeCall, sessionId: OsSessionId, how: string): void {
    if (this.connectedReported.has(call.id)) return;
    this.connectedReported.add(call.id);
    // Answered in-app first: the OS answer is the one the bridge asked for (see
    // the `answered` handler), and only needs fulfilling.
    if (call.state === 'active' || call.state === 'held') {
      this.reportConnectedReliably(call, sessionId, `answered ${call.id} (${how}, in-app first)`);
      this.scheduleReconcile();
      return;
    }
    try {
      call.answer();
    } catch (err) {
      this.connectedReported.delete(call.id);
      this.trace(`answer failed for ${call.id}: ${String(err)}`);
      // A call we can't answer must not linger with dead controls.
      this.abandonCall(call);
      return;
    }
    this.reportConnectedReliably(call, sessionId, `answered ${call.id} (${how})`);
    this.scheduleReconcile();
  }

  // The connected report is what dismisses the OS's incoming UI —
  // CXAnswerCallAction is only a request — so a lost one leaves the phone ringing
  // over a call that is already up. Retry it; if the OS still won't take it, the
  // two sides can't be brought into step, so end the call on both.
  private reportConnectedReliably(call: BridgeCall, sessionId: OsSessionId, done: string): void {
    void (async () => {
      for (let attempt = 0; attempt < OS_REPORT_ATTEMPTS; attempt += 1) {
        if (!this.calls.has(call.id)) return;
        try {
          await this.os.reportConnected(sessionId);
          this.trace(done);
          return;
        } catch (err) {
          this.trace(
            `reportConnected failed for ${call.id} (attempt ${attempt + 1}): ${String(err)}`
          );
        }
        await this.backoffAfter(attempt, OS_REPORT_ATTEMPTS);
      }
      this.connectedReported.delete(call.id);
      this.trace(`OS never took the connected report for ${call.id} — ending it`);
      this.abandonCall(call);
    })();
  }

  private watchCall(call: BridgeCall): void {
    call.on('answered', () => {
      // Exactly one connected report per call, and only once one is actually
      // made: latching first and then finding no session marked the call
      // reported while the OS was told nothing, and nothing could retry. The
      // OS then keeps showing its incoming UI, because the answer action is a
      // request that stays open until the call is reported connected.
      this.scheduleReconcile();
      if (this.connectedReported.has(call.id)) return;
      void (async () => {
        const sessionId = this.ids.sessionFor(call.id);
        if (!sessionId) {
          this.trace(`answered ${call.id} with no OS session to report to`);
          return;
        }
        if (!this.outboundCalls.has(call.id)) {
          // Answered in-app, so the OS still has this incoming call ringing, and
          // a "connected" report does not stop that on iOS: only an answer action
          // does. Ask the OS to answer; its answer event comes back through
          // answerCall, which fulfils it.
          try {
            await this.os.answer(sessionId);
            this.trace(`answered ${call.id} in-app — asked the OS to answer ${sessionId}`);
            return;
          } catch (err) {
            this.trace(`os.answer failed for ${call.id}: ${String(err)} — reporting connected`);
          }
        }
        this.connectedReported.add(call.id);
        this.reportConnectedReliably(call, sessionId, `reported ${call.id} connected`);
      })();
    });

    // Both origins are news to the OS. `by` says who put the call on hold, not
    // who asked: an in-app Hold reports 'local' and the OS knows nothing about
    // it, so filtering those out left the OS showing an active call and its own
    // hold button out of step. An OS-originated hold is the one to skip, and the
    // echo token is what identifies it — not `by`.
    call.on('held', (by) => {
      this.reportHold(call, true, `hold ${call.id} (${by})`);
      this.scheduleReconcile();
    });
    // `resumed` carries no origin flag. The value-matched echo token is again
    // what tells an OS-originated resume from an in-app one.
    call.on('resumed', () => {
      this.reportHold(call, false, `remote resume ${call.id}`);
      this.scheduleReconcile();
    });

    call.on('ended', (reason) => {
      this.trace(`SDK ended ${call.id} (${reason})`);
      this.teardownCall(call.id, reason);
    });
  }

  private reportHold(call: BridgeCall, held: boolean, message: string): void {
    const sessionId = this.ids.sessionFor(call.id);
    if (!sessionId) return;
    // Swallow only the exact echo of what we pushed; the opposite value is a
    // different action and must still be reported.
    if (this.suppressHoldEcho.get(sessionId) === held) return;
    this.suppressHoldEcho.set(sessionId, held);
    void this.os.setHeld(sessionId, held).catch(() => this.suppressHoldEcho.delete(sessionId));
    this.trace(message);
  }

  /**
   * Hang up, and make sure the call ends. The SDK sends one frame; this retries
   * one the server never answers and, once the attempts run out, ends the call
   * here so the OS and the app don't keep a call nothing can reach.
   *
   * An error reply means the server has no such call, and the SDK ends it. A
   * closed socket ends it too, through the lost session.
   */
  private endCall(call: BridgeCall): void {
    if (this.ending.has(call.id)) return;
    this.ending.add(call.id);
    void (async () => {
      for (let attempt = 0; attempt < HANGUP_ATTEMPTS; attempt += 1) {
        if (isEnded(call)) return;
        const outcome = await this.attempt(
          call,
          () => call.hangup(),
          'ended',
          HANGUP_ATTEMPT_TIMEOUT_MS
        );
        if (outcome.ok || isEnded(call)) return;
        if (outcome.kind !== 'timeout') break;
        await this.backoffAfter(attempt, HANGUP_ATTEMPTS);
      }
      if (isEnded(call) || !this.calls.has(call.id)) return;
      this.trace(`hangup of ${call.id} never confirmed — ending it here`);
      this.teardownCall(call.id, 'failed');
    })().finally(() => this.ending.delete(call.id));
  }

  /**
   * Hold or resume, confirmed. Resolves once the call's held/resumed arrives.
   *
   * The far end refusing on state (`invalid_message`) or a closed socket rejects
   * at once and leaves the call alone. A failure on the server's side (far end
   * unreachable) or no reply is retried; once the attempts run out the in-dialog
   * route is dead and every other action would fail the same way, so the call is
   * ended and the promise rejects.
   */
  private async changeHold(call: BridgeCall, held: boolean): Promise<void> {
    // The SDK only holds an active call and only resumes a held one.
    if (stateOf(call) !== (held ? 'active' : 'held')) return;
    this.changingHold.add(call.id);
    try {
      await this.confirmHold(call, held);
    } finally {
      this.changingHold.delete(call.id);
    }
  }

  private async confirmHold(call: BridgeCall, held: boolean): Promise<void> {
    const target = held ? 'held' : 'active';
    let lastError: unknown = null;
    for (let attempt = 0; attempt < HOLD_ATTEMPTS; attempt += 1) {
      // An earlier attempt may have landed after its wait gave up.
      if (stateOf(call) === target || isEnded(call)) return;
      const outcome = await this.attempt(
        call,
        () => (held ? call.hold() : call.resume()),
        held ? 'held' : 'resumed',
        HOLD_ATTEMPT_TIMEOUT_MS
      );
      if (outcome.ok || isEnded(call)) return;
      lastError = outcome.error;
      if (outcome.kind === 'unsent') throw outcome.error;
      if (
        outcome.kind === 'rejected' &&
        (outcome.error as BridgePhoneError).code === 'invalid_message'
      ) {
        throw outcome.error;
      }
      await this.backoffAfter(attempt, HOLD_ATTEMPTS);
    }
    if (stateOf(call) === target || isEnded(call)) return;
    this.endCall(call);
    throw lastError;
  }

  // One attempt of a call action: send it, then wait for the event that confirms
  // it, a server error naming the call, or the timeout.
  private attempt(
    call: BridgeCall,
    send: () => void,
    confirmedBy: 'held' | 'resumed' | 'ended',
    timeoutMs: number
  ): Promise<ActionOutcome> {
    try {
      send();
    } catch (error) {
      return Promise.resolve({ ok: false, kind: 'unsent', error });
    }
    const reached = { held: 'held', resumed: 'active', ended: 'ended' }[confirmedBy];
    if (call.state === reached) return Promise.resolve({ ok: true });
    return new Promise<ActionOutcome>((resolve) => {
      const waiters = this.callErrorWaiters.get(call.id) ?? new Set();
      this.callErrorWaiters.set(call.id, waiters);
      const finish = (outcome: ActionOutcome) => {
        this.timers.clearTimeout(timer);
        call.off(confirmedBy, onConfirmed);
        waiters.delete(onError);
        if (waiters.size === 0) this.callErrorWaiters.delete(call.id);
        resolve(outcome);
      };
      const onConfirmed = () => finish({ ok: true });
      const onError = (error: BridgePhoneError) => finish({ ok: false, kind: 'rejected', error });
      const timer = this.timers.setTimeout(
        () =>
          finish({
            ok: false,
            kind: 'timeout',
            error: new Error(`no reply confirming ${confirmedBy} for ${call.id}`),
          }),
        timeoutMs
      );
      (call.on as (event: string, handler: () => void) => void)(confirmedBy, onConfirmed);
      waiters.add(onError);
    });
  }

  /** The pause after a failed attempt; none after the last, which has nothing to wait for. */
  private async backoffAfter(attempt: number, attempts: number): Promise<void> {
    if (attempt >= attempts - 1) return;
    await new Promise<void>((resolve) => this.timers.setTimeout(resolve, osReportDelay(attempt)));
  }

  // Hang up and run the normal teardown now, without waiting for the hangup's
  // confirmation: the call is already unusable.
  private abandonCall(call: BridgeCall): void {
    this.endCall(call);
    this.teardownCall(call.id, 'failed');
  }

  // The one place that clears the SDK map, forgets the session, reports the OS
  // ended and releases the hold. Driven by the call's `ended`, or called directly
  // when there is no `ended` (e.g. an answer that threw).
  private teardownCall(callId: string, reason: CallEndReason): void {
    const sessionId = this.ids.sessionFor(callId);
    this.calls.delete(callId);
    this.outboundCalls.delete(callId);
    this.connectedReported.delete(callId);
    this.reportedToOs.delete(callId);
    this.ids.forgetCall(callId);
    if (sessionId) {
      this.forgetSession(sessionId);
      this.reportEndedReliably(sessionId, toOsEndReason(reason));
    }
    if (this.calls.size === 0) {
      this.hold.releaseNow();
      // The app may have gone to the background while this call was live, when
      // the drop had to wait. Nothing else re-checks, so the socket would stay
      // registered until the OS froze it and the next call forked to it.
      if (this.appState === 'background') this.dropRegistrationIfIdle();
    }
  }

  // Tell the OS a session is over, retrying with backoff: one lost report leaves
  // a call screen up (and on Android the foreground service holding the process)
  // for a call that no longer exists anywhere else.
  private reportEndedReliably(sessionId: OsSessionId, reason: OsEndReason): void {
    void (async () => {
      for (let attempt = 0; attempt < OS_REPORT_ATTEMPTS; attempt += 1) {
        try {
          await this.os.reportEnded(sessionId, reason);
          return;
        } catch (err) {
          this.trace(
            `reportEnded failed for ${sessionId} (attempt ${attempt + 1}): ${String(err)}`
          );
        }
        await this.backoffAfter(attempt, OS_REPORT_ATTEMPTS);
      }
    })();
  }

  // ------------------------------------------------------------------ OS → SDK

  private subscribeOs(): void {
    this.os.on('incomingReported', (e) => this.onIncomingReported(e.sessionId, e.callId));

    this.os.on('callIntent', (e) => {
      this.trace(`OS call intent → ${e.handle}`);
      void this.call(e.handle).catch((err) => this.trace(`os call intent failed: ${String(err)}`));
    });

    this.os.on('answer', (e) => {
      // No call yet on a wake: the answer is held for the call that arrives with
      // this session's call_id.
      const call = this.callForSession(e.sessionId);
      this.trace(`OS answer ${e.sessionId} → ${call?.id ?? 'no SDK call yet'}`);
      if (!call) {
        if (!this.pendingAnswer.has(e.sessionId)) {
          const armedAt = this.now();
          this.pendingAnswer.set(e.sessionId, armedAt);
          this.armAnswerDeadline(e.sessionId, armedAt);
        }
        return;
      }
      // The other half of the deadline fix: a tap that DOES resolve a call must
      // consume its held entry, or an earlier-armed timer still fires and reports
      // the now-connected call failed.
      this.dropHeldAnswer(e.sessionId);
      this.answerCall(call, e.sessionId, 'OS answer');
    });

    this.os.on('end', (e) => {
      this.dropHeldAnswer(e.sessionId);
      const call = this.callForSession(e.sessionId);
      this.trace(`OS end ${e.sessionId} → ${call?.id ?? 'none'}`);
      if (!call) {
        // Declined before the SDK delivered the call. Keep the session linked to
        // its call_id, so the call that arrives with that id is the one rejected
        // (applyHeld) and no other. A session with no call id is simply forgotten.
        // The wake deadline stays armed: a call answered or cancelled elsewhere
        // never arrives, and without it the link would hold the wake open forever.
        if (this.ids.callFor(e.sessionId) === undefined) {
          this.forgetSession(e.sessionId);
          return;
        }
        this.pendingDecline.add(e.sessionId);
        return;
      }
      if (call.state === 'ringing' || call.state === 'trying') {
        try {
          call.reject('decline');
          return;
        } catch (err) {
          this.trace(`reject failed for ${call.id}: ${String(err)} — hanging up`);
        }
      }
      this.endCall(call);
    });

    this.os.on('setMuted', (e) => {
      const call = this.callForSession(e.sessionId);
      // Mirror the desired state rather than toggling; a duplicate event is a no-op.
      if (!call || call.isMuted === e.muted) return;
      try {
        if (e.muted) call.mute();
        else call.unmute();
        this.trace(`OS mute ${String(e.muted)} → ${call.id}`);
      } catch (err) {
        // The mic did not change: put the OS control back, so it can't say
        // muted over a live mic.
        this.trace(`mute failed for ${call.id}: ${String(err)}`);
        void this.os.setMuted(e.sessionId, call.isMuted).catch(() => {});
      }
    });

    this.os.on('setHeld', (e) => {
      // Swallow only the exact echo of what we pushed (same held value), so a
      // stranded token can't swallow the user's opposite-valued action (dead-Resume).
      if (this.suppressHoldEcho.get(e.sessionId) === e.held) {
        this.suppressHoldEcho.delete(e.sessionId);
        return;
      }
      const call = this.callForSession(e.sessionId);
      if (!call) return;
      // The SDK only holds an active call and only resumes a held one; anything
      // else sends nothing, so no echo would ever consume a token.
      if (stateOf(call) !== (e.held ? 'active' : 'held')) return;
      // The call's own held/resumed event is about to fire for an action the OS
      // asked for, so mark it now: that echo must not be reported straight back.
      this.suppressHoldEcho.set(e.sessionId, e.held);
      this.trace(`OS hold ${String(e.held)} → ${call.id}`);
      void this.changeHold(call, e.held).catch((err: unknown) => {
        // The echo this token was waiting for won't come.
        this.suppressHoldEcho.delete(e.sessionId);
        this.trace(`hold ${String(e.held)} failed for ${call.id}: ${String(err)}`);
        // A hold that could not land at all has already hung the call up, and its
        // end tears the OS session down. Otherwise put the OS control back.
        if (!this.calls.has(call.id) || isEnded(call)) return;
        this.suppressHoldEcho.set(e.sessionId, !e.held);
        void this.os
          .setHeld(e.sessionId, !e.held)
          .catch(() => this.suppressHoldEcho.delete(e.sessionId));
      });
    });

    this.os.on('dtmf', (e) => {
      const call = this.callForSession(e.sessionId);
      if (!call) return;
      try {
        call.sendDtmf(e.digits);
      } catch (err) {
        this.trace(`dtmf failed for ${call.id}: ${String(err)}`);
      }
    });

    this.os.on('audioSessionActivated', () => this.trace('OS audio session activated'));
  }

  // The wake trigger and id-mapping primary. Queued by the OS layer, so it reaches
  // a late-attaching listener (always, on a cold wake).
  private onIncomingReported(sessionId: OsSessionId, callId: string | null): void {
    this.trace(`OS incoming-call-reported ${sessionId} (${callId ?? 'no call id'})`);
    // The OS recycles session ids, so any held answer/decline still keyed here
    // belongs to a PRIOR wake that never delivered. Clear it FIRST, before the
    // own-report guard, or a stale decline auto-applies (every call to voicemail).
    if (
      this.wakeSessions.has(sessionId) ||
      this.pendingDecline.has(sessionId) ||
      this.pendingAnswer.has(sessionId)
    ) {
      this.forgetSession(sessionId);
    }
    // Our own report of this call is in flight: this is its echo, or a push for
    // the same call. reportIncoming sorts them out once it has its session id.
    const reporting = callId ? this.reportingCalls.get(callId) : undefined;
    if (reporting) {
      reporting.push(sessionId);
      return;
    }
    if (this.ids.callFor(sessionId) !== undefined) return;
    if (!callId) {
      // The push is where a wake session's call_id comes from. Without one no
      // call can ever pair with it, so don't leave the OS ringing it.
      this.trace(`wake session ${sessionId} has no call id — ending it`);
      this.reportEndedReliably(sessionId, 'failed');
      return;
    }
    if (this.ids.sessionFor(callId)) {
      this.endDuplicateSession(sessionId, callId);
      return;
    }
    // At the cap already: this session is for another call than the one on the OS
    // screen, and the integration shows at most maxOsCalls. Android gets this for
    // free (Telecom refuses a second session); CallKit does not, so enforce it
    // here and both platforms behave alike.
    if (this.liveOsCallCount() >= this.maxOsCalls) {
      this.trace(`OS at ${this.maxOsCalls}-call cap — ending session ${sessionId}`);
      this.reportEndedReliably(sessionId, 'failed');
      return;
    }
    this.hold.acquire();
    this.wakeSessions.add(sessionId);
    this.linkOsSession(callId, sessionId, `linked ${callId} ⇄ ${sessionId}`);
    this.armWakeDeadline(sessionId, this.registrationDeadlineMs, 'registration');
    void this.ensureConnected(true).then(
      () => {
        if (!this.callForSession(sessionId) && this.wakeSessions.has(sessionId)) {
          this.armWakeDeadline(sessionId, this.deliveryDeadlineMs, 'delivery');
        }
      },
      (err: unknown) => {
        this.trace(`connect failed: ${String(err)}`);
        this.armWakeDeadline(sessionId, 0, 'registration failed');
      }
    );
  }

  private armWakeDeadline(sessionId: OsSessionId, ms: number, phase: string): void {
    this.wakeDeadlines.arm(sessionId, ms, () => {
      if (this.callForSession(sessionId)) return;
      this.trace(`wake deadline (${phase}): no call after ${ms}ms — tearing down`);
      // A declined session is already gone from the OS; only our state is left.
      const declined = this.pendingDecline.has(sessionId);
      this.forgetSession(sessionId);
      if (!declined) this.reportEndedReliably(sessionId, 'failed');
      // Nothing else in flight: keeping the AOR registered would make the NEXT
      // call fork to a session nobody is looking at instead of parking.
      if (this.wakeSessions.size === 0 && this.reportedToOs.size === 0 && this.calls.size === 0) {
        if (this.phone.isConnected) {
          this.trace('disconnecting so the next call parks');
          this.phone.disconnect();
        }
        this.hold.releaseNow();
      }
    });
  }

  // Clears the session and, with it, the reportedToOs entry for whatever call it
  // was mapped to. That clear reads the mapping FIRST and so must live here: done
  // by the caller after the fact, reportedToOs leaks the stale call id forever —
  // wakeInFlight() stays true, permanently disabling the backgrounded
  // registration drop and wake-deadline teardown, so the next call forks to a
  // dead socket instead of parking.
  private forgetSession(sessionId: OsSessionId): void {
    const stale = this.ids.callFor(sessionId);
    if (stale !== undefined) this.reportedToOs.delete(stale);
    this.wakeDeadlines.clear(sessionId);
    this.dropHeldAnswer(sessionId);
    this.pendingDecline.delete(sessionId);
    this.suppressHoldEcho.delete(sessionId);
    this.wakeSessions.delete(sessionId);
    this.ids.forgetSession(sessionId);
  }

  private wakeInFlight(): boolean {
    return this.wakeSessions.size > 0 || this.reportedToOs.size > 0 || this.hold.pending() !== null;
  }

  /** How many OS-reported calls are still live — the OS's session count. */
  private liveOsCallCount(): number {
    let n = 0;
    for (const callId of this.reportedToOs) if (this.calls.has(callId)) n += 1;
    return n;
  }

  // Pair a call with the OS session showing it, which also counts it against
  // maxOsCalls and keeps the registration up while it is live.
  private linkOsSession(callId: string, sessionId: OsSessionId, message: string): void {
    this.ids.link(callId, sessionId);
    this.reportedToOs.add(callId);
    this.trace(message);
  }

  // ----------------------------------------------------------------- reconcile

  /**
   * Check, shortly after a change, that the OS shows what the call is.
   *
   * Every OS report above is retried when it fails, but a report the OS takes
   * and then doesn't act on goes unseen: iOS accepts a connected report for an
   * incoming call and keeps it ringing. So compare what the OS says it shows
   * with the call, and correct the OS; the call's state is the server's, and
   * the OS follows it.
   *
   * Only the session the OS calls active is read, since that is all the port
   * offers. It is the one on screen, and with the default of one OS call it is
   * every session there is.
   */
  private scheduleReconcile(): void {
    if (this.reconcileTimer !== null) this.timers.clearTimeout(this.reconcileTimer);
    this.reconcileTimer = this.timers.setTimeout(() => {
      this.reconcileTimer = null;
      void this.reconcile();
    }, RECONCILE_DELAY_MS);
  }

  private async reconcile(): Promise<void> {
    let session: OsActiveSession | null;
    try {
      session = await this.os.getActiveSession();
    } catch (err) {
      this.trace(`reconcile: could not read the OS session: ${String(err)}`);
      return;
    }
    if (!session) return;
    const call = this.callForSession(session.sessionId);
    if (!call || isEnded(call) || this.ending.has(call.id)) return;
    const state = stateOf(call);
    if (state !== 'active' && state !== 'held') return;
    this.reconcileConnected(call, session);
    this.reconcileHeld(call, state === 'held', session);
  }

  private reconcileConnected(call: BridgeCall, session: OsActiveSession): void {
    const { sessionId, status } = session;
    if (status === undefined || status === 'connected' || status === 'ended') return;
    if (status === 'ringing' && !this.outboundCalls.has(call.id)) {
      // Only an answer action stops an incoming ring. Its answer event comes back
      // through answerCall, which must be free to fulfil it.
      this.trace(`reconcile: OS still ringing ${sessionId} over answered ${call.id} — answering`);
      this.connectedReported.delete(call.id);
      void this.os
        .answer(sessionId)
        .catch((err: unknown) => this.trace(`reconcile: os.answer failed: ${String(err)}`));
      return;
    }
    this.trace(`reconcile: OS shows ${sessionId} ${status} over answered ${call.id} — reporting`);
    this.connectedReported.add(call.id);
    this.reportConnectedReliably(call, sessionId, `reported ${call.id} connected (reconcile)`);
  }

  private reconcileHeld(call: BridgeCall, held: boolean, session: OsActiveSession): void {
    const { sessionId } = session;
    if (session.held === undefined || session.held === held || this.changingHold.has(call.id)) {
      return;
    }
    this.trace(`reconcile: OS shows ${sessionId} held=${String(session.held)}, ${call.id} is not`);
    this.suppressHoldEcho.set(sessionId, held);
    void this.os.setHeld(sessionId, held).catch(() => this.suppressHoldEcho.delete(sessionId));
  }

  private callForSession(sessionId: OsSessionId): BridgeCall | null {
    const callId = this.ids.callFor(sessionId);
    return callId ? (this.calls.get(callId) ?? null) : null;
  }

  // ----------------------------------------------------------------- lifecycle

  // Drop the registration when backgrounded with nothing live: a backgrounded
  // socket dies on the OS's schedule but its contact outlives it, so a call in that
  // window forks to a socket nobody holds (480) instead of parking for a wake.
  private subscribeLifecycle(): void {
    this.lifecycle?.onChange((state) => {
      this.appState = state;
      if (state === 'active') {
        // Anything the OS missed while the app was away shows on screen now.
        this.scheduleReconcile();
        if (!this.phone.isConnected) {
          void this.ensureConnected().catch((err: unknown) =>
            this.trace(`reconnect failed: ${String(err)}`)
          );
        }
        return;
      }
      if (state !== 'background') return;
      this.dropRegistrationIfIdle();
    });
  }

  private dropRegistrationIfIdle(): void {
    if (this.calls.size > 0 || this.placingOutbound > 0 || !this.phone.isConnected) return;
    if (this.wakeInFlight()) {
      this.trace('backgrounded during a wake — keeping the registration');
      return;
    }
    this.trace('backgrounded — dropping registration so the proxy parks the next call');
    this.phone.disconnect();
  }

  private trace(message: string): void {
    this.traceLines.push(`${new Date().toISOString().slice(11, 23)}  ${message}`);
    if (this.traceLines.length > TRACE_LIMIT) this.traceLines.shift();
    this.traceSnapshot = Object.freeze([...this.traceLines]);
    this.log(message);
    for (const listener of this.traceListeners) listener();
  }
}
