import { DialStackPhone } from '../phone.js';
import { PhoneError } from '../errors.js';
import type { PlatformStorage } from '../platform.js';

// Coverage for the phone-level device selection: persistence (namespaced per user
// so a shared workstation doesn't leak one person's mic choice into another's

/** A JWT with just enough shape for the phone's `sub` decoding. */
function tokenFor(userId: string): string {
  const payload = btoa(JSON.stringify({ sub: userId }))
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
  return `header.${payload}.signature`;
}

function inMemoryStorage(): PlatformStorage & { map: Map<string, string> } {
  const map = new Map<string, string>();
  return {
    map,
    getItem: (k) => map.get(k) ?? null,
    setItem: (k, v) => void map.set(k, v),
    removeItem: (k) => void map.delete(k),
  };
}

type DeviceSpec = { deviceId: string; kind: string; label: string; groupId?: string };

/**
 * Installs a `navigator.mediaDevices`. `asEventTarget: false` (the default)
 * produces a PLAIN OBJECT with no addEventListener — the shape several existing
 * suites install, and the one the production feature-guards must tolerate.
 */
function installMediaDevices(
  opts: {
    devices?: DeviceSpec[];
    asEventTarget?: boolean;
    enumerateDevices?: boolean;
    failEnumerate?: boolean;
    failGetUserMedia?: string;
  } = {}
) {
  const handlers: Array<() => void> = [];
  const removed: Array<() => void> = [];
  let gumCalls = 0;
  const stopped: boolean[] = [];

  const mediaDevices: Record<string, unknown> = {
    getUserMedia: async () => {
      gumCalls++;
      if (opts.failGetUserMedia) {
        throw Object.assign(new Error('gum failed'), { name: opts.failGetUserMedia });
      }
      const index = stopped.push(false) - 1;
      return {
        getTracks: () => [
          {
            kind: 'audio',
            stop: () => {
              stopped[index] = true;
            },
          },
        ],
      };
    },
  };

  if (opts.enumerateDevices !== false) {
    mediaDevices.enumerateDevices = async () => {
      if (opts.failEnumerate) throw new Error('blocked by permissions policy');
      return (opts.devices ?? []).map((d) => ({ groupId: 'g', ...d }));
    };
  }

  if (opts.asEventTarget) {
    mediaDevices.addEventListener = (type: string, handler: () => void) => {
      if (type === 'devicechange') handlers.push(handler);
    };
    mediaDevices.removeEventListener = (type: string, handler: () => void) => {
      if (type === 'devicechange') removed.push(handler);
    };
  }

  Object.defineProperty(globalThis, 'navigator', { value: { mediaDevices }, configurable: true });

  return {
    get gumCalls() {
      return gumCalls;
    },
    get probeTracksStopped() {
      return stopped;
    },
    get listenerCount() {
      return handlers.length - removed.length;
    },
    removedCount: () => removed.length,
    fireDeviceChange: () => handlers.forEach((h) => h()),
  };
}

