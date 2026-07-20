import { deriveOnboardingState, type OnboardingDataSnapshot } from '../derive';
import type { Account, OnboardingLocation, OnboardingUser } from '../../../types';
import type { DIDItem } from '../../../types/phone-numbers';
import type { Device, DeviceUserAssignment } from '../../../types/device';

function mkAccount(overrides: Partial<Account> = {}): Account {
  return {
    id: 'acct_x',
    name: 'Acme',
    email: 'admin@acme.test',
    phone: '+14165551234',
    primary_contact_name: 'Pat',
    config: { timezone: 'America/Toronto' },
    onboarding_complete: false,
    created_at: '2026-01-01T00:00:00Z',
    updated_at: '2026-01-01T00:00:00Z',
    ...overrides,
  } as Account;
}

function mkLocation(overrides: Partial<OnboardingLocation> = {}): OnboardingLocation {
  return {
    id: 'loc_x',
    name: 'HQ',
    address: { street: '1 Main', city: 'Toronto', state: 'ON', postal_code: 'M5V', country: 'CA' },
    status: 'active',
    created_at: '2026-01-01T00:00:00Z',
    updated_at: '2026-01-01T00:00:00Z',
    ...overrides,
  } as OnboardingLocation;
}

function mkUser(id: string): OnboardingUser {
  return {
    id,
    name: id,
    email: `${id}@acme.test`,
    created_at: '2026-01-01T00:00:00Z',
    updated_at: '2026-01-01T00:00:00Z',
  };
}

function mkDID(overrides: Partial<DIDItem> = {}): DIDItem {
  return {
    id: 'did_x',
    phone_number: '+14165550100',
    status: 'active',
    number_class: 'account_owned',
    outbound_enabled: true,
    created_at: '2026-01-01T00:00:00Z',
    updated_at: '2026-01-01T00:00:00Z',
    ...overrides,
  };
}

function mkDevice(id = 'dev_x', assignments?: DeviceUserAssignment[]): Device {
  return {
    id,
    type: 'deskphone',
    mac_address: '00:04:13:aa:bb:cc',
    vendor: 'snom',
    status: 'pending-sync',
    assignments,
    created_at: '2026-01-01T00:00:00Z',
    updated_at: '2026-01-01T00:00:00Z',
  } as Device;
}

function mkAssignment(userId = 'user_x'): DeviceUserAssignment {
  return {
    user: userId,
    user_id: userId,
    device: 'dev_x',
    device_id: 'dev_x',
    line_number: 1,
    created_at: '2026-01-01T00:00:00Z',
  };
}

const emptySnapshot: OnboardingDataSnapshot = {
  account: null,
  users: [],
  locations: [],
  dids: [],
  devices: [],
};

