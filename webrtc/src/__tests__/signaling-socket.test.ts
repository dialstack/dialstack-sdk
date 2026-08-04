// The signaling socket is a platform seam injected into Transport: web opens a
// bare `new WebSocket(url, protocols)` (the browser supplies its own User-Agent
// and forbids overriding it), while React Native must attach a User-Agent (the
// ingress 403s a UA-less handshake, which iOS sends). The RN-specific factory
// lives in the native package; here we verify Transport's contract — it opens a
// bare socket by default and otherwise defers verbatim to an injected factory.

import { Transport } from '../transport';

class CapturingWebSocket {
  static OPEN = 1;
  static calls: unknown[][] = [];
  readyState = 0;
  constructor(...args: unknown[]) {
    CapturingWebSocket.calls.push(args);
  }
  addEventListener(): void {}
  close(): void {}
}

let originalWebSocket: unknown;

beforeEach(() => {
  CapturingWebSocket.calls = [];
  originalWebSocket = (globalThis as Record<string, unknown>).WebSocket;
  (globalThis as Record<string, unknown>).WebSocket = CapturingWebSocket;
});

afterEach(() => {
  (globalThis as Record<string, unknown>).WebSocket = originalWebSocket;
});

describe('Transport signaling socket', () => {
  const URL = 'wss://webrtc.example.com/v1/webrtc';
  const PROTOCOLS = ['dialstack.webrtc.v1'];

  it('defaults to a bare WebSocket with no options arg (browser supplies its own UA)', () => {
    new Transport(URL, false).connect();

    expect(CapturingWebSocket.calls).toHaveLength(1);
    const args = CapturingWebSocket.calls[0]!;
    expect(args[0]).toBe(URL);
    expect(args[1]).toEqual(PROTOCOLS);
    expect(args).toHaveLength(2);
  });

  it('opens the socket through an injected factory verbatim (the RN User-Agent seam)', () => {
    const seen: unknown[][] = [];
    const factory = (url: string, protocols: string[]): WebSocket => {
      seen.push([url, protocols]);
      // A native factory would attach a User-Agent header here; the contract we
      // assert is that Transport hands the seam the url + protocols unchanged.
      return new CapturingWebSocket(url, protocols, {
        headers: { 'User-Agent': 'dialstack-sdk (react-native)' },
      }) as unknown as WebSocket;
    };

    new Transport(URL, false, factory).connect();

    expect(seen).toEqual([[URL, PROTOCOLS]]);
    const [, , options] = CapturingWebSocket.calls[0] as [
      string,
      string[],
      { headers?: Record<string, string> },
    ];
    expect(options?.headers?.['User-Agent']).toBeTruthy();
  });
});
