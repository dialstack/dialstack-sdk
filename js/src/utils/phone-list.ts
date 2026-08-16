import { parsePhoneNumberFromString } from 'libphonenumber-js';

/**
 * Why a line could not be turned into a number.
 *
 * - `invalid`       — a single number that is not a real US number
 * - `not_us`        — parses and is valid, but belongs to another country
 * - `toll_free`     — a US toll-free number, which cannot be ported
 * - `ambiguous`     — digits that do not divide cleanly into whole numbers
 * - `has_extension` — an extension is present, which we refuse to strip silently
 */
export type ParseProblemReason = 'invalid' | 'not_us' | 'toll_free' | 'ambiguous' | 'has_extension';

export interface ParsedNumber {
  /** 1-based line in the source text, so messages can point at what the user sees. */
  line: number;
  raw: string;
  e164: string;
}

export interface ParseProblem {
  line: number;
  raw: string;
  reason: ParseProblemReason;
}

export interface DuplicateEntry {
  line: number;
  raw: string;
  e164: string;
  firstSeenLine: number;
}

export interface ParsedPhoneNumberList {
  /** Valid numbers in input order, de-duplicated. */
  numbers: ParsedNumber[];
  problems: ParseProblem[];
  duplicates: DuplicateEntry[];
}

/**
 * Segments split on these; deliberately NOT on space, because a space sits
 * inside `(770) 212-6011`.
 */
const SEGMENT_DELIMITER = /[,;|\t]+/;

const EXTENSION = /\b(?:x|ext\.?|extension)\s*\d+/i;

const SINGLE_NUMBER_LENGTHS = (digits: string): boolean =>
  digits.length === 10 || (digits.length === 11 && digits.startsWith('1'));

type Classified = { ok: true; e164: string } | { ok: false; reason: ParseProblemReason };

/**
 * Mirrors the server's `validateUSPhoneNumber`: valid, US, and not toll-free.
 * Returns null when the input is not a single parseable number at all, which is
 * the caller's signal to try splitting it into several.
 */
function classifyOne(candidate: string): Classified | null {
  const parsed = parsePhoneNumberFromString(candidate, 'US');
  if (!parsed || !parsed.isValid()) return null;
  // Ask the parser rather than trusting the regex below: `7702126011x22` has no
  // word boundary before the `x`, and `#22` is not a marker the regex knows at
  // all, yet libphonenumber reads the extension off both. Missing it here would
  // silently port the main number and let normalize erase the extension from
  // the text, destroying the evidence too.
  if (parsed.ext) return { ok: false, reason: 'has_extension' };
  if (parsed.country !== 'US') return { ok: false, reason: 'not_us' };
  if (parsed.getType() === 'TOLL_FREE') return { ok: false, reason: 'toll_free' };
  return { ok: true, e164: parsed.number };
}

/**
 * Digit offsets at which the writer's own spacing puts a break.
 *
 * `(770) 212-6011` breaks after 3 digits; `770 212 6011 404 555 1212` breaks
 * after 3, 6, 10, 13 and 16. Only whitespace counts — punctuation inside a
 * number (`(`, `)`, `-`, `.`) is not a break. The end of the run is always a
 * legal boundary.
 */
interface DigitGrouping {
  /** Digit offsets where the writer put a break — the legal chunk boundaries. */
  boundaries: Set<number>;
  /** Digit offset → the digits of the group that ends there. */
  groupEndingAt: Map<number, string>;
}

function whitespaceDigitGroups(segment: string): DigitGrouping {
  const boundaries = new Set<number>();
  const groupEndingAt = new Map<number, string>();
  let digits = 0;
  let group = '';
  let pendingBreak = false;

  for (const ch of segment) {
    if (ch >= '0' && ch <= '9') {
      if (pendingBreak) {
        boundaries.add(digits);
        groupEndingAt.set(digits, group);
        group = '';
        pendingBreak = false;
      }
      digits += 1;
      group += ch;
    } else if (/\s/.test(ch)) {
      pendingBreak = true;
    }
  }

  boundaries.add(digits);
  groupEndingAt.set(digits, group);
  return { boundaries, groupEndingAt };
}