describe('DialStackPhone audio input selection', () => {
  let media: ReturnType<typeof installMediaDevices>;

  beforeEach(() => {
    media = installMediaDevices();
  });

  describe('persistence', () => {
    it('holds the selection in memory and writes no storage', async () => {
      // Remembering a device is the host's decision, not the core's — the React
      // softphone persists it and passes the saved value back in.
      const storage = inMemoryStorage();
      const phone = new DialStackPhone({ token: tokenFor('user_a'), storage, iceServers: [] });

      await phone.setAudioInputDevice('mic-b');

      expect(phone.audioInputDeviceId).toBe('mic-b');
      expect(storage.map.size).toBe(0);
    });

    it('does not carry a selection into a later phone', async () => {
      const storage = inMemoryStorage();
      const first = new DialStackPhone({ token: tokenFor('user_a'), storage, iceServers: [] });
      await first.setAudioInputDevice('mic-b');

      const second = new DialStackPhone({ token: tokenFor('user_a'), storage, iceServers: [] });
      expect(second.audioInputDeviceId).toBeNull();
    });
  });

  describe('probe before persisting', () => {
    it('rejects and stores nothing when the device cannot be acquired', async () => {
      media = installMediaDevices({ failGetUserMedia: 'NotFoundError' });
      const storage = inMemoryStorage();
      const phone = new DialStackPhone({ token: tokenFor('user_a'), storage, iceServers: [] });

      await expect(phone.setAudioInputDevice('mic-gone')).rejects.toMatchObject({
        code: 'audio_device_unavailable',
      });

      expect(storage.map.size).toBe(0);
      expect(phone.audioInputDeviceId).toBeNull();
    });

    it('releases the probe track so the mic indicator does not stay lit', async () => {
      const phone = new DialStackPhone({ token: tokenFor('user_a'), iceServers: [] });
      await phone.setAudioInputDevice('mic-b');

      expect(media.probeTracksStopped).toEqual([true]);
    });

    it('skips the probe while a call is live, so an exclusively-held mic still switches', async () => {
      // The probe getUserMedia's the TARGET device. With a live call already holding
      // Probing a device a live call already holds fails where mics are exclusive, which
      // used to skip the fan-out entirely.
      media = installMediaDevices({ failGetUserMedia: 'NotReadableError' });
      const phone = new DialStackPhone({ token: tokenFor('user_a'), iceServers: [] });
      const call = {
        setAudioInputDevice: jest.fn().mockResolvedValue(undefined),
        setAudioOutputDevice: jest.fn(),
      };
      phone.activeCalls.push(call as never);

      await expect(phone.setAudioInputDevice('mic-b')).resolves.toBeUndefined();

      expect(media.gumCalls).toBe(0);
      expect(call.setAudioInputDevice).toHaveBeenCalledWith('mic-b');
      expect(phone.audioInputDeviceId).toBe('mic-b');
    });

    it('still probes when no call is up, so a broken id cannot be persisted', async () => {
      media = installMediaDevices({ failGetUserMedia: 'NotFoundError' });
      const storage = inMemoryStorage();
      const phone = new DialStackPhone({ token: tokenFor('user_a'), storage, iceServers: [] });

      await expect(phone.setAudioInputDevice('mic-gone')).rejects.toMatchObject({
        code: 'audio_device_unavailable',
      });
      expect(storage.map.size).toBe(0);
    });

    it('skips the probe entirely when returning to the OS default', async () => {
      const phone = new DialStackPhone({ token: tokenFor('user_a'), iceServers: [] });
      await phone.setAudioInputDevice(null);

      expect(media.gumCalls).toBe(0);
    });
  });

  describe('broadcast to live calls', () => {
    /** A Call-shaped stub pushed onto the phone's activeCalls array. */
    function fakeCall(overrides: Partial<Record<string, unknown>> = {}) {
      return {
        setAudioInputDevice: jest.fn().mockResolvedValue(undefined),
        setAudioOutputDevice: jest.fn(),
        ...overrides,
      };
    }

    it('switches every live call', async () => {
      const phone = new DialStackPhone({ token: tokenFor('user_a'), iceServers: [] });
      const a = fakeCall();
      const b = fakeCall();
      phone.activeCalls.push(a as never, b as never);

      await phone.setAudioInputDevice('mic-b');

      expect(a.setAudioInputDevice).toHaveBeenCalledWith('mic-b');
      expect(b.setAudioInputDevice).toHaveBeenCalledWith('mic-b');
    });

    it('switches an outbound call still waiting for call.trying', async () => {
      // pendingCall isn't in activeCalls until the server answers with call.trying — a
      // window of up to OUTBOUND_CALL_TIMEOUT_MS. Skipping it resolved cleanly and
      // recorded the preference while that call kept the old mic for its whole duration.
      const phone = new DialStackPhone({ token: tokenFor('user_a'), iceServers: [] });
      const pending = fakeCall();
      (phone as unknown as { pendingCall: unknown }).pendingCall = pending;

      await phone.setAudioInputDevice('mic-b');
      phone.setAudioOutputDevice('spk-b');

      expect(pending.setAudioInputDevice).toHaveBeenCalledWith('mic-b');
      expect(pending.setAudioOutputDevice).toHaveBeenCalledWith('spk-b');
    });

    it('does not switch the pending call twice once it goes live', async () => {
      const phone = new DialStackPhone({ token: tokenFor('user_a'), iceServers: [] });
      const call = fakeCall();
      // call.trying pushes the same object onto activeCalls without clearing pendingCall.
      (phone as unknown as { pendingCall: unknown }).pendingCall = call;
      phone.activeCalls.push(call as never);

      await phone.setAudioInputDevice('mic-b');

      expect(call.setAudioInputDevice).toHaveBeenCalledTimes(1);
    });

    it('does not persist a device the live call rejected', async () => {
      // Persisting the request up front stored a device that never took effect, so the
      // NEXT call was seeded from a mic the user never successfully switched to.
      const storage = inMemoryStorage();
      const phone = new DialStackPhone({ token: tokenFor('user_a'), storage, iceServers: [] });
      const call = {
        setAudioInputDevice: jest
          .fn()
          .mockRejectedValue(new PhoneError({ code: 'audio_device_unavailable', message: 'no' })),
        setAudioOutputDevice: jest.fn(),
      };
      phone.activeCalls.push(call as never);
      phone.on('error', () => {});

      // Rejects rather than resolving: resolving let the React picker persist a device
      // that nothing was using.
      await expect(phone.setAudioInputDevice('mic-b')).rejects.toMatchObject({
        code: 'audio_device_unavailable',
      });

      expect(storage.map.size).toBe(0);
      expect(phone.audioInputDeviceId).toBeNull();
    });

    it('commits once a live call accepts', async () => {
      const phone = new DialStackPhone({ token: tokenFor('user_a'), iceServers: [] });
      phone.activeCalls.push({
        setAudioInputDevice: jest.fn().mockResolvedValue(undefined),
        setAudioOutputDevice: jest.fn(),
      } as never);

      await phone.setAudioInputDevice('mic-b');

      expect(phone.audioInputDeviceId).toBe('mic-b');
    });

    it('reports one call’s failure but still switches the others', async () => {
      const phone = new DialStackPhone({ token: tokenFor('user_a'), iceServers: [] });
      const failure = new PhoneError({ code: 'call_failed', message: 'nope' });
      const bad = fakeCall({ setAudioInputDevice: jest.fn().mockRejectedValue(failure) });
      const good = fakeCall();
      phone.activeCalls.push(bad as never, good as never);
      const errors: PhoneError[] = [];
      phone.on('error', (e) => errors.push(e));

      await expect(phone.setAudioInputDevice('mic-b')).resolves.toBeUndefined();

      expect(good.setAudioInputDevice).toHaveBeenCalledWith('mic-b');
      expect(errors).toContain(failure);
    });

    it('routes the ringback of every live call on an output change', () => {
      const phone = new DialStackPhone({ token: tokenFor('user_a'), iceServers: [] });
      const call = fakeCall();
      phone.activeCalls.push(call as never);

      phone.setAudioOutputDevice('spk-2');

      expect(call.setAudioOutputDevice).toHaveBeenCalledWith('spk-2');
      expect(phone.audioOutputDeviceId).toBe('spk-2');
    });

    it('does not touch the microphone when only the speaker changes', () => {
      const phone = new DialStackPhone({ token: tokenFor('user_a'), iceServers: [] });
      phone.setAudioOutputDevice('spk-2');
      expect(media.gumCalls).toBe(0);
    });
  });
});

