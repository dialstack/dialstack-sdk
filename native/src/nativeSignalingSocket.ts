import type { SignalingSocketFactory } from '@dialstack/sdk-react/core';

// The signaling ingress 403s a handshake with no `User-Agent`. iOS's WebSocket
// (SocketRocket) sends none by default, so we set one explicitly. RN's WebSocket
// takes a third `options` arg the DOM type doesn't declare; hence the cast.
const NATIVE_USER_AGENT = 'dialstack-sdk (react-native)';

/**
 * Its own module so `createPhone()` can use it without importing the provider
 * (and React with it): a push-woken headless runtime has no renderer, yet it
 * needs the same header or the ingress 403s its handshake.
 */
export const nativeSignalingSocket: SignalingSocketFactory = (url, protocols) => {
  const RNWebSocket = globalThis.WebSocket as unknown as new (
    url: string,
    protocols: string[],
    options: { headers: Record<string, string> }
  ) => WebSocket;
  return new RNWebSocket(url, protocols, {
    headers: { 'User-Agent': NATIVE_USER_AGENT },
  });
};
