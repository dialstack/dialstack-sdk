import {
  QUALITY_THRESHOLDS,
  callsSignature,
  readAllPages,
  SENTIMENT_THRESHOLDS,
  attemptMarks,
  computeRange,
  groupAttempts,
  healthLevel,
  outcomeCounts,
  outcomeOf,
  spreadPositions,
  waitPosition,
} from '../call-activity';
import type { CallLog, CallSummaryCount } from '../../types/components';

describe('outcomeOf', () => {
  it('names each way an inbound call reached nobody', () => {
    expect(outcomeOf('no-answer', false)).toBe('missed');
    expect(outcomeOf('completed', false)).toBe('abandoned');
    expect(outcomeOf('voicemail', false)).toBe('voicemail');
    expect(outcomeOf('busy', false)).toBe('failed');
    expect(outcomeOf('failed', false)).toBe('failed');
  });

  it('leaves out calls a party answered and calls in progress', () => {
    expect(outcomeOf('completed', true)).toBeNull();
    expect(outcomeOf(null, false)).toBeNull();
  });
});

describe('outcomeCounts', () => {
  it('counts inbound calls only, busy and failed together', () => {
    const rows: CallSummaryCount[] = [
      { direction: 'inbound', status: 'completed', connected: true, count: 10 },
      { direction: 'inbound', status: 'busy', connected: false, count: 2 },
      { direction: 'inbound', status: 'failed', connected: false, count: 1 },
      { direction: 'inbound', status: 'completed', connected: false, count: 3 },
      { direction: 'outbound', status: 'no-answer', connected: false, count: 7 },
    ];
    expect(outcomeCounts(rows)).toEqual({
      missed: 0,
      abandoned: 3,
      voicemail: 0,
      failed: 3,
      inbound: 16,
    });
  });
});

describe('healthLevel', () => {
  it('cuts exactly on the thresholds, with no rounding', () => {
    expect(healthLevel({ count: 1, total: 100 }, QUALITY_THRESHOLDS)).toBe('good');
    expect(healthLevel({ count: 101, total: 10000 }, QUALITY_THRESHOLDS)).toBe('warning');
    expect(healthLevel({ count: 3, total: 100 }, QUALITY_THRESHOLDS)).toBe('warning');
    expect(healthLevel({ count: 4, total: 100 }, QUALITY_THRESHOLDS)).toBe('critical');
    expect(healthLevel({ count: 20, total: 100 }, SENTIMENT_THRESHOLDS)).toBe('warning');
    expect(healthLevel({ count: 21, total: 100 }, SENTIMENT_THRESHOLDS)).toBe('critical');
  });

  it('will not rate fewer than 20 calls', () => {
    expect(healthLevel({ count: 0, total: 19 }, QUALITY_THRESHOLDS)).toBe('insufficient');
  });
});

describe('computeRange', () => {
  const now = new Date(2026, 10, 9, 14, 30); // a Monday afternoon

  it('compares today with the same weekday a week earlier, up to the same time', () => {
    const r = computeRange('today', now);
    expect(r.from).toEqual(new Date(2026, 10, 9));
    expect(r.previousFrom).toEqual(new Date(2026, 10, 2));
    expect(r.previousTo).toEqual(new Date(2026, 10, 2, 14, 30));
  });

  it('ends yesterday a millisecond before midnight', () => {
    const r = computeRange('yesterday', now);
    expect(r.from).toEqual(new Date(2026, 10, 8));
    expect(r.to.getTime()).toBe(new Date(2026, 10, 9).getTime() - 1);
  });

  it('compares the last 7 days with the 7 days just before', () => {
    const r = computeRange('last7d', now);
    expect(r.previousTo.getTime()).toBe(r.from.getTime() - 1);
    expect(r.to.getTime() - r.from.getTime()).toBe(
      r.previousTo.getTime() - r.previousFrom.getTime()
    );
  });
});

describe('the To call back timeline', () => {
  it('places now at the right edge and the lookback start at the left', () => {
    expect(waitPosition(0)).toBe(1);
    expect(waitPosition(7 * 24 * 60)).toBe(0);
    expect(waitPosition(60)).toBeGreaterThan(waitPosition(24 * 60));
  });

  it('pushes marks on the same pixels apart, older ones giving way', () => {
    const spread = spreadPositions([0.5, 0.5, 0.5]);
    expect(spread[2]).toBe(0.5);
    expect(spread[1]).toBeLessThan(0.5);
    expect(spread[0]).toBeLessThan(spread[1] ?? 0);
  });

  it('marks a busy try as failed and keeps the reason', () => {
    const marks = attemptMarks([
      {
        direction: 'inbound',
        status: 'busy',
        connected_at: null,
        started_at: '2026-11-08T10:00:00Z',
      },
      {
        direction: 'outbound',
        status: 'no-answer',
        connected_at: null,
        started_at: '2026-11-08T11:00:00Z',
      },
    ] as CallLog[]);
    expect(marks).toEqual([
      { at: '2026-11-08T10:00:00Z', kind: 'failed', status: 'busy' },
      { at: '2026-11-08T11:00:00Z', kind: 'callBack', status: 'no-answer' },
    ]);
  });

  it('keeps only tries since the caller was last reached and within the lookback', () => {
    const since = new Date('2026-11-01T00:00:00Z');
    const calls = [
      { remote_number: '+14155550101', started_at: '2026-10-31T00:00:00Z' },
      { remote_number: '+14155550101', started_at: '2026-11-03T00:00:00Z' },
      { remote_number: '+14155550101', started_at: '2026-11-05T00:00:00Z' },
    ] as CallLog[];
    const grouped = groupAttempts(
      calls,
      [{ phone_number: '+14155550101', last_connected_at: '2026-11-04T00:00:00Z' }],
      since
    );
    expect(grouped.get('+14155550101')?.map((c) => c.started_at)).toEqual(['2026-11-05T00:00:00Z']);
  });
});

describe('callsSignature', () => {
  it('moves when an outbound call connects, and not when rows reorder', () => {
    const rows: CallSummaryCount[] = [
      { direction: 'inbound', status: 'no-answer', connected: false, count: 2 },
      { direction: 'outbound', status: 'completed', connected: true, count: 1 },
    ];
    const sig = callsSignature({ breakdown: rows } as never);
    expect(callsSignature({ breakdown: [...rows].reverse() } as never)).toBe(sig);
    expect(callsSignature({ breakdown: [rows[0]!, { ...rows[1]!, count: 2 }] } as never)).not.toBe(
      sig
    );
  });
});

describe('readAllPages', () => {
  it('follows next_page_url until the last page', async () => {
    const read = jest
      .fn()
      .mockResolvedValueOnce({ data: [1, 2], next_page_url: '/v1/calls?page=abc&limit=2' })
      .mockResolvedValueOnce({ data: [3], next_page_url: null });
    expect(await readAllPages(read, { limit: 2 } as { limit: number; page?: string })).toEqual([
      1, 2, 3,
    ]);
    expect(read).toHaveBeenLastCalledWith({ limit: 2, page: 'abc' });
  });
});
