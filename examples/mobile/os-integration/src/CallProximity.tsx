import { useEffect } from 'react';
import InCallManager from 'react-native-incall-manager';
import { useSoftphone } from '@dialstack/sdk-native';

/**
 * Blanks the screen against the ear while a call is connected. With
 * `callAudio="host"` the provider leaves this to the app. Only the sensor is
 * used: InCallManager's audio-session calls would fight CallKit/Telecom for the
 * session.
 */
export function CallProximity(): null {
  const { calls } = useSoftphone();
  const hasConnectedCall = calls.some((c) => c.isConnected);
  useEffect(() => {
    if (!hasConnectedCall) return;
    InCallManager.startProximitySensor();
    return () => InCallManager.stopProximitySensor();
  }, [hasConnectedCall]);
  return null;
}
