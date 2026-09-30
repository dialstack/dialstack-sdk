import type { Ringback } from '@dialstack/sdk-react/core';

/**
 * Passed instead of leaving `ringback` unset: unset, the core falls back to its
 * WebAudio tone, which is silent on React Native only while no `AudioContext`
 * polyfill is installed.
 */
export const silentRingback: Ringback = {
  isPlaying: false,
  start() {},
  stop() {},
};

export type CallAudioOwner = 'sdk' | 'host';

/**
 * A bridge means the OS owns the call, so it always owns the audio: the
 * provider ringing on top of CallKit/Telecom costs the answered call its
 * microphone. `requested` matters only without one.
 */
export function resolveCallAudio(
  hasBridge: boolean,
  requested: CallAudioOwner = 'sdk'
): CallAudioOwner {
  return hasBridge ? 'host' : requested;
}
