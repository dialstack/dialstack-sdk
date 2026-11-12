import { earliestPortDate, isPortDay, portHolidayOn } from '../steps/numbers/port-numbers';

// Local dates: the onboarding port date is a local calendar date.
const local = (y: number, m: number, d: number) => new Date(y, m - 1, d);

describe('port days', () => {
  it("refuses a country's holidays for its own ports only", () => {
    expect(portHolidayOn(local(2026, 5, 18), 'CA')).toBe('Victoria Day');
    expect(isPortDay(local(2026, 5, 18), 'CA')).toBe(false);
    expect(isPortDay(local(2026, 5, 18), 'US')).toBe(true);
  });

  it('refuses weekends', () => {
    expect(isPortDay(local(2026, 11, 14), 'US')).toBe(false);
  });

  it('counts five porting days past holidays', () => {
    // Monday 2026-11-23: Thanksgiving and the day after are skipped.
    expect(earliestPortDate(local(2026, 11, 23), 'US')).toEqual(local(2026, 12, 2));
    // Thursday 2026-05-14: Victoria Day is skipped for a Canadian port only.
    expect(earliestPortDate(local(2026, 5, 14), 'US')).toEqual(local(2026, 5, 21));
    expect(earliestPortDate(local(2026, 5, 14), 'CA')).toEqual(local(2026, 5, 22));
  });
});
