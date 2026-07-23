import { renderHook, act } from '@testing-library/react';
import { useCallDuration } from '../useCallDuration';
import type { Call } from '../../../../webrtc';

function fakeCall(state: string, duration: number): Call {
  // `isConnected` mirrors the real Call getter (active OR held) that
  // isCallActive — used by the duration hook — now delegates to.
  return {
    state,
    duration,
    get isConnected() {
      return this.state === 'active' || this.state === 'held';
    },
  } as unknown as Call;
}

describe('useCallDuration', () => {
  beforeEach(() => jest.useFakeTimers());
  afterEach(() => jest.useRealTimers());

  it('returns 0:00 when there is no call', () => {
    const { result } = renderHook(() => useCallDuration(null));
    expect(result.current).toBe('0:00');
  });

  it('formats the current call duration', () => {
    const { result } = renderHook(() => useCallDuration(fakeCall('active', 65)));
    expect(result.current).toBe('1:05');
  });

  it('re-renders to reflect the mutated duration while a call is active', () => {
    const call = fakeCall('active', 0);
    const { result } = renderHook(() => useCallDuration(call, 500));
    expect(result.current).toBe('0:00');

    // The core mutates call.duration in place; the tick picks it up.
    (call as { duration: number }).duration = 3;
    act(() => {
      jest.advanceTimersByTime(500);
    });
    expect(result.current).toBe('0:03');
  });

  it('does not tick for a non-active call (ringing/trying)', () => {
    const call = fakeCall('ringing', 0);
    const { result } = renderHook(() => useCallDuration(call, 500));
    (call as { duration: number }).duration = 9;
    act(() => {
      jest.advanceTimersByTime(2000);
    });
    // No tick scheduled, so the readout reflects the initial (0) duration.
    expect(result.current).toBe('0:00');
  });
});