/**
 * Tile a digit run into consecutive whole numbers, preferring an 11-digit chunk
 * when it starts with a country code.
 *
 * Three constraints. The first is obvious; the other two are what stop a typo
 * becoming a number nobody typed:
 *
 * 1. The run must be consumed exactly — a leftover digit means we cannot tell
 *    what was intended.
 * 2. **Every chunk must end where the writer put a space.** Consuming evenly is
 *    not sufficient evidence on its own: one fat-fingered digit shifts the
 *    boundary and the run can still divide cleanly, so
 *    `(770) 212-60911 (404) 555-1212` would tile into `+17702126091` — a number
 *    nobody typed — with nothing left over to trip guard 1. Requiring the split
 *    to agree with the writer's own spacing rejects that, because the boundary
 *    would fall in the middle of a group they typed as one number.
 * 3. **A chunk may not end on a group that is a lone `1`, while digits remain.**
 *    Guard 2 is not enough when every separator is a plain space, because then
 *    the country code of the *next* number is itself a legal boundary and an
 *    11-digit chunk can reach across and swallow it:
 *    `1 770 212 6011 1 404 55 1212 1 213 555 1234` (one digit short in the
 *    middle number) tiled into `+14045512121`, which nobody typed, while the
 *    number they meant vanished — and every chunk still ended on a space.
 *    A solitary `1` is a country code, and a country code belongs to the number
 *    that follows it, never the one before.
 *
 * Returns null when the run cannot be tiled under all three constraints.
 */
function tileDigits(digits: string, grouping: DigitGrouping): string[] | null {
  const { boundaries, groupEndingAt } = grouping;
  const chunks: string[] = [];
  let i = 0;

  while (i < digits.length) {
    let matched = false;

    for (const width of [11, 10] as const) {
      if (i + width > digits.length) continue;
      if (!boundaries.has(i + width)) continue;
      // Guard 3: never finish a chunk on the next number's country code.
      if (i + width < digits.length && groupEndingAt.get(i + width) === '1') continue;
      const slice = digits.slice(i, i + width);
      if (width === 11 && !slice.startsWith('1')) continue;
      const parsed = parsePhoneNumberFromString(width === 11 ? `+${slice}` : slice, 'US');
      if (parsed && parsed.isValid()) {
        chunks.push(slice);
        i += width;
        matched = true;
        break;
      }
    }

    if (!matched) return null;
  }

  return chunks.length >= 2 ? chunks : null;
}

/** A decimal digit that is not ASCII 0-9 — full-width, Arabic-Indic, and so on. */
const NON_ASCII_DIGIT = /(?=\p{Nd})[^0-9]/u;

/** Resolve one segment to numbers, or to the single reason it failed. */
function parseSegment(segment: string): { numbers: string[] } | { reason: ParseProblemReason } {
  // Spreadsheet pastes carry full-width digits. NFKC folds them to ASCII so the
  // digit run and the spacing analysis both see them; without it `\D` strips
  // them as if they were punctuation and the number vanishes out of a
  // multi-number run with nothing reported against it.
  const text = segment.normalize('NFKC');

  if (EXTENSION.test(text)) return { reason: 'has_extension' };

  // Whatever NFKC could not fold is refused rather than stripped. Silently
  // dropping a digit the reader can see is the one outcome forbidden here.
  if (NON_ASCII_DIGIT.test(text)) return { reason: 'invalid' };

  const single = classifyOne(text);
  if (single) {
    return single.ok ? { numbers: [single.e164] } : { reason: single.reason };
  }

  const digits = text.replace(/\D/g, '');

  // A single US number is at most 11 digits, so anything shorter than two of
  // them cannot be a run of several: it is one bad number, not an ambiguous
  // split. Saying "couldn't tell how many numbers this is" about a half-typed
  // `123`, or about a heading carried in by a paste, would be baffling.
  if (digits.length < 12 || SINGLE_NUMBER_LENGTHS(digits)) return { reason: 'invalid' };

  const tiled = tileDigits(digits, whitespaceDigitGroups(text));
  if (!tiled) return { reason: 'ambiguous' };

  // Classify every chunk before emitting any of them, so a toll-free or
  // non-US number inside the run reports its real reason and the segment
  // still yields all-or-nothing.
  const e164s: string[] = [];
  for (const chunk of tiled) {
    const classified = classifyOne(chunk.length === 11 ? `+${chunk}` : chunk);
    if (!classified) return { reason: 'ambiguous' };
    if (!classified.ok) return { reason: classified.reason };
    e164s.push(classified.e164);
  }

  return { numbers: e164s };
}

