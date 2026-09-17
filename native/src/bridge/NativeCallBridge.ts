import type { CallEndReason, CallState, HeldBy } from '@dialstack/sdk-webrtc';

import type { OsCallAdapter, OsEndReason, OsSessionId } from '../os/OsCallAdapter';
import { RuntimeHold } from './RuntimeHold';
import { SessionMap } from './SessionMap';

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
  hangup(): void;
  hold(): void;
  resume(): void;
  mute(): void;
  unmute(): void;
  sendDtmf(digits: string): void;
  on(event: 'answered' | 'resumed', handler: () => void): void;
  on(event: 'held', handler: (by: HeldBy) => void): void;
  on(event: 'ended', handler: (reason: CallEndReason) => void): void;
}

export interface BridgePhoneError {
  code?: string;
  message?: string;
  fatal?: boolean;
}
/** What the bridge needs from the phone — `DialStackPhone` satisfies it. */
export interface BridgePhone {
  readonly isConnected: boolean;
  readonly isConnecting: boolean;
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
   * How many calls the bridge reports to the OS at once (default 1, matching the
   * shipped adapters). A genuine second concurrent call is NOT reported to the OS
   * but still rings and is answerable in-app; it just gets no OS session. Bridge
   * policy, not the library's limit — raise it for an adapter whose library
   * supports multiple OS sessions (call-waiting).
   */
  maxOsCalls?: number;
  now?: () => number;
  /**
   * Ensure a usable token is on the phone BEFORE registering. `onTokenExpiring`
   * only refreshes a live connection, so it can't cover a boot/push-wake that would
   * register with an expired token — the server rejects it fatally and the parked
   * call is lost. Awaited before every connect().
   */
  ensureFreshToken?: () => Promise<void>;
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

/**
 * The bidirectional bridge between the OS call surface and the SDK (OS↔SDK
 * answer/end/mute/hold/DTMF and lifecycle), and the only thing that subscribes to
 * either. Works with no renderer: a push-woken headless runtime starts it like
 * the app window does.
 */
export class NativeCallBridge {
  readonly hold: RuntimeHold;

  private readonly phone: BridgePhone;
  private readonly os: OsCallAdapter;
  private readonly lifecycle: AppLifecycle | null;
  private readonly log: (message: string) => void;
  private readonly registrationDeadlineMs: number;
  private readonly deliveryDeadlineMs: number;
  private readonly answerTtlMs: number;
  private readonly maxOsCalls: number;
  private readonly now: () => number;
  private readonly ensureFreshToken: (() => Promise<void>) | null;

  private started = false;
  private connecting: Promise<void> | null = null;

