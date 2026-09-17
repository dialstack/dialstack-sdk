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

  /** Set to make answer() throw once, for the answer-failure path. */
  failAnswer = false;
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
    this.state = 'ended';
  }
  hangup(): void {
    this.actions.push('hangup');
    this.state = 'ended';
  }
  hold(): void {
    this.actions.push('hold');
    this.state = 'held';
  }
  resume(): void {
    this.actions.push('resume');
    this.state = 'active';
  }
  mute(): void {
    this.actions.push('mute');
    this.isMuted = true;
  }
  unmute(): void {
    this.actions.push('unmute');
    this.isMuted = false;
  }
  sendDtmf(digits: string): void {
    this.actions.push(`dtmf:${digits}`);
  }
  on(event: string, handler: (...args: never[]) => void): void {
    addHandler(this.handlers, event, handler);
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
  isConnecting = false;
  connectCalls = 0;
  disconnectCalls = 0;
  /** Set before connect() is called to make it fail. */
  failConnectWith: Error | null = null;
  /** Set to hold connect() open until `resolveConnect()`. */
  manualConnect = false;
  private resolvePending: (() => void) | null = null;
  private readonly handlers: Handlers = {};

  connect(): Promise<void> {
    this.connectCalls += 1;
    if (this.failConnectWith) return Promise.reject(this.failConnectWith);
    if (this.manualConnect) {
      this.isConnecting = true;
      return new Promise<void>((resolve) => {
        this.resolvePending = () => {
          this.isConnecting = false;
          this.isConnected = true;
          resolve();
        };
      });
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
  call(destination: string): Promise<FakeCall> {
    this.outboundCalls.push(destination);
    if (this.failCallWith) return Promise.reject(this.failCallWith);
    const call =
      this.callResult ?? new FakeCall(`call_out_${this.outboundCalls.length}`, destination);
    return Promise.resolve(call);
  }
  disconnect(): void {
    this.disconnectCalls += 1;
    this.isConnected = false;
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
  on(event: string, handler: (...args: never[]) => void): void {
    addHandler(this.handlers, event, handler);
  }
  emitIncoming(call: FakeCall): void {
    this.emit('incoming', call);
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
