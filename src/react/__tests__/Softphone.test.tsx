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

// Render <Softphone> under a provider (the only supported form). Provider props
// (token, onError, onConnectionStateChange, …) go on the provider; the softphone
// takes only its own UI props.
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
  // Mirror the real Call.isConnected getter (active OR held) — the UI's
  // isCallActive gate reads it.
  get isConnected(): boolean {
    return this.state === 'active' || this.state === 'held';
  }
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
    // The outbound FakeCall becomes the foreground call → in-call screen.
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
    renderSoftphone();
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
    renderSoftphone();
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
  it('renders the caller and answers on tap', () => {
    renderSoftphone();
    act(() => phone().emit('connected'));

    const inbound = new FakeCall('inbound', '+14155552671', 'Alice', 'me');
    act(() => phone().emit('incoming', inbound));

    expect(screen.getByText('Incoming call')).toBeInTheDocument();
    expect(screen.getByText('Alice')).toBeInTheDocument();

    fireEvent.click(screen.getByLabelText('Answer'));
    expect(inbound.answer).toHaveBeenCalled();
    // Answering leaves the incoming screen (it's now the in-call panel) — the
    // just-answered call is NOT still shown as a declinable incoming card.
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
    renderSoftphone();
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
    // The transfer renders the normal in-call view + a Complete/Cancel banner —
    // NOT a bespoke screen that drops the controls. With the consult answered
    // (active), Mute/Hold/Hang up stay available alongside the banner
    // (regression: they used to disappear during a transfer).
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
  // Bring up a connected softphone with one active (answered inbound) call.
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

    // A 2nd inbound arrives while Alice is active — surfaced as call-waiting.
    const interrupt = new FakeCall('inbound', '+14155550002', 'Bob', 'me');
    act(() => phone().emit('incoming', interrupt));

    // The in-call controls for the active call are still present (non-intrusive).
    expect(screen.getByLabelText('Hang up')).toBeInTheDocument();
    // The interrupt is shown as an answer/decline card on top.
    expect(screen.getByText('Bob')).toBeInTheDocument();
    expect(screen.getByLabelText('Answer')).toBeInTheDocument();

    // Answering the interrupt holds the active call and answers the interrupt.
    fireEvent.click(screen.getByLabelText('Answer'));
    expect(active.hold).toHaveBeenCalled();
    expect(interrupt.answer).toHaveBeenCalled();
  });

  it('disables the Transfer control while more than one call is live', () => {
    renderSoftphone();
    act(() => phone().emit('connected'));
    connectWithActiveCall('Alice', '+14155550001');

    // One call → Transfer is available.
    expect(screen.getByLabelText('Transfer')).toBeEnabled();

    // A 2nd call arrives (call-waiting) → starting a new transfer is ambiguous,
    // so the Transfer control is disabled (shown, not hidden).
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

    // Both callers are shown; neither is answered.
    expect(screen.getByText('Alice')).toBeInTheDocument();
    expect(screen.getByText('Bob')).toBeInTheDocument();
    expect(a.answer).not.toHaveBeenCalled();
    expect(b.answer).not.toHaveBeenCalled();
    // Two answer buttons (one per card).
    expect(screen.getAllByLabelText('Answer')).toHaveLength(2);
    // The incoming stack is the whole screen — no dial pad behind it (you're
    // being called, not dialing). The dial pad's number field must be absent.
    expect(screen.queryByLabelText('Enter a number')).not.toBeInTheDocument();
  });

  it('switches to a held call from the in-call held-call list', () => {
    renderSoftphone();
    act(() => phone().emit('connected'));
    const alice = connectWithActiveCall('Alice', '+14155550001');

    // A 2nd inbound arrives and is answered → Alice is held, Bob active.
    const bob = new FakeCall('inbound', '+14155550002', 'Bob', 'me');
    act(() => phone().emit('incoming', bob));
    fireEvent.click(screen.getByLabelText('Answer'));
    act(() => {
      bob.state = 'active';
      alice.state = 'held';
      bob.emit('answered');
    });

    // Alice now shows in the switchable held-call list; clicking resumes her
    // (and holds Bob).
    const switchToAlice = screen.getByLabelText('Switch to this call: Alice');
    fireEvent.click(switchToAlice);
    expect(bob.hold).toHaveBeenCalled();
    expect(alice.resume).toHaveBeenCalled();
  });

  it('does not render a just-answered call as both incoming card and in-call panel', () => {
    renderSoftphone();
    act(() => phone().emit('connected'));

    // A single inbound rings, then the user answers — but the server echo hasn't
    // landed, so the call is `active` (flag) while its `state` is still 'ringing'.
    const inbound = new FakeCall('inbound', '+14155550001', 'Alice', 'me');
    act(() => phone().emit('incoming', inbound));
    fireEvent.click(screen.getByLabelText('Answer'));
    // No emit('answered') — reproduce the pre-echo window (state stays 'ringing').

    // It must render ONLY as the in-call panel, never also as an incoming card.
    expect(screen.getByLabelText('Hang up')).toBeInTheDocument();
    expect(screen.queryByText('Incoming call')).not.toBeInTheDocument();
    expect(screen.queryByLabelText('Answer')).not.toBeInTheDocument();
  });

  it('hides the transfer banner when a third unrelated call is focused', async () => {
    renderSoftphone();
    act(() => phone().emit('connected'));
    const alice = connectWithActiveCall('Alice', '+14155550001');

    // Start an attended transfer from Alice → consult leg is active, Alice held.
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

    // A third, unrelated inbound arrives and is answered → it's the focused call,
    // and it is NOT part of the transfer. The banner + Complete must disappear.
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

    // Alice is active + live: the Hold control (labeled Hold) is present.
    expect(screen.getByLabelText('Hold')).toBeInTheDocument();

    // Alice goes held while still the foreground call (e.g. promoted after another
    // call ended, or held during a switch): the control reads Resume and no live
    // duration timer is shown — the UI reflects the real held state.
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
    // Autoplay is blocked: play() always rejects. The pre-answer attempt (while
    // ringing) must NOT report; the post-answer retry must report via onError so
    // an answered call isn't silently without audio.
    const play = HTMLMediaElement.prototype.play as jest.Mock;
    play.mockReset();
    play.mockRejectedValue(new DOMException('blocked', 'NotAllowedError'));
    const onError = jest.fn();

    renderSoftphone({ onError });
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

  it('does NOT surface an error when play() is aborted by call teardown', async () => {
    // On hangup the stream's srcObject is cleared, which rejects any pending
    // play() with AbortError ("interrupted by a new load request") — normal
    // teardown, not an autoplay block. It must NOT surface audio_playback_blocked,
    // or a spurious banner appears after every call ends.
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

    // AbortError is teardown noise — never surfaced.
    expect(onError).not.toHaveBeenCalledWith(
      expect.objectContaining({ code: 'audio_playback_blocked' })
    );

    play.mockReset();
    play.mockResolvedValue(undefined);
  });

  it('surfaces a non-AbortError play() rejection (e.g. unsupported source)', async () => {
    // Not every real playback failure is NotAllowedError — a decode/unsupported-
    // source failure rejects with a different name. Only AbortError (teardown) is
    // benign; any other rejection on the answered retry must surface so an answered
    // call isn't silently without audio.
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
