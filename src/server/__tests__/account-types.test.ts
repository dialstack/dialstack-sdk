import type { Account, AccountUpdateParams } from '../index';
import type {
  Account as OnboardingAccount,
  UpdateAccountRequest,
} from '../../types/account-onboarding';

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
