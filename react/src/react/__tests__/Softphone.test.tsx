/**
 * Render/interaction tests for the composable Softphone over a faked phone
 * stream. These cover the web render tree wiring (screens, controls, audio
 * binding). `<Softphone>` is a pure consumer, so it's rendered under a
 * `<SoftphoneProvider>` (which owns the token/connection) via `renderSoftphone`;
 * the call-state logic itself is covered by the shared softphone hooks tests.
 */

import React from 'react';
import { render, screen, fireEvent, act } from '@testing-library/react';
import { Softphone } from '../softphone/ui/Softphone';
import {
  SoftphoneProvider,
  type SoftphoneProviderProps,
} from '../softphone/provider/SoftphoneProvider';

function renderSoftphone(
  providerProps: Partial<SoftphoneProviderProps> = {},
  softphoneProps: { autoFocusDestination?: boolean } = {}
) {
  return render(
    <SoftphoneProvider token="tok" {...providerProps}>
      <Softphone {...softphoneProps} />
    </SoftphoneProvider>
  );
}

type Handler = (...args: unknown[]) => void;

class Emitter {
  private listeners: Record<string, Set<Handler>> = {};
  on(event: string, h: Handler): void {
    (this.listeners[event] ??= new Set()).add(h);
  }
  off(event: string, h?: Handler): void {
    if (!h) delete this.listeners[event];
    else this.listeners[event]?.delete(h);
  }
  emit(event: string, ...args: unknown[]): void {
    this.listeners[event]?.forEach((h) => h(...args));
  }
}

class FakeCall extends Emitter {
  state = 'trying';
  isMuted = false;
  duration = 0;
  // The device genuinely captured. null means "nothing captured", so the picker falls
  // back to the phone's preference — set it to model an acquisition fallback.
  effectiveAudioInputDeviceId: string | null = null;
  get isConnected(): boolean {
    return this.state === 'active' || this.state === 'held';
  }
  canSendDtmf = true;
  remoteMediaStream = {} as MediaStream;
  answer = jest.fn();
  reject = jest.fn();
  hangup = jest.fn();
  mute = jest.fn(() => {
    this.isMuted = true;
  });
  unmute = jest.fn(() => {
    this.isMuted = false;
  });
  hold = jest.fn();
  resume = jest.fn();
  sendDtmf = jest.fn();
  transfer = jest.fn();
  completeTransfer = jest.fn();
  consult: FakeCall | null = null;
  attendedTransfer = jest.fn((destination: string) => {
    this.state = 'held';
    const consult = new FakeCall('outbound', '', null, destination);
    this.consult = consult;
    return Promise.resolve(consult);
  });
  constructor(
    public direction: 'inbound' | 'outbound',
    public from: string,
    public fromName: string | null,
    public to: string
  ) {
    super();
  }
}

class FakePhone extends Emitter {
  static last: FakePhone | null = null;
  nextCall: FakeCall | null = null;
  audioInputDeviceId: string | null = null;
  audioOutputDeviceId: string | null = null;
  setAudioInputDevice = jest.fn((id: string | null) => {
    this.audioInputDeviceId = id;
    return Promise.resolve();
  });
  setAudioOutputDevice = jest.fn((id: string | null) => {
    this.audioOutputDeviceId = id;
  });
  constructor() {
    super();
    FakePhone.last = this;
  }
  connect(): Promise<void> {
    return Promise.resolve();
  }
  disconnect(): void {}
  call(to: string): Promise<unknown> {
    const c = this.nextCall ?? new FakeCall('outbound', '', null, to);
    return Promise.resolve(c);
  }
}

// Only the phone is faked. Spreading the real module keeps the rest of the
// package's surface — notably `storage`, which the audio-device provider reads to
// restore the user's last choice; replacing the module wholesale left it
// undefined and every render threw.
jest.mock('@dialstack/sdk-webrtc', () => ({
  ...jest.requireActual('@dialstack/sdk-webrtc'),
  DialStackPhone: jest.fn().mockImplementation(() => new FakePhone()),
}));

function phone(): FakePhone {
  if (!FakePhone.last) throw new Error('phone not constructed');
  return FakePhone.last;
}

