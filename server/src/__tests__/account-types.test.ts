import type { Account, AccountCreateParams, AccountUpdateParams, TosVariant } from '../index.js';
import type {
  Account as OnboardingAccount,
  UpdateAccountRequest,
  TosVariant as OnboardingTosVariant,
} from '@dialstack/sdk-js';

describe('account default button template types', () => {
  it('exposes the public field on both SDK account surfaces', () => {
    const account = { default_button_template: 'btpl_default' } satisfies Pick<
      Account,
      'default_button_template'
    >;
    const onboardingAccount = { default_button_template: null } satisfies Pick<
      OnboardingAccount,
      'default_button_template'
    >;
    const update = { default_button_template: null } satisfies AccountUpdateParams;
    const onboardingUpdate = {
      default_button_template: 'btpl_default',
    } satisfies UpdateAccountRequest;

    expect(account.default_button_template).toBe('btpl_default');
    expect(onboardingAccount.default_button_template).toBeNull();
    expect(update.default_button_template).toBeNull();
    expect(onboardingUpdate.default_button_template).toBe('btpl_default');
  });
});

describe('account subscription-agreement variant types', () => {
  it('is selectable at creation and readable on both account surfaces', () => {
    const create = {
      email: 'owner@example.com',
      primary_contact_name: 'Jane Doe',
      pricing: { per_user_rate: 1999, per_did_rate: 299, per_voiceai_location_rate: 4999 },
      address: {
        street: '123 Main St',
        city: 'New York',
        state: 'NY',
        postal_code: '10001',
        country: 'US',
      },
      tos_variant: 'hipaa',
    } satisfies AccountCreateParams;

    const account = { tos_variant: 'hipaa' } satisfies Pick<Account, 'tos_variant'>;
    const onboardingAccount = { tos_variant: 'standard' } satisfies Pick<
      OnboardingAccount,
      'tos_variant'
    >;

    // Correctable while unsigned, on both update surfaces.
    const update = { tos_variant: 'standard' } satisfies AccountUpdateParams;
    const onboardingUpdate = { tos_variant: 'hipaa' } satisfies UpdateAccountRequest;

    const variant: TosVariant = 'standard';
    const onboardingVariant: OnboardingTosVariant = 'hipaa';

    expect(create.tos_variant).toBe('hipaa');
    expect(account.tos_variant).toBe('hipaa');
    expect(onboardingAccount.tos_variant).toBe('standard');
    expect(update.tos_variant).toBe('standard');
    expect(onboardingUpdate.tos_variant).toBe('hipaa');
    expect(variant).toBe('standard');
    expect(onboardingVariant).toBe('hipaa');
  });
});
