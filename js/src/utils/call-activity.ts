/**
 * Facts about an account's calls that the call activity components share
 * (To call back, Unread voicemail, Call analytics, Devices offline): how a call
 * that reached nobody is named, the windows they compare, the health
 * thresholds, the To call back timeline, and how times are shown.
 */

import { formatNationalUS } from './phone-list';
import type { CallLog, CallStatus, CallSummary, CallSummaryCount } from '../types/components';
import type { CallAnalyticsRangePreset, CallOutcome, QualitySummary } from '../types/call-activity';
import type { PaginatedResponse } from '../types/phone-numbers';

// ============================================================================
// Outcomes
// ============================================================================

/** Bar and legend order, and the chart colour each takes (1-based). */
export const OUTCOMES: readonly CallOutcome[] = ['missed', 'abandoned', 'voicemail', 'failed'];

export function outcomeColor(outcome: CallOutcome): string {
  return `var(--ds-color-chart-${OUTCOMES.indexOf(outcome) + 1})`;
}

/**
 * How a call that reached nobody ended; null when a party connected or the
 * call is still in progress. A hang-up at the voicemail greeting is already
 * `no-answer` in the API, so it counts as missed, like any unanswered ring.
 */
export function outcomeOf(
  status: CallStatus | null | undefined,
  connected: boolean
): CallOutcome | null {
  switch (status) {
    case 'no-answer':
      return 'missed';
    case 'voicemail':
      return 'voicemail';
    case 'busy':
    case 'failed':
      return 'failed';
    case 'completed':
      return connected ? null : 'abandoned';
    default:
      return null;
  }
}

/** The call-list filters that select one outcome's inbound calls. */
export function outcomeFilters(outcome: CallOutcome): {
  status?: CallStatus;
  statuses?: CallStatus[];
  connected?: boolean;
} {
  switch (outcome) {
    case 'missed':
      return { status: 'no-answer' };
    case 'abandoned':
      return { status: 'completed', connected: false };
    case 'voicemail':
      return { status: 'voicemail' };
    case 'failed':
      return { statuses: ['busy', 'failed'] };
  }
}

export type OutcomeCounts = Record<CallOutcome, number> & { inbound: number };

/** Inbound only: each outcome is a caller nobody served. */
export function outcomeCounts(breakdown: CallSummaryCount[] | undefined): OutcomeCounts {
  const counts: OutcomeCounts = { missed: 0, abandoned: 0, voicemail: 0, failed: 0, inbound: 0 };
  for (const row of breakdown ?? []) {
    if (row.direction !== 'inbound') continue;
    counts.inbound += row.count;
    const outcome = outcomeOf(row.status, row.connected);
    if (outcome) counts[outcome] += row.count;
  }
  return counts;
}

export function unservedTotal(counts: OutcomeCounts): number {
  return OUTCOMES.reduce((sum, o) => sum + counts[o], 0);
}

/** Changes when, and only when, the inbound counts do. */
/**
 * Every count in a summary, in a stable order: changes when any call in the
 * window starts, ends or connects, in either direction.
 */
export function callsSignature(summary: CallSummary | undefined): string {
  return (summary?.breakdown ?? [])
    .map((r) => `${r.direction}/${r.status}/${r.connected}=${r.count}`)
    .sort()
    .join(',');
}

/** Pages a read can follow before giving up; the newest pages come first. */
const MAX_PAGES = 10;

/** Every page of a list read, up to MAX_PAGES, as one array. */
export async function readAllPages<T, P extends { page?: string }>(
  read: (params: P) => Promise<PaginatedResponse<T>>,
  params: P
): Promise<T[]> {
  const out: T[] = [];
  let page: string | undefined;
  for (let i = 0; i < MAX_PAGES; i++) {
    const res = await read(page ? { ...params, page } : params);
    out.push(...res.data);
    const next = res.next_page_url
      ? new URL(res.next_page_url, 'http://x').searchParams.get('page')
      : null;
    if (!next) break;
    page = next;
  }
  return out;
}

export type Direction = 'inbound' | 'outbound' | 'internal';

export function directionCounts(summary: CallSummary | undefined): Record<Direction, number> {
  const counts: Record<Direction, number> = { inbound: 0, outbound: 0, internal: 0 };
  for (const row of summary?.breakdown ?? []) counts[row.direction] += row.count;
  return counts;
}

/** Whole-percent change; null with nothing before, since a change from zero is unbounded. */
export function percentChange(current: number, previous: number): number | null {
  if (previous === 0) return null;
  return Math.round(((current - previous) / previous) * 100);
}

export interface Share {
  count: number;
  total: number;
}

/** Customer sentiment: the other party's reading on inbound calls. */
export function customerSentiment(summary: CallSummary | undefined): Share {
  const share: Share = { count: 0, total: 0 };
  for (const row of summary?.sentiment.remote ?? []) {
    if (row.direction !== 'inbound') continue;
    share.total += row.count;
    if (row.sentiment === 'negative') share.count += row.count;
  }
  return share;
}