// jsdom implements neither HTMLMediaElement.play nor setSinkId. Note lib.dom.d.ts
// DOES type setSinkId, so production code can only detect its absence at runtime —
const setSinkId = jest.fn().mockResolvedValue(undefined);

const audioDevices: MediaDeviceInfo[] = [
  { deviceId: 'mic-1', kind: 'audioinput', label: 'Headset Mic', groupId: 'g1' },
  { deviceId: 'mic-2', kind: 'audioinput', label: 'Built-in Mic', groupId: 'g3' },
  { deviceId: 'spk-1', kind: 'audiooutput', label: 'Headset Speaker', groupId: 'g1' },
  { deviceId: 'spk-2', kind: 'audiooutput', label: 'Display Audio', groupId: 'g2' },
] as MediaDeviceInfo[];

beforeAll(() => {
  Object.defineProperty(HTMLMediaElement.prototype, 'play', {
    configurable: true,
    value: jest.fn().mockResolvedValue(undefined),
  });
  Object.defineProperty(HTMLMediaElement.prototype, 'setSinkId', {
    configurable: true,
    value: setSinkId,
  });
  // jsdom has no navigator.mediaDevices at all.
  Object.defineProperty(navigator, 'mediaDevices', {
    configurable: true,
    value: {
      enumerateDevices: jest.fn().mockResolvedValue(audioDevices),
      addEventListener: jest.fn(),
      removeEventListener: jest.fn(),
    },
  });

  const realError = console.error;
  jest.spyOn(console, 'error').mockImplementation((...args: unknown[]) => {
    const first = args[0];
    if (typeof first === 'string' && first.includes('not wrapped in act')) return;
    realError(...(args as []));
  });
});

beforeEach(() => {
  FakePhone.last = null;
  setSinkId.mockClear();
  // The speaker choice persists to localStorage, so without this the persistence
  // case and the "no selection → no setSinkId" case couple through test ordering.
  localStorage.clear();
});

describe('Softphone dial screen', () => {
  it('shows the connecting chip, then enables Call once connected + a number is typed', () => {
    renderSoftphone();
    expect(screen.getByText('Connecting…')).toBeInTheDocument();

    act(() => phone().emit('connected'));

    const callBtn = screen.getByLabelText('Call');
    expect(callBtn).toBeDisabled();

    fireEvent.change(screen.getByLabelText('Enter a number'), {
      target: { value: '5551234' },
    });
    expect(callBtn).toBeEnabled();
  });

  it('keypad taps append to the destination and backspace removes', () => {
    renderSoftphone();
    act(() => phone().emit('connected'));

    fireEvent.click(screen.getByLabelText('1'));
    fireEvent.click(screen.getByLabelText('2 ABC'));
    const input = screen.getByLabelText('Enter a number') as HTMLInputElement;
    expect(input.value).toBe('12');

    fireEvent.click(screen.getByLabelText('Delete'));
    expect(input.value).toBe('1');
  });

  it('places a call to the typed destination', async () => {
    renderSoftphone();
    act(() => phone().emit('connected'));
    fireEvent.change(screen.getByLabelText('Enter a number'), {
      target: { value: '5551234' },
    });
    await act(async () => {
      fireEvent.click(screen.getByLabelText('Call'));
    });
    expect(screen.getByLabelText('Hang up')).toBeInTheDocument();
  });
});