describe('DialStackPhone.listAudioDevices', () => {
  it('splits inputs from outputs and drops video', async () => {
    installMediaDevices({
      devices: [
        { deviceId: 'default', kind: 'audioinput', label: 'Default' },
        { deviceId: 'mic-1', kind: 'audioinput', label: 'Headset Mic' },
        { deviceId: 'spk-1', kind: 'audiooutput', label: 'Headset Speaker' },
        { deviceId: 'cam-1', kind: 'videoinput', label: 'Webcam' },
      ],
    });
    const phone = new DialStackPhone({ token: tokenFor('user_a'), iceServers: [] });

    const list = await phone.listAudioDevices();

    expect(list.inputs.map((d) => d.deviceId)).toEqual(['default', 'mic-1']);
    expect(list.outputs.map((d) => d.deviceId)).toEqual(['spk-1']);
    expect(list.inputs[0].isDefault).toBe(true);
    expect(list.inputs[1].isDefault).toBe(false);
    expect(list.labelsAvailable).toBe(true);
    expect(list.supported).toBe(true);
  });

  it('reports labels as unavailable before permission is granted', async () => {
    // What a browser actually returns pre-permission: the device count is real but
    // the identities are withheld.
    installMediaDevices({ devices: [{ deviceId: '', kind: 'audioinput', label: '' }] });
    const phone = new DialStackPhone({ token: tokenFor('user_a'), iceServers: [] });

    const list = await phone.listAudioDevices();

    expect(list.labelsAvailable).toBe(false);
    expect(list.supported).toBe(true);
  });

  it('reports unsupported when the host cannot enumerate', async () => {
    installMediaDevices({ enumerateDevices: false });
    const phone = new DialStackPhone({ token: tokenFor('user_a'), iceServers: [] });

    const list = await phone.listAudioDevices();

    expect(list).toEqual({ inputs: [], outputs: [], labelsAvailable: false, supported: false });
  });

  it('degrades instead of throwing when enumeration is blocked', async () => {
    installMediaDevices({ failEnumerate: true });
    const phone = new DialStackPhone({ token: tokenFor('user_a'), iceServers: [] });

    await expect(phone.listAudioDevices()).resolves.toMatchObject({ supported: false });
  });
});