  private readonly ids = new SessionMap();
  private readonly calls = new Map<string, BridgeCall>();
  /** OS sessions created by a native wake report; their call id may not be the one the SDK delivers. */
  private readonly wakeSessions = new Set<OsSessionId>();
  private readonly reportedToOs = new Set<string>();
  private readonly connectedReported = new Set<string>();
  /**
   * An OS answer/decline that landed before the SDK had the call. On a wake the
   * user taps within ~200ms while connect() takes seconds, so it's applied on arrival.
   */
  private readonly pendingAnswer = new Map<OsSessionId, number>();
  private readonly pendingDecline = new Set<OsSessionId>();
  // sessionId -> the held value we pushed to the OS, so its echo can be swallowed
  // once. A Map keyed on the value (not a Set) so a non-echoing adapter (the
  // shipped callkeep skeleton echoes nothing) doesn't strand the token: with a Set
  // a missing echo left it set, swallowing the user's next genuine Resume and
  // leaving a dead Resume button. Value-matching suppresses only the exact echo.
  private readonly suppressHoldEcho = new Map<OsSessionId, boolean>();
  private readonly wakeDeadlines = new Map<OsSessionId, ReturnType<typeof setTimeout>>();
  // When each wake session's call was delivered/adopted, so a re-fork of the SAME
  // parked INVITE (resent within the delivery window) is told apart from a
  // genuinely new second call and dropped as a duplicate.
  private readonly wakeAdoptedAt = new Map<OsSessionId, number>();
  private selfReportsInFlight = 0;

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
    this.hold = options.hold ?? new RuntimeHold();
    this.log = options.log ?? (() => {});
    this.registrationDeadlineMs = options.registrationDeadlineMs ?? 20_000;
    this.deliveryDeadlineMs = options.deliveryDeadlineMs ?? 5_000;
    this.answerTtlMs = options.answerTtlMs ?? 30_000;
    this.maxOsCalls = options.maxOsCalls ?? 1;
    this.now = options.now ?? Date.now;
    this.ensureFreshToken = options.ensureFreshToken ?? null;
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
   * Connect at most once; resolving means the SIP AOR is REGISTERed, so a parked
   * INVITE can reach us. Never `reconnect()` here — that disposes live calls.
   *
   * `forWake` is the corpse-proofing path: when the OS freezes a backgrounded app
   * it can kill the WebSocket with no close frame reaching JS, so no `disconnected`
   * fires and `isConnected`/`this.connecting` still read "connected" over a dead
   * socket. Trusting them never re-REGISTERs the AOR and the parked call is never
   * re-forked. So a wake with NO live call sheds whatever socket state we hold and
   * reconnects for real. A wake WITH a live call skips this: that call proves the
   * socket and a teardown would drop it.
   */
  ensureConnected(forWake = false): Promise<void> {
    if (forWake && this.calls.size === 0 && (this.phone.isConnected || this.phone.isConnecting)) {
      // Can't trust the claimed connection (see forWake above). Shed it and connect
      // fresh; with no live call, disconnect() disposes nothing that matters.
      this.disconnectPhone();
    }
    if (this.connecting) return this.connecting;
    if (this.phone.isConnected) return Promise.resolve();
    // A connect can be in flight without `this.connecting` tracking it: the UI
    // provider adopts the same phone, and connect() throws on the overlap.
    if (this.phone.isConnecting) return Promise.resolve();
    this.connecting = (async () => {
      if (this.ensureFreshToken) {
        try {
          await this.ensureFreshToken();
        } catch (err) {
          this.trace(`token refresh before connect failed: ${String(err)}`);
          // Try connecting anyway: the current token might still work (clock skew),
          // and a real auth_expired surfaces through the normal error path.
        }
      }
      await this.phone.connect();
    })().catch((err: unknown) => {
      this.connecting = null;
      throw err;
    });
    return this.connecting;
  }

  /** In-app Answer, routed through the OS so it converges on the one answer path. */
  answer(callId: string): void {
    const sessionId = this.ids.sessionFor(callId);
    if (!sessionId) {
      this.calls.get(callId)?.answer();
      return;
    }
    void this.os.answer(sessionId).catch((err) => this.trace(`os.answer failed: ${String(err)}`));
  }

  /** In-app End/Decline, via the same convergence. */
  end(callId: string): void {
    const sessionId = this.ids.sessionFor(callId);
    if (!sessionId) {
      this.calls.get(callId)?.hangup();
      return;
    }
    void this.os.end(sessionId).catch((err) => this.trace(`os.end failed: ${String(err)}`));
  }

  /**
   * Place an outbound call, reported to the OS FIRST so on Android the foreground
   * service starts and the call survives backgrounding mid-dial (otherwise the OS
   * reaps the process and drops the call). If placement fails we end the session
   * we opened; from then on it rides the same `watchCall` lifecycle.
   */
  async call(destination: string, displayName?: string | null): Promise<BridgeCall> {
    return this.placeOutbound(destination, displayName);
  }

