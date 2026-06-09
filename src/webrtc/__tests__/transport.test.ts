import { Transport } from '../transport';
import { PhoneError } from '../errors';

// Minimal scriptable WebSocket double. Captures instances so tests can
// drive server-side events (message/close) and count reconnects.
class FakeWebSocket {
  static instances: FakeWebSocket[] = [];
  static OPEN = 1;
  readyState = FakeWebSocket.OPEN;
  url: string;
  private handlers: Record<string, ((evt: { data?: string }) => void)[]> = {};

  constructor(url: string, _protocols?: string[]) {
    this.url = url;
    FakeWebSocket.instances.push(this);
  }

  addEventListener(event: string, handler: (evt: { data?: string }) => void): void {
    (this.handlers[event] ??= []).push(handler);
  }

  send(_data: string): void {}
  close(): void {
    this.fire('close', {});
  }

  fire(event: string, evt: { data?: string }): void {
    for (const h of this.handlers[event] ?? []) h(evt);
  }
}

describe('Transport session_revoked handling', () => {
  let originalWebSocket: unknown;

  beforeEach(() => {
    FakeWebSocket.instances = [];
    originalWebSocket = (globalThis as Record<string, unknown>).WebSocket;
    (globalThis as Record<string, unknown>).WebSocket = FakeWebSocket;
    jest.useFakeTimers();
  });

  afterEach(() => {
    (globalThis as Record<string, unknown>).WebSocket = originalWebSocket;
    jest.useRealTimers();
  });

  function connect(autoReconnect: boolean): {
    transport: Transport;
    closed: jest.Mock;
    reconnecting: jest.Mock;
  } {
    const transport = new Transport('ws://test/v1/webrtc', autoReconnect);
    const closed = jest.fn();
    const reconnecting = jest.fn();
    transport.on('closed', closed);
    transport.on('reconnecting', reconnecting);
    transport.connect();
    return { transport, closed, reconnecting };
  }

  it('does not reconnect after a fatal session_revoked error frame', () => {
    const { closed, reconnecting } = connect(true);
    const ws = FakeWebSocket.instances[0]!;

    ws.fire('message', {
      data: JSON.stringify({
        type: 'error',
        code: 'session_revoked',
        message: 'user sessions revoked',
        fatal: true,
      }),
    });
    ws.fire('close', {});
    jest.runAllTimers();

    expect(reconnecting).not.toHaveBeenCalled();
    expect(FakeWebSocket.instances).toHaveLength(1);
    expect(closed).toHaveBeenCalledTimes(1);
    const reason = closed.mock.calls[0]![0] as { fatal: boolean; error?: PhoneError };
    expect(reason.fatal).toBe(true);
    expect(reason.error?.code).toBe('session_revoked');
  });

  it('still reconnects after a non-terminal close', () => {
    const { reconnecting } = connect(true);
    const ws = FakeWebSocket.instances[0]!;

    ws.fire('close', {});
    expect(reconnecting).toHaveBeenCalledTimes(1);
    jest.runAllTimers();
    expect(FakeWebSocket.instances).toHaveLength(2);
  });

  it('non-fatal error frames do not suppress reconnect', () => {
    const { reconnecting } = connect(true);
    const ws = FakeWebSocket.instances[0]!;

    ws.fire('message', {
      data: JSON.stringify({
        type: 'error',
        code: 'call_limit',
        message: 'too many calls',
        fatal: false,
      }),
    });
    ws.fire('close', {});
    expect(reconnecting).toHaveBeenCalledTimes(1);
  });
});
