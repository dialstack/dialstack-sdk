/**
 * The days the carrier does not port numbers on, besides weekends.
 *
 * It is the carrier's published porting-holiday list, which covers US and
 * Canadian ports in one table without saying which ports each day applies to.
 * The days the carrier itself is closed apply to every port, since it handles
 * every port. The days only some losing carriers observe apply to ports of
 * their own country's numbers, or both countries' when both observe them; a
 * port asked for on one is refused or moved, so it is never offered.
 *
 * Computed by rule rather than from a holiday library, which would weigh more
 * than everything else in this file's callers. The API refuses the same days.
 *
 * Last checked against the carrier's list for
 * {@link PORTING_HOLIDAYS_VERIFIED_THROUGH_YEAR}. To refresh it, compare the
 * carrier's published list for the new year with `holidays` below, adjust, and
 * bump the year.
 */

import type { SupportedCountryCode } from '../constants/countries';

export const PORTING_HOLIDAYS_VERIFIED_THROUGH_YEAR = 2026;

type Holidays = Map<string, string>;

const pad = (n: number) => String(n).padStart(2, '0');

/** A calendar date as `YYYY-MM-DD`, from UTC fields. */
const key = (d: Date) => `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`;

const utc = (year: number, month: number, day: number) => new Date(Date.UTC(year, month, day));

const addDays = (d: Date, days: number) =>
  utc(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate() + days);

/** The nth `weekday` (0 = Sunday) of a month; a negative n counts from its end. */
function nthWeekday(year: number, month: number, weekday: number, n: number): Date {
  if (n > 0) {
    const first = utc(year, month, 1);
    return addDays(first, ((weekday - first.getUTCDay() + 7) % 7) + (n - 1) * 7);
  }
  const last = utc(year, month + 1, 0);
  return addDays(last, -(((last.getUTCDay() - weekday + 7) % 7) + (-n - 1) * 7));
}

/** Easter Sunday (Gregorian, anonymous algorithm). */
function easter(year: number): Date {
  const a = year % 19;
  const b = Math.floor(year / 100);
  const c = year % 100;
  const d = Math.floor(b / 4);
  const e = b % 4;
  const f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4);
  const k = c % 4;
  const l = (32 + 2 * e + 2 * i - h - k) % 7;
  const m = Math.floor((a + 11 * h + 22 * l) / 451);
  const month = Math.floor((h + l - 7 * m + 114) / 31);
  const day = ((h + l - 7 * m + 114) % 31) + 1;
  return utc(year, month - 1, day);
}

function add(out: Holidays, date: Date, name: string): void {
  const k = key(date);
  if (!out.has(k)) out.set(k, name);
}

/**
 * A fixed-date holiday and the weekday it is observed on when it falls on a
 * weekend, given as day offsets by weekday (0 = Sunday … 6 = Saturday).
 */
function addFixed(
  out: Holidays,
  date: Date,
  name: string,
  observed: Partial<Record<number, number>>
): void {
  add(out, date, name);
  const offset = observed[date.getUTCDay()];
  if (offset) add(out, addDays(date, offset), `${name} (observed)`);
}

/** A US holiday on a Saturday is observed Friday, on a Sunday Monday. */
const US_OBSERVED = { 6: -1, 0: 1 };
/** A Canadian holiday on a weekend is observed the Monday after. */
const CA_OBSERVED = { 6: 2, 0: 1 };

function holidays(year: number, country: SupportedCountryCode): Holidays {
  const out: Holidays = new Map();
  const canada = country === 'CA';
  // A Canadian port's view of a US-only closure names its country.
  const us = (name: string) => (canada ? `${name} (US)` : name);
  // Each country's own name for a day both observe.
  const pick = (usName: string, caName: string) => (canada ? caName : usName);

  // The carrier is closed: every port.
  addFixed(out, utc(year, 0, 1), "New Year's Day", US_OBSERVED);
  // Next year's New Year's Day, observed on this year's December 31.
  addFixed(out, utc(year + 1, 0, 1), "New Year's Day", US_OBSERVED);
  add(out, nthWeekday(year, 0, 1, 3), us('Martin Luther King Jr. Day'));
  add(out, nthWeekday(year, 4, 1, -1), us('Memorial Day'));
  addFixed(out, utc(year, 6, 4), us('Independence Day'), US_OBSERVED);
  add(out, nthWeekday(year, 8, 1, 1), pick('Labor Day', 'Labour Day'));
  const thanksgiving = nthWeekday(year, 10, 4, 4);
  add(out, thanksgiving, us('Thanksgiving Day'));
  add(out, addDays(thanksgiving, 1), us('Day after Thanksgiving'));
  add(out, utc(year, 11, 24), 'Christmas Eve');
  addFixed(out, utc(year, 11, 25), 'Christmas Day', US_OBSERVED);

  // Limited days both countries observe.
  add(out, nthWeekday(year, 1, 1, 3), pick("Presidents' Day", 'Family Day'));
  add(out, addDays(easter(year), -2), 'Good Friday');
  add(out, nthWeekday(year, 9, 1, 2), pick('Columbus Day', 'Thanksgiving'));
  add(out, utc(year, 11, 31), "New Year's Eve");

  if (!canada) {
    addFixed(out, utc(year, 10, 11), 'Veterans Day', US_OBSERVED);
    addFixed(out, utc(year, 5, 19), 'Juneteenth', US_OBSERVED);
    // The Tuesday after the first Monday of November.
    add(out, addDays(nthWeekday(year, 10, 1, 1), 1), 'Election Day');
    return out;
  }
  // Canadian ports: Canada's own days, and its own weekend observances.
  addFixed(out, utc(year, 10, 11), 'Remembrance Day', CA_OBSERVED);
  addFixed(out, utc(year, 0, 1), "New Year's Day", CA_OBSERVED);
  addFixed(out, utc(year, 11, 25), 'Christmas Day', CA_OBSERVED);
  // The last Monday before May 25.
  add(out, nthWeekday(year, 4, 1, -2), 'Victoria Day');
  addFixed(out, utc(year, 6, 1), 'Canada Day', CA_OBSERVED);
  add(out, nthWeekday(year, 7, 1, 1), 'Civic Holiday');
  addFixed(out, utc(year, 8, 30), 'National Day for Truth and Reconciliation', CA_OBSERVED);
  return out;
}

const cache = new Map<string, Holidays>();

/**
 * The name of the porting holiday on a date for a port of `country`'s
 * numbers, or `null` when the carrier ports that day (weekends aside). `date`
 * is a calendar date, `YYYY-MM-DD`.
 */
export function portingHoliday(date: string, country: SupportedCountryCode): string | null {
  const year = Number(date.slice(0, 4));
  if (!Number.isInteger(year) || date.length !== 10) return null;
  const cacheKey = `${country}${year}`;
  let out = cache.get(cacheKey);
  if (!out) {
    out = holidays(year, country);
    cache.set(cacheKey, out);
  }
  return out.get(date) ?? null;
}