/**
 * Parse arbitrary pasted text into US phone numbers, reporting line numbers and
 * repeats.
 *
 * **Internal.** Both surfaces use {@link parsePhoneNumberRows}; this is not
 * exported from the package, so it is not public API. It is retained because it
 * is the most direct exercise of the segment engine the row parser also uses.
 *
 * Accepts newline, comma, semicolon, tab and pipe separated input in any common
 * US format. Only genuinely blank lines are skipped: text with no digits at all
 * — a spreadsheet heading, a label, a typo — is reported rather than dropped,
 * because a heading and a typo are the same shape and exempting one lets the
 * other through unseen.
 *
 * A segment yields either all of its numbers or none: partial results are never
 * emitted, because a truncated paste that silently produced one valid number
 * would submit a port order for a number the customer never intended to move.
 */
export function parsePhoneNumberList(text: string): ParsedPhoneNumberList {
  const numbers: ParsedNumber[] = [];
  const problems: ParseProblem[] = [];
  const duplicates: DuplicateEntry[] = [];
  const seen = new Map<string, number>();

  const lines = text.replace(/\r\n?/g, '\n').split('\n');

  lines.forEach((lineText, index) => {
    const line = index + 1;

    for (const segment of lineText.split(SEGMENT_DELIMITER)) {
      const raw = segment.trim();
      if (raw === '') continue;

      const result = parseSegment(raw);

      if ('reason' in result) {
        problems.push({ line, raw, reason: result.reason });
        continue;
      }

      for (const e164 of result.numbers) {
        const firstSeenLine = seen.get(e164);
        if (firstSeenLine !== undefined) {
          duplicates.push({ line, raw, e164, firstSeenLine });
          continue;
        }
        seen.set(e164, line);
        numbers.push({ line, raw, e164 });
      }
    }
  });

  return { numbers, problems, duplicates };
}

/** One row's worth of pasted input, in the order it was written. */
export interface ParsedRow {
  /** Canonical national form when the segment was readable, else the text as typed. */
  value: string;
  /** Set when the segment could not be read; absent for a valid number. */
  reason?: ParseProblemReason;
}

/**
 * Split pasted text into one entry per number, in input order, for a UI that
 * holds each number separately.
 *
 * Everything the writer put in comes back out: a segment that could not be read
 * keeps its text verbatim and carries a reason, and a line with no digits at all
 * — a spreadsheet heading, or a typo like `asdf` — is an unreadable entry rather
 * than something quietly dropped. Only genuinely blank lines disappear.
 *
 * Repeats are kept. Whether a repeat is worth flagging is a question about the
 * whole list, which the caller can answer by looking at what came before it;
 * dropping it here would lose the writer's text.
 */
export function parsePhoneNumberRows(text: string): ParsedRow[] {
  const rows: ParsedRow[] = [];

  for (const line of text.replace(/\r\n?/g, '\n').split('\n')) {
    for (const segment of line.split(SEGMENT_DELIMITER)) {
      const raw = segment.trim();
      if (raw === '') continue;

      const result = parseSegment(raw);
      if ('reason' in result) {
        rows.push({ value: raw, reason: result.reason });
        continue;
      }
      for (const e164 of result.numbers) rows.push({ value: formatNationalUS(e164) });
    }
  }

  return rows;
}

/**
 * Canonical display form for a US number, e.g. `+17702126011` → `(770) 212-6011`.
 *
 * Both surfaces normalize with this so canonical text is a fixed point: text
 * that has been normalized re-parses to itself, which is what lets a saved draft
 * reopen without reformatting or reordering anything.
 */
export function formatNationalUS(e164: string): string {
  const parsed = parsePhoneNumberFromString(e164, 'US');
  return parsed ? parsed.formatNational() : e164;
}

/** A problem the server reported about one number, keyed by the number itself. */
export interface NumberIssue {
  e164: string;
  message: string;
}