  // Shared by the app's own call() (SDK → OS) and an OS-initiated dial (callIntent,
  // OS → SDK) so both directions converge on one path.
  private async placeOutbound(
    destination: string,
    displayName?: string | null
  ): Promise<BridgeCall> {
    await this.ensureConnected();
    const sessionId = await this.os.reportOutgoing({ to: destination, displayName });
    let call: BridgeCall;
    try {
      call = await this.phone.call(destination);
    } catch (err) {
      // The call never left: drop the OS session we opened.
      void this.os.reportEnded(sessionId, 'failed').catch(() => {});
      this.trace(`outbound call to ${destination} failed to place: ${String(err)}`);
      throw err;
    }
    this.calls.set(call.id, call);
    this.ids.link(call.id, sessionId);
    this.reportedToOs.add(call.id);
    this.watchCall(call);
    this.trace(`outbound ${call.id} → OS ${sessionId}`);
    return call;
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
    this.phone.on('connected', () => this.trace('socket connected (AOR registered)'));
    this.phone.on('disconnected', () => {
      // The socket's real lifecycle clears the latch, not connect()'s promise:
      // a disconnect() from elsewhere would otherwise leave a resolved promise
      // here and the next ensureConnected() would return without reconnecting.
      this.connecting = null;
      this.trace('socket disconnected');
    });
    this.phone.on('reconnecting', () => this.trace('socket reconnecting'));
    this.phone.on('reconnected', () => this.trace('socket reconnected'));
    this.phone.on('error', (err) =>
      this.trace(
        `phone error${err.fatal ? ' (fatal)' : ''}: ${err.code ?? '?'} ${err.message ?? ''}`
      )
    );
    this.phone.on('incoming', (call) => this.onIncoming(call));
  }

  private onIncoming(call: BridgeCall): void {
    this.calls.set(call.id, call);
    this.trace(`SDK incoming ${call.id} from ${call.from}`);
    this.watchCall(call);

    // The wake mapping is keyed on the PARKED call's id; the resumed INVITE is a
    // different call, so it's unmapped. Only one call rings at a time, so an
    // unmapped wake session here belongs to this call: adopt it.
    let sessionId = this.ids.sessionFor(call.id);
    if (!sessionId) {
      const adopted = this.adoptWakeSession(call.id);
      if (adopted) {
        sessionId = adopted;
        this.reportedToOs.add(call.id);
        this.clearWakeDeadline(adopted);
        this.wakeAdoptedAt.set(adopted, this.now());
        this.trace(`adopted wake session ${adopted} for ${call.id}`);
      }
    }

    if (!sessionId) {
      // Same parked INVITE reaching us twice: a fork within the delivery window is
      // a duplicate; one after it is a genuinely new concurrent call.
      if (this.wakeSessions.size > 0 && this.duplicateForkWindowOpen()) {
        this.trace(`duplicate wake delivery ${call.id} — hanging up the extra fork`);
        this.calls.delete(call.id);
        call.hangup();
        return;
      }
      // Apply a held decline ONLY when this was the sole wake in flight — then this
      // call is unambiguously the one it delivered. With another wake live, this
      // call is a DIFFERENT wake's; applying unconditionally sent every later call
      // to voicemail.
      if (this.wakeSessions.size === 0 && this.pendingDecline.size === 1) {
        this.pendingDecline.clear();
        call.reject('decline');
        this.trace(`declined ${call.id} (held decline applied)`);
        return;
      }
      // OS single-call cap: a genuine second call gets no OS session but is not
      // dropped — the in-app softphone still rings and can answer it.
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
      this.pendingAnswer.delete(sessionId);
      call.reject('decline');
      this.trace(`declined ${call.id} (held decline applied)`);
      return;
    }
    const tappedAt = this.pendingAnswer.get(sessionId);
    if (tappedAt === undefined) return;
    this.pendingAnswer.delete(sessionId);
    // Session ids are reused across attempts, so a stale tap would auto-answer the
    // next call on that session.
    if (this.now() - tappedAt > this.answerTtlMs) {
      this.trace(`discarded stale answer tap for ${sessionId}`);
      return;
    }
    this.answerCall(call, sessionId, 'held tap applied');
  }

  private adoptWakeSession(callId: string): OsSessionId | null {
    for (const sessionId of this.wakeSessions) {
      const linked = this.ids.callFor(sessionId);
      if (linked === callId) return sessionId;
      // Already bound to a DIFFERENT, still-live call (a server-side double resume):
      // do NOT steal the session — that orphaned the first call and pointed the OS
      // session at the duplicate (the held answer went to call #1 while the OS end
      // went to call #2). onIncoming hangs the duplicate up.
      if (linked !== undefined && this.calls.has(linked)) continue;
      // The linked call is gone (never delivered / already ended): reclaim it.
      if (linked !== undefined) {
        this.reportedToOs.delete(linked);
        this.ids.forgetCall(linked);
      }
      this.ids.link(callId, sessionId);
      return sessionId;
    }
    return null;
  }

