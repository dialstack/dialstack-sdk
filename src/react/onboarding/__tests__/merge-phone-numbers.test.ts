import { mergePhoneNumbers } from '../merge-phone-numbers';
import type { PortOrder } from '../../../types/phone-number-ordering';
import type { DIDItem } from '../../../types/phone-numbers';

function mkDID(overrides: Partial<DIDItem> = {}): DIDItem {
  return {
    id: 'did_x',
    phone_number: '+15145551234',
    status: 'inactive',
    outbound_enabled: false,
    routing_target: null,
    created_at: '2026-06-03T17:49:00Z',
    updated_at: '2026-06-03T17:49:00Z',
    ...overrides,
  } as DIDItem;
}

function mkPort(overrides: Partial<PortOrder> = {}): PortOrder {
  return {
    id: 'port_x',
    status: 'submitted',
    details: { phone_numbers: ['+15145551234'], requested_foc_date: '2026-06-20' },
    submitted_at: '2026-06-03T17:49:00Z',
    created_at: '2026-06-03T17:49:00Z',
    updated_at: '2026-06-03T17:49:00Z',
    ...overrides,
  } as PortOrder;
}

function statusOf(items: ReturnType<typeof mergePhoneNumbers>, phone: string) {
  return items.find((i) => i.phone_number === phone)?.status;
}

describe('onboarding mergePhoneNumbers', () => {
  it('lets an active re-port win over a released DID left by a cancelled order', () => {
    // A combined order was cancelled (leaving a `released` DID) and the number
    // was re-submitted in a new exception port order. The stale released DID
    // must not mask the active port (which would render it as Cancelled).
    const items = mergePhoneNumbers(
      [
        mkDID({ id: 'did_released', status: 'released' }),
        mkDID({ id: 'did_inactive', status: 'inactive' }),
      ],
      [],
      [mkPort({ status: 'exception' })]
    );

    expect(statusOf(items, '+15145551234')).toBe('porting_exception');
  });

  it('keeps a genuinely released DID (no active order/port) as released', () => {
    const items = mergePhoneNumbers([mkDID({ status: 'released' })], [], []);
    expect(statusOf(items, '+15145551234')).toBe('released');
  });
});
