// The native seam must open the socket with a non-empty User-Agent (the ingress
// 403s a UA-less handshake, which iOS sends); the web seam must not. Mocks
// react-native-* so platform.native evaluates under jsdom.

jest.mock('react-native-incall-manager', () => ({ __esModule: true, default: {} }));
jest.mock('react-native-webrtc', () => ({
  __esModule: true,
  MediaStream: class {},
  MediaStreamTrack: class {},
  RTCPeerConnection: class {},
  mediaDevices: {},
}));

class CapturingWebSocket {
  static OPEN = 1;
  static calls: unknown[][] = [];
  constructor(...args: unknown[]) {
    CapturingWebSocket.calls.push(args);
  }
}

let originalWebSocket: unknown;

beforeEach(() => {
  CapturingWebSocket.calls = [];
  originalWebSocket = (globalThis as Record<string, unknown>).WebSocket;
  (globalThis as Record<string, unknown>).WebSocket = CapturingWebSocket;
});

afterEach(() => {
  (globalThis as Record<string, unknown>).WebSocket = originalWebSocket;
  jest.resetModules();
});

describe('createSignalingSocket', () => {
  const URL = 'wss://webrtc.example.com/v1/webrtc';
  const PROTOCOLS = ['dialstack.webrtc.v1'];

  it('native seam opens the socket with a non-empty User-Agent header', async () => {
    const { createSignalingSocket } = await import('../platform.native');
    createSignalingSocket(URL, PROTOCOLS);

    expect(CapturingWebSocket.calls).toHaveLength(1);
    const [url, protocols, options] = CapturingWebSocket.calls[0] as [
      string,
      string[],
      { headers?: Record<string, string> },
    ];
    expect(url).toBe(URL);
    expect(protocols).toEqual(PROTOCOLS);
    expect(options?.headers?.['User-Agent']).toBeTruthy();
  });

  it('web seam opens the socket with no options arg (browser supplies its own UA)', async () => {
    const { createSignalingSocket } = await import('../platform');
    createSignalingSocket(URL, PROTOCOLS);

    expect(CapturingWebSocket.calls).toHaveLength(1);
    const args = CapturingWebSocket.calls[0];
    expect(args[0]).toBe(URL);
    expect(args[1]).toEqual(PROTOCOLS);
    expect(args).toHaveLength(2);
  });
});
