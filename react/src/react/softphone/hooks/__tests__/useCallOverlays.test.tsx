import { renderHook, act } from '@testing-library/react';
import { useCallOverlays } from '../useCallOverlays';
import type { Call } from '../../../../../../webrtc/src';

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

  it('all three overlays are mutually exclusive', () => {
    // Exclusivity is structural (one piece of state names the open panel), so this
    // guards against a regression back to N booleans where each toggler has to
    // remember to clear the others.
    const call = fakeCall();
    const { result } = renderHook(() => useCallOverlays(call));
    const open = (): string[] =>
      [
        result.current.showKeypad && 'keypad',
        result.current.showTransfer && 'transfer',
        result.current.showDevices && 'devices',
      ].filter(Boolean) as string[];

    act(() => result.current.toggleDevices());
    expect(open()).toEqual(['devices']);

    act(() => result.current.toggleKeypad());
    expect(open()).toEqual(['keypad']);

    act(() => result.current.toggleDevices());
    expect(open()).toEqual(['devices']);

    act(() => result.current.toggleTransfer());
    expect(open()).toEqual(['transfer']);

    act(() => result.current.toggleDevices());
    expect(open()).toEqual(['devices']);

    // Toggling the open one closes it, leaving nothing open.
    act(() => result.current.toggleDevices());
    expect(open()).toEqual([]);
  });

  it('closeTransfer leaves another open overlay alone', () => {
    const call = fakeCall();
    const { result } = renderHook(() => useCallOverlays(call));
    act(() => result.current.toggleDevices());

    act(() => result.current.closeTransfer());

    // It closes the transfer overlay specifically, not "whatever is open".
    expect(result.current.showDevices).toBe(true);
  });

  it('resets the devices overlay when the foreground call changes', () => {
    const { result, rerender } = renderHook(({ call }) => useCallOverlays(call), {
      initialProps: { call: fakeCall() as Call | null },
    });
    act(() => result.current.toggleDevices());
    expect(result.current.showDevices).toBe(true);

    rerender({ call: null });

    expect(result.current.showDevices).toBe(false);
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
