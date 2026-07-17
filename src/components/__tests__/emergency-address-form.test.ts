import { normalizeStateCode } from '../emergency-address-form';

describe('normalizeStateCode', () => {
  it('maps a full US state name to its 2-letter code', () => {
    expect(normalizeStateCode('California')).toBe('CA');
    expect(normalizeStateCode('New York')).toBe('NY');
  });

  it('is case- and whitespace-insensitive', () => {
    expect(normalizeStateCode('  texas ')).toBe('TX');
    expect(normalizeStateCode('DISTRICT OF COLUMBIA')).toBe('DC');
  });

  it('upper-cases an already-abbreviated code (MSAG wants uppercase)', () => {
    expect(normalizeStateCode('CA')).toBe('CA');
    expect(normalizeStateCode('ny')).toBe('NY'); // a 2-letter code, upper-cased for the validator
  });

  it('passes an unrecognized value through (trimmed)', () => {
    expect(normalizeStateCode(' Freedonia ')).toBe('Freedonia');
  });

  it('maps Canadian provinces too (country may be CA)', () => {
    expect(normalizeStateCode('Ontario')).toBe('ON');
    expect(normalizeStateCode('quebec')).toBe('QC');
  });
});
