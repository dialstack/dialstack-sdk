/**
 * Tests for useCalls against a faked DialStackPhone event stream. The fake lets
 * the test drive the same events the real core emits (connected, incoming,
 * call.* lifecycle) so the hook's connection-state mapping, foreground-call
 * policy, per-call wiring, and teardown are exercised without a WebSocket.
 */

import { renderHook, act, waitFor } from '@testing-library/react';
import { useCalls } from '../useCalls';
import type { Call, CallEndReason } from '../../../webrtc';

// ---- fakes -----------------------------------------------------------------

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
  listenerCount(): number {
    return Object.values(this.listeners).reduce((n, s) => n + s.size, 0);
  }
}

class FakeCall extends Emitter {
  state = 'trying';
  isMuted = false;
  duration = 0;
  // Consult leg produced by attendedTransfer (for assertions).
  consult: FakeCall | null = null;
  completeTransferCalls = 0;
  hangupCalls = 0;
  resumeCalls = 0;
  rejectReasons: string[] = [];
  constructor(
    public direction: 'inbound' | 'outbound',
    public from: string,
    public fromName: string | null,
    public to: string
  ) {
    super();
  }
  // When set, attendedTransfer resolves via this deferred controller instead of
  // synchronously — lets a test end the original mid-dial to exercise the race.
  deferConsult: { resolve: () => void } | null = null;
  attendedTransfer(destination: string): Promise<Call> {
    this.state = 'held';
    const consult = new FakeCall('outbound', '', null, destination);
    this.consult = consult;
    if (this.deferConsult) {
      return new Promise<Call>((res) => {
        this.deferConsult = { resolve: () => res(consult as unknown as Call) };
      });
    }
    return Promise.resolve(consult as unknown as Call);
  }
  completeTransfer(): void {
    this.completeTransferCalls += 1;
  }
  hangup(): void {
    this.hangupCalls += 1;
  }
  reject(reason: string): void {
    this.rejectReasons.push(reason);
  }
  resume(): void {
    this.resumeCalls += 1;
    this.state = 'active';
  }
}

class FakePhone extends Emitter {
  static last: FakePhone | null = null;
  connectCalls = 0;
  disconnectCalls = 0;
  callArgs: string[] = [];
  nextCall: FakeCall | null = null;

  constructor(public options: unknown) {
    super();
    FakePhone.last = this;
  }
  connect(): Promise<void> {
    this.connectCalls += 1;
    return Promise.resolve();
  }
  disconnect(): void {
    this.disconnectCalls += 1;
  }
  call(destination: string): Promise<Call> {
    this.callArgs.push(destination);
    const c = this.nextCall ?? new FakeCall('outbound', '', null, destination);
    return Promise.resolve(c as unknown as Call);
  }
}

jest.mock('../../../webrtc', () => ({
  DialStackPhone: jest.fn().mockImplementation((options: unknown) => new FakePhone(options)),
}));

function phone(): FakePhone {
  if (!FakePhone.last) throw new Error('phone not constructed');
  return FakePhone.last;
}

beforeEach(() => {
  FakePhone.last = null;
});

// ---- tests -----------------------------------------------------------------

describe('useCalls connection lifecycle', () => {
  it('connects on mount and maps connection events to state', async () => {
    const { result } = renderHook(() => useCalls({ token: 'tok' }));

    // autoConnect default true → connecting immediately.
    expect(result.current.connection).toBe('connecting');
    expect(phone().connectCalls).toBe(1);

    act(() => phone().emit('connected'));
    expect(result.current.connection).toBe('connected');

    act(() => phone().emit('reconnecting', 1, 500));
    expect(result.current.connection).toBe('reconnecting');

    act(() => phone().emit('reconnected'));
    expect(result.current.connection).toBe('connected');

    act(() => phone().emit('disconnected'));
    expect(result.current.connection).toBe('disconnected');
  });

  it('does not connect when autoConnect is false', () => {
    const { result } = renderHook(() => useCalls({ token: 'tok', autoConnect: false }));
    expect(result.current.connection).toBe('idle');
    expect(phone().connectCalls).toBe(0);
  });

  it('disconnects the phone on unmount', () => {
    const { unmount } = renderHook(() => useCalls({ token: 'tok' }));
    const p = phone();
    unmount();
    expect(p.disconnectCalls).toBe(1);
  });

  it('surfaces a fatal error as the error state and forwards it to onError', () => {
    const onError = jest.fn();
    const { result } = renderHook(() => useCalls({ token: 'tok', onError }));
    act(() => phone().emit('error', { code: 'unauthorized', message: 'bad token', fatal: true }));
    expect(onError).toHaveBeenCalledWith({ code: 'unauthorized', message: 'bad token' });
    expect(result.current.connection).toBe('error');
  });
});

