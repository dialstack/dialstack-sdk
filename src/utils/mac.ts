/**
 * MAC address normalization utility.
 */

/**
 * Normalize a MAC address to colon-separated lowercase format.
 * Accepts any delimiter (colon, hyphen, dot) or no delimiter at all.
 * Returns null if the input doesn't contain exactly 12 hex digits.
 */
export function normalizeMac(input: string): string | null {
  const hex = input.replace(/[^a-fA-F0-9]/g, '');
  if (hex.length !== 12) return null;

  return hex.toLowerCase().match(/.{2}/g)!.join(':');
}
