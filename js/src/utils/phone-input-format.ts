import { AsYouType } from 'libphonenumber-js';

/** Characters a US number can legitimately contain while being typed. */
const PHONE_SHAPED = /^[\d\s().+-]*$/;

const canonical = (digits: string): string => (digits ? new AsYouType('US').input(digits) : '');

/**
 * Format a single number field as it is typed.
 *
 * Formatting applies to insertions only. **A deletion is always literal** — one
 * keypress removes exactly the one character under the caret and nothing else.
 * Rewriting during a deletion is what makes an input feel possessed: removing
 * the `x` from `678-555-0199 x123` would also swallow the space, so the next
 * press lands on a digit instead of where the reader was aiming.
 *
 * Shared by both surfaces because these rules are subtle, the failure mode is a
 * digit silently disappearing, and the two must behave identically.
 */
export function formatWhileTyping(raw: string, previous: string): string {
  // Anything not phone-shaped is text the reader needs to see and correct — a
  // heading carried in by a paste, or a typo. Reformatting destroys what they
  // have to read.
  if (!PHONE_SHAPED.test(raw)) return raw;

  // More than one number's worth of digits cannot be formatted as a number, and
  // running it through the formatter strips the reader's own spacing — both the
  // structure they need to fix it and the evidence the parser splits on.
  const digits = raw.replace(/\D/g, '');
  if (digits.length > 11) return raw;

  if (raw.length < previous.length) return raw;

  // Nothing to format yet. Returning '' would drop the character, and because
  // the value is unchanged React does not re-render — so the field would still
  // show a `+` the state no longer has, and every later keystroke would build
  // on a value the reader cannot see.
  if (digits === '') return raw;

  // A leading `+` means an international number. Formatting the digits alone
  // discards it, and the row is then reported as unreadable rather than
  // "only US numbers can be ported" — the wrong message, and the evidence for
  // the right one is gone.
  if (raw.trimStart().startsWith('+')) return new AsYouType().input(raw.trimStart());

  return canonical(digits);
}

/**
 * Tidy a finished value.
 *
 * Deletions leave the value part-formatted on purpose; a blur means the reader
 * has moved on, so it is safe to settle it. Nothing that is not a single number
 * is touched, so a row still under correction keeps its text.
 */
export function formatOnBlur(value: string): string {
  if (!PHONE_SHAPED.test(value)) return value;
  const digits = value.replace(/\D/g, '');
  if (digits.length > 11) return value;
  if (digits === '') return value;

  // Same reason as while typing: dropping the `+` turns "only US numbers can be
  // ported" into "not a valid US phone number", which is both wrong and
  // unactionable. An 11-digit international number would otherwise lose it here
  // even though the keystroke path was careful to keep it.
  if (value.trimStart().startsWith('+')) return new AsYouType().input(value.trimStart());

  return canonical(digits);
}