  private async reportIncoming(call: BridgeCall): Promise<void> {
    // Marked before the await: a second trigger mid-flight would ring twice.
    this.reportedToOs.add(call.id);
    let sessionId: OsSessionId;
    // Counted across the await so onIncomingReported can tell the OS echo of OUR
    // report from a native wake: adapters emit incomingReported from inside
    // reportIncoming, before the session id exists to link, so a link-based guard
    // alone misses it and processes every foreground inbound as a wake.
    this.selfReportsInFlight += 1;
    try {
      sessionId = await this.os.reportIncoming({
        callId: call.id,
        from: call.from,
        displayName: call.fromName,
      });
    } catch (err) {
      this.reportedToOs.delete(call.id);
      this.trace(`OS report failed for ${call.id}: ${String(err)}`);
      return;
    } finally {
      this.selfReportsInFlight -= 1;
    }
    if (!this.calls.has(call.id)) {
      // Ended while the OS was still being told about it.
      void this.os.reportEnded(sessionId, 'remoteEnded').catch(() => {});
      return;
    }
    this.ids.link(call.id, sessionId);
    this.trace(`reported ${call.id} to the OS as ${sessionId}`);
    this.applyHeld(call, sessionId);
  }

  private answerCall(call: BridgeCall, sessionId: OsSessionId, how: string): void {
    if (this.connectedReported.has(call.id)) return;
    this.connectedReported.add(call.id);
    try {
      call.answer();
    } catch (err) {
      this.connectedReported.delete(call.id);
      this.trace(`answer failed for ${call.id}: ${String(err)}`);
      // A call we can't answer must not linger with dead controls: hang up
      // best-effort and run the normal teardown.
      try {
        call.hangup();
      } catch {
        // Already gone; the teardown below is what actually matters.
      }
      this.teardownCall(call.id, 'failed');
      return;
    }
    void this.os
      .reportConnected(sessionId)
      .then(() => this.trace(`answered ${call.id} (${how})`))
      .catch((err) => this.trace(`reportConnected failed for ${call.id}: ${String(err)}`));
  }

  private watchCall(call: BridgeCall): void {
    call.on('answered', () => {
      // Exactly one connected report per call.
      if (this.connectedReported.has(call.id)) return;
      this.connectedReported.add(call.id);
      const sessionId = this.ids.sessionFor(call.id);
      if (sessionId) void this.os.reportConnected(sessionId).catch(() => {});
    });

    call.on('held', (by) => {
      const sessionId = this.ids.sessionFor(call.id);
      // A local hold came from the OS in the first place; only a remote one is news.
      if (!sessionId || by !== 'remote') return;
      this.suppressHoldEcho.set(sessionId, true);
      void this.os.setHeld(sessionId, true).catch(() => this.suppressHoldEcho.delete(sessionId));
      this.trace(`remote hold ${call.id}`);
    });

    call.on('resumed', () => {
      const sessionId = this.ids.sessionFor(call.id);
      if (!sessionId) return;
      // `resumed` carries no origin flag. Only skip a pending resume-echo
      // (held=false); a pending hold-echo (held=true) is a different action and
      // must not swallow this report.
      if (this.suppressHoldEcho.get(sessionId) === false) return;
      this.suppressHoldEcho.set(sessionId, false);
      void this.os.setHeld(sessionId, false).catch(() => this.suppressHoldEcho.delete(sessionId));
      this.trace(`remote resume ${call.id}`);
    });

    call.on('ended', (reason) => {
      this.trace(`SDK ended ${call.id} (${reason})`);
      this.teardownCall(call.id, reason);
    });
  }

