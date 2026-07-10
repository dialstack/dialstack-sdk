/**
 * Tests for useCall against a faked DialStackPhone event stream. The fake lets
 * the test drive the same events the real core emits (connected, incoming,
 * call.* lifecycle) so the hook's connection-state mapping, foreground-call
 * policy, per-call wiring, and teardown are exercised without a WebSocket.
 */

import { renderHook, act, waitFor } from '@testing-library/react';
import { useCall } from '../useCall';
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
}

class FakeCall extends Emitter {
  state = 'trying';
  isMuted = false;
  duration = 0;
  constructor(
    public direction: 'inbound' | 'outbound',
    public from: string,
    public fromName: string | null,
    public to: string
  ) {
    super();
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

describe('useCall connection lifecycle', () => {
  it('connects on mount and maps connection events to state', async () => {
    const { result } = renderHook(() => useCall({ token: 'tok' }));

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
    const { result } = renderHook(() => useCall({ token: 'tok', autoConnect: false }));
    expect(result.current.connection).toBe('idle');
    expect(phone().connectCalls).toBe(0);
  });

  it('disconnects the phone on unmount', () => {
    const { unmount } = renderHook(() => useCall({ token: 'tok' }));
    const p = phone();
    unmount();
    expect(p.disconnectCalls).toBe(1);
  });

  it('surfaces a fatal error as the error state and forwards it to onError', () => {
    const onError = jest.fn();
    const { result } = renderHook(() => useCall({ token: 'tok', onError }));
    act(() => phone().emit('error', { code: 'unauthorized', message: 'bad token', fatal: true }));
    expect(onError).toHaveBeenCalledWith({ code: 'unauthorized', message: 'bad token' });
    expect(result.current.connection).toBe('error');
  });
});

describe('useCall foreground-call policy', () => {
  it('presents an incoming call and fires onIncomingCall', () => {
    const onIncomingCall = jest.fn();
    const { result } = renderHook(() => useCall({ token: 'tok', onIncomingCall }));
    act(() => phone().emit('connected'));

    const inbound = new FakeCall('inbound', '+15551112222', 'Alice', 'me');
    act(() => phone().emit('incoming', inbound));

    expect(result.current.activeCall).toBe(inbound as unknown as Call);
    expect(onIncomingCall).toHaveBeenCalledWith({ from: '+15551112222', fromName: 'Alice' });
  });

  it('latest inbound call replaces the foreground call', () => {
    const { result } = renderHook(() => useCall({ token: 'tok' }));
    act(() => phone().emit('connected'));

    const first = new FakeCall('inbound', '+1111', null, 'me');
    const second = new FakeCall('inbound', '+2222', null, 'me');
    act(() => phone().emit('incoming', first));
    act(() => phone().emit('incoming', second));

    expect(result.current.activeCall).toBe(second as unknown as Call);
  });

  it('unwires a replaced call so its later events no longer fire handlers', () => {
    const onCallEnded = jest.fn();
    const { result } = renderHook(() => useCall({ token: 'tok', onCallEnded }));
    act(() => phone().emit('connected'));

    const first = new FakeCall('inbound', '+1111', null, 'me');
    const second = new FakeCall('inbound', '+2222', null, 'me');
    act(() => phone().emit('incoming', first));
    act(() => phone().emit('incoming', second)); // first is replaced as foreground

    // The replaced call ending must NOT clear the current foreground call or
    // fire onCallEnded — its listeners were removed when it lost the foreground.
    act(() => first.emit('ended', 'hangup' as CallEndReason));
    expect(onCallEnded).not.toHaveBeenCalled();
    expect(result.current.activeCall).toBe(second as unknown as Call);

    // The current foreground call still behaves normally.
    act(() => second.emit('ended', 'hangup' as CallEndReason));
    expect(onCallEnded).toHaveBeenCalledWith({ reason: 'hangup' });
    expect(result.current.activeCall).toBeNull();
  });

  it('clears the foreground call when it ends and fires onCallEnded', () => {
    const onCallEnded = jest.fn();
    const { result } = renderHook(() => useCall({ token: 'tok', onCallEnded }));
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
    renderHook(() => useCall({ token: 'tok', onCallActivated, onCallStarted }));
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

describe('useCall placeCall', () => {
  it('places an outbound call when connected and fires onCallStarted(outbound)', async () => {
    const onCallStarted = jest.fn();
    const { result } = renderHook(() => useCall({ token: 'tok', onCallStarted }));
    act(() => phone().emit('connected'));

    await act(async () => {
      await result.current.placeCall('+15559998888');
    });

    expect(phone().callArgs).toEqual(['+15559998888']);
    expect(result.current.activeCall).not.toBeNull();
    expect(onCallStarted).toHaveBeenCalledWith({ direction: 'outbound', peer: '+15559998888' });
  });

  it('no-ops when not connected', async () => {
    const { result } = renderHook(() => useCall({ token: 'tok' }));
    // still 'connecting' — never emitted connected
    await act(async () => {
      await result.current.placeCall('+15559998888');
    });
    expect(phone().callArgs).toEqual([]);
    expect(result.current.activeCall).toBeNull();
  });

  it('no-ops for an empty/whitespace destination', async () => {
    const { result } = renderHook(() => useCall({ token: 'tok' }));
    act(() => phone().emit('connected'));
    await act(async () => {
      await result.current.placeCall('   ');
    });
    expect(phone().callArgs).toEqual([]);
  });

  it('forwards a placeCall failure to onError', async () => {
    const onError = jest.fn();
    const { result } = renderHook(() => useCall({ token: 'tok', onError }));
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

describe('useCall credential changes', () => {
  it('reconstructs and reconnects the phone when the token changes', () => {
    const { rerender } = renderHook(({ token }) => useCall({ token }), {
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
    const { rerender } = renderHook(({ onError }) => useCall({ token: 'tok', onError }), {
      initialProps: { onError: () => {} },
    });
    const p = phone();
    rerender({ onError: () => {} });
    expect(phone()).toBe(p);
    expect(p.connectCalls).toBe(1);
    expect(p.disconnectCalls).toBe(0);
  });
});