/** Poor call quality: calls whose estimated MOS is below 3.5. */
export function poorQuality(summary: QualitySummary | undefined): Share {
  const share: Share = { count: 0, total: 0 };
  for (const b of summary?.time_series ?? []) {
    share.count += b.poor_count;
    share.total += b.good_count + b.fair_count + b.poor_count;
  }
  return share;
}

// ============================================================================
// Health
// ============================================================================

export type HealthLevel = 'good' | 'warning' | 'critical' | 'insufficient';

/** Below this many calls one bad call swings the percentage too far to rate. */
export const MIN_HEALTH_SAMPLE = 20;

export interface Thresholds {
  /** Highest percentage that is still good */
  good: number;
  /** Highest percentage that is still a warning; above it is critical */
  warning: number;
}

/** Negative customer sentiment, as a share of inbound calls with a reading. */
export const SENTIMENT_THRESHOLDS: Thresholds = { good: 10, warning: 20 };

/** Calls with poor audio, as a share of measured calls. */
export const QUALITY_THRESHOLDS: Thresholds = { good: 1, warning: 3 };

/**
 * Exact cutoffs: 1.00 % is good and 1.01 % a warning. Compared in integers
 * (count × 100 against threshold × total) so a share exactly on a cutoff is
 * not pushed over it by float error.
 */
export function healthLevel(share: Share, thresholds: Thresholds): HealthLevel {
  if (share.total < MIN_HEALTH_SAMPLE) return 'insufficient';
  if (share.count * 100 <= thresholds.good * share.total) return 'good';
  if (share.count * 100 <= thresholds.warning * share.total) return 'warning';
  return 'critical';
}

export function formatPercent(share: Share): string {
  if (share.total === 0) return '—';
  const pct = (share.count / share.total) * 100;
  return `${pct > 0 && pct < 10 ? pct.toFixed(1) : Math.round(pct)}%`;
}

// ============================================================================
// Windows
// ============================================================================

export const RANGE_PRESETS: readonly CallAnalyticsRangePreset[] = [
  'last1h',
  'last4h',
  'last8h',
  'today',
  'yesterday',
  'last7d',
];

export interface ComparisonRange {
  from: Date;
  to: Date;
  previousFrom: Date;
  previousTo: Date;
}

export const HOUR = 3_600_000;

function startOfDay(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}

function addDays(d: Date, days: number): Date {
  // Calendar days, so a DST change keeps the clock time.
  return new Date(
    d.getFullYear(),
    d.getMonth(),
    d.getDate() + days,
    d.getHours(),
    d.getMinutes(),
    d.getSeconds(),
    d.getMilliseconds()
  );
}

/**
 * A window and the one it is compared with: the same window a week earlier,
 * so a Monday is set against a Monday and this afternoon against last week's.
 * The last 7 days compare with the 7 days just before. Days start at the
 * viewer's midnight: an account has no time zone, only its locations do.
 */
export function computeRange(
  preset: CallAnalyticsRangePreset,
  now: Date = new Date()
): ComparisonRange {
  let from: Date;
  let to = now;
  switch (preset) {
    case 'last1h':
      from = new Date(now.getTime() - HOUR);
      break;
    case 'last4h':
      from = new Date(now.getTime() - 4 * HOUR);
      break;
    case 'last8h':
      from = new Date(now.getTime() - 8 * HOUR);
      break;
    case 'today':
      from = startOfDay(now);
      break;
    case 'yesterday':
      to = new Date(startOfDay(now).getTime() - 1);
      from = addDays(startOfDay(now), -1);
      break;
    case 'last7d':
      from = new Date(now.getTime() - 7 * 24 * HOUR);
      break;
  }
  if (preset === 'last7d') {
    // The API's to_date is inclusive, hence the 1 ms.
    const previousTo = new Date(from.getTime() - 1);
    return {
      from,
      to,
      previousFrom: new Date(previousTo.getTime() - (to.getTime() - from.getTime())),
      previousTo,
    };
  }
  return { from, to, previousFrom: addDays(from, -7), previousTo: addDays(to, -7) };
}

/** Days the To call back and Unread voicemail lists look back. */
export const LOOKBACK_DAYS = 7;

/** Local midnight 7 days ago: stable for a whole day. */
export function lookbackStart(now: Date = new Date()): Date {
  return addDays(startOfDay(now), -LOOKBACK_DAYS);
}

export function browserTimeZone(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
  } catch {
    return 'UTC';
  }
}

// ============================================================================
// To call back timeline
// ============================================================================

const MINUTE = 60_000;
const SPAN_MINUTES = LOOKBACK_DAYS * 24 * 60;

/** Waits shorter than this sit at the right edge, labelled now. */
export const NEAREST_MINUTES = 10;

/**
 * Where on the axis a moment this many minutes ago falls: 0 at the lookback
 * start, 1 at NEAREST_MINUTES ago or later. Logarithmic, because waits run
 * from minutes to days.
 */
