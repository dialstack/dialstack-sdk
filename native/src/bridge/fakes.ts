import type { CallEndReason, CallState, HeldBy } from '@dialstack/sdk-webrtc';

import type { AppLifecycle, AppLifecycleState, BridgeCall, BridgePhone } from './NativeCallBridge';

/** In-memory phone, call and lifecycle for testing a bridge or an app's call UI without a device. */
type Handlers = Record<string, ((...args: never[]) => void)[]>;

function addHandler(handlers: Handlers, event: string, handler: (...args: never[]) => void): void {
  (handlers[event] ??= []).push(handler);
}

function emitTo(handlers: Handlers, event: string, ...args: unknown[]): void {
  for (const h of handlers[event] ?? []) (h as (...a: unknown[]) => void)(...args);
}

export class FakeCall implements BridgeCall {
  state: CallState = 'ringing';
  isMuted = false;
  readonly fromName: string | null = null;
  readonly actions: string[] = [];
  private readonly handlers: Handlers = {};

  constructor(
    readonly id: string,
    readonly from = '1002'
  ) {}

  /**
   * Off: hold, resume and hangup only send, like the SDK's; the outcome comes
   * later as an event or a phone error. On: they take effect at once.
   */
  autoConfirm = true;
  /** Set to make answer() throw once, for the answer-failure path. */
  failAnswer = false;
  /** Make the next call to one of these fail the way the SDK's does. */
  readonly failNext: Partial<
    Record<'reject' | 'hold' | 'resume' | 'mute' | 'unmute' | 'dtmf', Error>
  > = {};
  private takeFailure(op: keyof FakeCall['failNext']): Error | undefined {
    const err = this.failNext[op];
    delete this.failNext[op];
    return err;
  }
  answer(): void {
    this.actions.push('answer');
    if (this.failAnswer) {
      this.failAnswer = false;
      throw new Error('answer failed');
    }
    this.state = 'active';
  }
  reject(reason: 'busy' | 'decline' = 'decline'): void {
    this.actions.push(`reject:${reason}`);
    const err = this.takeFailure('reject');
    if (err) throw err;
    this.state = 'ended';
  }
  hangup(): void {
    this.actions.push('hangup');
    if (this.autoConfirm) this.state = 'ended';
  }
  // Each throws, as the SDK's does when the socket is closed. A server-side
  // refusal arrives instead as a phone error naming the call.
  hold(): void {
    this.actions.push('hold');
    const err = this.takeFailure('hold');
    if (err) throw err;
    if (this.autoConfirm) this.state = 'held';
  }
  resume(): void {
    this.actions.push('resume');
    const err = this.takeFailure('resume');
    if (err) throw err;
    if (this.autoConfirm) this.state = 'active';
  }
  mute(): void {
    this.actions.push('mute');
    const err = this.takeFailure('mute');
    if (err) throw err;
    this.isMuted = true;
  }
  unmute(): void {
    this.actions.push('unmute');
    const err = this.takeFailure('unmute');
    if (err) throw err;
    this.isMuted = false;
  }
  sendDtmf(digits: string): void {
    this.actions.push(`dtmf:${digits}`);
    const err = this.takeFailure('dtmf');
    if (err) throw err;
  }
  on(event: string, handler: (...args: never[]) => void): void {
    addHandler(this.handlers, event, handler);
  }
  off(event: string, handler: (...args: never[]) => void): void {
    this.handlers[event] = (this.handlers[event] ?? []).filter((h) => h !== handler);
  }

  emitAnswered(): void {
    this.state = 'active';
    this.emit('answered');
  }
  emitHeld(by: HeldBy): void {
    this.state = 'held';
    this.emit('held', by);
  }
  emitResumed(): void {
    this.state = 'active';
    this.emit('resumed');
  }
  emitEnded(reason: CallEndReason): void {
    this.state = 'ended';
    this.emit('ended', reason);
  }
  private emit(event: string, ...args: unknown[]): void {
    emitTo(this.handlers, event, ...args);
  }
}