  // The one place that clears the SDK map, forgets the session, reports the OS
  // ended and releases the hold. Driven by the call's `ended`, or called directly
  // when there is no `ended` (e.g. an answer that threw).
  private teardownCall(callId: string, reason: CallEndReason): void {
    const sessionId = this.ids.sessionFor(callId);
    this.calls.delete(callId);
    this.connectedReported.delete(callId);
    this.reportedToOs.delete(callId);
    this.ids.forgetCall(callId);
    if (sessionId) {
      this.forgetSession(sessionId);
      void this.os.reportEnded(sessionId, toOsEndReason(reason)).catch(() => {});
    }
    if (this.calls.size === 0) this.hold.releaseNow();
  }

  // ------------------------------------------------------------------ OS → SDK

  private subscribeOs(): void {
    this.os.on('incomingReported', (e) => this.onIncomingReported(e.sessionId));

    this.os.on('callIntent', (e) => {
      this.trace(`OS call intent → ${e.handle}`);
      void this.placeOutbound(e.handle).catch((err) =>
        this.trace(`os call intent failed: ${String(err)}`)
      );
    });

    this.os.on('answer', (e) => {
      const call = this.callForSession(e.sessionId);
      this.trace(`OS answer ${e.sessionId} → ${call?.id ?? 'no SDK call yet'}`);
      if (!call) {
        if (!this.pendingAnswer.has(e.sessionId)) this.pendingAnswer.set(e.sessionId, this.now());
        return;
      }
      this.answerCall(call, e.sessionId, 'OS answer');
    });

    this.os.on('end', (e) => {
      this.pendingAnswer.delete(e.sessionId);
      const call = this.callForSession(e.sessionId);
      this.trace(`OS end ${e.sessionId} → ${call?.id ?? 'none'}`);
      if (!call) {
        // Declined before the SDK delivered the call. Forget the session so it
        // can't linger as an adopt target (a stale declined session adopted by a
        // LATER unrelated call sent every call to voicemail). Remember the decline
        // only while this was the one wake in flight.
        const wasInFlight = this.wakeSessions.has(e.sessionId);
        this.forgetSession(e.sessionId);
        if (wasInFlight) this.pendingDecline.add(e.sessionId);
        return;
      }
      if (call.state === 'ringing' || call.state === 'trying') call.reject('decline');
      else call.hangup();
    });

    this.os.on('setMuted', (e) => {
      const call = this.callForSession(e.sessionId);
      // Mirror the desired state rather than toggling; a duplicate event is a no-op.
      if (!call || call.isMuted === e.muted) return;
      if (e.muted) call.mute();
      else call.unmute();
      this.trace(`OS mute ${String(e.muted)} → ${call.id}`);
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
      if (e.held) call.hold();
      else call.resume();
      this.trace(`OS hold ${String(e.held)} → ${call.id}`);
    });

    this.os.on('dtmf', (e) => {
      const call = this.callForSession(e.sessionId);
      if (!call) return;
      call.sendDtmf(e.digits);
    });

    this.os.on('audioSessionActivated', () => this.trace('OS audio session activated'));
  }

  // The wake trigger and id-mapping primary. Queued by the OS layer, so it reaches
  // a late-attaching listener (always, on a cold wake).
  private onIncomingReported(sessionId: OsSessionId): void {
    this.trace(`OS incoming-call-reported ${sessionId}`);
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
    // Our own reportIncoming, echoed by the OS layer. Two checks because the echo
    // can land either side of the await: mid-flight (before the id is linked) it is
    // caught by the counter; after (the link exists) by the map. Without the
    // counter a foreground inbound was treated as a native wake — hold acquired,
    // wake deadlines armed, session added to wakeSessions.
    if (this.selfReportsInFlight > 0) return;
    if (this.ids.callFor(sessionId) !== undefined) return;
    void (async () => {
      this.hold.acquire();
      const registered = this.ensureConnected(true).then(
        () => true,
        (err: unknown) => {
          this.trace(`connect failed: ${String(err)}`);
          return false;
        }
      );
      try {
        const session = await this.os.getActiveSession();
        // Failing to map is recoverable; mis-mapping answers the wrong call.
        if (!session || session.sessionId !== sessionId) {
          this.trace(`no session match for ${sessionId} — not mapped`);
          return;
        }
        this.wakeSessions.add(sessionId);
        if (session.callId) {
          this.ids.link(session.callId, sessionId);
          this.reportedToOs.add(session.callId);
          this.trace(`linked ${session.callId} ⇄ ${sessionId}`);
        }
        this.armWakeDeadline(sessionId, this.registrationDeadlineMs, 'registration');
        if (await registered) {
          if (!this.callForSession(sessionId) && this.wakeSessions.has(sessionId)) {
            this.armWakeDeadline(sessionId, this.deliveryDeadlineMs, 'delivery');
          }
        } else {
          this.armWakeDeadline(sessionId, 0, 'registration failed');
        }
      } catch (err) {
        this.trace(`session pull failed for ${sessionId}: ${String(err)}`);
      }
    })();
  }

