import { renderHook, act } from '@testing-library/react';
import { useCallActions } from '../useCallActions';
import type { Call } from '../../../../webrtc';

function fakeCall(overrides: Partial<Record<string, unknown>> = {}): {
  call: Call;
  spies: Record<string, jest.Mock>;
} {
  const spies = {
    answer: jest.fn(),
    reject: jest.fn(),
    hangup: jest.fn(),
    mute: jest.fn(),
    unmute: jest.fn(),
    hold: jest.fn(),
    resume: jest.fn(),
    sendDtmf: jest.fn(),
    transfer: jest.fn(),
  };
  const call = {
    state: 'active',
    isMuted: false,
    ...spies,
    ...overrides,
  } as unknown as Call;
  return { call, spies };
}

describe('useCallActions overlays', () => {
  it('keypad and transfer overlays are mutually exclusive', () => {
    const { call } = fakeCall();
    const { result } = renderHook(() => useCallActions(call));

    expect(result.current.showKeypad).toBe(false);
    expect(result.current.showTransfer).toBe(false);

    act(() => result.current.toggleKeypad());
    expect(result.current.showKeypad).toBe(true);
    expect(result.current.showTransfer).toBe(false);

    act(() => result.current.toggleTransfer());
    expect(result.current.showKeypad).toBe(false);
    expect(result.current.showTransfer).toBe(true);

    act(() => result.current.resetOverlays());
    expect(result.current.showKeypad).toBe(false);
    expect(result.current.showTransfer).toBe(false);
  });

  it('resets overlays when the foreground call changes (new call or → null)', () => {
    const first = fakeCall().call;
    const { result, rerender } = renderHook(({ call }) => useCallActions(call), {
      initialProps: { call: first as ReturnType<typeof fakeCall>['call'] | null },
    });

    act(() => result.current.toggleTransfer());
    expect(result.current.showTransfer).toBe(true);

    // A different call takes the foreground → overlay resets.
    rerender({ call: fakeCall().call });
    expect(result.current.showTransfer).toBe(false);

    act(() => result.current.toggleKeypad());
    expect(result.current.showKeypad).toBe(true);

    // Call ends (→ null) → overlay resets.
    rerender({ call: null });
    expect(result.current.showKeypad).toBe(false);
  });
});

describe('useCallActions pass-throughs', () => {
  it('answer / reject / hangup call the core directly', () => {
    const { call, spies } = fakeCall();
    const { result } = renderHook(() => useCallActions(call));
    act(() => result.current.answer());
    act(() => result.current.reject());
    act(() => result.current.hangup());
    expect(spies.answer).toHaveBeenCalled();
    expect(spies.reject).toHaveBeenCalled();
    expect(spies.hangup).toHaveBeenCalled();
  });

  it('toggleMute mutes an unmuted call and unmutes a muted one', () => {
    const unmuted = fakeCall({ isMuted: false });
    const { result: r1 } = renderHook(() => useCallActions(unmuted.call));
    act(() => r1.current.toggleMute());
    expect(unmuted.spies.mute).toHaveBeenCalled();
    expect(unmuted.spies.unmute).not.toHaveBeenCalled();

    const muted = fakeCall({ isMuted: true });
    const { result: r2 } = renderHook(() => useCallActions(muted.call));
    act(() => r2.current.toggleMute());
    expect(muted.spies.unmute).toHaveBeenCalled();
    expect(muted.spies.mute).not.toHaveBeenCalled();
  });

  it('toggleMute re-renders so the control reflects the new isMuted (no server event fires for mute)', () => {
    // The core flips call.isMuted in place with no server round-trip, so the
    // hook must force a re-render itself — otherwise the mute control's label
    // would go stale until some unrelated event re-rendered the tree.
    const call = {
      isMuted: false,
      state: 'active',
      mute: jest.fn(function (this: { isMuted: boolean }) {
        this.isMuted = true;
      }),
      unmute: jest.fn(),
    } as unknown as Call;
    let renders = 0;
    const { result } = renderHook(() => {
      renders += 1;
      return useCallActions(call);
    });
    const before = renders;
    act(() => result.current.toggleMute());
    expect(renders).toBeGreaterThan(before);
  });

  it('toggleHold holds an active call and resumes a held one', () => {
    const active = fakeCall({ state: 'active' });
    const { result: r1 } = renderHook(() => useCallActions(active.call));
    act(() => r1.current.toggleHold());
    expect(active.spies.hold).toHaveBeenCalled();

    const held = fakeCall({ state: 'held' });
    const { result: r2 } = renderHook(() => useCallActions(held.call));
    act(() => r2.current.toggleHold());
    expect(held.spies.resume).toHaveBeenCalled();
  });

  it('does nothing when there is no call', () => {
    const { result } = renderHook(() => useCallActions(null));
    // Should not throw.
    act(() => {
      result.current.answer();
      result.current.toggleMute();
      result.current.toggleHold();
      result.current.sendDtmf('5');
      result.current.transfer('+1');
    });
  });
});

describe('useCallActions sendDtmf', () => {
  it('forwards the digit to the call', () => {
    const { call, spies } = fakeCall();
    const { result } = renderHook(() => useCallActions(call));
    act(() => result.current.sendDtmf('7'));
    expect(spies.sendDtmf).toHaveBeenCalledWith('7');
  });

  it('ignores an empty digit', () => {
    const { call, spies } = fakeCall();
    const { result } = renderHook(() => useCallActions(call));
    act(() => result.current.sendDtmf(''));
    expect(spies.sendDtmf).not.toHaveBeenCalled();
  });

  it('routes a thrown PhoneError to onError instead of throwing', () => {
    const onError = jest.fn();
    const { call } = fakeCall({
      sendDtmf: jest.fn(() => {
        throw { code: 'call_failed', message: 'no sender' };
      }),
    });
    const { result } = renderHook(() => useCallActions(call, { onError }));
    act(() => result.current.sendDtmf('1'));
    expect(onError).toHaveBeenCalledWith({ code: 'call_failed', message: 'no sender' });
  });
});

describe('useCallActions transfer', () => {
  it('transfers a trimmed destination and closes the transfer overlay', () => {
    const { call, spies } = fakeCall();
    const { result } = renderHook(() => useCallActions(call));
    act(() => result.current.toggleTransfer());
    expect(result.current.showTransfer).toBe(true);

    act(() => result.current.transfer('  +15551234567  '));
    expect(spies.transfer).toHaveBeenCalledWith('+15551234567');
    expect(result.current.showTransfer).toBe(false);
  });

  it('ignores an empty destination', () => {
    const { call, spies } = fakeCall();
    const { result } = renderHook(() => useCallActions(call));
    act(() => result.current.transfer('   '));
    expect(spies.transfer).not.toHaveBeenCalled();
  });

  it('routes a thrown PhoneError to onError and leaves the overlay open', () => {
    const onError = jest.fn();
    const { call } = fakeCall({
      transfer: jest.fn(() => {
        throw { code: 'invalid_message', message: 'not active' };
      }),
    });
    const { result } = renderHook(() => useCallActions(call, { onError }));
    act(() => result.current.toggleTransfer());
    act(() => result.current.transfer('+1'));
    expect(onError).toHaveBeenCalledWith({ code: 'invalid_message', message: 'not active' });
    expect(result.current.showTransfer).toBe(true);
  });
});
