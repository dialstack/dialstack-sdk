import { mapNonPortableToIssues, nonPortableMessages } from '../steps/numbers/port-numbers';

/** Stands in for the locale lookup; returns the key and params so assertions read clearly. */
const t = (key: string, params?: Record<string, string | number>) =>
  params ? `${key.split('.').pop()} ${JSON.stringify(params)}` : (key.split('.').pop() ?? key);

describe('mapNonPortableToIssues', () => {
  it('says why each number cannot be ported', () => {
    expect(
      mapNonPortableToIssues(
        [
          {
            phone_number: '+19075551234',
            reason: 'unsupported_carrier',
            losing_carrier_name: 'Example Telco',
          },
          {
            phone_number: '+16055551234',
            reason: 'unsupported_rate_center',
            city: 'Alsen',
            state: 'SD',
          },
          { phone_number: '+12025550123', reason: 'unsupported_number' },
          { phone_number: '+12025550124', reason: 'something_new' },
          { phone_number: '+12025550125' },
        ],
        nonPortableMessages(t)
      )
    ).toEqual([
      { e164: '+19075551234', message: 'unsupportedCarrierNamed {"carrier":"Example Telco"}' },
      { e164: '+16055551234', message: 'unsupportedAreaNamed {"area":"Alsen, SD"}' },
      { e164: '+12025550123', message: 'unsupportedNumber' },
      { e164: '+12025550124', message: 'notPortableUnknown' },
      { e164: '+12025550125', message: 'notPortableUnknown' },
    ]);
  });

  it('leaves the carrier out where it has a column of its own', () => {
    expect(
      mapNonPortableToIssues(
        [
          {
            phone_number: '+19075551234',
            reason: 'unsupported_carrier',
            losing_carrier_name: 'Example Telco',
          },
        ],
        nonPortableMessages(t, false)
      )
    ).toEqual([{ e164: '+19075551234', message: 'unsupportedCarrier' }]);
  });
});