export function waitPosition(minutesAgo: number): number {
  const m = Math.min(Math.max(minutesAgo, NEAREST_MINUTES), SPAN_MINUTES);
  return (
    1 -
    (Math.log(m) - Math.log(NEAREST_MINUTES)) / (Math.log(SPAN_MINUTES) - Math.log(NEAREST_MINUTES))
  );
}

export function positionAt(at: string, now: Date): number {
  return waitPosition((now.getTime() - Date.parse(at)) / MINUTE);
}

export const AXIS_TICKS: ReadonlyArray<{
  minutes: number;
  unit: 'days' | 'hours' | 'now';
  count: number;
}> = [
  { minutes: SPAN_MINUTES, unit: 'days', count: LOOKBACK_DAYS },
  { minutes: 1440, unit: 'days', count: 1 },
  { minutes: 240, unit: 'hours', count: 4 },
  { minutes: 60, unit: 'hours', count: 1 },
  { minutes: NEAREST_MINUTES, unit: 'now', count: 0 },
];

/** A mark on a caller's track: one of their calls, by how it ended, or one of ours. */
export interface AttemptMark {
  at: string;
  kind: CallOutcome | 'callBack';
  /** The exact reason, where one outcome covers several (busy within failed). */
  status: CallStatus | null;
}

/** Oldest first, so later marks draw over earlier ones. */
export function attemptMarks(calls: CallLog[]): AttemptMark[] {
  const marks: AttemptMark[] = [];
  for (const call of calls) {
    if (call.direction === 'outbound') {
      if (call.status) marks.push({ at: call.started_at, kind: 'callBack', status: call.status });
      continue;
    }
    const kind = outcomeOf(call.status, call.connected_at != null);
    if (kind) marks.push({ at: call.started_at, kind, status: call.status ?? null });
  }
  return marks.sort((a, b) => Date.parse(a.at) - Date.parse(b.at));
}

/** Closest two marks may sit, as a share of the track: a little over one dot. */
const MIN_MARK_GAP = 0.012;

/**
 * Positions (oldest first), each pushed left of the next by at least
 * MIN_MARK_GAP: tries minutes apart, hours ago, land on the same pixels of a
 * logarithmic axis, and counting them matters more than their spacing.
 */
export function spreadPositions(positions: number[]): number[] {
  const spread = [...positions];
  for (let i = spread.length - 2; i >= 0; i--) {
    const next = spread[i + 1] ?? 1;
    spread[i] = Math.max(0, Math.min(spread[i] ?? 0, next - MIN_MARK_GAP));
  }
  return spread;
}

/** Each caller's calls after they were last reached and after `since`, by number. */
export function groupAttempts(
  calls: CallLog[],
  callers: ReadonlyArray<{ phone_number: string; last_connected_at: string | null }>,
  since: Date
): Map<string, CallLog[]> {
  const cutoff = new Map(
    callers.map((c) => [
      c.phone_number,
      Math.max(since.getTime(), c.last_connected_at ? Date.parse(c.last_connected_at) : 0),
    ])
  );
  const byNumber = new Map<string, CallLog[]>();
  for (const call of calls) {
    const number =
      typeof call.remote_number === 'string'
        ? call.remote_number
        : call.remote_number?.phone_number;
    const after = number ? cutoff.get(number) : undefined;
    if (!number || after === undefined || Date.parse(call.started_at) <= after) continue;
    byNumber.set(number, [...(byNumber.get(number) ?? []), call]);
  }
  return byNumber;
}

// ============================================================================
// Formatting
// ============================================================================

export function formatNumber(e164: string): string {
  return formatNationalUS(e164);
}

function sameDay(a: Date, b: Date): boolean {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  );
}

/**
 * When something happened: the time today, "Yesterday, 4:30 PM", then the
 * weekday and date. When, not how long ago: a call-back is matched to "this
 * morning", and an age goes stale while the page is open.
 */
export function formatWhen(
  at: Date,
  now: Date,
  locale: string,
  yesterday: (time: string) => string
): string {
  const time = at.toLocaleTimeString(locale, { hour: 'numeric', minute: '2-digit' });
  if (sameDay(at, now)) return time;
  if (sameDay(at, addDays(now, -1))) return yesterday(time);
  return at.toLocaleString(locale, {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}

/** How long since, in the largest whole unit: "3 days", "5 hours", "12 minutes". */
export function formatSince(
  at: Date,
  now: Date,
  units: {
    days: (n: number) => string;
    hours: (n: number) => string;
    minutes: (n: number) => string;
  }
): string {
  const minutes = Math.max(0, Math.floor((now.getTime() - at.getTime()) / MINUTE));
  if (minutes >= 1440) return units.days(Math.floor(minutes / 1440));
  if (minutes >= 60) return units.hours(Math.floor(minutes / 60));
  return units.minutes(minutes);
}
