import { useCallback, useMemo, useSyncExternalStore } from 'react';

export type AudioOutputKind =
  'earpiece' | 'speaker' | 'wired' | 'bluetooth' | 'car' | 'airplay' | 'other';

export interface AudioOutput {
  id: string;
  kind: AudioOutputKind;
  name: string;
}

/**
 * Call-audio routing, implemented by a host that owns call audio
 * (`callAudio="host"`) over whatever its OS integration exposes.
 *
 * `current()` must be what the OS reports, never what was last requested: the
 * route also changes from the CallKit/Telecom UI, a headset, or a car, and the
 * softphone shows only this. It must return the same object until the route
 * changes.
 */
export interface AudioOutputController {
  current(): AudioOutput | null;
  onChange(listener: (output: AudioOutput | null) => void): () => void;
  setSpeaker(on: boolean): Promise<void>;
}

export interface UseAudioOutput {
  supported: boolean;
  current: AudioOutput | null;
  speakerOn: boolean;
  toggleSpeaker: () => void;
}

export function useAudioOutputController(
  controller: AudioOutputController | undefined,
  onError?: (err: unknown) => void
): UseAudioOutput {
  const subscribe = useCallback(
    (notify: () => void) => controller?.onChange(notify) ?? (() => {}),
    [controller]
  );
  const snapshot = useCallback(() => controller?.current() ?? null, [controller]);
  const current = useSyncExternalStore(subscribe, snapshot, snapshot);
  const speakerOn = current?.kind === 'speaker';

  const toggleSpeaker = useCallback(() => {
    if (!controller) return;
    // Through a promise so a host's setSpeaker that throws synchronously, or
    // returns no promise, still lands in onError instead of the press handler.
    Promise.resolve()
      .then(() => controller.setSpeaker(!speakerOn))
      .catch((err: unknown) => onError?.(err));
  }, [controller, speakerOn, onError]);

  return useMemo(
    () => ({ supported: controller !== undefined, current, speakerOn, toggleSpeaker }),
    [controller, current, speakerOn, toggleSpeaker]
  );
}