describe('DialStackPhone audioDevicesChanged subscription', () => {
  it('does not throw when mediaDevices is not an EventTarget', () => {
    // Several existing suites install exactly this shape, and React Native's
    // mediaDevices is likewise not an EventTarget.
    installMediaDevices({ asEventTarget: false });
    const phone = new DialStackPhone({ token: tokenFor('user_a'), iceServers: [] });

    expect(() => phone.on('audioDevicesChanged', () => {})).not.toThrow();
    expect(() => phone.off('audioDevicesChanged')).not.toThrow();
  });

  it('re-enumerates and emits the fresh list on a device change', async () => {
    const media = installMediaDevices({
      asEventTarget: true,
      devices: [{ deviceId: 'mic-1', kind: 'audioinput', label: 'Headset Mic' }],
    });
    const phone = new DialStackPhone({ token: tokenFor('user_a'), iceServers: [] });
    const seen: unknown[] = [];
    phone.on('audioDevicesChanged', (list) => seen.push(list));

    media.fireDeviceChange();
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(seen).toHaveLength(1);
    expect(seen[0]).toMatchObject({ inputs: [{ deviceId: 'mic-1', label: 'Headset Mic' }] });
  });

  it('registers nothing until someone listens', () => {
    const media = installMediaDevices({ asEventTarget: true });
    new DialStackPhone({ token: tokenFor('user_a'), iceServers: [] });

    expect(media.listenerCount).toBe(0);
  });

  it('releases the host listener only when the last listener goes', () => {
    const media = installMediaDevices({ asEventTarget: true });
    const phone = new DialStackPhone({ token: tokenFor('user_a'), iceServers: [] });
    const first = (): void => {};
    const second = (): void => {};

    phone.on('audioDevicesChanged', first);
    phone.on('audioDevicesChanged', second);
    expect(media.listenerCount).toBe(1);

    phone.off('audioDevicesChanged', first);
    expect(media.listenerCount).toBe(1);

    phone.off('audioDevicesChanged', second);
    expect(media.listenerCount).toBe(0);
  });

  it('survives a reconnect', () => {
    const media = installMediaDevices({ asEventTarget: true });
    const phone = new DialStackPhone({
      token: tokenFor('user_a'),
      iceServers: [],
      autoReconnect: false,
    });
    phone.on('audioDevicesChanged', () => {});
    expect(media.listenerCount).toBe(1);

    phone.disconnect();

    expect(media.listenerCount).toBe(1);
  });
});
