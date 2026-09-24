import { parsePhoneNumberFromString } from 'libphonenumber-js';

/** E.164 for a number the user typed, or null when it is not a valid number. */
export function toE164(raw: string): string | null {
  const parsed = parsePhoneNumberFromString(raw, 'US');
  return parsed?.isValid() ? parsed.number : null;
}

export function formatForDisplay(e164: string): string {
  return parsePhoneNumberFromString(e164)?.formatNational() ?? e164;
}
