import {
  focEasternDate,
  focTimeFromEastern,
  focTimeOptions,
  focWindowIn,
  focZoneLabel,
  formatFocTime12h,
  isFocTimeInWindow,
} from '../foc-time';

describe('focWindowIn', () => {
  it('is 08:00–20:00 in Eastern', () => {
    expect(focWindowIn('2026-10-20', 'America/New_York')).toEqual({ start: '08:00', end: '20:00' });
  });

  it('shifts into Pacific', () => {
    expect(focWindowIn('2026-10-20', 'America/Los_Angeles')).toEqual({
      start: '05:00',
      end: '17:00',
    });
  });

  it('depends on the date in a zone with no daylight time', () => {
    expect(focWindowIn('2026-07-15', 'America/Phoenix')).toEqual({ start: '05:00', end: '17:00' });
    expect(focWindowIn('2026-01-15', 'America/Phoenix')).toEqual({ start: '06:00', end: '18:00' });
  });
});

describe('focTimeOptions', () => {
  it('offers 08:00 to 20:00 in Eastern', () => {
    const options = focTimeOptions('2026-10-20', 'America/New_York');
    expect(options[0]).toBe('08:00');
    expect(options.at(-1)).toBe('20:00');
    expect(options).toHaveLength(25);
  });

  it('offers 05:00 to 17:00 in Pacific', () => {
    const options = focTimeOptions('2026-10-20', 'America/Los_Angeles');
    expect(options[0]).toBe('05:00');
    expect(options.at(-1)).toBe('17:00');
    expect(options).not.toContain('17:30');
  });

  it('wraps past midnight for a zone far from Eastern', () => {
    const options = focTimeOptions('2026-10-20', 'Pacific/Guam');
    expect(options).toContain('00:00');
    expect(options).toContain('22:00');
    expect(options).not.toContain('12:00');
  });

  it('is right on a daylight-saving change day', () => {
    // 2026-11-01: Eastern and Pacific both fall back; the window stays 05:00–17:00.
    const options = focTimeOptions('2026-11-01', 'America/Los_Angeles');
    expect(options[0]).toBe('05:00');
    expect(options.at(-1)).toBe('17:00');
  });
});

describe('isFocTimeInWindow', () => {
  it('reads the time in the given zone', () => {
    expect(isFocTimeInWindow('2026-10-20', '05:00', 'America/Los_Angeles')).toBe(true);
    expect(isFocTimeInWindow('2026-10-20', '05:00', 'America/New_York')).toBe(false);
    expect(isFocTimeInWindow('2026-10-20', '20:00', 'America/New_York')).toBe(true);
    expect(isFocTimeInWindow('2026-10-20', '20:30', 'America/New_York')).toBe(false);
  });

  it('accepts the top of the window and refuses a minute past it', () => {
    expect(isFocTimeInWindow('2026-10-20', '20:00', 'America/New_York')).toBe(true);
    expect(isFocTimeInWindow('2026-10-20', '20:01', 'America/New_York')).toBe(false);
  });

  it('refuses a malformed time', () => {
    expect(isFocTimeInWindow('2026-10-20', '9:00', 'America/New_York')).toBe(false);
  });
});

describe('focTimeFromEastern', () => {
  it('converts an Eastern wall clock into the zone', () => {
    expect(focTimeFromEastern('2026-10-20', '11:30', 'America/New_York')).toBe('11:30');
    expect(focTimeFromEastern('2026-10-20', '11:30', 'America/Los_Angeles')).toBe('08:30');
  });
});

describe('focEasternDate', () => {
  it('is the Eastern date of the instant, which can be the day before', () => {
    expect(focEasternDate('2026-10-20', '09:00', 'America/Los_Angeles')).toBe('2026-10-20');
    // 09:00 in Guam (UTC+10) is 19:00 the previous evening in Eastern.
    expect(focEasternDate('2026-10-20', '09:00', 'Pacific/Guam')).toBe('2026-10-19');
  });
});

describe('labels', () => {
  it('names the zone and formats 12-hour times', () => {
    expect(focZoneLabel('America/Los_Angeles')).toBe('Pacific Time');
    expect(focZoneLabel('Not/AZone')).toBe('Not/AZone');
    expect(formatFocTime12h('17:30')).toBe('5:30 PM');
    expect(formatFocTime12h('00:00')).toBe('12:00 AM');
    expect(formatFocTime12h('12:00')).toBe('12:00 PM');
  });
});
