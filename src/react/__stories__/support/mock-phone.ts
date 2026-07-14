/**
 * Story-support only — an in-memory fake of `DialStackPhone` + `Call` so
 * Storybook can drive the real softphone user flows (dial, incoming, answer,
 * hold, transfer, hang up) without a live WebSocket. Injected via the internal
 * `__setPhoneFactory` seam in `../../softphone-hooks/useCalls`.
 *
 * This is NOT a story itself (it lives under `support/`, which the stories glob
 * doesn't match) and is NOT public API — it exists to make the softphone's
 * user-facing flows testable in the browser (the layer a jest render test can't
 * cover visually).
 *
 * Modeled on the jest doubles in `../../__tests__/Softphone.test.tsx`.
 */

import type { Call } from '../../../webrtc';
import type { DialStackPhone } from '../../../webrtc';
import type { PhoneOptions } from '../../../webrtc';

type Handler = (...args: unknown[]) => void;

class Emitter {
  private listeners: Record<string, Set<Handler>> = {};
  on(event: string, h: Handler): void {
    (this.listeners[event] ??= new Set()).add(h);
  }
  off(event: string, h?: Handler): void {
    if (!h) delete this.listeners[event];
    else this.listeners[event]?.delete(h);
  }
  emit(event: string, ...args: unknown[]): void {
    this.listeners[event]?.forEach((h) => h(...args));
  }
}

export class MockCall extends Emitter {
  state = 'trying';
  isMuted = false;
  duration = 0;
  canSendDtmf = true;
  // The provider binds this to its <audio> element's srcObject. In a real
  // browser (where stories run) that setter rejects anything that isn't a real
  // MediaStream, so construct one; fall back to an empty object where the
  // constructor is unavailable (non-browser env).
  remoteMediaStream: MediaStream =
    typeof MediaStream !== 'undefined' ? new MediaStream() : ({} as MediaStream);
  consult: MockCall | null = null;

  // Mirror Call.isConnected / isHeld so the UI's isCallActive gate and the
  // multi-call layout resolve exactly as they do against a real Call.
  get isConnected(): boolean {
    return this.state === 'active' || this.state === 'held';
  }
  get isHeld(): boolean {
    return this.state === 'held';
  }

  constructor(
    public id: string,
    public direction: 'inbound' | 'outbound',
    public from: string,
    public fromName: string | null,
    public to: string
  ) {
    super();
  }

  answer(): void {
    this.state = 'active';
    this.emit('answered');
  }
  reject(): void {
    this.state = 'ended';
    this.emit('ended', 'declined');
  }
  hangup(): void {
    this.state = 'ended';
    this.emit('ended', 'hangup');
  }
  mute(): void {
    this.isMuted = true;
  }
  unmute(): void {
    this.isMuted = false;
  }
  hold(): void {
    this.state = 'held';
    this.emit('held', 'local');
  }
  resume(): void {
    this.state = 'active';
    this.emit('resumed');
  }
  sendDtmf(): void {}
  transfer(): void {
    // Blind transfer hands the call off; from the UI's perspective it ends.
    this.state = 'ended';
    this.emit('ended', 'transferred');
  }
  attendedTransfer(destination: string): Promise<Call> {
    this.state = 'held';
    this.emit('held', 'local');
    const consult = new MockCall(`consult-${destination}`, 'outbound', '', null, destination);
    this.consult = consult;
    // The consult target picks up shortly after, so the consult leg goes active
    // (the in-call controls render against it) and Complete becomes enabled —
    // mirroring a real attended transfer where the consult is answered.
    queueMicrotask(() => {
      consult.state = 'active';
      consult.emit('answered');
    });
    return Promise.resolve(consult as unknown as Call);
  }
  completeTransfer(): void {
    this.state = 'ended';
    this.emit('ended', 'transferred');
  }
  dispose(): void {}
}

export class MockPhone extends Emitter {
  isConnected = false;
  private seq = 0;

  connect(): Promise<void> {
    this.isConnected = true;
    // Resolve first (mirrors the real connect() awaiting `authenticated`), then
    // surface `connected` so useCalls dispatches its connected state.
    queueMicrotask(() => this.emit('connected'));
    return Promise.resolve();
  }
  disconnect(): void {
    this.isConnected = false;
  }
  reconnect(): Promise<void> {
    this.emit('reconnecting', 0, 0);
    queueMicrotask(() => this.emit('connected'));
    return Promise.resolve();
  }
  call(to: string): Promise<Call> {
    const c = new MockCall(`out-${++this.seq}`, 'outbound', '', null, to);
    // An outbound goes active once the far end answers; keep it simple for the
    // story and mark it active immediately so the in-call screen shows.
    c.state = 'active';
    return Promise.resolve(c as unknown as Call);
  }

  // E911 is disabled in the stories (the built-in prompt only fires when there's
  // a saved address), so these are inert.
  listEmergencyAddresses(): Promise<never[]> {
    return Promise.resolve([]);
  }
  setEmergencyAddress(): Promise<never> {
    return Promise.reject(new Error('not used in stories'));
  }
  selectEmergencyAddress(): void {}
  clearEmergencyAddressRegisteredIp(): Promise<void> {
    return Promise.resolve();
  }

  /** Drive an inbound call the way the server's `incoming` frame would. */
  ringIncoming(from: string, fromName: string | null): MockCall {
    const c = new MockCall(`in-${++this.seq}`, 'inbound', from, fromName, 'me');
    c.state = 'ringing';
    this.emit('incoming', c);
    return c;
  }
}

/**
 * Grabs the phone the provider constructs so play functions can drive events
 * (ring an inbound, etc.). Set the factory before render; read `.current` after.
 */
export class MockPhoneController {
  current: MockPhone | null = null;

  /** A factory to hand to `__setPhoneFactory`; records the constructed phone. */
  factory = (_opts: PhoneOptions): DialStackPhone => {
    const phone = new MockPhone();
    this.current = phone;
    return phone as unknown as DialStackPhone;
  };

  /**
   * Resolve once the provider has actually constructed the phone (the factory
   * ran). Play functions await this before driving events, so a story can't race
   * ahead of the provider's mount — the flake that surfaced only under CI timing.
   */
  async waitForPhone(timeoutMs = 5000): Promise<MockPhone> {
    const start = Date.now();
    while (!this.current) {
      if (Date.now() - start > timeoutMs) throw new Error('MockPhone was never constructed');
      await new Promise((r) => setTimeout(r, 10));
    }
    return this.current;
  }

  ringIncoming(from: string, fromName: string | null = null): MockCall {
    if (!this.current) throw new Error('MockPhone not constructed yet');
    return this.current.ringIncoming(from, fromName);
  }
}
