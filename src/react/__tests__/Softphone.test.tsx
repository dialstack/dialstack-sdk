/**
 * Render/interaction tests for the composable Softphone over a faked phone
 * stream. These cover the web render tree wiring (screens, controls, audio
 * binding) via the batteries-included <Softphone token=...> form (which mounts
 * its own SoftphoneProvider); the call-state logic itself is covered by the
 * shared softphone-hooks tests.
 */

import React from 'react';
import { render, screen, fireEvent, act } from '@testing-library/react';
import { Softphone } from '../softphone/Softphone';

// ---- fake core -------------------------------------------------------------

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
  // Browser default: the audio sender exposes an RTCDTMFSender. RN sets this
  // false (no .dtmf), which hides the keypad.
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

jest.mock('../../webrtc', () => ({
  DialStackPhone: jest.fn().mockImplementation(() => new FakePhone()),
}));

function phone(): FakePhone {
  if (!FakePhone.last) throw new Error('phone not constructed');
  return FakePhone.last;
}

// HTMLMediaElement.play is not implemented in jsdom.
beforeAll(() => {
  Object.defineProperty(HTMLMediaElement.prototype, 'play', {
    configurable: true,
    value: jest.fn().mockResolvedValue(undefined),
  });
});

beforeEach(() => {
  FakePhone.last = null;
});

// ---- tests -----------------------------------------------------------------

describe('Softphone dial screen', () => {
  it('shows the connecting chip, then enables Call once connected + a number is typed', () => {
    render(<Softphone token="tok" />);
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
    render(<Softphone token="tok" />);
    act(() => phone().emit('connected'));

    fireEvent.click(screen.getByLabelText('1'));
    fireEvent.click(screen.getByLabelText('2 ABC'));
    const input = screen.getByLabelText('Enter a number') as HTMLInputElement;
    expect(input.value).toBe('12');

    fireEvent.click(screen.getByLabelText('Delete'));
    expect(input.value).toBe('1');
  });

  it('places a call to the typed destination', async () => {
    render(<Softphone token="tok" />);
    act(() => phone().emit('connected'));
    fireEvent.change(screen.getByLabelText('Enter a number'), {
      target: { value: '5551234' },
    });
    await act(async () => {
      fireEvent.click(screen.getByLabelText('Call'));
    });
    // The outbound FakeCall becomes the foreground call → in-call screen.
    expect(screen.getByLabelText('Hang up')).toBeInTheDocument();
  });
});

