/**
 * The onboarding portal's billing disclosure. Same statement the admin portal
 * and the ordering widget make, so these assert the wording and the states in
 * which it must NOT quote a price.
 */
import React from 'react';
import { screen } from '@testing-library/react';
import { renderWithOnboarding } from '../__test-helpers__/onboarding';
import { BillingImpactNotice } from '../components/BillingImpactNotice';
import { TeamMembers } from '../steps/account/TeamMembers';

const notice = () => screen.queryByRole('note', { name: 'Billing impact' });
const text = () => notice()?.textContent?.replace(/\s+/g, ' ').trim() ?? '';

describe('onboarding BillingImpactNotice', () => {
  it('quotes the account rate for a seat', async () => {
    await renderWithOnboarding(<BillingImpactNotice resource="userSeat" count={1} />);
    expect(text()).toContain("Adds $15.00/month to this account's bill");
    expect(text()).toContain('1 user seat at $15.00 per month.');
    expect(text()).toContain('Taxes and fees are additional.');
  });

  it('prices numbers per unit and says when the charge starts', async () => {
    await renderWithOnboarding(<BillingImpactNotice resource="phoneNumber" count={3} />);
    expect(text()).toContain("Adds $6.00/month to this account's bill");
    expect(text()).toContain('3 phone numbers at $2.00 each per month.');
    expect(text()).toContain('Billing starts when each number activates.');
  });

  it('says a sandbox account is not billed rather than quoting a price', async () => {
    // A test-mode key only ever reaches sandbox or demo accounts, so the notice
    // is certain without reading the account.
    await renderWithOnboarding(<BillingImpactNotice resource="userSeat" count={1} />, {
      instanceOverrides: { livemode: false },
    });
    expect(text()).toContain('This account is not billed');
    expect(text()).not.toContain('$');
  });

  it('names the billable resource without a price when no rate is agreed', async () => {
    await renderWithOnboarding(<BillingImpactNotice resource="userSeat" count={1} />, {
      pricing: null,
    });
    expect(text()).toContain('Adds 1 billable user seat to this account.');
    expect(text()).not.toContain('$');
  });

  it('renders nothing when the action adds nothing billable', async () => {
    await renderWithOnboarding(<BillingImpactNotice resource="phoneNumber" count={0} />);
    expect(notice()).toBeNull();
  });

  it('quotes a rate, not a total, on a control used repeatedly', async () => {
    await renderWithOnboarding(
      <BillingImpactNotice resource="userSeat" count={1} variant="rate" />
    );
    expect(text()).toContain('$15.00/month per user seat');
    expect(text()).toContain('Each team member you add is billed at this rate.');
    // A per-add total sitting above the list of members already added reads as
    // a claim about the account, and is wrong the moment a second one is added.
    expect(text()).not.toContain('Adds ');
    expect(text()).not.toContain('1 user seat');
  });

  // The disclosure is only worth anything where the action happens, so pin it
  // to the step rather than only to the component.
  it('appears on the onboarding step that adds a member', async () => {
    await renderWithOnboarding(<TeamMembers onBack={() => {}} onDone={() => {}} />);
    expect(text()).toContain('$15.00/month per user seat');
    expect(text()).not.toContain('1 user seat');
  });
});
