/**
 * The rig under scripts/ — standing in for your backend. 10.0.2.2 is the host
 * loopback as seen from the Android emulator.
 */
export const RIG_URL = process.env.EXPO_PUBLIC_RIG_URL ?? 'http://10.0.2.2:8788';
