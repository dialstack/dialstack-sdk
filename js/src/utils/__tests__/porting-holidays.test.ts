import { PORTING_HOLIDAYS_VERIFIED_THROUGH_YEAR, portingHoliday } from '../porting-holidays';

// The carrier's published 2026 US and Canada porting holidays, weekdays only,
// per country: the days the carrier is closed apply to every port, and the
// limited days to their own country's. The API pins the same tables.
const US_2026 = [
  '2026-01-01',
  '2026-01-19',
  '2026-02-16',
  '2026-04-03',
  '2026-05-25',
  '2026-06-19',
  '2026-07-03',
  '2026-09-07',
  '2026-10-12',
  '2026-11-03',
  '2026-11-11',
  '2026-11-26',
  '2026-11-27',
  '2026-12-24',
  '2026-12-25',
  '2026-12-31',
];
const CA_2026 = [
  '2026-01-01',
  '2026-01-19',
  '2026-02-16',
  '2026-04-03',
  '2026-05-18',
  '2026-05-25',
  '2026-07-01',
  '2026-07-03',
  '2026-08-03',
  '2026-09-07',
  '2026-09-30',
  '2026-10-12',
  '2026-11-11',
  '2026-11-26',
  '2026-11-27',
  '2026-12-24',
  '2026-12-25',
  '2026-12-31',
];

function markedWeekdays(country: 'US' | 'CA'): string[] {
  const marked: string[] = [];
  for (let t = Date.UTC(2026, 0, 1); t < Date.UTC(2027, 0, 1); t += 86_400_000) {
    const d = new Date(t);
    const date = d.toISOString().slice(0, 10);
    if (d.getUTCDay() % 6 !== 0 && portingHoliday(date, country)) marked.push(date);
  }
  return marked;
}

describe('portingHoliday', () => {
  it('marks the carrier 2026 list, by country', () => {
    expect(markedWeekdays('US')).toEqual(US_2026);
    expect(markedWeekdays('CA')).toEqual(CA_2026);
  });

  it("applies a country's holidays to its own ports only", () => {
    expect(portingHoliday('2026-05-18', 'US')).toBeNull();
    expect(portingHoliday('2026-05-18', 'CA')).toBe('Victoria Day');
    expect(portingHoliday('2026-06-19', 'US')).toBe('Juneteenth');
    expect(portingHoliday('2026-06-19', 'CA')).toBeNull();
  });

  it('blocks the carrier’s own closed days for every port', () => {
    expect(portingHoliday('2026-11-26', 'US')).toBe('Thanksgiving Day');
    expect(portingHoliday('2026-11-26', 'CA')).toBe('Thanksgiving Day (US)');
  });

  it('names a day both observe in each country’s words', () => {
    expect(portingHoliday('2026-09-07', 'US')).toBe('Labor Day');
    expect(portingHoliday('2026-09-07', 'CA')).toBe('Labour Day');
  });

  it('names an observed day', () => {
    expect(portingHoliday('2026-07-03', 'US')).toBe('Independence Day (observed)');
  });

  it('marks next New Year’s Day observed on December 31 of a Saturday year', () => {
    // 2028-01-01 is a Saturday.
    expect(portingHoliday('2027-12-31', 'US')).not.toBeNull();
  });

  it('returns null for a malformed date', () => {
    expect(portingHoliday('', 'US')).toBeNull();
    expect(portingHoliday('2026-5-18', 'US')).toBeNull();
  });
});

// The carrier publishes next year's list in the autumn. This fails from
// December 10 of the verified year until the list is re-checked, here and in
// the API, so a new year never starts on an unchecked list.
describe('porting holiday list staleness', () => {
  it('has been checked against the carrier for the coming year', () => {
    const year = PORTING_HOLIDAYS_VERIFIED_THROUGH_YEAR;
    const now = new Date();
    if (now >= new Date(year, 11, 10)) {
      throw new Error(
        `The porting holidays were last checked for ${year}. Compare the carrier's ` +
          `published list for ${year + 1} with holidays() in porting-holidays.ts and the API's ` +
          'copy, adjust both, and bump the verified year in each.'
      );
    }
    if (now >= new Date(year, 9, 1)) {
      console.warn(`[porting-holidays] checked through ${year}: re-check before December 10.`);
    }
  });
});