describe('Softphone error surfacing', () => {
  it('shows a GENERIC error chip AND forwards the real error to onError', () => {
    const onError = jest.fn();
    renderSoftphone({ onError });
    act(() => phone().emit('connected'));

    act(() => {
      phone().emit('error', {
        code: 'call_failed',
        message: 'destination invalid: raw server text',
      });
    });

    expect(onError).toHaveBeenCalledWith({
      code: 'call_failed',
      message: 'destination invalid: raw server text',
    });
    const alert = screen.getByRole('alert');
    expect(alert).toHaveTextContent('Call failed');
    expect(alert).not.toHaveTextContent('raw server text');

    fireEvent.click(screen.getByLabelText('Dismiss'));
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('shows a distinct, actionable message for a denied microphone permission', () => {
    renderSoftphone();
    act(() => phone().emit('connected'));

    act(() => {
      phone().emit('error', {
        code: 'mic_permission_denied',
        message: 'Microphone permission is required to place a call',
      });
    });

    const alert = screen.getByRole('alert');
    expect(alert).toHaveTextContent(/microphone/i);
    expect(alert).not.toHaveTextContent('Call failed');
  });

  it('clears the error chip on a successful reconnect', () => {
    renderSoftphone();
    act(() => phone().emit('connected'));
    act(() => {
      phone().emit('error', { code: 'call_failed', message: 'boom' });
    });
    expect(screen.getByRole('alert')).toBeInTheDocument();

    act(() => phone().emit('disconnected'));
    act(() => phone().emit('connected'));
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });
});

describe('Softphone incoming screen', () => {
  it('renders the caller and answers on tap', () => {
    renderSoftphone();
    act(() => phone().emit('connected'));

    const inbound = new FakeCall('inbound', '+14155552671', 'Alice', 'me');
    act(() => phone().emit('incoming', inbound));

    expect(screen.getByText('Incoming call')).toBeInTheDocument();
    expect(screen.getByText('Alice')).toBeInTheDocument();

    fireEvent.click(screen.getByLabelText('Answer'));
    expect(inbound.answer).toHaveBeenCalled();
    expect(screen.queryByLabelText('Decline')).not.toBeInTheDocument();
  });

  it('declines a ringing inbound on tap', () => {
    renderSoftphone();
    act(() => phone().emit('connected'));

    const inbound = new FakeCall('inbound', '+14155552671', 'Alice', 'me');
    act(() => phone().emit('incoming', inbound));

    fireEvent.click(screen.getByLabelText('Decline'));
    expect(inbound.reject).toHaveBeenCalled();
  });
});

describe('Softphone in-call screen', () => {
  function connectWithActiveCall(): FakeCall {
    renderSoftphone();
    act(() => phone().emit('connected'));
    const inbound = new FakeCall('inbound', '+14155552671', 'Alice', 'me');
    act(() => phone().emit('incoming', inbound));
    act(() => {
      inbound.state = 'active';
      inbound.emit('answered');
    });
    return inbound;
  }

  it('shows in-call controls and hangs up', () => {
    const call = connectWithActiveCall();
    fireEvent.click(screen.getByLabelText('Hang up'));
    expect(call.hangup).toHaveBeenCalled();
  });

  it('toggles mute', () => {
    const call = connectWithActiveCall();
    fireEvent.click(screen.getByLabelText('Mute'));
    expect(call.mute).toHaveBeenCalled();
    expect(screen.getByLabelText('Unmute')).toBeInTheDocument();
  });

  it('opens the keypad and sends DTMF', () => {
    const call = connectWithActiveCall();
    fireEvent.click(screen.getByLabelText('Keypad'));
    fireEvent.click(screen.getByLabelText('5'));
    expect(call.sendDtmf).toHaveBeenCalledWith('5');
  });

  it('hides the keypad control when the call cannot send DTMF (e.g. RN)', () => {
    renderSoftphone();
    act(() => phone().emit('connected'));
    const inbound = new FakeCall('inbound', '+14155552671', 'Alice', 'me');
    inbound.canSendDtmf = false;
    act(() => phone().emit('incoming', inbound));
    act(() => {
      inbound.state = 'active';
      inbound.emit('answered');
    });
    expect(screen.getByLabelText('Hang up')).toBeInTheDocument();
    expect(screen.getByLabelText('Mute')).toBeInTheDocument();
    expect(screen.queryByLabelText('Keypad')).not.toBeInTheDocument();
  });

  it('opens transfer and submits a blind transfer', () => {
    const call = connectWithActiveCall();
    fireEvent.click(screen.getByLabelText('Transfer'));
    fireEvent.change(screen.getByLabelText('Transfer to…'), {
      target: { value: '5559999' },
    });
    fireEvent.click(screen.getByText('Transfer now'));
    expect(call.transfer).toHaveBeenCalledWith('5559999');
  });

  it('starts an attended transfer and completes it', async () => {
    const call = connectWithActiveCall();
    fireEvent.click(screen.getByLabelText('Transfer'));
    fireEvent.change(screen.getByLabelText('Transfer to…'), {
      target: { value: '5559999' },
    });
    await act(async () => {
      fireEvent.click(screen.getByText('Consult first'));
    });
    expect(call.attendedTransfer).toHaveBeenCalledWith('5559999');
    expect(screen.getByText('Complete transfer')).toBeDisabled();
    act(() => {
      call.consult!.state = 'active';
      call.consult!.emit('answered');
    });
    expect(screen.getByLabelText('Mute')).toBeInTheDocument();
    expect(screen.getByLabelText('Hold')).toBeInTheDocument();
    expect(screen.getByLabelText('Hang up')).toBeInTheDocument();
    fireEvent.click(screen.getByText('Complete transfer'));
    expect(call.completeTransfer).toHaveBeenCalled();
  });

  it('cancels an attended transfer (hangs up consult, resumes original)', async () => {
    const call = connectWithActiveCall();
    fireEvent.click(screen.getByLabelText('Transfer'));
    fireEvent.change(screen.getByLabelText('Transfer to…'), {
      target: { value: '5559999' },
    });
    await act(async () => {
      fireEvent.click(screen.getByText('Consult first'));
    });
    const consult = call.consult!;
    fireEvent.click(screen.getByText('Cancel'));
    expect(consult.hangup).toHaveBeenCalled();
    expect(call.resume).toHaveBeenCalled();
  });
});

describe('Softphone multi-call', () => {
  function connectWithActiveCall(name: string, from: string): FakeCall {
    const call = new FakeCall('inbound', from, name, 'me');
    act(() => phone().emit('incoming', call));
    act(() => {
      call.state = 'active';
      call.emit('answered');
    });
    return call;
  }

  it('shows a call-waiting card over the in-call screen without hiding its controls', () => {
    renderSoftphone();
    act(() => phone().emit('connected'));
    const active = connectWithActiveCall('Alice', '+14155550001');

    const interrupt = new FakeCall('inbound', '+14155550002', 'Bob', 'me');
    act(() => phone().emit('incoming', interrupt));

    expect(screen.getByLabelText('Hang up')).toBeInTheDocument();
    expect(screen.getByText('Bob')).toBeInTheDocument();
    expect(screen.getByLabelText('Answer')).toBeInTheDocument();

    fireEvent.click(screen.getByLabelText('Answer'));
    expect(active.hold).toHaveBeenCalled();
    expect(interrupt.answer).toHaveBeenCalled();
  });

  it('disables the Transfer control while more than one call is live', () => {
    renderSoftphone();
    act(() => phone().emit('connected'));
    connectWithActiveCall('Alice', '+14155550001');

    expect(screen.getByLabelText('Transfer')).toBeEnabled();

    act(() => phone().emit('incoming', new FakeCall('inbound', '+14155550002', 'Bob', 'me')));
    expect(screen.getByLabelText('Transfer')).toBeDisabled();
  });

  it('stacks multiple idle inbound calls (both shown, none active)', () => {
    renderSoftphone();
    act(() => phone().emit('connected'));

    const a = new FakeCall('inbound', '+14155550001', 'Alice', 'me');
    const b = new FakeCall('inbound', '+14155550002', 'Bob', 'me');
    act(() => phone().emit('incoming', a));
    act(() => phone().emit('incoming', b));

    expect(screen.getByText('Alice')).toBeInTheDocument();
    expect(screen.getByText('Bob')).toBeInTheDocument();
    expect(a.answer).not.toHaveBeenCalled();
    expect(b.answer).not.toHaveBeenCalled();
    expect(screen.getAllByLabelText('Answer')).toHaveLength(2);
    expect(screen.queryByLabelText('Enter a number')).not.toBeInTheDocument();
  });

  it('switches to a held call from the in-call held-call list', () => {
    renderSoftphone();
    act(() => phone().emit('connected'));
    const alice = connectWithActiveCall('Alice', '+14155550001');

    const bob = new FakeCall('inbound', '+14155550002', 'Bob', 'me');
    act(() => phone().emit('incoming', bob));
    fireEvent.click(screen.getByLabelText('Answer'));
    act(() => {
      bob.state = 'active';
      alice.state = 'held';
      bob.emit('answered');
    });

    const switchToAlice = screen.getByLabelText('Switch to this call: Alice');
    fireEvent.click(switchToAlice);
    expect(bob.hold).toHaveBeenCalled();
    expect(alice.resume).toHaveBeenCalled();
  });

  it('does not render a just-answered call as both incoming card and in-call panel', () => {
    renderSoftphone();
    act(() => phone().emit('connected'));

    const inbound = new FakeCall('inbound', '+14155550001', 'Alice', 'me');
    act(() => phone().emit('incoming', inbound));
    fireEvent.click(screen.getByLabelText('Answer'));

    expect(screen.getByLabelText('Hang up')).toBeInTheDocument();
    expect(screen.queryByText('Incoming call')).not.toBeInTheDocument();
    expect(screen.queryByLabelText('Answer')).not.toBeInTheDocument();
  });

  it('hides the transfer banner when a third unrelated call is focused', async () => {
    renderSoftphone();
    act(() => phone().emit('connected'));
    const alice = connectWithActiveCall('Alice', '+14155550001');

    fireEvent.click(screen.getByLabelText('Transfer'));
    fireEvent.change(screen.getByLabelText('Transfer to…'), { target: { value: '5559999' } });
    await act(async () => {
      fireEvent.click(screen.getByText('Consult first'));
    });
    act(() => {
      alice.consult!.state = 'active';
      alice.consult!.emit('answered');
    });
    expect(screen.getByText('Complete transfer')).toBeInTheDocument();

    const carol = new FakeCall('inbound', '+14155550003', 'Carol', 'me');
    act(() => phone().emit('incoming', carol));
    fireEvent.click(screen.getByLabelText('Answer'));
    act(() => {
      carol.state = 'active';
      carol.emit('answered');
    });
    expect(screen.queryByText('Complete transfer')).not.toBeInTheDocument();
  });

  it('a held foreground call shows no running duration and reads Resume', () => {
    renderSoftphone();
    act(() => phone().emit('connected'));
    const alice = connectWithActiveCall('Alice', '+14155550001');

    expect(screen.getByLabelText('Hold')).toBeInTheDocument();

    act(() => {
      alice.state = 'held';
      alice.emit('held');
    });
    expect(screen.getByLabelText('Resume')).toBeInTheDocument();
    expect(screen.queryByLabelText('Hold')).not.toBeInTheDocument();
  });
});

describe('Softphone callbacks', () => {
  it('reports connection-state changes', () => {
    const onConnectionStateChange = jest.fn();
    renderSoftphone({ onConnectionStateChange });
    act(() => phone().emit('connected'));
    expect(onConnectionStateChange).toHaveBeenCalledWith({ state: 'connected' });
  });

  it('retries audio play on answer and surfaces a persistent autoplay block', async () => {
    const play = HTMLMediaElement.prototype.play as jest.Mock;
    play.mockReset();
    play.mockRejectedValue(new DOMException('blocked', 'NotAllowedError'));
    const onError = jest.fn();

    renderSoftphone({ onError });
    act(() => phone().emit('connected'));
    const inbound = new FakeCall('inbound', '+14155552671', 'Alice', 'me');
    act(() => phone().emit('incoming', inbound));

    await act(async () => {});
    expect(onError).not.toHaveBeenCalled();

    await act(async () => {
      inbound.state = 'active';
      inbound.emit('answered');
    });
    await act(async () => {});
    expect(onError).toHaveBeenCalledWith(
      expect.objectContaining({ code: 'audio_playback_blocked' })
    );

    play.mockReset();
    play.mockResolvedValue(undefined);
  });

  it('does NOT surface an error when play() is aborted by call teardown', async () => {
    const play = HTMLMediaElement.prototype.play as jest.Mock;
    play.mockReset();
    play.mockRejectedValue(
      new DOMException('The play() request was interrupted by a new load request.', 'AbortError')
    );
    const onError = jest.fn();

    renderSoftphone({ onError });
    act(() => phone().emit('connected'));
    const inbound = new FakeCall('inbound', '+14155552671', 'Alice', 'me');
    act(() => phone().emit('incoming', inbound));
    await act(async () => {
      inbound.state = 'active';
      inbound.emit('answered');
    });
    await act(async () => {});

    expect(onError).not.toHaveBeenCalledWith(
      expect.objectContaining({ code: 'audio_playback_blocked' })
    );

    play.mockReset();
    play.mockResolvedValue(undefined);
  });

  it('surfaces a non-AbortError play() rejection (e.g. unsupported source)', async () => {
    const play = HTMLMediaElement.prototype.play as jest.Mock;
    play.mockReset();
    play.mockRejectedValue(new DOMException('cannot decode', 'NotSupportedError'));
    const onError = jest.fn();

    renderSoftphone({ onError });
    act(() => phone().emit('connected'));
    const inbound = new FakeCall('inbound', '+14155552671', 'Alice', 'me');
    act(() => phone().emit('incoming', inbound));
    await act(async () => {
      inbound.state = 'active';
      inbound.emit('answered');
    });
    await act(async () => {});

    expect(onError).toHaveBeenCalledWith(
      expect.objectContaining({ code: 'audio_playback_blocked' })
    );

    play.mockReset();
    play.mockResolvedValue(undefined);
  });
});

describe('Softphone audio device selection', () => {
  async function connectWithActiveCall(): Promise<FakeCall> {
    renderSoftphone();
    act(() => phone().emit('connected'));
    const inbound = new FakeCall('inbound', '+14155552671', 'Alice', 'me');
    act(() => phone().emit('incoming', inbound));
    await act(async () => {
      inbound.state = 'active';
      inbound.emit('answered');
    });
    return inbound;
  }

  /** Opens the Audio overlay and waits for the device lists to populate. */
  async function openPicker(): Promise<{ mic: HTMLElement; speaker: HTMLElement }> {
    fireEvent.click(screen.getByLabelText('Audio'));
    await screen.findByRole('option', { name: 'Headset Mic' });
    await screen.findByRole('option', { name: 'Display Audio' });
    return {
      mic: screen.getByLabelText('Microphone'),
      speaker: screen.getByLabelText('Speaker'),
    };
  }

  it('renders the picker from the in-call controls and toggles it closed', async () => {
    await connectWithActiveCall();
    await openPicker();

    fireEvent.click(screen.getByLabelText('Audio'));
    expect(screen.queryByLabelText('Microphone')).not.toBeInTheDocument();
  });

  it('shows the captured microphone, not the one that was asked for', async () => {
    // Acquisition falls back to an unconstrained mic when the saved id no longer
    // resolves, so the preference can name a device that was never opened. Showing the
    // preference made the picker claim a mic the call wasn't using.
    const call = await connectWithActiveCall();
    phone().audioInputDeviceId = 'mic-1';
    act(() => {
      call.effectiveAudioInputDeviceId = 'mic-2';
      call.emit('audioInputChanged', 'mic-2');
    });
    const { mic } = await openPicker();

    expect((mic as HTMLSelectElement).value).toBe('mic-2');
  });

  it('re-reads the captured device when the core switches it', async () => {
    // `audioInputDeviceId` is plain mutable state; without an `audioInputChanged`
    // subscription a switch driven from the public API never reached the UI.
    const call = await connectWithActiveCall();
    const { mic } = await openPicker();
    expect((mic as HTMLSelectElement).value).toBe('');

    act(() => {
      call.effectiveAudioInputDeviceId = 'mic-1';
      call.emit('audioInputChanged', 'mic-1');
    });

    expect((screen.getByLabelText('Microphone') as HTMLSelectElement).value).toBe('mic-1');
  });

  it('routes call audio to the selected speaker', async () => {
    await connectWithActiveCall();
    const { speaker } = await openPicker();

    await act(async () => {
      fireEvent.change(speaker, { target: { value: 'spk-2' } });
    });

    expect(setSinkId).toHaveBeenCalledWith('spk-2');
  });

  it('routes the ringback of the selected speaker through the phone too', async () => {
    await connectWithActiveCall();
    const { speaker } = await openPicker();

    await act(async () => {
      fireEvent.change(speaker, { target: { value: 'spk-2' } });
    });

    expect(phone().setAudioOutputDevice).toHaveBeenCalledWith('spk-2');
  });

  it('re-applies the speaker on a later call', async () => {
    const first = await connectWithActiveCall();
    const { speaker } = await openPicker();
    await act(async () => {
      fireEvent.change(speaker, { target: { value: 'spk-2' } });
    });
    setSinkId.mockClear();

    await act(async () => {
      first.state = 'ended';
      first.emit('ended', 'hangup');
    });
    const second = new FakeCall('inbound', '+14155559999', 'Bob', 'me');
    act(() => phone().emit('incoming', second));
    await act(async () => {
      second.state = 'active';
      second.emit('answered');
    });

    expect(setSinkId).toHaveBeenCalledWith('spk-2');
  });

  it('routes to the system default when no speaker has been chosen', async () => {
    await connectWithActiveCall();

    // Originally asserted the opposite — that no call is made — on the theory that a
    // consumer who never opens the picker shouldn't eat a needless setSinkId. That was
    expect(setSinkId).toHaveBeenCalledWith('');
  });

  it('switches the microphone through the phone', async () => {
    await connectWithActiveCall();
    const { mic } = await openPicker();

    await act(async () => {
      fireEvent.change(mic, { target: { value: 'mic-1' } });
    });

    expect(phone().setAudioInputDevice).toHaveBeenCalledWith('mic-1');
  });

  it('maps the system-default option back to null', async () => {
    await connectWithActiveCall();
    const { mic } = await openPicker();
    await act(async () => {
      fireEvent.change(mic, { target: { value: 'mic-1' } });
    });

    await act(async () => {
      fireEvent.change(mic, { target: { value: '' } });
    });

    expect(phone().setAudioInputDevice).toHaveBeenLastCalledWith(null);
  });

  it('applies the system default when the speaker selection is cleared', async () => {
    await connectWithActiveCall();
    const { speaker } = await openPicker();
    await act(async () => {
      fireEvent.change(speaker, { target: { value: 'spk-2' } });
    });
    setSinkId.mockClear();

    await act(async () => {
      fireEvent.change(speaker, { target: { value: '' } });
    });

    expect(setSinkId).toHaveBeenCalledWith('');
  });

  it('switches the microphone even while a call already holds one', async () => {
    // The phone-level probe used to getUserMedia the target device before switching.
    // Platforms that grant a mic exclusively fail the probe when a call already holds it,
    // which used to skip the fan-out and silently drop the switch.
    const call = await connectWithActiveCall();
    const { mic } = await openPicker();

    await act(async () => {
      fireEvent.change(mic, { target: { value: 'mic-1' } });
    });

    expect(phone().setAudioInputDevice).toHaveBeenCalledWith('mic-1');
    expect(call).toBeDefined();
  });

  it('does not show a microphone as selected when the switch failed', async () => {
    await connectWithActiveCall();
    phone().setAudioInputDevice.mockRejectedValueOnce(
      Object.assign(new Error('nope'), { code: 'audio_device_unavailable' })
    );
    const { mic } = await openPicker();

    await act(async () => {
      fireEvent.change(mic, { target: { value: 'mic-1' } });
    });

    expect((mic as HTMLSelectElement).value).toBe('');
  });

  it('surfaces a disconnected microphone with a recovery prompt', async () => {
    const call = await connectWithActiveCall();
    await openPicker();

    await act(async () => {
      call.emit('audioInputLost');
    });

    expect(screen.getByRole('alert')).toHaveTextContent(/microphone was disconnected/i);
  });

  it('keeps the disconnected warning when the recovery re-pick fails', async () => {
    // `audioInputLost` fires once per capture track, so clearing the warning on attempt
    // rather than on success erased the user's only signal for good — leaving a clean UI
    // over a dead track.
    const call = await connectWithActiveCall();
    const { mic } = await openPicker();
    await act(async () => {
      call.emit('audioInputLost');
    });

    phone().setAudioInputDevice.mockRejectedValueOnce(
      Object.assign(new Error('busy'), { code: 'audio_device_unavailable' })
    );
    await act(async () => {
      fireEvent.change(mic, { target: { value: 'mic-1' } });
    });

    expect(screen.getByRole('alert')).toHaveTextContent(/microphone was disconnected/i);
  });

  it('clears the disconnected warning once a re-pick succeeds', async () => {
    const call = await connectWithActiveCall();
    const { mic } = await openPicker();
    await act(async () => {
      call.emit('audioInputLost');
    });

    await act(async () => {
      fireEvent.change(mic, { target: { value: 'mic-1' } });
    });

    expect(screen.queryByRole('alert')).toBeNull();
  });

  it('keeps audio playing when the sink rejects the route', async () => {
    const onError = jest.fn();
    renderSoftphone({ onError });
    act(() => phone().emit('connected'));
    const inbound = new FakeCall('inbound', '+14155552671', 'Alice', 'me');
    act(() => phone().emit('incoming', inbound));
    await act(async () => {
      inbound.state = 'active';
      inbound.emit('answered');
    });
    setSinkId.mockRejectedValueOnce(new Error('NotFoundError'));

    const { speaker } = await openPicker();
    await act(async () => {
      fireEvent.change(speaker, { target: { value: 'spk-2' } });
    });

    expect(onError).not.toHaveBeenCalled();
    expect(screen.getByLabelText('Hang up')).toBeInTheDocument();
  });

  it('re-enumerates once a call grants microphone access', async () => {
    const enumerate = navigator.mediaDevices.enumerateDevices as jest.Mock;
    enumerate.mockResolvedValueOnce([
      // The pre-permission shape: real count, blank identity.
      { deviceId: '', kind: 'audioinput', label: '', groupId: '' },
    ] as MediaDeviceInfo[]);

    await connectWithActiveCall();
    const { speaker } = await openPicker();

    expect(enumerate.mock.calls.length).toBeGreaterThan(1);
    expect(speaker).toBeEnabled();
  });

  it('remembers the speaker across a remount', async () => {
    const first = await connectWithActiveCall();
    const { speaker } = await openPicker();
    await act(async () => {
      fireEvent.change(speaker, { target: { value: 'spk-2' } });
    });
    await act(async () => {
      first.state = 'ended';
      first.emit('ended', 'hangup');
    });
    setSinkId.mockClear();

    renderSoftphone();
    act(() => phone().emit('connected'));
    const next = new FakeCall('inbound', '+14155551234', 'Carol', 'me');
    act(() => phone().emit('incoming', next));
    await act(async () => {
      next.state = 'active';
      next.emit('answered');
    });

    expect(setSinkId).toHaveBeenCalledWith('spk-2');
  });
});

describe('Softphone audio device selection without setSinkId', () => {
  let original: PropertyDescriptor | undefined;

  beforeEach(() => {
    original = Object.getOwnPropertyDescriptor(HTMLMediaElement.prototype, 'setSinkId');
    delete HTMLMediaElement.prototype.setSinkId;
  });

  afterEach(() => {
    if (original) Object.defineProperty(HTMLMediaElement.prototype, 'setSinkId', original);
  });

  it('still offers the microphone and explains the speaker limitation', async () => {
    const onError = jest.fn();
    renderSoftphone({ onError });
    act(() => phone().emit('connected'));
    const inbound = new FakeCall('inbound', '+14155552671', 'Alice', 'me');
    act(() => phone().emit('incoming', inbound));
    await act(async () => {
      inbound.state = 'active';
      inbound.emit('answered');
    });

    fireEvent.click(screen.getByLabelText('Audio'));

    expect(await screen.findByLabelText('Microphone')).toBeEnabled();
    expect(await screen.findByLabelText('Speaker')).toBeDisabled();
    expect(screen.getByText(/device settings/i)).toBeInTheDocument();
    expect(onError).not.toHaveBeenCalled();
  });
});

describe('Softphone audio device selection without enumerateDevices', () => {
  let original: PropertyDescriptor | undefined;

  beforeEach(() => {
    original = Object.getOwnPropertyDescriptor(navigator, 'mediaDevices');
    Object.defineProperty(navigator, 'mediaDevices', { configurable: true, value: undefined });
  });

  afterEach(() => {
    if (original) Object.defineProperty(navigator, 'mediaDevices', original);
  });

  it('says so rather than showing a lone "System default" mic', async () => {
    // An old WebView, or a sandboxed iframe / Permissions-Policy blocking enumeration:
    // the lists stay empty, and with no hint the dropdown reads as "one microphone".
    const onError = jest.fn();
    renderSoftphone({ onError });
    act(() => phone().emit('connected'));
    const inbound = new FakeCall('inbound', '+14155552671', 'Alice', 'me');
    act(() => phone().emit('incoming', inbound));
    await act(async () => {
      inbound.state = 'active';
      inbound.emit('answered');
    });

    fireEvent.click(screen.getByLabelText('Audio'));

    expect(await screen.findByText(/cannot list audio devices/i)).toBeInTheDocument();
    expect(onError).not.toHaveBeenCalled();
  });
});