  private armWakeDeadline(sessionId: OsSessionId, ms: number, phase: string): void {
    this.clearWakeDeadline(sessionId);
    this.wakeDeadlines.set(
      sessionId,
      setTimeout(() => {
        this.wakeDeadlines.delete(sessionId);
        if (this.callForSession(sessionId)) return;
        this.trace(`wake deadline (${phase}): no call after ${ms}ms — tearing down`);
        this.forgetSession(sessionId);
        void this.os.reportEnded(sessionId, 'failed').catch(() => {});
        // Nothing else in flight: keeping the AOR registered would make the NEXT
        // call fork to a session nobody is looking at instead of parking.
        if (this.wakeSessions.size === 0 && this.reportedToOs.size === 0 && this.calls.size === 0) {
          if (this.phone.isConnected) {
            this.trace('disconnecting so the next call parks');
            this.disconnectPhone();
          }
          this.hold.releaseNow();
        }
      }, ms)
    );
  }

  // disconnect() emits no 'disconnected' (it nulls its transport before the
  // guarded 'closed' handler runs), so the latch is cleared by hand — else the
  // next ensureConnected() returns a stale resolved promise and never reconnects.
  private disconnectPhone(): void {
    this.connecting = null;
    this.phone.disconnect();
  }

  private clearWakeDeadline(sessionId: OsSessionId): void {
    const t = this.wakeDeadlines.get(sessionId);
    if (t !== undefined) {
      clearTimeout(t);
      this.wakeDeadlines.delete(sessionId);
    }
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
    this.clearWakeDeadline(sessionId);
    this.pendingAnswer.delete(sessionId);
    this.pendingDecline.delete(sessionId);
    this.suppressHoldEcho.delete(sessionId);
    this.wakeSessions.delete(sessionId);
    this.wakeAdoptedAt.delete(sessionId);
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

  // True while a wake session is bound to a live call adopted within the last
  // deliveryDeadlineMs — the window in which the server may re-fork the SAME parked
  // INVITE, so an unmapped call arriving now is a duplicate.
  private duplicateForkWindowOpen(): boolean {
    for (const sessionId of this.wakeSessions) {
      const callId = this.ids.callFor(sessionId);
      if (callId === undefined || !this.calls.has(callId)) continue;
      const adoptedAt = this.wakeAdoptedAt.get(sessionId);
      if (adoptedAt !== undefined && this.now() - adoptedAt <= this.deliveryDeadlineMs) {
        return true;
      }
    }
    return false;
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
      if (state === 'active') {
        if (!this.phone.isConnected) {
          void this.ensureConnected().catch((err: unknown) =>
            this.trace(`reconnect failed: ${String(err)}`)
          );
        }
        return;
      }
      if (state !== 'background') return;
      if (this.calls.size > 0 || !this.phone.isConnected) return;
      if (this.wakeInFlight()) {
        this.trace('backgrounded during a wake — keeping the registration');
        return;
      }
      this.trace('backgrounded — dropping registration so the proxy parks the next call');
      this.disconnectPhone();
    });
  }

  private trace(message: string): void {
    this.traceLines.push(`${new Date().toISOString().slice(11, 23)}  ${message}`);
    if (this.traceLines.length > TRACE_LIMIT) this.traceLines.shift();
    this.traceSnapshot = Object.freeze([...this.traceLines]);
    this.log(message);
    for (const listener of this.traceListeners) listener();
  }
}
