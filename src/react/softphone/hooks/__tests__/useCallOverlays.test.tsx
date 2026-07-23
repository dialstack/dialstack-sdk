import { renderHook, act } from '@testing-library/react';
import { useCallOverlays } from '../useCallOverlays';
import type { Call } from '../../../../webrtc';

function fakeCall(): Call {
  return { state: 'active', isMuted: false } as unknown as Call;
}

describe('useCallOverlays', () => {
  it('keypad and transfer overlays are mutually exclusive', () => {
    // A stable call identity across renders — the reset effect keys on the call,
    // so a fresh object each render would reset the flags mid-test.
    const call = fakeCall();
    const { result } = renderHook(() => useCallOverlays(call));

    expect(result.current.showKeypad).toBe(false);
    expect(result.current.showTransfer).toBe(false);

    act(() => result.current.toggleKeypad());
    expect(result.current.showKeypad).toBe(true);
    expect(result.current.showTransfer).toBe(false);

    act(() => result.current.toggleTransfer());
    expect(result.current.showKeypad).toBe(false);
    expect(result.current.showTransfer).toBe(true);

    // Toggling the same overlay off closes it.
    act(() => result.current.toggleTransfer());
    expect(result.current.showKeypad).toBe(false);
    expect(result.current.showTransfer).toBe(false);
  });

  it('closeTransfer closes only the transfer overlay', () => {
    const call = fakeCall();
    const { result } = renderHook(() => useCallOverlays(call));
    act(() => result.current.toggleTransfer());
    expect(result.current.showTransfer).toBe(true);

    act(() => result.current.closeTransfer());
    expect(result.current.showTransfer).toBe(false);
  });

  it('resets overlays when the foreground call changes (new call or → null)', () => {
    const { result, rerender } = renderHook(({ call }) => useCallOverlays(call), {
      initialProps: { call: fakeCall() as Call | null },
    });

    act(() => result.current.toggleTransfer());
    expect(result.current.showTransfer).toBe(true);

    // A different call takes the foreground → overlay resets.
    rerender({ call: fakeCall() });
    expect(result.current.showTransfer).toBe(false);

    act(() => result.current.toggleKeypad());
    expect(result.current.showKeypad).toBe(true);

    // Call ends (→ null) → overlay resets.
    rerender({ call: null });
    expect(result.current.showKeypad).toBe(false);
  });
});
