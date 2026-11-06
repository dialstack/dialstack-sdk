/**
 * Catches obvious address typos so the error lands in the field slot rather than
 * the card-level banner. Deliberately loose: the API's own check is authoritative,
 * and a client rule stricter than the server would reject addresses the server
 * would happily accept — a worse failure than relaying its message.
 */
export function looksLikeEmailAddress(value: string): boolean {
  if (/\s/.test(value)) return false;
  const parts = value.split('@');
  if (parts.length !== 2) return false;
  const [local, domain] = parts;
  return (
    !!local && !!domain && domain.includes('.') && !domain.startsWith('.') && !domain.endsWith('.')
  );
}
