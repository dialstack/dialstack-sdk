import type { DIDItem } from '@dialstack/sdk-js';
import { takesCallerIdAndListing } from '../steps/numbers/helpers';

const did = (overrides: Partial<DIDItem>): DIDItem =>
  ({
    id: 'did_1',
    phone_number: '+15125550100',
    status: 'active',
    outbound_enabled: true,
    fax_enabled: false,
    ...overrides,
  }) as DIDItem;

describe('takesCallerIdAndListing', () => {
  it('accepts a permanent local number', () => {
    expect(
      takesCallerIdAndListing(did({ number_class: 'account_owned', number_type: 'local' }))
    ).toBe(true);
  });

  it('accepts a number from an API that predates number_type', () => {
    expect(takesCallerIdAndListing(did({ number_class: 'account_owned' }))).toBe(true);
  });

  it('refuses a temporary number', () => {
    expect(takesCallerIdAndListing(did({ number_class: 'temporary' }))).toBe(false);
  });

  it('refuses a toll-free number', () => {
    expect(
      takesCallerIdAndListing(did({ phone_number: '+18335409250', number_type: 'toll_free' }))
    ).toBe(false);
  });
});