describe('useCalls single-active policy', () => {
  it('presents an incoming call and fires onIncomingCall', () => {
    const onIncomingCall = jest.fn();
    const { result } = renderHook(() => useCalls({ token: 'tok', onIncomingCall }));
    act(() => phone().emit('connected'));

    const inbound = new FakeCall('inbound', '+15551112222', 'Alice', 'me');
    act(() => phone().emit('incoming', inbound));

    expect(result.current.activeCall).toBe(inbound as unknown as Call);
    expect(onIncomingCall).toHaveBeenCalledWith({ from: '+15551112222', fromName: 'Alice' });
  });

  it('rejects a second inbound as busy while a call is active', () => {
    const onIncomingCall = jest.fn();
    const { result } = renderHook(() => useCalls({ token: 'tok', onIncomingCall }));
    act(() => phone().emit('connected'));

    const first = new FakeCall('inbound', '+1111', null, 'me');
    const second = new FakeCall('inbound', '+2222', null, 'me');
    act(() => phone().emit('incoming', first));
    act(() => phone().emit('incoming', second));

    // The first stays the active call; the second is rejected busy, not surfaced.
    expect(result.current.activeCall).toBe(first as unknown as Call);
    expect(second.rejectReasons).toEqual(['busy']);
    expect(onIncomingCall).toHaveBeenCalledTimes(1);
  });

  it('rejects a second inbound arriving in the same commit cycle as the first', () => {
    const onIncomingCall = jest.fn();
    const { result } = renderHook(() => useCalls({ token: 'tok', onIncomingCall }));
    act(() => phone().emit('connected'));

    const first = new FakeCall('inbound', '+1111', null, 'me');
    const second = new FakeCall('inbound', '+2222', null, 'me');
    // Both INVITEs land before React can commit + flush the activeCallRef sync
    // effect — the busy gate must still catch the second (it keys on the
    // synchronous wired-call map, not the post-commit ref).
    act(() => {
      phone().emit('incoming', first);
      phone().emit('incoming', second);
    });

    expect(result.current.activeCall).toBe(first as unknown as Call);
    expect(second.rejectReasons).toEqual(['busy']);
    expect(onIncomingCall).toHaveBeenCalledTimes(1);
  });

  it('clears the foreground call when it ends and fires onCallEnded', () => {
    const onCallEnded = jest.fn();
    const { result } = renderHook(() => useCalls({ token: 'tok', onCallEnded }));
    act(() => phone().emit('connected'));

    const inbound = new FakeCall('inbound', '+1111', null, 'me');
    act(() => phone().emit('incoming', inbound));
    expect(result.current.activeCall).not.toBeNull();

    act(() => inbound.emit('ended', 'hangup' as CallEndReason));
    expect(onCallEnded).toHaveBeenCalledWith({ reason: 'hangup' });
    expect(result.current.activeCall).toBeNull();
  });

  it('fires onCallActivated and onCallStarted(inbound) when an inbound call is answered', () => {
    const onCallActivated = jest.fn();
    const onCallStarted = jest.fn();
    renderHook(() => useCalls({ token: 'tok', onCallActivated, onCallStarted }));
    act(() => phone().emit('connected'));

    const inbound = new FakeCall('inbound', '+1111', null, 'me');
    act(() => phone().emit('incoming', inbound));
    act(() => {
      inbound.state = 'active';
      inbound.emit('answered');
    });

    expect(onCallActivated).toHaveBeenCalledWith(inbound);
    expect(onCallStarted).toHaveBeenCalledWith({ direction: 'inbound', peer: '+1111' });
  });
});

