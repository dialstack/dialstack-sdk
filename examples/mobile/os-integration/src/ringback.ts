import type { CreatePhoneOptions } from '@dialstack/sdk-native';
import { Platform } from 'react-native';
import InCallManager from 'react-native-incall-manager';

let playing = false;

/**
 * Outbound ringback, Android only. The provider plays none when the OS owns call
 * audio, so the app supplies it. Android's is a tone generator on the call
 * stream, which leaves Telecom's audio alone. iOS gets none: InCallManager has
 * no tone generator there, so it plays a ringtone file instead, through its own
 * player, from the speaker, and resets the category options CallKit's session
 * was configured with.
 */
export const ringback: CreatePhoneOptions['ringback'] =
  Platform.OS === 'android'
    ? {
        get isPlaying() {
          return playing;
        },
        start() {
          if (playing) return;
          try {
            InCallManager.startRingback('_DTMF_');
            playing = true;
          } catch {
            // Best-effort: the call goes on without a ringback.
          }
        },
        stop() {
          if (!playing) return;
          playing = false;
          try {
            InCallManager.stopRingback();
          } catch {
            // Best-effort.
          }
        },
      }
    : undefined;
