import { normalizeMac } from '../mac';

describe('normalizeMac', () => {
  it('normalizes colon-separated MAC', () => {
    expect(normalizeMac('00:04:13:AA:BB:CC')).toBe('00:04:13:aa:bb:cc');
  });

  it('normalizes dash-separated MAC', () => {
    expect(normalizeMac('00-04-13-AA-BB-CC')).toBe('00:04:13:aa:bb:cc');
  });

  it('normalizes dot-separated MAC (Cisco-style)', () => {
    expect(normalizeMac('0004.13AA.BBCC')).toBe('00:04:13:aa:bb:cc');
  });

  it('normalizes MAC with no separators', () => {
    expect(normalizeMac('000413AABBCC')).toBe('00:04:13:aa:bb:cc');
  });

  it('returns null for too-short input', () => {
    expect(normalizeMac('00:04:13')).toBeNull();
  });

  it('returns null for too-long input', () => {
    expect(normalizeMac('00:04:13:AA:BB:CC:DD')).toBeNull();
  });

  it('returns null for non-hex characters', () => {
    expect(normalizeMac('00:04:13:GG:HH:II')).toBeNull();
  });

  it('returns null for empty string', () => {
    expect(normalizeMac('')).toBeNull();
  });

  it('handles lowercase input', () => {
    expect(normalizeMac('000413aabbcc')).toBe('00:04:13:aa:bb:cc');
  });

  it('handles mixed case and whitespace-adjacent input', () => {
    expect(normalizeMac('00:04:13:aA:bB:cC')).toBe('00:04:13:aa:bb:cc');
  });
});
