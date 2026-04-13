import { formatPhoneForDisplay } from '../dial-plan/format-phone';

describe('formatPhoneForDisplay', () => {
  it('formats US numbers in national format', () => {
    expect(formatPhoneForDisplay('+14155551234')).toBe('(415) 555-1234');
  });

  it('formats Canadian (NANP) numbers in national format', () => {
    // Canada shares +1 with the US; countryCallingCode fallback covers this.
    expect(formatPhoneForDisplay('+12048675309')).toBe('(204) 867-5309');
  });

  it('formats UK numbers in international format', () => {
    expect(formatPhoneForDisplay('+442071234567')).toBe('+44 20 7123 4567');
  });

  it('formats French numbers in international format', () => {
    expect(formatPhoneForDisplay('+33142868326')).toBe('+33 1 42 86 83 26');
  });

  it('returns empty string for empty input', () => {
    expect(formatPhoneForDisplay('')).toBe('');
    expect(formatPhoneForDisplay(null)).toBe('');
    expect(formatPhoneForDisplay(undefined)).toBe('');
  });

  it('returns the raw input when parsing fails', () => {
    expect(formatPhoneForDisplay('not-a-number')).toBe('not-a-number');
  });
});
