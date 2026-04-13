import { parsePhoneNumberFromString } from 'libphonenumber-js';

/**
 * Format an E.164 phone number for display.
 * US numbers render in national format ("(415) 555-1234"),
 * other countries in international format ("+44 20 7123 4567").
 * Returns the raw input if parsing fails.
 */
export function formatPhoneForDisplay(e164: string | null | undefined): string {
  if (!e164) return '';
  const parsed = parsePhoneNumberFromString(e164);
  if (!parsed) return e164;
  const isNanp = parsed.country === 'US' || parsed.countryCallingCode === '1';
  return isNanp ? parsed.formatNational() : parsed.formatInternational();
}
