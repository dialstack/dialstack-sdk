/**
 * The carrier's port-time window is 08:00–20:00 Eastern, whatever zone the
 * order is placed in. These helpers express it in the order's zone on a given
 * date, using only `Intl` so the bundle carries no timezone library. The date
 * matters: Arizona and Hawaii keep no daylight time, so their offset from
 * Eastern changes through the year.
 *
 * Shared by the admin portal and the onboarding portal, so both offer and
 * accept exactly the times the API will. A date left `undefined` (or empty)
 * means today's Eastern date, which is enough to fix the offset.
 */
export const FOC_CARRIER_TIMEZONE = 'America/New_York';

const WINDOW_START = 8 * 60;
const WINDOW_END = 20 * 60;

const formatters = new Map<string, Intl.DateTimeFormat>();

function wallClockFormatter(timeZone: string): Intl.DateTimeFormat {
  let f = formatters.get(timeZone);
  if (!f) {
    f = new Intl.DateTimeFormat('en-US', {
      timeZone,
      hourCycle: 'h23',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
    });
    formatters.set(timeZone, f);
  }
  return f;
}

/** The wall clock in `timeZone` at instant `t`, as a UTC timestamp of the same fields. */
function wallClockAsUtc(t: number, timeZone: string): number {
  const parts: Record<string, number> = {};
  for (const p of wallClockFormatter(timeZone).formatToParts(new Date(t))) {
    if (p.type !== 'literal') parts[p.type] = Number(p.value);
  }
  return Date.UTC(
    parts.year ?? 1970,
    (parts.month ?? 1) - 1,
    parts.day ?? 1,
    parts.hour ?? 0,
    parts.minute ?? 0
  );
}

/** The instant a wall-clock time names in `timeZone`. */
function zonedInstant(date: string, minutes: number, timeZone: string): number {
  const [y, m, d] = date.split('-').map(Number);
  const wall = Date.UTC(y ?? 1970, (m ?? 1) - 1, d ?? 1, Math.floor(minutes / 60), minutes % 60);
  // Two passes settle the offset even when the first guess lands across a
  // daylight-saving change.
  let t = wall;
  for (let i = 0; i < 2; i++) t = wall - (wallClockAsUtc(t, timeZone) - t);
  return t;
}

function minutesOfDay(t: number, timeZone: string): number {
  const wall = new Date(wallClockAsUtc(t, timeZone));
  return wall.getUTCHours() * 60 + wall.getUTCMinutes();
}

function todayEastern(): string {
  return new Date(wallClockAsUtc(Date.now(), FOC_CARRIER_TIMEZONE)).toISOString().slice(0, 10);
}

const pad = (n: number) => String(n).padStart(2, '0');
const toHHMM = (minutes: number) => `${pad(Math.floor(minutes / 60))}:${pad(minutes % 60)}`;

function parseHHMM(hhmm: string): number | null {
  const match = /^(\d{2}):(\d{2})$/.exec(hhmm);
  return match ? Number(match[1]) * 60 + Number(match[2]) : null;
}

/** Whether `hhmm` in `timeZone` on `date` falls inside the carrier's window. */
export function isFocTimeInWindow(
  date: string | undefined,
  hhmm: string,
  timeZone: string
): boolean {
  const minutes = parseHHMM(hhmm);
  if (minutes === null) return false;
  const t = zonedInstant(date || todayEastern(), minutes, timeZone);
  const eastern = minutesOfDay(t, FOC_CARRIER_TIMEZONE);
  return eastern >= WINDOW_START && eastern <= WINDOW_END;
}

/** An Eastern wall-clock time (`hhmm`) on `date`, as HH:MM in `timeZone`. */
export function focTimeFromEastern(
  date: string | undefined,
  hhmm: string,
  timeZone: string
): string {
  const minutes = parseHHMM(hhmm) ?? 0;
  const t = zonedInstant(date || todayEastern(), minutes, FOC_CARRIER_TIMEZONE);
  return toHHMM(minutesOfDay(t, timeZone));
}

/**
 * The Eastern calendar date (YYYY-MM-DD) of `hhmm` read in `timeZone` on
 * `date`. The carrier counts its lead time on this date, not the one written:
 * in Guam, 09:00 is the previous day in Eastern.
 */
export function focEasternDate(date: string, hhmm: string, timeZone: string): string {
  const t = zonedInstant(date, parseHHMM(hhmm) ?? 0, timeZone);
  return new Date(wallClockAsUtc(t, FOC_CARRIER_TIMEZONE)).toISOString().slice(0, 10);
}

/** The carrier's window on `date`, as HH:MM wall-clock times in `timeZone`. */
export function focWindowIn(
  date: string | undefined,
  timeZone: string
): { start: string; end: string } {
  return {
    start: focTimeFromEastern(date, toHHMM(WINDOW_START), timeZone),
    end: focTimeFromEastern(date, toHHMM(WINDOW_END), timeZone),
  };
}

/**
 * Half-hour times in `timeZone` the API accepts on `date`, in wall-clock order.
 * For a zone far from Eastern (Guam) the window wraps past midnight, and the
 * list does with it.
 */
export function focTimeOptions(date: string | undefined, timeZone: string): string[] {
  const options: string[] = [];
  for (let minutes = 0; minutes < 24 * 60; minutes += 30) {
    const hhmm = toHHMM(minutes);
    if (isFocTimeInWindow(date, hhmm, timeZone)) options.push(hhmm);
  }
  return options;
}

/** A zone's generic name ("Pacific Time"), or the IANA name if the runtime has none. */
export function focZoneLabel(timeZone: string, locale = 'en-US'): string {
  try {
    const parts = new Intl.DateTimeFormat(locale, {
      timeZone,
      timeZoneName: 'longGeneric',
    }).formatToParts(new Date());
    return parts.find((p) => p.type === 'timeZoneName')?.value ?? timeZone;
  } catch {
    return timeZone;
  }
}

/** "17:30" → "5:30 PM". */
export function formatFocTime12h(hhmm: string): string {
  const [h = 0, m = 0] = hhmm.split(':').map(Number);
  const suffix = h >= 12 ? 'PM' : 'AM';
  return `${h % 12 === 0 ? 12 : h % 12}:${pad(m)} ${suffix}`;
}
