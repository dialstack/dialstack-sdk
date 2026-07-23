/**
 * Tests for useCalls against a faked DialStackPhone event stream. The fake lets
 * the test drive the same events the real core emits (connected, incoming,
 * call.* lifecycle) so the hook's connection-state mapping, foreground-call
 * policy, per-call wiring, and teardown are exercised without a WebSocket.
 */

import { renderHook, act, waitFor } from '@testing-library/react';
import { useCalls } from '../useCalls';
import type { Call, CallEndReason } from '../../../../webrtc';

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
  // Mirror the real Call.isConnected getter (active OR held).
  get isConnected(): boolean {
    return this.state === 'active' || this.state === 'held';
  }
  // Consult leg produced by attendedTransfer (for assertions).
  consult: FakeCall | null = null;
  completeTransferCalls = 0;
  hangupCalls = 0;
  resumeCalls = 0;
  holdCalls = 0;
  answerCalls = 0;
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
  hold(): void {
    this.holdCalls += 1;
    this.state = 'held';
  }
  answer(): void {
    this.answerCalls += 1;
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

jest.mock('../../../../webrtc', () => ({
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

describe('useCalls multi-call policy', () => {
  it('surfaces an incoming call in incomingCalls (not active) and fires onIncomingCall', () => {
    const onIncomingCall = jest.fn();
    const { result } = renderHook(() => useCalls({ token: 'tok', onIncomingCall }));
    act(() => phone().emit('connected'));

    const inbound = new FakeCall('inbound', '+15551112222', 'Alice', 'me');
    act(() => phone().emit('incoming', inbound));

    // A ringing inbound is NOT the active call until answered — it's an incoming.
    expect(result.current.activeCall).toBeNull();
    expect(result.current.incomingCalls).toEqual([inbound as unknown as Call]);
    expect(onIncomingCall).toHaveBeenCalledWith({ from: '+15551112222', fromName: 'Alice' });
  });

  it('surfaces multiple concurrent incoming calls (call-waiting), not busy', () => {
    const { result } = renderHook(() => useCalls({ token: 'tok' }));
    act(() => phone().emit('connected'));

    const first = new FakeCall('inbound', '+1111', null, 'me');
    const second = new FakeCall('inbound', '+2222', null, 'me');
    act(() => phone().emit('incoming', first));
    act(() => phone().emit('incoming', second));

    // Both are surfaced (stacked), neither rejected.
    expect(result.current.incomingCalls).toEqual([first, second] as unknown as Call[]);
    expect(second.rejectReasons).toEqual([]);
  });

  it('surfaces two concurrent incoming calls from the SAME number as distinct legs', () => {
    // Edge case: the same caller rings twice (two INVITEs, two distinct call_ids
    // → two distinct Call objects). They must NOT collapse into one card —
    // identity is the Call object, not the peer number.
    const { result } = renderHook(() => useCalls({ token: 'tok' }));
    act(() => phone().emit('connected'));

    const a = new FakeCall('inbound', '+15551234567', 'Same Caller', 'me');
    const b = new FakeCall('inbound', '+15551234567', 'Same Caller', 'me');
    act(() => phone().emit('incoming', a));
    act(() => phone().emit('incoming', b));

    expect(result.current.incomingCalls).toEqual([a, b] as unknown as Call[]);
    expect(b.rejectReasons).toEqual([]);
  });

  it('rejects a further inbound past the concurrent-call cap as busy', () => {
    const { result } = renderHook(() => useCalls({ token: 'tok' }));
    act(() => phone().emit('connected'));

    // Cap is 4. Ring 4 → all surfaced; the 5th is rejected busy.
    const calls = Array.from({ length: 5 }, (_, i) => new FakeCall('inbound', `+${i}`, null, 'me'));
    act(() => calls.forEach((c) => phone().emit('incoming', c)));

    expect(result.current.incomingCalls.length).toBe(4);
    expect(calls[4].rejectReasons).toEqual(['busy']);
  });

  it('answering an incoming makes it active and holds the current active call', () => {
    const { result } = renderHook(() => useCalls({ token: 'tok' }));
    act(() => phone().emit('connected'));

    // A live active call (answered inbound A).
    const a = new FakeCall('inbound', '+1111', null, 'me');
    act(() => phone().emit('incoming', a));
    act(() => result.current.answerCall(a as unknown as Call));
    expect(result.current.activeCall).toBe(a as unknown as Call);

    // B rings while A is active (call-waiting interrupt).
    const b = new FakeCall('inbound', '+2222', null, 'me');
    act(() => phone().emit('incoming', b));
    expect(result.current.incomingCalls).toEqual([b] as unknown as Call[]);

    // Answer B → A is held, B is active.
    act(() => result.current.answerCall(b as unknown as Call));
    expect(result.current.activeCall).toBe(b as unknown as Call);
    expect(a.holdCalls).toBe(1);
    expect(b.answerCalls).toBe(1);
    expect(result.current.heldCalls).toEqual([a] as unknown as Call[]);
  });

  it('switchToCall holds the current active call and resumes the target', () => {
    const { result } = renderHook(() => useCalls({ token: 'tok' }));
    act(() => phone().emit('connected'));

    const a = new FakeCall('inbound', '+1111', null, 'me');
    const b = new FakeCall('inbound', '+2222', null, 'me');
    act(() => phone().emit('incoming', a));
    act(() => result.current.answerCall(a as unknown as Call));
    act(() => phone().emit('incoming', b));
    act(() => result.current.answerCall(b as unknown as Call)); // A held, B active

    act(() => result.current.switchToCall(a as unknown as Call));
    expect(result.current.activeCall).toBe(a as unknown as Call);
    expect(b.holdCalls).toBe(1); // b was held on switch
    expect(a.resumeCalls).toBe(1); // a was resumed
  });

  it('a background leg answering (core event) does not steal focus', () => {
    const { result } = renderHook(() => useCalls({ token: 'tok' }));
    act(() => phone().emit('connected'));

    // A active, B held (user switched back to A).
    const a = new FakeCall('inbound', '+1111', null, 'me');
    const b = new FakeCall('inbound', '+2222', null, 'me');
    act(() => phone().emit('incoming', a));
    act(() => result.current.answerCall(a as unknown as Call));
    act(() => phone().emit('incoming', b));
    act(() => result.current.answerCall(b as unknown as Call));
    act(() => result.current.switchToCall(a as unknown as Call)); // A active, B held
    expect(result.current.activeCall).toBe(a as unknown as Call);
    a.holdCalls = 0; // reset to observe any spurious re-hold below

    // B's callee (a backgrounded leg) fires the core 'answered' event. It must
    // NOT yank focus to B or re-hold A.
    act(() => b.emit('answered'));
    expect(result.current.activeCall).toBe(a as unknown as Call);
    expect(result.current.heldCalls).toEqual([b] as unknown as Call[]);
    expect(a.holdCalls).toBe(0); // A was not re-held by B's answer
  });

  it('a lone outbound stays active when its far end answers (core event)', () => {
    const { result } = renderHook(() => useCalls({ token: 'tok' }));
    act(() => phone().emit('connected'));

    // Place an outbound; it's the sole call and is already active from `placeCall`.
    // When the far end picks up (core 'answered' event), it stays active — the
    // event doesn't promote (focus is owned by user actions), and doesn't throw.
    const out = new FakeCall('outbound', '', null, '+15550001111');
    phone().nextCall = out;
    return act(async () => {
      await result.current.placeCall('+15550001111');
    }).then(() => {
      act(() => {
        out.state = 'active';
        out.emit('answered');
      });
      expect(result.current.activeCall).toBe(out as unknown as Call);
    });
  });

  it('holds the true active leg, not a render-late one, on rapid switch', () => {
    const { result } = renderHook(() => useCalls({ token: 'tok' }));
    act(() => phone().emit('connected'));

    // A active, B held.
    const a = new FakeCall('inbound', '+1111', null, 'me');
    const b = new FakeCall('inbound', '+2222', null, 'me');
    act(() => phone().emit('incoming', a));
    act(() => result.current.answerCall(a as unknown as Call));
    act(() => phone().emit('incoming', b));
    act(() => result.current.answerCall(b as unknown as Call)); // A held, B active
    expect(result.current.activeCall).toBe(b as unknown as Call);

    // Reset counters, then switch back to A. The hold must target the TRUE active
    // leg (B) — with a render-late ref this could hold the already-replaced A.
    a.holdCalls = 0;
    b.holdCalls = 0;
    act(() => result.current.switchToCall(a as unknown as Call));
    expect(b.holdCalls).toBe(1); // the real active leg was held
    expect(a.holdCalls).toBe(0); // never held the leg we're switching TO
    expect(result.current.activeCall).toBe(a as unknown as Call);
  });

  it('switchToCall resumes the held call if resuming the target fails', () => {
    const onError = jest.fn();
    const { result } = renderHook(() => useCalls({ token: 'tok', onError }));
    act(() => phone().emit('connected'));

    const a = new FakeCall('inbound', '+1111', null, 'me');
    const b = new FakeCall('inbound', '+2222', null, 'me');
    act(() => phone().emit('incoming', a));
    act(() => result.current.answerCall(a as unknown as Call));
    act(() => phone().emit('incoming', b));
    act(() => result.current.answerCall(b as unknown as Call)); // A held, B active

    // Switching back to A: A.resume() throws. B was just held — it must be
    // resumed (rolled back) so the conversation isn't stranded on hold.
    a.resume = () => {
      throw { code: 'call_failed', message: 'resume failed' };
    };
    act(() => result.current.switchToCall(a as unknown as Call));

    expect(b.holdCalls).toBe(1);
    expect(b.resumeCalls).toBe(1); // rolled back
    expect(onError).toHaveBeenCalledWith({ code: 'call_failed', message: 'resume failed' });
  });

  it('answerCall resumes the held call if answering the target fails', () => {
    const onError = jest.fn();
    const { result } = renderHook(() => useCalls({ token: 'tok', onError }));
    act(() => phone().emit('connected'));

    const a = new FakeCall('inbound', '+1111', null, 'me');
    act(() => phone().emit('incoming', a));
    act(() => result.current.answerCall(a as unknown as Call)); // A active

    // A second inbound arrives; answering it throws. A was auto-held — it must be
    // resumed (rolled back).
    const b = new FakeCall('inbound', '+2222', null, 'me');
    act(() => phone().emit('incoming', b));
    b.answer = () => {
      throw { code: 'call_failed', message: 'answer failed' };
    };
    act(() => result.current.answerCall(b as unknown as Call));

    expect(a.holdCalls).toBe(1);
    expect(a.resumeCalls).toBe(1); // rolled back
    expect(onError).toHaveBeenCalledWith({ code: 'call_failed', message: 'answer failed' });
  });

  it('clears the active call when it ends and fires onCallEnded', () => {
    const onCallEnded = jest.fn();
    const { result } = renderHook(() => useCalls({ token: 'tok', onCallEnded }));
    act(() => phone().emit('connected'));

    const inbound = new FakeCall('inbound', '+1111', null, 'me');
    act(() => phone().emit('incoming', inbound));
    act(() => result.current.answerCall(inbound as unknown as Call));
    expect(result.current.activeCall).not.toBeNull();

    act(() => inbound.emit('ended', 'hangup' as CallEndReason));
    expect(onCallEnded).toHaveBeenCalledWith({ reason: 'hangup' });
    expect(result.current.activeCall).toBeNull();
  });

  it('promotes a held call to active (still held) when the active call ends', () => {
    // Repro: in a call, a call-waiting interrupt arrives and is answered (A held,
    // B active). Ending B must surface A as the on-screen call — not leave the
    // in-call screen blank with A stranded in the list. A stays HELD (the user
    // resumes it), so we only re-focus it, we don't auto-resume.
    const { result } = renderHook(() => useCalls({ token: 'tok' }));
    act(() => phone().emit('connected'));

    const a = new FakeCall('inbound', '+1111', null, 'me');
    const b = new FakeCall('inbound', '+2222', null, 'me');
    act(() => phone().emit('incoming', a));
    act(() => result.current.answerCall(a as unknown as Call));
    act(() => phone().emit('incoming', b));
    act(() => result.current.answerCall(b as unknown as Call)); // A held, B active

    expect(result.current.activeCall).toBe(b as unknown as Call);
    expect(a.state).toBe('held');

    act(() => b.emit('ended', 'hangup' as CallEndReason));

    // A is now the active (on-screen) call, and still on hold — not resumed.
    expect(result.current.activeCall).toBe(a as unknown as Call);
    expect(result.current.heldCalls).toEqual([] as unknown as Call[]);
    expect(a.state).toBe('held');
    expect(a.resumeCalls).toBe(0);
  });

  it('keeps exactly one active call as answered calls end one by one', () => {
    const { result } = renderHook(() => useCalls({ token: 'tok' }));
    act(() => phone().emit('connected'));

    const a = new FakeCall('inbound', '+1111', null, 'me');
    const b = new FakeCall('inbound', '+2222', null, 'me');
    const c = new FakeCall('inbound', '+3333', null, 'me');
    act(() => phone().emit('incoming', a));
    act(() => result.current.answerCall(a as unknown as Call));
    act(() => phone().emit('incoming', b));
    act(() => result.current.answerCall(b as unknown as Call));
    act(() => phone().emit('incoming', c));
    act(() => result.current.answerCall(c as unknown as Call)); // A,B held; C active

    // End the active one repeatedly — a held call always takes over, never blank.
    act(() => c.emit('ended', 'hangup' as CallEndReason));
    expect(result.current.activeCall).toBe(b as unknown as Call);
    act(() => b.emit('ended', 'hangup' as CallEndReason));
    expect(result.current.activeCall).toBe(a as unknown as Call);
    // Last call ends → no calls left → no active call.
    act(() => a.emit('ended', 'hangup' as CallEndReason));
    expect(result.current.activeCall).toBeNull();
    expect(result.current.calls).toEqual([]);
  });

  it('has no active call when only a ringing inbound remains after the answered call ends', () => {
    const { result } = renderHook(() => useCalls({ token: 'tok' }));
    act(() => phone().emit('connected'));

    const answered = new FakeCall('inbound', '+1111', null, 'me');
    act(() => phone().emit('incoming', answered));
    act(() => result.current.answerCall(answered as unknown as Call)); // active
    const ringing = new FakeCall('inbound', '+2222', null, 'me'); // stays 'trying'
    act(() => phone().emit('incoming', ringing)); // call-waiting, not active

    act(() => answered.emit('ended', 'hangup' as CallEndReason));

    // The only remaining call is still ringing — it must NOT be auto-promoted.
    expect(result.current.activeCall).toBeNull();
    expect(result.current.incomingCalls).toEqual([ringing] as unknown as Call[]);
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
    // No call placed, but not a silent no-op — the host caller is told.
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

  it('resumes the call it held when the second dial fails (no stranded hold)', async () => {
    const onError = jest.fn();
    const { result } = renderHook(() => useCalls({ token: 'tok', onError }));
    act(() => phone().emit('connected'));

    // Place a first call; it becomes the active foreground call.
    await act(async () => {
      await result.current.placeCall('+15551110000');
    });
    const first = result.current.activeCall as unknown as FakeCall;
    first.state = 'active';
    // Faithful to the real Call: hold() only sends the message; `state` does NOT
    // flip to 'held' synchronously (it changes on the server echo). So resume must
    // target the same call we held, not gate on its (still-'active') state — the
    // exact timing a synchronous fake would have masked.
    first.hold = () => {
      first.holdCalls += 1;
    };

    // placeCall holds `first`, then the dial rejects. It must resume `first`.
    phone().call = jest
      .fn()
      .mockRejectedValue({ code: 'mic_permission_denied', message: 'no mic' });
    await act(async () => {
      await result.current.placeCall('+15552220000');
    });

    await waitFor(() =>
      expect(onError).toHaveBeenCalledWith({ code: 'mic_permission_denied', message: 'no mic' })
    );
    expect(first.holdCalls).toBe(1);
    expect(first.resumeCalls).toBe(1);
    expect(result.current.activeCall).not.toBeNull();
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

  it('keeps stable transfer roles when switching focus between the consult legs', async () => {
    // A consult is two switchable calls + a transfer flag: switching focus to the
    // original must NOT flip the roles. consultCall/transferOriginal stay pinned,
    // and completeAttendedTransfer still bridges via the (correct) original.
    const { result, original } = withActiveCall();
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

    // Switch focus back to the original (now the active call), consult held.
    act(() => result.current.switchToCall(original as unknown as Call));
    expect(result.current.activeCall).toBe(original as unknown as Call);
    // Roles unchanged despite the active call flipping.
    expect(result.current.consultCall).toBe(consult as unknown as Call);
    expect(result.current.transferOriginal).toBe(original as unknown as Call);

    // Complete still bridges via the original.
    act(() => result.current.completeAttendedTransfer());
    expect(original.completeTransferCalls).toBe(1);
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
    // The held original remains the foreground call, and its transfer flags are
    // cleared — it's a plain call again, not half of a dangling transfer.
    expect(result.current.activeCall).toBe(original as unknown as Call);
    expect(result.current.transferOriginal).toBeNull();
    expect(result.current.calls[0]?.transferPeer).toBeNull();
    expect(result.current.calls[0]?.transferRole).toBeNull();
  });

  it('clears the transfer flags on the consult when the ORIGINAL leg ends first', async () => {
    // Symmetric to the above: if the original drops mid-consult, the surviving
    // consult must shed its transfer role/peer (no dangling half-transfer).
    const { result, original } = withActiveCall();
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
    // The original hangs up (remote drop) while the consult is live.
    act(() => (original as unknown as FakeCall).emit('ended', 'hangup' as CallEndReason));
    // The consult survives as the active call, no longer part of a transfer.
    expect(result.current.activeCall).toBe(consult as unknown as Call);
    expect(result.current.consultCall).toBeNull();
    expect(result.current.transferOriginal).toBeNull();
    const consultEntry = result.current.calls.find((e) => e.call === (consult as unknown as Call));
    expect(consultEntry?.transferPeer).toBeNull();
    expect(consultEntry?.transferRole).toBeNull();
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

  it('placeCall while a transfer is in progress does not orphan the transfer legs', async () => {
    const { result, original } = withActiveCall();
    await act(async () => {
      await result.current.placeCall('+1000');
    });
    await act(async () => {
      await result.current.startAttendedTransfer('+2000');
    });
    const consult = original.consult!;

    // Multi-call: placing a 3rd call is allowed; it holds the consult and dials.
    // The transfer legs (consult + held original) must survive as entries, not be
    // dropped — the new outbound just joins the list as active.
    await act(async () => {
      await result.current.placeCall('+3000');
    });

    expect(phone().callArgs).toContain('+3000');
    // Both transfer legs still present in the call list (not orphaned).
    const calls = result.current.calls.map((e) => e.call);
    expect(calls).toContain(consult as unknown as Call);
    expect(calls).toContain(original as unknown as Call);
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

  it('surfaces a new inbound as call-waiting during a consult without stomping it', async () => {
    const { result, original } = withActiveCall();
    await act(async () => {
      await result.current.placeCall('+1000');
    });
    await act(async () => {
      await result.current.startAttendedTransfer('+2000');
    });
    const intruder = new FakeCall('inbound', '+3000', null, 'me');
    act(() => phone().emit('incoming', intruder));
    // Multi-call: the intruder is surfaced as an incoming (call-waiting), NOT
    // rejected, and the in-progress transfer is untouched (consult still active).
    expect(result.current.incomingCalls).toEqual([intruder] as unknown as Call[]);
    expect(intruder.rejectReasons).toEqual([]);
    expect(result.current.activeCall).toBe(original.consult as unknown as Call);
    expect(result.current.consultCall).toBe(original.consult as unknown as Call);
    expect(result.current.transferOriginal).toBe(original as unknown as Call);
  });
});
