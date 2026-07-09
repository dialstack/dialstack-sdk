import {
  isIncomingRinging,
  isCallActive,
  selectScreen,
  callPeerNumber,
  callPeerName,
  formatCallDuration,
  formatDisplayNumber,
  callStateLabelKey,
} from '../dialer-view-model';
import type { Call, CallDirection, CallState } from '../../webrtc';

// A minimal Call-shaped stub — the view-model only reads these fields.
function fakeCall(partial: Partial<Call> = {}): Call {
  return {
    direction: 'outbound' as CallDirection,
    state: 'active' as CallState,
    from: '',
    fromName: null,
    to: '',
    duration: 0,
    ...partial,
  } as Call;
}

describe('isIncomingRinging', () => {
  it('is true for an inbound call still ringing or trying', () => {
    expect(isIncomingRinging(fakeCall({ direction: 'inbound', state: 'ringing' }))).toBe(true);
    expect(isIncomingRinging(fakeCall({ direction: 'inbound', state: 'trying' }))).toBe(true);
  });

  it('is false once an inbound call is answered', () => {
    expect(isIncomingRinging(fakeCall({ direction: 'inbound', state: 'active' }))).toBe(false);
  });

  it('is false for an outbound call even while ringing', () => {
    expect(isIncomingRinging(fakeCall({ direction: 'outbound', state: 'ringing' }))).toBe(false);
  });
});

describe('isCallActive', () => {
  it('is true for active and held, false otherwise', () => {
    expect(isCallActive(fakeCall({ state: 'active' }))).toBe(true);
    expect(isCallActive(fakeCall({ state: 'held' }))).toBe(true);
    expect(isCallActive(fakeCall({ state: 'ringing' }))).toBe(false);
    expect(isCallActive(fakeCall({ state: 'trying' }))).toBe(false);
    expect(isCallActive(fakeCall({ state: 'ended' }))).toBe(false);
  });
});

describe('selectScreen', () => {
  it('returns dial when there is no call', () => {
    expect(selectScreen(null)).toBe('dial');
  });
  it('returns incoming for an alerting inbound call', () => {
    expect(selectScreen(fakeCall({ direction: 'inbound', state: 'ringing' }))).toBe('incoming');
  });
  it('returns in-call for an answered or outbound call', () => {
    expect(selectScreen(fakeCall({ direction: 'inbound', state: 'active' }))).toBe('in-call');
    expect(selectScreen(fakeCall({ direction: 'outbound', state: 'ringing' }))).toBe('in-call');
  });
});

describe('callPeerNumber / callPeerName', () => {
  it('uses from/fromName for inbound and to/none for outbound', () => {
    const inbound = fakeCall({ direction: 'inbound', from: '+15551112222', fromName: 'Alice' });
    expect(callPeerNumber(inbound)).toBe('+15551112222');
    expect(callPeerName(inbound)).toBe('Alice');

    const outbound = fakeCall({ direction: 'outbound', to: '+15553334444', fromName: 'ignored' });
    expect(callPeerNumber(outbound)).toBe('+15553334444');
    expect(callPeerName(outbound)).toBeNull();
  });
});

describe('formatCallDuration', () => {
  it('formats seconds as m:ss with a zero-padded seconds field', () => {
    expect(formatCallDuration(0)).toBe('0:00');
    expect(formatCallDuration(5)).toBe('0:05');
    expect(formatCallDuration(65)).toBe('1:05');
    expect(formatCallDuration(600)).toBe('10:00');
  });

  it('floors fractional and clamps negative input', () => {
    expect(formatCallDuration(65.9)).toBe('1:05');
    expect(formatCallDuration(-5)).toBe('0:00');
  });
});

describe('formatDisplayNumber', () => {
  it('pretty-prints a US E.164 number nationally', () => {
    expect(formatDisplayNumber('+14155552671')).toBe('(415) 555-2671');
  });
  it('returns empty for empty input', () => {
    expect(formatDisplayNumber('')).toBe('');
  });
  it('leaves unparseable input (extensions, short partials) untouched', () => {
    expect(formatDisplayNumber('1001')).toBe('1001');
    expect(formatDisplayNumber('12')).toBe('12');
  });
});

describe('callStateLabelKey', () => {
  it('maps each state to its stable label key', () => {
    expect(callStateLabelKey('trying')).toBe('stateTrying');
    expect(callStateLabelKey('ringing')).toBe('stateRinging');
    expect(callStateLabelKey('active')).toBe('stateActive');
    expect(callStateLabelKey('held')).toBe('stateHeld');
    expect(callStateLabelKey('ended')).toBe('stateEnded');
  });
});