describe('useCalls placeCall', () => {
  it('places an outbound call when connected and fires onCallStarted(outbound)', async () => {
    const onCallStarted = jest.fn();
    const { result } = renderHook(() => useCalls({ token: 'tok', onCallStarted }));
    act(() => phone().emit('connected'));

    await act(async () => {
      await result.current.placeCall('+15559998888');
    });

    expect(phone().callArgs).toEqual(['+15559998888']);
    expect(result.current.activeCall).not.toBeNull();
    expect(onCallStarted).toHaveBeenCalledWith({ direction: 'outbound', peer: '+15559998888' });
  });

  it('no-ops when not connected', async () => {
    const { result } = renderHook(() => useCalls({ token: 'tok' }));
    // still 'connecting' — never emitted connected
    await act(async () => {
      await result.current.placeCall('+15559998888');
    });
    expect(phone().callArgs).toEqual([]);
    expect(result.current.activeCall).toBeNull();
  });

  it('does not dial an empty/whitespace destination, and surfaces it via onError', async () => {
    const onError = jest.fn();
    const { result } = renderHook(() => useCalls({ token: 'tok', onError }));
    act(() => phone().emit('connected'));
    await act(async () => {
      await result.current.placeCall('   ');
    });
    // No call placed, but not a silent no-op — the host (e.g. dial()) is told.
    expect(phone().callArgs).toEqual([]);
    expect(onError).toHaveBeenCalledWith(expect.objectContaining({ code: 'invalid_message' }));
  });

  it('forwards a placeCall failure to onError', async () => {
    const onError = jest.fn();
    const { result } = renderHook(() => useCalls({ token: 'tok', onError }));
    act(() => phone().emit('connected'));
    phone().call = jest.fn().mockRejectedValue({ code: 'rate_limited', message: 'too many' });

    await act(async () => {
      await result.current.placeCall('+1');
    });
    await waitFor(() =>
      expect(onError).toHaveBeenCalledWith({ code: 'rate_limited', message: 'too many' })
    );
  });
});

describe('useCalls credential changes', () => {
  it('reconstructs and reconnects the phone when the token changes', () => {
    const { rerender } = renderHook(({ token }) => useCalls({ token }), {
      initialProps: { token: 'tok-1' },
    });
    const first = phone();
    expect(first.connectCalls).toBe(1);

    rerender({ token: 'tok-2' });
    // Old phone torn down; a new one constructed and connected.
    expect(first.disconnectCalls).toBe(1);
    const second = phone();
    expect(second).not.toBe(first);
    expect(second.connectCalls).toBe(1);
  });

  it('does not reconnect when only a handler identity changes', () => {
    const { rerender } = renderHook(({ onError }) => useCalls({ token: 'tok', onError }), {
      initialProps: { onError: () => {} },
    });
    const p = phone();
    rerender({ onError: () => {} });
    expect(phone()).toBe(p);
    expect(p.connectCalls).toBe(1);
    expect(p.disconnectCalls).toBe(0);
  });
});

