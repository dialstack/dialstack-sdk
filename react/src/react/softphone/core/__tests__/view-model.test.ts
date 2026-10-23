import {
  isIncomingRinging,
  shouldRingIncoming,
  isCallActive,
  canPlaceCall,
  selectScreen,
  selectLayout,
  callPeerNumber,
  callPeerName,
  peerDisplay,
  isRoomyLayout,
  formatCallDuration,
  formatDisplayNumber,
  stripToDialString,
  sanitizeDestination,
  sanitizeOrEmitInvalid,
  INVALID_DESTINATION_ERROR,
  callStateLabelKey,
  errorMessageKey,
  filterDirectory,
  directoryContactTags,
  type DirectoryContact,
} from '../view-model';
import type { Call, CallDirection, CallState } from '@dialstack/sdk-webrtc';

// A minimal Call-shaped stub — the view-model only reads these fields.
function fakeCall(partial: Partial<Call> = {}): Call {
  const state = (partial.state ?? 'active') as CallState;
  return {
    direction: 'outbound' as CallDirection,
    state,
    from: '',
    fromName: null,
    to: '',
    duration: 0,
    ...partial,
    // Mirror the real Call.isConnected (active OR held) that isCallActive now
    // delegates to. A plain value (not a getter) so it can't drift on `this`.
    isConnected: state === 'active' || state === 'held',
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

describe('shouldRingIncoming', () => {
  it('is false when there is no active call', () => {
    expect(shouldRingIncoming(null)).toBe(false);
  });

  it('is true only when the (single) active call is an inbound call still alerting', () => {
    expect(shouldRingIncoming(fakeCall({ direction: 'inbound', state: 'ringing' }))).toBe(true);
    expect(shouldRingIncoming(fakeCall({ direction: 'inbound', state: 'active' }))).toBe(false);
    expect(shouldRingIncoming(fakeCall({ direction: 'outbound', state: 'ringing' }))).toBe(false);
  });

  it('rings while ANY call in the list is an alerting inbound (call-waiting)', () => {
    const activeOutbound = fakeCall({ direction: 'outbound', state: 'active' });
    const ringingInbound = fakeCall({ direction: 'inbound', state: 'ringing' });
    // A call-waiting interrupt during an active call rings too.
    expect(shouldRingIncoming([activeOutbound, ringingInbound])).toBe(true);
    // No inbound alerting → silent, even with several live calls.
    expect(
      shouldRingIncoming([activeOutbound, fakeCall({ direction: 'inbound', state: 'held' })])
    ).toBe(false);
    expect(shouldRingIncoming([])).toBe(false);
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

describe('canPlaceCall', () => {
  it('requires connected + a destination + no binding in progress', () => {
    expect(canPlaceCall('connected', '5551234', false)).toBe(true);
    // Not connected.
    expect(canPlaceCall('connecting', '5551234', false)).toBe(false);
    expect(canPlaceCall('reconnecting', '5551234', false)).toBe(false);
    // Empty destination.
    expect(canPlaceCall('connected', '', false)).toBe(false);
    // E911 binding in progress blocks dialing even when otherwise ready.
    expect(canPlaceCall('connected', '5551234', true)).toBe(false);
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

describe('selectLayout', () => {
  const ringingInbound = () => fakeCall({ direction: 'inbound', state: 'ringing' });
  const answeredCall = () => fakeCall({ direction: 'outbound', state: 'active' });
  const heldCall = () => fakeCall({ direction: 'outbound', state: 'held' });

  it('idle: dial base, no incoming', () => {
    expect(selectLayout([])).toEqual({
      base: 'dial',
      incoming: [],
      overlay: false,
      compact: false,
    });
  });

  it('single idle inbound: dial base, one full-size incoming card (not an overlay)', () => {
    const call = ringingInbound();
    const layout = selectLayout([call]);
    expect(layout.base).toBe('dial');
    expect(layout.incoming).toEqual([call]);
    expect(layout.overlay).toBe(false);
    expect(layout.compact).toBe(false);
  });

  it('multiple idle inbound: dial base, compact stacked cards', () => {
    const a = ringingInbound();
    const b = ringingInbound();
    const layout = selectLayout([a, b]);
    expect(layout.base).toBe('dial');
    expect(layout.incoming).toEqual([a, b]);
    expect(layout.overlay).toBe(false);
    expect(layout.compact).toBe(true);
  });

  it('answered call only: in-call base, no incoming', () => {
    expect(selectLayout([answeredCall()])).toEqual({
      base: 'in-call',
      incoming: [],
      overlay: false,
      compact: false,
    });
  });

  it('call-waiting: an interrupt during an active call is a compact overlay on the in-call base', () => {
    const active = answeredCall();
    const interrupt = ringingInbound();
    const layout = selectLayout([active, interrupt]);
    expect(layout.base).toBe('in-call');
    expect(layout.incoming).toEqual([interrupt]);
    expect(layout.overlay).toBe(true);
    expect(layout.compact).toBe(true);
  });

  it('a held call (no active) still makes the base in-call', () => {
    expect(selectLayout([heldCall()]).base).toBe('in-call');
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

describe('stripToDialString', () => {
  it('removes display separators from a formatted/pasted number', () => {
    expect(stripToDialString('(581) 319-5082')).toBe('5813195082');
    expect(stripToDialString('+1 581-319-5082')).toBe('+15813195082');
    expect(stripToDialString('581.319.5082')).toBe('5813195082');
  });

  it('keeps digits, +, *, # and DTMF A-D; uppercases letters', () => {
    expect(stripToDialString('*72')).toBe('*72');
    expect(stripToDialString('#')).toBe('#');
    expect(stripToDialString('1001')).toBe('1001');
    expect(stripToDialString('16dc')).toBe('16DC');
  });

  it('drops characters the server would reject and caps length at 32', () => {
    // Only + * # 0-9 and DTMF A-D survive; e/f/g/z etc. are dropped. Letters that
    // do survive are the DTMF set (a-d → A-D).
    expect(stripToDialString('5o8z2')).toBe('582'); // o, z dropped
    expect(stripToDialString('cab')).toBe('CAB'); // DTMF letters kept + uppercased
    expect(stripToDialString('1'.repeat(40)).length).toBe(32);
    expect(stripToDialString('   ')).toBe('');
  });
});

describe('sanitizeDestination', () => {
  it('canonicalizes a valid PSTN number to E.164 (the copy-paste bug case)', () => {
    // The exact string that failed live: a pasted, formatted US number.
    expect(sanitizeDestination('(581) 319-5082')).toBe('+15813195082');
    expect(sanitizeDestination('581-319-5082')).toBe('+15813195082');
    expect(sanitizeDestination('+1 (581) 319-5082')).toBe('+15813195082');
  });

  it('leaves extensions, star codes, and DTMF as stripped symbols (not E.164)', () => {
    expect(sanitizeDestination('1001')).toBe('1001'); // extension — not a phone number
    expect(sanitizeDestination('*72')).toBe('*72');
    expect(sanitizeDestination('#123')).toBe('#123');
    expect(sanitizeDestination('16dc')).toBe('16DC');
  });

  it('always returns a value within the server allowlist (or empty)', () => {
    const allowed = /^[+*#0-9A-D]{0,32}$/;
    for (const input of ['(581) 319-5082', 'call bob', '*72', '', '   ', '+44 20 7946 0000']) {
      expect(sanitizeDestination(input)).toMatch(allowed);
    }
  });
});

describe('sanitizeOrEmitInvalid', () => {
  it('returns the cleaned target and does not emit for valid input', () => {
    const onError = jest.fn();
    expect(sanitizeOrEmitInvalid('(581) 319-5082', onError)).toBe('+15813195082');
    expect(onError).not.toHaveBeenCalled();
  });

  it('emits the shared invalid-destination error and returns "" for junk input', () => {
    const onError = jest.fn();
    expect(sanitizeOrEmitInvalid('xyz', onError)).toBe('');
    expect(onError).toHaveBeenCalledWith(INVALID_DESTINATION_ERROR);
  });

  it('emits for empty input by default (placeCall behavior)', () => {
    const onError = jest.fn();
    expect(sanitizeOrEmitInvalid('   ', onError)).toBe('');
    expect(onError).toHaveBeenCalledWith(INVALID_DESTINATION_ERROR);
  });

  it('stays silent on empty input when silentWhenEmpty (transfer-field behavior)', () => {
    const onError = jest.fn();
    // Empty → silent...
    expect(sanitizeOrEmitInvalid('   ', onError, { silentWhenEmpty: true })).toBe('');
    expect(onError).not.toHaveBeenCalled();
    // ...but non-empty junk still reports.
    expect(sanitizeOrEmitInvalid('xyz', onError, { silentWhenEmpty: true })).toBe('');
    expect(onError).toHaveBeenCalledWith(INVALID_DESTINATION_ERROR);
  });

  it('tolerates a missing onError callback', () => {
    expect(() => sanitizeOrEmitInvalid('xyz', undefined)).not.toThrow();
    expect(sanitizeOrEmitInvalid('xyz', undefined)).toBe('');
  });
});

describe('errorMessageKey', () => {
  it('maps a denied mic permission to its own actionable key', () => {
    expect(errorMessageKey('mic_permission_denied')).toBe('micPermissionError');
  });

  it('maps connection/session-class codes to connectionError, not callError', () => {
    // These are socket/session failures, not call failures — showing "Call
    // failed" for e.g. an idle token-refresh failure (auth_failed) mislabels it.
    for (const code of [
      'auth_failed',
      'auth_expired',
      'session_limit',
      'session_revoked',
      'going_away',
      'idle_timeout',
      'slow_consumer',
      'transport_closed',
      'ice_fetch_failed',
      'token_refresh_failed',
    ]) {
      expect(errorMessageKey(code)).toBe('connectionError');
    }
  });

  it('collapses genuine call-attempt and unknown codes to the generic callError key', () => {
    for (const code of ['call_failed', 'call_not_found', 'rate_limited', 'invalid_message', '']) {
      expect(errorMessageKey(code)).toBe('callError');
    }
  });
});

describe('peerDisplay', () => {
  const inbound = (fromName: string | null) =>
    ({ direction: 'inbound', from: '+15551230000', fromName, to: '1001' }) as unknown as Call;
  const fmt = (v: string) => `fmt(${v})`;

  it('titles the call with the host name and keeps the number under it', () => {
    expect(peerDisplay(inbound('Caller ID'), { name: 'Jordan Lee' }, fmt, '?')).toMatchObject({
      name: 'Jordan Lee',
      number: 'fmt(+15551230000)',
    });
  });

  it('falls back to the caller-id name, then the number alone', () => {
    expect(peerDisplay(inbound('Caller ID'), null, fmt, '?')).toMatchObject({
      name: 'Caller ID',
      number: 'fmt(+15551230000)',
    });
    expect(peerDisplay(inbound(null), null, fmt, '?')).toMatchObject({
      name: 'fmt(+15551230000)',
      number: null,
    });
  });

  it('passes the host avatar through', () => {
    expect(peerDisplay(inbound(null), { avatar: { initials: 'JL' } }, fmt, '?')).toMatchObject({
      avatar: { initials: 'JL' },
    });
  });
});

describe('isRoomyLayout', () => {
  it('follows the host size on auto, and by default', () => {
    expect(isRoomyLayout('auto', true)).toBe(true);
    expect(isRoomyLayout('auto', false)).toBe(false);
    expect(isRoomyLayout(undefined, false)).toBe(false);
  });

  it('pins the tier whatever the host', () => {
    expect(isRoomyLayout('full', false)).toBe(true);
    expect(isRoomyLayout('compact', true)).toBe(false);
  });
});

describe('filterDirectory', () => {
  const entries: DirectoryContact[] = [
    { id: 'front-desk', label: 'Front desk', destination: '100' },
    {
      id: 'alex-rivera',
      label: 'Alex Rivera',
      destination: '+15555550101',
      description: 'Billing',
      group: 'Team',
    },
    { id: 'sam-lee', label: 'Sam Lee', destination: '102', group: 'Team' },
    { id: 'night-line', label: 'Night line', destination: '+15555550199', group: 'External' },
  ];

  it('returns every entry for a blank query, ungrouped first, groups in first-seen order', () => {
    expect(filterDirectory(entries, '  ')).toEqual([
      { group: undefined, destinations: [entries[0]] },
      { group: 'Team', destinations: [entries[1], entries[2]] },
      { group: 'External', destinations: [entries[3]] },
    ]);
  });

  it('matches label, description, group and destination, ignoring case', () => {
    const labels = (q: string) =>
      filterDirectory(entries, q).flatMap((g) => g.destinations.map((d) => d.label));
    expect(labels('ALEX')).toEqual(['Alex Rivera']);
    expect(labels('billing')).toEqual(['Alex Rivera']);
    expect(labels('external')).toEqual(['Night line']);
    expect(labels('0199')).toEqual(['Night line']);
  });

  it('drops groups with no match', () => {
    expect(filterDirectory(entries, 'sam')).toEqual([
      { group: 'Team', destinations: [entries[2]] },
    ]);
    expect(filterDirectory(entries, 'nobody')).toEqual([]);
  });

  it('matches a number however it is formatted', () => {
    const labels = (q: string) =>
      filterDirectory(entries, q).flatMap((g) => g.destinations.map((d) => d.label));
    expect(labels('555-0101')).toEqual(['Alex Rivera']);
    expect(labels('(555) 5550101')).toEqual(['Alex Rivera']);
    expect(labels('1 555 555 0199')).toEqual(['Night line']);
  });

  it('does not match on a single digit pulled out of words', () => {
    expect(filterDirectory(entries, 'line 1')).toEqual([]);
  });

  it('matches a tag', () => {
    const tagged = {
      id: 'kim-lo',
      label: 'Kim Lo',
      destination: '300',
      tags: ['Spanish', 'On call'],
    };
    expect(filterDirectory([...entries, tagged], 'on CALL')).toEqual([
      { group: undefined, destinations: [tagged] },
    ]);
  });

  it('trims tags and drops blank ones', () => {
    expect(
      directoryContactTags({ id: 'a', label: 'A', destination: '1', tags: [' Spanish ', '', '  '] })
    ).toEqual(['Spanish']);
    expect(directoryContactTags({ id: 'a', label: 'A', destination: '1' })).toEqual([]);
  });

  it('treats a blank group as no group', () => {
    const blank = { id: 'lobby', label: 'Lobby', destination: '200', group: ' ' };
    expect(filterDirectory([blank], '')).toEqual([{ group: undefined, destinations: [blank] }]);
  });
});
