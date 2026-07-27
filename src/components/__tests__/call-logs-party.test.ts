import { CallLogsComponent } from '../call-logs';

/**
 * formatCallParty renders "number (label)". The API reports the caller name
 * exactly as the carrier sent it, including the case where the carrier put the
 * number in the display-name field — suppressing that redundant restatement is
 * this layer's job.
 */
describe('CallLogsComponent party formatting', () => {
  // formatCallParty and its helper are private; the rendered string is the
  // contract under test.
  const format = (number: string, label: string | null): string => {
    const component = new CallLogsComponent();
    return (
      component as unknown as {
        formatCallParty(n: string, l?: string | null): string;
      }
    ).formatCallParty(number, label);
  };

  it('renders a real caller name alongside the nationally-formatted number', () => {
    expect(format('+14155551234', 'Jane Caller')).toBe('(415) 555-1234 (Jane Caller)');
  });

  it('keeps locality CNAM and carrier placeholders', () => {
    expect(format('+16196132085', 'LA MESA      CA')).toBe('(619) 613-2085 (LA MESA      CA)');
    expect(format('+19126567675', 'WIRELESS CALLER')).toBe('(912) 656-7675 (WIRELESS CALLER)');
  });

  // A label never rescues a number we can't show: these rows now reach the
  // label path because clid supplies a name where extension lookup found none.
  it('withholds an internal identifier even when a label is present', () => {
    expect(format('user_01hqzx9k8mn4p6r2t7v3w5y8b0-wrtc', 'Marine (1002)')).toBe('—');
    expect(format('a1b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6', 'Marine (1002)')).toBe('—');
  });

  it('keeps an extension label that merely contains the extension', () => {
    expect(format('1002', 'Marine (1002)')).toBe('1002 (Marine (1002))');
  });

  // A suppressed label must render exactly as if the API had sent none. The
  // number itself formats to "(581) 781-2192", so asserting on parentheses
  // would be meaningless here.
  it('suppresses a label identical to the number', () => {
    expect(format('+15817812192', '+15817812192')).toBe(format('+15817812192', null));
  });

  it('suppresses a label that is the number in another format', () => {
    expect(format('+14186597044', '14186597044')).toBe(format('+14186597044', null));
    expect(format('+15817027849', '(581) 702-7849')).toBe(format('+15817027849', null));
  });
});
