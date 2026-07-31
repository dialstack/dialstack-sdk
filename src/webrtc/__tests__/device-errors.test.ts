import { devicePhoneError, PhoneError } from '../errors';
import { DialStackPhone } from '../phone';

function gumError(name: string, message = 'gum failed'): Error {
  return Object.assign(new Error(message), { name });
}

describe('devicePhoneError', () => {
  it('maps a denied permission to mic_permission_denied', () => {
    for (const name of ['NotAllowedError', 'SecurityError']) {
      const err = devicePhoneError({ cause: gumError(name) });
      expect(err).toBeInstanceOf(PhoneError);
      expect(err.code).toBe('mic_permission_denied');
    }
  });

  it('lets the caller override the permission message for its own context', () => {
    const err = devicePhoneError({
      cause: gumError('NotAllowedError'),
      permissionMessage: 'Microphone permission is required to place a call',
    });
    expect(err.code).toBe('mic_permission_denied');
    expect(err.message).toBe('Microphone permission is required to place a call');
  });

  it('maps a missing or unsatisfiable device to audio_device_unavailable', () => {
    for (const name of ['NotFoundError', 'OverconstrainedError']) {
      expect(devicePhoneError({ cause: gumError(name) }).code).toBe('audio_device_unavailable');
    }
  });

  it('maps a locked mic to audio_device_in_use, without naming a device', () => {
    // NotReadableError means no device of the kind could be read — another app holds the
    // mic exclusively. Grouping it with "unavailable" told the user to re-pick a device
    // when the fix is to quit the other app.
    const err = devicePhoneError({ cause: gumError('NotReadableError'), deviceId: 'mic-b' });

    expect(err.code).toBe('audio_device_in_use');
    expect(err.message).toMatch(/another application/i);
    expect(err.message).not.toContain('mic-b');
  });

  it('names the offending device so the UI can tell the user which one to re-pick', () => {
    const err = devicePhoneError({ cause: gumError('NotFoundError'), deviceId: 'mic-b' });
    expect(err.message).toContain('mic-b');
  });

  it('falls back to call_failed for an unrecognized failure', () => {
    const err = devicePhoneError({ cause: gumError('WeirdNewError', 'the bus exploded') });
    expect(err.code).toBe('call_failed');
    expect(err.message).toContain('the bus exploded');
  });

  it('does not throw on a null or non-Error cause', () => {
    expect(devicePhoneError({ cause: null }).code).toBe('call_failed');
    expect(devicePhoneError({ cause: 'a string' }).code).toBe('call_failed');
  });

  it('carries the callId through so a call-scoped error can be attributed', () => {
    expect(devicePhoneError({ cause: gumError('NotFoundError'), callId: 'call_1' }).callId).toBe(
      'call_1'
    );
    expect(devicePhoneError({ cause: gumError('NotFoundError') }).callId).toBeNull();
  });

  it('never marks a device failure fatal — the phone stays usable', () => {
    expect(devicePhoneError({ cause: gumError('NotAllowedError') }).fatal).toBe(false);
    expect(devicePhoneError({ cause: gumError('NotFoundError') }).fatal).toBe(false);
  });
});

class AuthingWebSocket {
  static instances: AuthingWebSocket[] = [];
  static OPEN = 1;
  readyState = AuthingWebSocket.OPEN;
  private handlers: Record<string, ((evt: unknown) => void)[]> = {};
  private lastAuthReqId: string | null = null;

  constructor(public url: string) {
    AuthingWebSocket.instances.push(this);
  }
  addEventListener(event: string, handler: (evt: unknown) => void): void {
    (this.handlers[event] ??= []).push(handler);
  }
  send(data: string): void {
    try {
      const msg = JSON.parse(data) as { type?: string; req_id?: string };
      if (msg.type === 'authenticate') this.lastAuthReqId = msg.req_id ?? null;
    } catch {
      // ignore
    }
  }
  close(): void {
    this.fire('close', { code: 1000, reason: '' });
  }
  fire(event: string, evt: unknown): void {
    for (const h of this.handlers[event] ?? []) h(evt);
  }
  completeAuth(): void {
    this.fire('open', {});
    this.fire('message', {
      data: JSON.stringify({ type: 'authenticated', req_id: this.lastAuthReqId }),
    });
  }
}

/**
 * Guards the mic-error mapping at the `placeOutbound` boundary, not just in the
 * classifier: `call()` is the only path a consumer takes, so this is what pins the
 * codes a UI actually branches on. Written against the pre-refactor inline
 * classification so routing it through `devicePhoneError` is provably behavior-
 * preserving.
 */
describe('DialStackPhone.call() microphone failures', () => {
  let originalWebSocket: unknown;
  let originalNavigator: unknown;

  async function connectedPhone(): Promise<DialStackPhone> {
    const phone = new DialStackPhone({ token: 'tok', iceServers: [], autoReconnect: false });
    const connectP = phone.connect();
    await Promise.resolve();
    await Promise.resolve();
    AuthingWebSocket.instances[0]?.completeAuth();
    await connectP;
    return phone;
  }

  /** Makes every getUserMedia reject with a DOMException-shaped `name`. */
  function failMicWith(name: string, message = 'gum failed'): void {
    Object.defineProperty(globalThis, 'navigator', {
      configurable: true,
      value: {
        mediaDevices: {
          getUserMedia: () => Promise.reject(Object.assign(new Error(message), { name })),
        },
      },
    });
  }

  beforeEach(() => {
    AuthingWebSocket.instances = [];
    originalWebSocket = (globalThis as Record<string, unknown>).WebSocket;
    originalNavigator = Object.getOwnPropertyDescriptor(globalThis, 'navigator');
    (globalThis as Record<string, unknown>).WebSocket = AuthingWebSocket;
    (globalThis as Record<string, unknown>).RTCPeerConnection = class {
      addEventListener(): void {}
      close(): void {}
      getSenders(): unknown[] {
        return [];
      }
    };
    (globalThis as Record<string, unknown>).MediaStream = class {
      getTracks(): unknown[] {
        return [];
      }
      addTrack(): void {}
    };
  });

  afterEach(() => {
    (globalThis as Record<string, unknown>).WebSocket = originalWebSocket;
    if (originalNavigator) {
      Object.defineProperty(globalThis, 'navigator', originalNavigator as PropertyDescriptor);
    }
  });

  it('surfaces a denied mic permission as mic_permission_denied', async () => {
    failMicWith('NotAllowedError');
    const phone = await connectedPhone();
    await expect(phone.call('+14155551234')).rejects.toMatchObject({
      code: 'mic_permission_denied',
    });
  });

  it('surfaces a SecurityError as mic_permission_denied too', async () => {
    failMicWith('SecurityError');
    const phone = await connectedPhone();
    await expect(phone.call('+14155551234')).rejects.toMatchObject({
      code: 'mic_permission_denied',
    });
  });

  it('surfaces any other mic failure as call_failed', async () => {
    failMicWith('WeirdNewError', 'the bus exploded');
    const phone = await connectedPhone();
    await expect(phone.call('+14155551234')).rejects.toMatchObject({ code: 'call_failed' });
  });

  it('releases the pending-outbound slot so a retry is possible', async () => {
    failMicWith('NotAllowedError');
    const phone = await connectedPhone();
    await expect(phone.call('+14155551234')).rejects.toMatchObject({
      code: 'mic_permission_denied',
    });
    await expect(phone.call('+14155551234')).rejects.toMatchObject({
      code: 'mic_permission_denied',
    });
  });
});
