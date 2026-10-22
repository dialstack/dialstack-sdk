import { DialStackPhone } from '../phone.js';
import { PACKAGE_VERSION } from '../version.js';

class FakeWebSocket {
  static instances: FakeWebSocket[] = [];
  static OPEN = 1;
  readyState = FakeWebSocket.OPEN;
  sent: string[] = [];
  private handlers: Record<string, ((evt: unknown) => void)[]> = {};

  constructor() {
    FakeWebSocket.instances.push(this);
  }
  addEventListener(event: string, handler: (evt: unknown) => void): void {
    (this.handlers[event] ??= []).push(handler);
  }
  send(data: string): void {
    this.sent.push(data);
  }
  close(): void {}
  fire(event: string, evt: unknown): void {
    for (const h of this.handlers[event] ?? []) h(evt);
  }
  authenticateFrame(): Record<string, unknown> | undefined {
    return this.sent
      .map((s) => JSON.parse(s) as Record<string, unknown>)
      .find((m) => m.type === 'authenticate');
  }
}

async function flush(): Promise<void> {
  for (let i = 0; i < 12; i++) await Promise.resolve();
}

describe('DialStackPhone reports its client string', () => {
  let originalWebSocket: unknown;
  let originalFetch: unknown;
  let fetchMock: jest.Mock;

  beforeEach(() => {
    FakeWebSocket.instances = [];
    originalWebSocket = (globalThis as Record<string, unknown>).WebSocket;
    (globalThis as Record<string, unknown>).WebSocket = FakeWebSocket;
    originalFetch = (globalThis as Record<string, unknown>).fetch;
    fetchMock = jest.fn(async () => ({
      ok: true,
      status: 200,
      json: async () => ({ ice_servers: [] }),
    }));
    (globalThis as Record<string, unknown>).fetch = fetchMock;
  });

  afterEach(() => {
    (globalThis as Record<string, unknown>).WebSocket = originalWebSocket;
    (globalThis as Record<string, unknown>).fetch = originalFetch;
  });

  async function connectAndCapture(phone: DialStackPhone) {
    void phone.connect().catch(() => {});
    await flush();
    const ws = FakeWebSocket.instances[FakeWebSocket.instances.length - 1]!;
    ws.fire('open', {});
    await flush();
    const [, init] = fetchMock.mock.calls[0] as [string, { headers: Record<string, string> }];
    phone.disconnect();
    return { header: init.headers['DialStack-Client'], frame: ws.authenticateFrame() };
  }

  it('prefixes the embedding packages with its own version', async () => {
    const phone = new DialStackPhone({
      token: 'tok',
      autoReconnect: false,
      client: 'sdk-react/3.7.0;c=softphone',
    });
    const { header, frame } = await connectAndCapture(phone);

    const expected = `sdk-webrtc/${PACKAGE_VERSION} sdk-react/3.7.0;c=softphone`;
    expect(header).toBe(expected);
    expect(frame?.client).toBe(expected);
  });

  it('leaves its own token out under sdk-native, which versions the inlined copy', async () => {
    const phone = new DialStackPhone({
      token: 'tok',
      autoReconnect: false,
      client: 'sdk-native/0.3.0;c=softphone',
    });
    const { header } = await connectAndCapture(phone);

    expect(header).toBe('sdk-native/0.3.0;c=softphone');
  });

  it('reports only itself when used directly', async () => {
    const phone = new DialStackPhone({ token: 'tok', autoReconnect: false });
    const { header, frame } = await connectAndCapture(phone);

    expect(header).toBe(`sdk-webrtc/${PACKAGE_VERSION}`);
    expect(frame?.client).toBe(`sdk-webrtc/${PACKAGE_VERSION}`);
  });
});