describe('useCalls attended transfer', () => {
  // Bring the hook to an active outbound call and return [result, the call].
  function withActiveCall() {
    const rendered = renderHook(() => useCalls({ token: 'tok' }));
    act(() => phone().emit('connected'));
    const original = new FakeCall('outbound', '', null, '+1000');
    phone().nextCall = original;
    return { ...rendered, original };
  }

  it('startAttendedTransfer holds the original and tracks the consult leg', async () => {
    const { result, original } = withActiveCall();
    await act(async () => {
      await result.current.placeCall('+1000');
    });
    expect(result.current.activeCall).toBe(original as unknown as Call);

    await act(async () => {
      await result.current.startAttendedTransfer('+2000');
    });

    // Original held; the consult leg (dialed to +2000) is now the ACTIVE call
    // the user is talking to, and the original is exposed as transferOriginal.
    expect(original.state).toBe('held');
    expect(result.current.consultCall).toBe(original.consult as unknown as Call);
    expect(result.current.activeCall).toBe(original.consult as unknown as Call);
    expect(result.current.transferOriginal).toBe(original as unknown as Call);
  });

  it('completeAttendedTransfer bridges via the original call once the consult answers', async () => {
    const { result, original } = withActiveCall();
    await act(async () => {
      await result.current.placeCall('+1000');
    });
    await act(async () => {
      await result.current.startAttendedTransfer('+2000');
    });
    const consult = original.consult!;

    // Not yet answered → complete is a no-op (bridging a ringing leg would drop
    // the held caller).
    act(() => result.current.completeAttendedTransfer());
    expect(original.completeTransferCalls).toBe(0);

    // Consult answers → complete bridges via the (held) original.
    act(() => {
      consult.state = 'active';
      consult.emit('answered');
    });
    act(() => result.current.completeAttendedTransfer());
    expect(original.completeTransferCalls).toBe(1);
  });

  it('cancelAttendedTransfer hangs up the consult and resumes the original', async () => {
    const { result, original } = withActiveCall();
    await act(async () => {
      await result.current.placeCall('+1000');
    });
    await act(async () => {
      await result.current.startAttendedTransfer('+2000');
    });
    const consult = original.consult!;
    act(() => result.current.cancelAttendedTransfer());
    expect(consult.hangupCalls).toBe(1);
    expect(original.resumeCalls).toBe(1);
    expect(result.current.consultCall).toBeNull();
  });

  it('clears the consult slot (not the foreground) when the consult leg ends', async () => {
    const { result, original } = withActiveCall();
    await act(async () => {
      await result.current.placeCall('+1000');
    });
    await act(async () => {
      await result.current.startAttendedTransfer('+2000');
    });
    const consult = original.consult!;
    act(() => consult.emit('ended', 'hangup' as CallEndReason));
    expect(result.current.consultCall).toBeNull();
    // The held original remains the foreground call.
    expect(result.current.activeCall).toBe(original as unknown as Call);
  });

  it('fires onCallEnded once (for the original, not the consult) when a transfer completes', async () => {
    const onCallEnded = jest.fn();
    const rendered = renderHook(() => useCalls({ token: 'tok', onCallEnded }));
    act(() => phone().emit('connected'));
    const original = new FakeCall('outbound', '', null, '+1000');
    phone().nextCall = original;
    const { result } = rendered;

    await act(async () => {
      await result.current.placeCall('+1000');
    });
    await act(async () => {
      await result.current.startAttendedTransfer('+2000');
    });
    const consult = original.consult!;
    act(() => {
      consult.state = 'active';
      consult.emit('answered');
    });
    act(() => result.current.completeAttendedTransfer());

    // Both legs end 'transferred'; the host was only told about the original
    // (the consult never fired a start), so onCallEnded fires exactly once.
    act(() => {
      original.state = 'ended';
      original.emit('ended', 'transferred' as CallEndReason);
      consult.state = 'ended';
      consult.emit('ended', 'transferred' as CallEndReason);
    });
    expect(onCallEnded).toHaveBeenCalledTimes(1);
    expect(onCallEnded).toHaveBeenCalledWith({ reason: 'transferred' });
  });

  it('cancelAttendedTransfer unwires the consult without waiting for its ended event', async () => {
    const { result, original } = withActiveCall();
    await act(async () => {
      await result.current.placeCall('+1000');
    });
    await act(async () => {
      await result.current.startAttendedTransfer('+2000');
    });
    const consult = original.consult!;
    // Consult never answered (still 'trying'); cancel must not leave its
    // listeners attached (the server may never echo 'ended' for an unanswered
    // outbound leg).
    act(() => result.current.cancelAttendedTransfer());
    expect(consult.listenerCount()).toBe(0);
  });

  it('placeCall is a no-op while a transfer is in progress (does not orphan the held original)', async () => {
    const { result, original } = withActiveCall();
    await act(async () => {
      await result.current.placeCall('+1000');
    });
    await act(async () => {
      await result.current.startAttendedTransfer('+2000');
    });
    const consult = original.consult!;

    // A host calling dial() mid-transfer must not blow away the transfer legs.
    await act(async () => {
      await result.current.placeCall('+3000');
    });

    // Both transfer legs survive; nothing was dialed to +3000.
    expect(phone().callArgs).not.toContain('+3000');
    expect(result.current.activeCall).toBe(consult as unknown as Call);
    expect(result.current.transferOriginal).toBe(original as unknown as Call);
  });

  it('hangs up the consult and does not orphan it if the original drops mid-dial', async () => {
    const { result, original } = withActiveCall();
    await act(async () => {
      await result.current.placeCall('+1000');
    });
    // Make the consult dial resolve on our command so we can end the original
    // during the await window.
    original.deferConsult = { resolve: () => undefined };

    let transferPromise: Promise<void>;
    act(() => {
      transferPromise = result.current.startAttendedTransfer('+2000');
    });
    // Original hangs up while the consult is still dialing.
    act(() => {
      original.state = 'ended';
      original.emit('ended', 'hangup' as CallEndReason);
    });
    // Now the consult dial resolves — into a state with no original to hold.
    await act(async () => {
      original.deferConsult!.resolve();
      await transferPromise;
    });

    const consult = original.consult!;
    // The consult is hung up, not surfaced as an orphaned active call.
    expect(consult.hangupCalls).toBe(1);
    expect(result.current.consultCall).toBeNull();
    expect(result.current.activeCall).toBeNull();
  });

  it('does not let a new inbound stomp an in-progress consult', async () => {
    const { result, original } = withActiveCall();
    await act(async () => {
      await result.current.placeCall('+1000');
    });
    await act(async () => {
      await result.current.startAttendedTransfer('+2000');
    });
    const intruder = new FakeCall('inbound', '+3000', null, 'me');
    act(() => phone().emit('incoming', intruder));
    // The consult stays the active call; the intruder is rejected busy and does
    // not stomp the in-progress transfer.
    expect(result.current.activeCall).toBe(original.consult as unknown as Call);
    expect(result.current.consultCall).toBe(original.consult as unknown as Call);
    expect(result.current.transferOriginal).toBe(original as unknown as Call);
    expect(intruder.rejectReasons).toEqual(['busy']);
  });
});
