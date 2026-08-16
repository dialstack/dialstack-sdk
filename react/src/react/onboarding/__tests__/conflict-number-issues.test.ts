import { conflictNumberIssues } from '../steps/numbers/port-numbers';

/** Stands in for the locale lookup; returns the key so assertions read clearly. */
const t = (key: string) => key;

describe('conflictNumberIssues', () => {
  it('marks each named number with the copy for its situation', () => {
    const err = {
      name: 'ApiError',
      status: 409,
      code: 'phone_numbers_already_claimed',
      details: {
        already_on_account: ['+17702126011'],
        in_service_elsewhere: ['+14045551212', '+12135551234'],
      },
    };

    expect(conflictNumberIssues(err, t)).toEqual([
      {
        e164: '+17702126011',
        message: 'accountOnboarding.numbers.port.conflictAlreadyOnAccount',
      },
      {
        e164: '+14045551212',
        message: 'accountOnboarding.numbers.port.conflictInServiceElsewhere',
      },
      {
        e164: '+12135551234',
        message: 'accountOnboarding.numbers.port.conflictInServiceElsewhere',
      },
    ]);
  });

  it('keeps the two situations apart', () => {
    const issues = conflictNumberIssues(
      {
        details: {
          already_on_account: ['+17702126011'],
          in_service_elsewhere: ['+14045551212'],
        },
      },
      t
    );

    // The distinction is the whole point: one is "take it off the order", the
    // other is "support has to move it". Collapsing them sends half the readers
    // to the wrong action.
    expect(issues[0]?.message).not.toEqual(issues[1]?.message);
  });

  it('is empty for an error carrying no details, so callers can apply it blind', () => {
    expect(conflictNumberIssues(new Error('network'), t)).toEqual([]);
    expect(conflictNumberIssues({ code: 'phone_number_limit_exceeded' }, t)).toEqual([]);
    expect(conflictNumberIssues(null, t)).toEqual([]);
    expect(conflictNumberIssues(undefined, t)).toEqual([]);
  });

  it('tolerates a group being absent rather than empty', () => {
    const issues = conflictNumberIssues({ details: { in_service_elsewhere: ['+14045551212'] } }, t);
    expect(issues).toHaveLength(1);
    expect(issues[0]?.e164).toBe('+14045551212');
  });
});