export type RowStatus =
  | { status: 'empty' }
  | { status: 'ok'; e164: string }
  | { status: 'problem'; reason: ParseProblemReason }
  | { status: 'duplicate'; e164: string; firstSeenIndex: number }
  | { status: 'server'; e164: string; message: string };

/**
 * Parsing is pure and rows are re-classified on every keystroke, so results are
 * cached by value. Without this, editing one row re-parses every other row —
 * at 77 rows that made a keystroke visibly lag.
 */
const rowCache = new Map<string, ParsedRow[]>();

function parseRowValue(value: string): ParsedRow[] {
  const hit = rowCache.get(value);
  if (hit) return hit;

  const parsed = parsePhoneNumberRows(value);
  // Bounded so a long editing session cannot grow it without limit.
  if (rowCache.size > 500) rowCache.clear();
  rowCache.set(value, parsed);
  return parsed;
}

/**
 * Classify each row against the list as a whole.
 *
 * Every row gets exactly one status. That is the point of holding numbers in
 * rows rather than free text: there is no third state a value can fall into
 * where it is neither counted nor flagged.
 *
 * Precedence runs from what the reader can act on soonest: a value we could not
 * read at all, then something the server rejected, then a repeat of a row above.
 *
 * Shared so both surfaces agree on what "ready" means — a number counted in one
 * and not the other is the same silent short order this whole design refuses.
 */
export function classifyPhoneNumberRows(
  values: readonly string[],
  issues: readonly NumberIssue[] = []
): RowStatus[] {
  const issueFor = new Map(issues.map((i) => [i.e164, i.message]));
  const firstSeen = new Map<string, number>();

  return values.map((value, index): RowStatus => {
    if (value.trim() === '') return { status: 'empty' };

    const parsed = parseRowValue(value);

    // One row holds one number. Several here means the reader typed a separator
    // into the field by hand — a paste would have fanned out into rows.
    if (parsed.length !== 1) return { status: 'problem', reason: 'ambiguous' };

    const row = parsed[0];
    if (!row || row.reason) return { status: 'problem', reason: row?.reason ?? 'invalid' };

    const parsedNumber = parsePhoneNumberFromString(row.value, 'US');
    if (!parsedNumber) return { status: 'problem', reason: 'invalid' };
    const e164 = parsedNumber.number;

    const message = issueFor.get(e164);
    if (message) return { status: 'server', e164, message };

    const seenAt = firstSeen.get(e164);
    if (seenAt !== undefined) return { status: 'duplicate', e164, firstSeenIndex: seenAt };

    firstSeen.set(e164, index);
    return { status: 'ok', e164 };
  });
}

/** The numbers this list would submit, in order and de-duplicated. */
export function readyPhoneNumbers(
  values: readonly string[],
  issues: readonly NumberIssue[] = []
): string[] {
  return classifyPhoneNumberRows(values, issues)
    .map((row) => (row.status === 'ok' ? row.e164 : null))
    .filter((e164): e164 is string => e164 !== null);
}

/**
 * The clean gate: an order may not advance while any row is unresolved.
 *
 * Proceeding with a subset would quietly drop numbers the customer asked to
 * port, and they would not find out until the port completed without them. A
 * row is resolved by correcting it or deleting it — both deliberate acts.
 *
 * A blank row is not a blocker: it is an unused field, and there is nothing on
 * screen claiming it will be ported.
 *
 * **A repeat is a blocker**, which it was not at first. The argument for letting
 * it through was that nothing is lost at the carrier by sending a number once —
 * true, and beside the point. The row stays on screen, so a list of 85 rows
 * submits 83 numbers, and the two that vanish are exactly the kind of silent
 * shortfall the rest of this design refuses. Deleting the repeat costs one
 * click and makes what is on screen match what is ordered.
 */
export function isPhoneNumberListReady(
  values: readonly string[],
  issues: readonly NumberIssue[],
  maxNumbers: number
): boolean {
  const rows = classifyPhoneNumberRows(values, issues);
  if (rows.some((r) => r.status === 'problem' || r.status === 'server' || r.status === 'duplicate'))
    return false;

  const ready = rows.filter((r) => r.status === 'ok').length;
  return ready > 0 && ready <= maxNumbers;
}
