import type { DIDItem } from '@dialstack/sdk-js';
import { takesCallerId, takesDirectoryListing } from '../steps/numbers/helpers';

const did = (overrides: Partial<DIDItem>): DIDItem =>
  ({
    id: 'did_1',
    phone_number: '+15125550100',
    status: 'active',
    outbound_enabled: true,
    fax_enabled: false,
    country: 'US',
    ...overrides,
  }) as DIDItem;

describe('takesCallerId', () => {
  it('accepts a permanent local number', () => {
    expect(takesCallerId(did({ number_class: 'account_owned', number_type: 'local' }))).toBe(true);
  });

  it('accepts a number from an API that predates number_type', () => {
    expect(takesCallerId(did({ number_class: 'account_owned' }))).toBe(true);
  });

  it('accepts a Canadian number', () => {
    expect(takesCallerId(did({ phone_number: '+14382285735', country: 'CA' }))).toBe(true);
  });

  it('refuses a temporary number', () => {
    expect(takesCallerId(did({ number_class: 'temporary' }))).toBe(false);
  });

  it('refuses a toll-free number', () => {
    expect(takesCallerId(did({ phone_number: '+18335409250', number_type: 'toll_free' }))).toBe(
      false
    );
  });
});

describe('takesDirectoryListing', () => {
  it('accepts a permanent US number', () => {
    expect(takesDirectoryListing(did({ number_class: 'account_owned' }))).toBe(true);
  });

  it('refuses a Canadian number', () => {
    expect(takesDirectoryListing(did({ phone_number: '+14382285735', country: 'CA' }))).toBe(false);
  });

  it('refuses a temporary or toll-free number', () => {
    expect(takesDirectoryListing(did({ number_class: 'temporary' }))).toBe(false);
    expect(takesDirectoryListing(did({ number_type: 'toll_free' }))).toBe(false);
  });
});
