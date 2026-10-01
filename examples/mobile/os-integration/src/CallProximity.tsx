import { useEffect } from 'react';
import { Platform } from 'react-native';
import InCallManager from 'react-native-incall-manager';
import { useAudioOutput, useSoftphone } from '@dialstack/sdk-native';

/**
 * Blanks the screen against the ear while a call is on the earpiece: from
 * placing it, since the phone goes to the ear while it rings out, but not while
 * an incoming call rings, when the user is looking at the screen to answer.
 * With `callAudio="host"` the provider leaves this to the app.
 *
 * Only InCallManager's screen calls are used, never `start()`: its audio routing
 * would fight CallKit/Telecom. On Android `startProximitySensor()` is no help
 * without `start()` (it blanks only when its own routing chose the earpiece), so
 * this takes the proximity wake lock directly and the OS blanks on near itself.
 */
export function CallProximity(): null {
  const { calls } = useSoftphone();
  const { current } = useAudioOutput();
  const inCall = calls.some(
    (c) => c.state !== 'ended' && (c.direction === 'outbound' || c.isConnected)
  );
  // Unknown counts as earpiece: the route is unread until the session activates.
  const atEar = current === null || current.kind === 'earpiece';
  const enabled = inCall && atEar;

  useEffect(() => {
    if (!enabled) return;
    if (Platform.OS === 'android') {
      InCallManager.turnScreenOff();
      return () => InCallManager.turnScreenOn();
    }
    InCallManager.startProximitySensor();
    return () => InCallManager.stopProximitySensor();
  }, [enabled]);
  return null;
}
