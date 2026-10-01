import { act, renderHook } from '@testing-library/react';

import {
  useAudioOutputController,
  type AudioOutput,
  type AudioOutputController,
} from '../audioOutput';

const EARPIECE: AudioOutput = { id: 'e', kind: 'earpiece', name: 'Earpiece' };
const SPEAKER: AudioOutput = { id: 's', kind: 'speaker', name: 'Speaker' };

function fakeController(initial: AudioOutput | null) {
  let current = initial;
  const listeners = new Set<(o: AudioOutput | null) => void>();
  const setSpeaker = jest.fn<Promise<void>, [boolean]>(async () => {});
  const controller: AudioOutputController = {
    current: () => current,
    onChange: (l) => {
      listeners.add(l);
      return () => listeners.delete(l);
    },
    setSpeaker,
  };
  const route = (o: AudioOutput | null) => {
    current = o;
    for (const l of listeners) l(o);
  };
  return { controller, route, setSpeaker };
}

describe('useAudioOutputController', () => {
  it('is unsupported and inert without a controller', () => {
    const { result } = renderHook(() => useAudioOutputController(undefined));
    expect(result.current.supported).toBe(false);
    expect(result.current.speakerOn).toBe(false);

    expect(() => act(() => result.current.toggleSpeaker())).not.toThrow();
    expect(result.current.current).toBeNull();
    expect(result.current.speakerOn).toBe(false);
  });

  it('follows routes the OS reports, whoever changed them', () => {
    const { controller, route } = fakeController(EARPIECE);
    const { result } = renderHook(() => useAudioOutputController(controller));
    expect(result.current.speakerOn).toBe(false);

    act(() => route(SPEAKER));
    expect(result.current.current).toBe(SPEAKER);
    expect(result.current.speakerOn).toBe(true);
  });

  it('asks for the opposite of the reported route, without assuming it took', async () => {
    const { controller, route, setSpeaker } = fakeController(EARPIECE);
    const { result } = renderHook(() => useAudioOutputController(controller));

    await act(async () => result.current.toggleSpeaker());
    expect(setSpeaker).toHaveBeenLastCalledWith(true);
    expect(result.current.speakerOn).toBe(false);

    act(() => route(SPEAKER));
    await act(async () => result.current.toggleSpeaker());
    expect(setSpeaker).toHaveBeenLastCalledWith(false);
  });

  it('reports a failed route change', async () => {
    const { controller, setSpeaker } = fakeController(EARPIECE);
    setSpeaker.mockRejectedValueOnce(new Error('no endpoint'));
    const onError = jest.fn();
    const { result } = renderHook(() => useAudioOutputController(controller, onError));

    await act(async () => result.current.toggleSpeaker());
    expect(onError).toHaveBeenCalledWith(new Error('no endpoint'));
  });

  it('reports a route change that throws synchronously', async () => {
    const { controller, setSpeaker } = fakeController(EARPIECE);
    setSpeaker.mockImplementationOnce(() => {
      throw new Error('not in a call');
    });
    const onError = jest.fn();
    const { result } = renderHook(() => useAudioOutputController(controller, onError));

    await act(async () => result.current.toggleSpeaker());
    expect(onError).toHaveBeenCalledWith(new Error('not in a call'));
  });
});
