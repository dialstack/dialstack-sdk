import { PhoneError } from '../errors.js';
import { Call, type CallInit } from '../call.js';

class FakeTrack {
  kind = 'audio';
  enabled = true;
  stop(): void {}
}

class FakeMediaStream {
  private tracks: FakeTrack[] = [];
  addTrack(t: FakeTrack): void {
    this.tracks.push(t);
  }
  getTracks(): FakeTrack[] {
    return this.tracks;
  }
  getAudioTracks(): FakeTrack[] {
    return this.tracks;
  }
}

class FakeRTCPeerConnection {
  localDescription = null;
  iceGatheringState = 'complete';
  addEventListener(): void {}
  removeEventListener(): void {}
  getSenders(): unknown[] {
    return [];
  }
  close(): void {}
}

type Sent = { type: string; req_id?: string; call_id?: string };

function makeCall(overrides: Partial<CallInit> = {}): {
  call: Call;
  sent: Sent[];
  send: jest.Mock;
} {
  (globalThis as Record<string, unknown>).MediaStream = FakeMediaStream;
  (globalThis as Record<string, unknown>).RTCPeerConnection = FakeRTCPeerConnection;
  const sent: Sent[] = [];
  const send = jest.fn((msg: Sent) => {
    sent.push(msg);
  });
  let seq = 0;
  const call = new Call({
    id: 'call_1',
    direction: 'inbound',
    from: '+15550001111',
    fromName: null,
    to: 'user_test-wrtc',
    initialState: 'active',
    transport: { send, trySend: send } as never,
    iceServers: [],
    startConsult: jest.fn(),
    nextReqId: () => `req_${++seq}`,
    // No mic in these tests: the actions under test never touch capture.
    deferInboundCapture: true,
    ...overrides,
  });
  return { call, sent, send };
}

describe('Call action frames carry a req_id', () => {
  it('stamps a distinct req_id on each action', () => {
    const { call, sent } = makeCall();
    call.hold();
    call.state = 'held';
    call.resume();
    call.mute();
    call.hangup();
    const ids = sent.map((m) => m.req_id);
    expect(sent.map((m) => m.type)).toEqual([
      'call.hold',
      'call.resume',
      'call.mute',
      'call.hangup',
    ]);
    expect(ids.every(Boolean)).toBe(true);
    expect(new Set(ids).size).toBe(ids.length);
  });
});

describe('Call.hangup', () => {
  const lastReqId = (sent: Sent[]) => sent[sent.length - 1]!.req_id!;

  it('ends the call locally when the server answers the hangup with an error', () => {
    const { call, sent } = makeCall();
    const reasons: string[] = [];
    call.on('ended', (r) => reasons.push(r));

    call.hangup();
    // The server returns this when it has already dropped the call.
    call.handleActionError(lastReqId(sent));

    expect(reasons).toEqual(['hangup']);
    expect(call.state).toBe('ended');
  });

  it('leaves the call alone when an error answers some other action', () => {
    const { call, sent } = makeCall();
    call.hold();
    call.handleActionError(lastReqId(sent));
    expect(call.state).toBe('active');
  });

  it('ignores an error for a req_id it did not send', () => {
    const { call } = makeCall();
    call.hangup();
    call.handleActionError('req_other');
    expect(call.state).toBe('active');
  });

  // The web softphone's rollbacks catch these synchronously.
  it('hangup, hold and resume throw when the socket is closed', () => {
    const send = jest.fn(() => {
      throw new PhoneError({ code: 'transport_closed', message: 'WebSocket is not open' });
    });
    const { call } = makeCall({ transport: { send, trySend: jest.fn() } as never });
    expect(() => call.hold()).toThrow(PhoneError);
    call.state = 'held';
    expect(() => call.resume()).toThrow(PhoneError);
    expect(() => call.hangup()).toThrow(PhoneError);
  });
});
