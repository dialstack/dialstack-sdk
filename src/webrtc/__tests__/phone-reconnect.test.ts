import { DialStackPhone } from '../phone';

// A WebSocket double that completes the handshake: on `open` it sends back an
// `authenticated` frame so connect() resolves. Lets a test reach a connected
// phone and then exercise reconnect().
class AuthingWebSocket {
  static instances: AuthingWebSocket[] = [];
  static OPEN = 1;
  readyState = AuthingWebSocket.OPEN;
  url: string;
  private handlers: Record<string, ((evt: unknown) => void)[]> = {};
  constructor(url: string) {
    this.url = url;
    AuthingWebSocket.instances.push(this);
  }
  addEventListener(event: string, handler: (evt: unknown) => void): void {
    (this.handlers[event] ??= []).push(handler);
  }
  send(): void {}
  close(): void {
    this.fire('close', { code: 1000, reason: '' });
  }
  fire(event: string, evt: unknown): void {
    for (const h of this.handlers[event] ?? []) h(evt);
  }
  completeAuth(): void {
    this.fire('open', {});
    this.fire('message', { data: JSON.stringify({ type: 'authenticated' }) });
  }
}

describe('DialStackPhone reconnect()', () => {
  let originalWebSocket: unknown;

  beforeEach(() => {
    AuthingWebSocket.instances = [];
    originalWebSocket = (globalThis as Record<string, unknown>).WebSocket;
    (globalThis as Record<string, unknown>).WebSocket = AuthingWebSocket;
  });

  afterEach(() => {
    (globalThis as Record<string, unknown>).WebSocket = originalWebSocket;
  });

  it('emits `reconnecting` on reconnect() so the connection state transitions', async () => {
    // Regression: the transport-staleness guard drops the old socket's async
    // `closed` once reconnect() nulls this.transport, so without an explicit
    // `reconnecting` the connection state never leaves `connected` across a
    // reconnect — and a consumer watching for a connected→…→connected transition
    // (the E911 binding re-check) never sees one and stays stuck.
    const phone = new DialStackPhone({ token: 'tok', iceServers: [], autoReconnect: false });

    const events: string[] = [];
    phone.on('reconnecting', () => events.push('reconnecting'));
    phone.on('reconnected', () => events.push('reconnected'));

    const connectP = phone.connect();
    await Promise.resolve();
    await Promise.resolve();
    AuthingWebSocket.instances[0]?.completeAuth();
    await connectP;

    const reconnectP = phone.reconnect();
    await Promise.resolve();
    await Promise.resolve();
    AuthingWebSocket.instances[AuthingWebSocket.instances.length - 1]?.completeAuth();
    await reconnectP;

    expect(events).toContain('reconnecting');
    expect(events).toContain('reconnected');
    expect(events.indexOf('reconnecting')).toBeLessThan(events.indexOf('reconnected'));
  });
});