describe('deriveOnboardingState', () => {
  it('returns empty completion sets for an empty snapshot', () => {
    const { completed } = deriveOnboardingState(emptySnapshot);
    expect(completed.account.size).toBe(0);
    expect(completed.numbers.size).toBe(0);
    expect(completed.hardware.size).toBe(0);
  });

  it('marks business-details when account fields and a complete location exist', () => {
    const { completed } = deriveOnboardingState({
      ...emptySnapshot,
      account: mkAccount(),
      locations: [mkLocation()],
    });
    expect(completed.account.has('business-details')).toBe(true);
    expect(completed.account.has('team-members')).toBe(false);
  });

  it('marks team-members when there is ≥1 user whose email differs from account.email', () => {
    const base = {
      ...emptySnapshot,
      account: mkAccount({ email: 'owner@acme.test' }),
      locations: [mkLocation()],
    };

    // Only the owner user → not a team yet.
    expect(
      deriveOnboardingState({
        ...base,
        users: [{ ...mkUser('u1'), email: 'owner@acme.test' }],
      }).completed.account.has('team-members')
    ).toBe(false);

    // Owner + 1 employee → team-members complete.
    expect(
      deriveOnboardingState({
        ...base,
        users: [
          { ...mkUser('u1'), email: 'owner@acme.test' },
          { ...mkUser('u2'), email: 'employee@acme.test' },
        ],
      }).completed.account.has('team-members')
    ).toBe(true);

    // 1 employee, no owner user present (e.g., admin-user was soft-deleted)
    // → still complete because the rule requires "≥1 non-owner", not "≥2 total".
    expect(
      deriveOnboardingState({
        ...base,
        users: [{ ...mkUser('u1'), email: 'employee@acme.test' }],
      }).completed.account.has('team-members')
    ).toBe(true);
  });

  it('counts a non-owner user with no email toward team-members', () => {
    // The owner always carries the account email, so a user with no email at
    // all can never be the owner — it's a real teammate and must count. (This
    // mirrors the server gate, which also counts NULL-email non-owner users.)
    const base = {
      ...emptySnapshot,
      account: mkAccount({ email: 'owner@acme.test' }),
      locations: [mkLocation()],
    };
    expect(
      deriveOnboardingState({
        ...base,
        users: [
          { ...mkUser('u1'), email: 'owner@acme.test' },
          { ...mkUser('u2'), email: null },
        ],
      }).completed.account.has('team-members')
    ).toBe(true);
  });

  it('does not double-count an owner who is also a telephony user', () => {
    // The overlap case: the owner is also a telephony user (account_role
    // 'owner', email === account.email). team-members is email-based and
    // role-agnostic, so the overlap owner never counts as a teammate.
    const base = {
      ...emptySnapshot,
      account: mkAccount({ email: 'owner@acme.test' }),
      locations: [mkLocation()],
    };

    // Overlap owner alone → not a team.
    expect(
      deriveOnboardingState({
        ...base,
        users: [{ ...mkUser('u1'), email: 'owner@acme.test', account_role: 'owner' }],
      }).completed.account.has('team-members')
    ).toBe(false);

    // Overlap owner + 1 employee → complete.
    expect(
      deriveOnboardingState({
        ...base,
        users: [
          { ...mkUser('u1'), email: 'owner@acme.test', account_role: 'owner' },
          { ...mkUser('u2'), email: 'employee@acme.test' },
        ],
      }).completed.account.has('team-members')
    ).toBe(true);
  });

  describe('numbers — unexpired DIDs count, expired ones drop out', () => {
    const future = new Date(Date.now() + 60 * 60 * 1000).toISOString();
    const past = new Date(Date.now() - 60 * 60 * 1000).toISOString();

    it('does NOT mark order substeps when only a temp DID is present', () => {
      // A temp DID satisfies the onboarding_complete gate (handled elsewhere),
      // but it shouldn't mark the buy/port substeps as completed — the user
      // still needs to walk that flow to order a real number.
      const { completed } = deriveOnboardingState({
        ...emptySnapshot,
        account: mkAccount(),
        dids: [
          mkDID({
            id: 'did_temp',
            number_class: 'temporary',
            status: 'active',
            expires_at: future,
          }),
        ],
      });
      expect(completed.numbers.has('overview')).toBe(false);
      expect(completed.numbers.has('order-status')).toBe(false);
    });

    it('does NOT mark order substeps when the only DID has already expired', () => {
      const { completed } = deriveOnboardingState({
        ...emptySnapshot,
        account: mkAccount(),
        dids: [
          mkDID({
            id: 'did_temp',
            number_class: 'temporary',
            status: 'active',
            expires_at: past,
          }),
        ],
      });
      expect(completed.numbers.has('overview')).toBe(false);
      expect(completed.numbers.has('order-status')).toBe(false);
    });

    it('marks order-status when an unexpired non-temp DID is active alongside an expired temp', () => {
      const { completed } = deriveOnboardingState({
        ...emptySnapshot,
        account: mkAccount(),
        dids: [
          mkDID({ id: 'did_temp', number_class: 'temporary', status: 'active', expires_at: past }),
          mkDID({ id: 'did_owned', status: 'active' }),
        ],
      });
      expect(completed.numbers.has('order-status')).toBe(true);
    });

    it('marks order substeps when a non-temporary (account_owned) DID exists', () => {
      const { completed } = deriveOnboardingState({
        ...emptySnapshot,
        account: mkAccount(),
        dids: [mkDID()],
      });
      expect(completed.numbers.has('overview')).toBe(true);
      expect(completed.numbers.has('order-search')).toBe(true);
      expect(completed.numbers.has('order-results')).toBe(true);
      expect(completed.numbers.has('order-confirm')).toBe(true);
    });
  });

  describe('numbers — e911, caller-id, directory-listing', () => {
    it('marks e911 complete when any location E911 address is provisioned', () => {
      const { completed } = deriveOnboardingState({
        ...emptySnapshot,
        account: mkAccount(),
        locations: [mkLocation({ e911_status: 'provisioned' })],
      });
      expect(completed.numbers.has('e911')).toBe(true);
    });

    it('ignores primary_did_id when deriving E911 readiness', () => {
      const { completed } = deriveOnboardingState({
        ...emptySnapshot,
        account: mkAccount(),
        locations: [mkLocation({ primary_did_id: 'did_missing', e911_status: 'provisioned' })],
        dids: [mkDID({ id: 'did_a' })],
      });
      expect(completed.numbers.has('e911')).toBe(true);
    });

    it('does not mark e911 when E911 is pending', () => {
      const { completed } = deriveOnboardingState({
        ...emptySnapshot,
        account: mkAccount(),
        locations: [mkLocation({ primary_did_id: 'did_a', e911_status: 'pending' })],
        dids: [mkDID({ id: 'did_a' })],
      });
      expect(completed.numbers.has('e911')).toBe(false);
    });

    it('does not mark e911 when E911 has failed', () => {
      const { completed } = deriveOnboardingState({
        ...emptySnapshot,
        account: mkAccount(),
        locations: [mkLocation({ primary_did_id: 'did_a', e911_status: 'failed' })],
        dids: [mkDID({ id: 'did_a' })],
      });
      expect(completed.numbers.has('e911')).toBe(false);
    });

    it('does not mark e911 when E911 status is missing', () => {
      const { completed } = deriveOnboardingState({
        ...emptySnapshot,
        account: mkAccount(),
        locations: [mkLocation({ primary_did_id: 'did_a' })],
        dids: [mkDID({ id: 'did_a' })],
      });
      expect(completed.numbers.has('e911')).toBe(false);
    });

    it('marks caller-id when any DID has caller_id_name', () => {
      const { completed } = deriveOnboardingState({
        ...emptySnapshot,
        account: mkAccount(),
        dids: [mkDID({ caller_id_name: 'Acme HQ' })],
      });
      expect(completed.numbers.has('caller-id')).toBe(true);
    });

    it('does NOT mark caller-id when the only DID with caller_id_name has expired', () => {
      const { completed } = deriveOnboardingState({
        ...emptySnapshot,
        account: mkAccount(),
        dids: [mkDID({ caller_id_name: 'Acme HQ', expires_at: '2020-01-01T00:00:00Z' })],
      });
      expect(completed.numbers.has('caller-id')).toBe(false);
    });

    it('marks directory-listing when any DID is not non_registered', () => {
      const { completed } = deriveOnboardingState({
        ...emptySnapshot,
        account: mkAccount(),
        dids: [mkDID({ directory_listing_type: 'listed' })],
      });
      expect(completed.numbers.has('directory-listing')).toBe(true);
    });

    it('does not mark directory-listing when all DIDs are non_registered', () => {
      const { completed } = deriveOnboardingState({
        ...emptySnapshot,
        account: mkAccount(),
        dids: [mkDID({ directory_listing_type: 'non_registered' })],
      });
      expect(completed.numbers.has('directory-listing')).toBe(false);
    });
  });

  describe('hardware — device-assignment requires a user-assigned device', () => {
    it('marks device-assignment when a device has at least one user assignment', () => {
      const { completed } = deriveOnboardingState({
        ...emptySnapshot,
        account: mkAccount(),
        devices: [mkDevice('dev_a', [mkAssignment()])],
      });
      expect(completed.hardware.has('device-assignment')).toBe(true);
    });

    it('does NOT mark device-assignment when a device exists but has no assignments', () => {
      const { completed } = deriveOnboardingState({
        ...emptySnapshot,
        account: mkAccount(),
        devices: [mkDevice('dev_a')],
      });
      expect(completed.hardware.has('device-assignment')).toBe(false);
    });

    it('does NOT mark device-assignment when a device has an empty assignments array', () => {
      const { completed } = deriveOnboardingState({
        ...emptySnapshot,
        account: mkAccount(),
        devices: [mkDevice('dev_a', [])],
      });
      expect(completed.hardware.has('device-assignment')).toBe(false);
    });

    it('leaves hardware incomplete when no devices exist', () => {
      const { completed } = deriveOnboardingState({
        ...emptySnapshot,
        account: mkAccount(),
      });
      expect(completed.hardware.size).toBe(0);
    });

    it('marks device-assignment when a DECT base has a handset with an assignment', () => {
      const { completed } = deriveOnboardingState({
        ...emptySnapshot,
        account: mkAccount(),
        devices: [
          {
            id: 'dectb_x',
            type: 'dect_base',
            mac_address: '00:04:13:dd:ee:ff',
            vendor: 'snom',
            status: 'pending-sync',
            handsets: [
              {
                id: 'dh_x',
                base_id: 'dectb_x',
                ipei: '00000000001',
                slot_number: 1,
                status: 'paired',
                assignments: [mkAssignment()],
                created_at: '2026-01-01T00:00:00Z',
                updated_at: '2026-01-01T00:00:00Z',
              },
            ],
            created_at: '2026-01-01T00:00:00Z',
            updated_at: '2026-01-01T00:00:00Z',
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
          } as any,
        ],
      });
      expect(completed.hardware.has('device-assignment')).toBe(true);
    });

    it('does NOT mark device-assignment when a DECT base has handsets but no assignments', () => {
      const { completed } = deriveOnboardingState({
        ...emptySnapshot,
        account: mkAccount(),
        devices: [
          {
            id: 'dectb_x',
            type: 'dect_base',
            mac_address: '00:04:13:dd:ee:ff',
            vendor: 'snom',
            status: 'pending-sync',
            handsets: [
              {
                id: 'dh_x',
                base_id: 'dectb_x',
                ipei: '00000000001',
                slot_number: 1,
                status: 'paired',
                assignments: [],
                created_at: '2026-01-01T00:00:00Z',
                updated_at: '2026-01-01T00:00:00Z',
              },
            ],
            created_at: '2026-01-01T00:00:00Z',
            updated_at: '2026-01-01T00:00:00Z',
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
          } as any,
        ],
      });
      expect(completed.hardware.has('device-assignment')).toBe(false);
    });
  });

  it('treats missing required business fields as incomplete', () => {
    const { completed } = deriveOnboardingState({
      ...emptySnapshot,
      account: mkAccount({ phone: null }),
      locations: [mkLocation()],
    });
    expect(completed.account.has('business-details')).toBe(false);
  });

  it('treats a location missing postal_code as incomplete', () => {
    const { completed } = deriveOnboardingState({
      ...emptySnapshot,
      account: mkAccount(),
      locations: [
        mkLocation({
          address: {
            street: '1 Main',
            city: 'Toronto',
            state: 'ON',
            postal_code: '',
            country: 'CA',
          },
        }),
      ],
    });
    expect(completed.account.has('business-details')).toBe(false);
  });
});
