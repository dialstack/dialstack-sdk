/**
 * Suggests a new user's extension number for the onboarding portal.
 *
 * Deliberately a private copy of the admin portal's `nextExtensionNumber` for
 * the user range, not a shared export: sharing it would make it public SDK API.
 * An admin-side test checks the two agree, so change both together.
 */

// 3-digit service codes that collide with dialed codes on a 3-digit account.
// Exported only for the admin parity test; the onboarding entry point does not
// re-export this module.
export const RESERVED_SERVICE_CODES: ReadonlySet<string> = new Set([
  '211',
  '311',
  '411',
  '511',
  '611',
  '711',
  '811',
  '911',
  '988',
  '933',
]);

/**
 * Lowest free number in the user range (1xx, 1xxx, ...), falling back to the
 * whole extension space; null when every number is taken.
 */
export function suggestUserExtension(
  existingNumbers: string[],
  extensionLength: number
): string | null {
  const base = Math.pow(10, extensionLength - 1);
  const maxNumber = Math.pow(10, extensionLength) - 1;
  const used = new Set(existingNumbers.map((n) => parseInt(n, 10)));
  const isAvailable = (n: number) => !used.has(n) && !RESERVED_SERVICE_CODES.has(n.toString());

  for (let n = base; n <= Math.min(2 * base - 1, maxNumber); n++) {
    if (isAvailable(n)) return n.toString();
  }
  for (let n = base; n <= maxNumber; n++) {
    if (isAvailable(n)) return n.toString();
  }
  return null;
}