export class FakePhone implements BridgePhone {
  isConnected = false;
  connectCalls = 0;
  disconnectCalls = 0;
  /** Set before connect() is called to make it fail. */
  failConnectWith: Error | null = null;
  /** Set to hold connect() open until `resolveConnect()`. */
  manualConnect = false;
  private resolvePending: (() => void) | null = null;
  private pendingConnect: Promise<void> | null = null;
  private readonly handlers: Handlers = {};

  connect(): Promise<void> {
    this.connectCalls += 1;
    if (this.failConnectWith) return Promise.reject(this.failConnectWith);
    // Like the real phone, a second connect() joins the one in flight.
    if (this.pendingConnect) return this.pendingConnect;
    if (this.manualConnect) {
      this.pendingConnect = new Promise<void>((resolve) => {
        this.resolvePending = () => {
          this.isConnected = true;
          this.pendingConnect = null;
          resolve();
        };
      });
      return this.pendingConnect;
    }
    this.isConnected = true;
    return Promise.resolve();
  }
  resolveConnect(): void {
    this.resolvePending?.();
    this.resolvePending = null;
  }
  tokens: string[] = [];
  setToken(token: string): void {
    this.tokens.push(token);
  }
  /** Set to make the next call() reject, for the placement-failure path. */
  failCallWith: Error | null = null;
  outboundCalls: string[] = [];
  callResult: FakeCall | null = null;
  /** Set to hold call() open until `resolveCall()`. */
  manualCall = false;
  private resolvePendingCall: (() => void) | null = null;
  call(destination: string): Promise<FakeCall> {
    this.outboundCalls.push(destination);
    if (this.failCallWith) return Promise.reject(this.failCallWith);
    const call =
      this.callResult ?? new FakeCall(`call_out_${this.outboundCalls.length}`, destination);
    if (this.manualCall) {
      return new Promise<FakeCall>((resolve) => {
        this.resolvePendingCall = () => resolve(call);
      });
    }
    return Promise.resolve(call);
  }
  resolveCall(): void {
    this.resolvePendingCall?.();
    this.resolvePendingCall = null;
  }
  disconnect(): void {
    this.disconnectCalls += 1;
    this.isConnected = false;
    // Like the real phone, abandons a connect in flight: the next connect() is new.
    this.pendingConnect = null;
    this.resolvePending = null;
    this.emit('disconnected');
  }
  /**
   * The OS froze the backgrounded app and killed the socket with no close frame:
   * the transport is dead but `isConnected` still reads true and NO 'disconnected'
   * fires. Models the corpse the wake path must not trust.
   */
  killSocketSilently(): void {
    // isConnected deliberately left true; no event emitted.
  }
  /**
   * The socket dropped and the transport is between automatic reconnect attempts:
   * neither connected nor connecting, and no 'disconnected' fires.
   */
  startReconnecting(): void {
    this.isConnected = false;
    this.emit('reconnecting', 1, 30_000);
  }
  on(event: string, handler: (...args: never[]) => void): void {
    addHandler(this.handlers, event, handler);
  }
  emitIncoming(call: FakeCall): void {
    this.emit('incoming', call);
  }
  /** A server error frame, which the SDK names a call on when it can. */
  emitError(err: { code?: string; message?: string; callId?: string | null }): void {
    this.emit('error', err);
  }
  private emit(event: string, ...args: unknown[]): void {
    emitTo(this.handlers, event, ...args);
  }
}

export class FakeLifecycle implements AppLifecycle {
  private listeners: ((s: AppLifecycleState) => void)[] = [];
  onChange(listener: (state: AppLifecycleState) => void): () => void {
    this.listeners.push(listener);
    return () => {
      this.listeners = this.listeners.filter((l) => l !== listener);
    };
  }
  set(state: AppLifecycleState): void {
    for (const l of this.listeners) l(state);
  }
}