describe('Softphone error surfacing', () => {
  it('shows a GENERIC error chip AND forwards the real error to onError', () => {
    const onError = jest.fn();
    render(<Softphone token="tok" onError={onError} />);
    act(() => phone().emit('connected'));

    act(() => {
      phone().emit('error', {
        code: 'call_failed',
        message: 'destination invalid: raw server text',
      });
    });

    // The host still receives the real, specific error...
    expect(onError).toHaveBeenCalledWith({
      code: 'call_failed',
      message: 'destination invalid: raw server text',
    });
    // ...but the built-in UI shows a GENERIC message, never the raw server text.
    const alert = screen.getByRole('alert');
    expect(alert).toHaveTextContent('Call failed');
    expect(alert).not.toHaveTextContent('raw server text');

    // Dismiss clears it.
    fireEvent.click(screen.getByLabelText('Dismiss'));
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('shows a distinct, actionable message for a denied microphone permission', () => {
    render(<Softphone token="tok" />);
    act(() => phone().emit('connected'));

    act(() => {
      phone().emit('error', {
        code: 'mic_permission_denied',
        message: 'Microphone permission is required to place a call',
      });
    });

    // Not the generic 'Call failed' — a specific, self-remediable message.
    const alert = screen.getByRole('alert');
    expect(alert).toHaveTextContent(/microphone/i);
    expect(alert).not.toHaveTextContent('Call failed');
  });

  it('clears the error chip on a successful reconnect', () => {
    render(<Softphone token="tok" />);
    act(() => phone().emit('connected'));
    act(() => {
      phone().emit('error', { code: 'call_failed', message: 'boom' });
    });
    expect(screen.getByRole('alert')).toBeInTheDocument();

    // A disconnect→connected edge clears the stale banner.
    act(() => phone().emit('disconnected'));
    act(() => phone().emit('connected'));
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });
});

describe('Softphone incoming screen', () => {
  it('renders the caller and answer/decline, and answers on tap', () => {
    render(<Softphone token="tok" />);
    act(() => phone().emit('connected'));

    const inbound = new FakeCall('inbound', '+14155552671', 'Alice', 'me');
    act(() => phone().emit('incoming', inbound));

    expect(screen.getByText('Incoming call')).toBeInTheDocument();
    expect(screen.getByText('Alice')).toBeInTheDocument();

    fireEvent.click(screen.getByLabelText('Answer'));
    expect(inbound.answer).toHaveBeenCalled();

    fireEvent.click(screen.getByLabelText('Decline'));
    expect(inbound.reject).toHaveBeenCalled();
  });
});

describe('Softphone in-call screen', () => {
  function connectWithActiveCall(): FakeCall {
    render(<Softphone token="tok" />);
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
    // After mute the control relabels to Unmute.
    expect(screen.getByLabelText('Unmute')).toBeInTheDocument();
  });

  it('opens the keypad and sends DTMF', () => {
    const call = connectWithActiveCall();
    fireEvent.click(screen.getByLabelText('Keypad'));
    // The DTMF pad renders digit buttons; tap "5".
    fireEvent.click(screen.getByLabelText('5'));
    expect(call.sendDtmf).toHaveBeenCalledWith('5');
  });

  it('hides the keypad control when the call cannot send DTMF (e.g. RN)', () => {
    render(<Softphone token="tok" />);
    act(() => phone().emit('connected'));
    const inbound = new FakeCall('inbound', '+14155552671', 'Alice', 'me');
    inbound.canSendDtmf = false;
    act(() => phone().emit('incoming', inbound));
    act(() => {
      inbound.state = 'active';
      inbound.emit('answered');
    });
    // Other in-call controls still render; only the Keypad control is gone.
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
    // "Consult first" holds the original and dials the consult leg (async).
    await act(async () => {
      fireEvent.click(screen.getByText('Consult first'));
    });
    expect(call.attendedTransfer).toHaveBeenCalledWith('5559999');
    // Complete is disabled until the consult answers (bridging a ringing leg
    // would drop the held caller).
    expect(screen.getByText('Complete transfer')).toBeDisabled();
    // Consult answers → Complete enables; clicking it bridges via the original.
    act(() => {
      call.consult!.state = 'active';
      call.consult!.emit('answered');
    });
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

describe('Softphone callbacks', () => {
  it('reports connection-state changes', () => {
    const onConnectionStateChange = jest.fn();
    render(<Softphone token="tok" onConnectionStateChange={onConnectionStateChange} />);
    act(() => phone().emit('connected'));
    expect(onConnectionStateChange).toHaveBeenCalledWith({ state: 'connected' });
  });

  it('retries audio play on answer and surfaces a persistent autoplay block', async () => {
    // Autoplay is blocked: play() always rejects. The pre-answer attempt (while
    // ringing) must NOT report; the post-answer retry must report via onError so
    // an answered call isn't silently without audio.
    const play = HTMLMediaElement.prototype.play as jest.Mock;
    play.mockReset();
    play.mockRejectedValue(new DOMException('blocked', 'NotAllowedError'));
    const onError = jest.fn();

    render(<Softphone token="tok" onError={onError} />);
    act(() => phone().emit('connected'));
    const inbound = new FakeCall('inbound', '+14155552671', 'Alice', 'me');
    act(() => phone().emit('incoming', inbound));

    // While ringing (pre-gesture), a rejected play() is not reported.
    await act(async () => {});
    expect(onError).not.toHaveBeenCalled();

    // Answer → the answered retry fails too → surfaced.
    await act(async () => {
      inbound.state = 'active';
      inbound.emit('answered');
    });
    await act(async () => {});
    expect(onError).toHaveBeenCalledWith(
      expect.objectContaining({ code: 'audio_playback_blocked' })
    );

    // Restore the default resolving mock for other tests.
    play.mockReset();
    play.mockResolvedValue(undefined);
  });
});
