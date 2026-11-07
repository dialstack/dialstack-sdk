import { makeFocDate } from '../steps/numbers/types';

describe('makeFocDate', () => {
  afterEach(() => jest.useRealTimers());

  it.each([
    ['2026-11-06T12:00:00', '2026-11-20'], // Friday: two weeks out is a Friday
    ['2026-11-07T12:00:00', '2026-11-23'], // Saturday: rolls past the weekend
    ['2026-11-08T12:00:00', '2026-11-23'], // Sunday: rolls past the weekend
  ])('from %s defaults to the weekday %s', (now, want) => {
    jest.useFakeTimers().setSystemTime(new Date(now));
    expect(makeFocDate()).toBe(want);
  });
});
