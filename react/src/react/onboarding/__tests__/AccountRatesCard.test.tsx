/**
 * The portal's standing rates card. These assert the figures it may show, and
 * the states in which it must not put a price in front of the customer.
 */
import React from 'react';
import { screen } from '@testing-library/react';
import { renderWithOnboarding } from '../__test-helpers__/onboarding';
import { AccountRatesCard } from '../components/AccountRatesCard';

const card = () => screen.queryByRole('region', { name: 'Your monthly rates' });
const text = () => card()?.textContent?.replace(/\s+/g, ' ').trim() ?? '';

const RATES = { per_user_rate: 3000, per_did_rate: 500, per_voiceai_location_rate: 10000 };

const IN_FORCE = {
  object: 'effective_pricing' as const,
  ...RATES,
  effective_from: '2026-08-01',
  next: null,
};

const WITH_PENDING = {
  ...IN_FORCE,
  next: { ...RATES, per_user_rate: 3500, effective_from: '2026-09-01' },
};

describe('onboarding AccountRatesCard', () => {
  it('lists every rate in force, with the taxes and fees qualifier', async () => {
    await renderWithOnboarding(<AccountRatesCard />, { pricing: IN_FORCE });
    expect(text()).toContain('$30.00/month');
    expect(text()).toContain('$5.00/month');
    expect(text()).toContain('$100.00/month');
    expect(text()).toContain('Taxes and fees are additional.');
  });

  it('says nothing about a change in the steady state', async () => {
    await renderWithOnboarding(<AccountRatesCard />, { pricing: IN_FORCE });
    // Anchor on a rendered rate first: every assertion below is an absence, and
    // text() falls back to '' when the card is missing, so without this the spec
    // passes for a card that failed to render at all.
    expect(text()).toContain('$30.00/month');
    expect(text()).not.toMatch(/from \w+ \d+, \d{4}/);
    expect(text()).not.toContain('next billing period');
  });

  it('keeps the in-force rate as the figure and dates the pending one', async () => {
    // The card has to agree with the invoice the customer is holding, so a
    // pending rate is additive and never replaces the amount being billed.
    await renderWithOnboarding(<AccountRatesCard />, { pricing: WITH_PENDING });
    expect(text()).toContain('$30.00/month');
    expect(text()).toContain('$35.00/month from Sep 1, 2026');
    expect(text()).toContain('Rate changes take effect at the start of the next billing period.');
  });

  it('announces a change only for the leg whose rate actually moved', async () => {
    // `pending` is present when ANY rate differs, so trusting its presence would
    // announce a change against untouched legs too.
    await renderWithOnboarding(<AccountRatesCard />, { pricing: WITH_PENDING });
    expect(text().match(/from Sep 1, 2026/g)).toHaveLength(1);
  });

  it('dates the change in UTC, not the viewer zone', async () => {
    // effective_from is a month boundary, so in a negative-offset zone it reads
    // as Aug 31 and tells the customer the new rate starts a day and a month
    // early. Asserting the rendered day would only catch that off UTC, and CI
    // runs in UTC, so pin the option instead: drop timeZone from the component
    // and this fails everywhere.
    const spy = jest.spyOn(Intl, 'DateTimeFormat');
    try {
      await renderWithOnboarding(<AccountRatesCard />, { pricing: WITH_PENDING });
      expect(spy).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({ timeZone: 'UTC' })
      );
      // Anchored on an in-force figure too: without it this spec passes while
      // every rate on the card is the deprecated latest-set value.
      expect(text()).toContain('$30.00/month');
      expect(text()).toContain('Sep 1, 2026');
    } finally {
      spy.mockRestore();
    }
  });

  it('never quotes a pending rate of zero as free', async () => {
    // 0 is how an unset rate is stored, and the billing run falls back to a
    // catalog default for it, so "free next month" would be contradicted by the
    // invoice.
    await renderWithOnboarding(<AccountRatesCard />, {
      pricing: {
        ...IN_FORCE,
        next: { ...RATES, per_did_rate: 0, effective_from: '2026-09-01' },
      },
    });
    expect(text()).toContain('$5.00/month');
    expect(text()).not.toContain('$0.00');
    expect(text()).not.toContain('from Sep 1, 2026');
    expect(text()).not.toContain('next billing period');
  });

  it('stays silent about timing when no row shows a change', async () => {
    // Defence in depth: the API now only sends `pending` when the tiered rates
    // differ. The card must still stay silent when no row shows a change, rather
    // than trusting that guard held upstream.
    await renderWithOnboarding(<AccountRatesCard />, {
      pricing: {
        ...IN_FORCE,
        per_did_rate: 0,
        next: { ...RATES, per_did_rate: 500, effective_from: '2026-09-01' },
      },
    });
    expect(text()).toContain('$30.00/month');
    expect(text()).not.toContain('from Sep 1, 2026');
    expect(text()).not.toContain('next billing period');
  });

  it('separates a failed rates read from an account with no rates', async () => {
    // The bootstrap folds pricing in with the agreement and nulls both when that
    // fetch fails. Asserting "no rates are set" there tells a paying customer
    // their agreed price does not exist.
    await renderWithOnboarding(<AccountRatesCard />, { pricing: null });
    expect(text()).toContain('Rates are unavailable right now.');
    expect(text()).not.toContain('No rates are set');
  });

  it('quotes no price for an account that is never billed', async () => {
    // A test-mode key only ever reaches sandbox and demo accounts, so one case
    // covers both: the card never sees the mode itself.
    await renderWithOnboarding(<AccountRatesCard />, {
      pricing: IN_FORCE,
      instanceOverrides: { livemode: false },
    });
    expect(text()).toContain('This account is not billed.');
    expect(text()).not.toContain('$');
  });

  it('says not billed for a sandbox account even when the rates are missing', async () => {
    // Mode first, matching the admin card: an account that is never billed has
    // no rates to report as unavailable.
    await renderWithOnboarding(<AccountRatesCard />, {
      pricing: null,
      instanceOverrides: { livemode: false },
    });
    expect(text()).toContain('This account is not billed.');
    expect(text()).not.toContain('unavailable');
    expect(text()).not.toContain('Rates are unavailable');
  });

  it('names no rates rather than quoting a catalog default', async () => {
    // 0 is how an unset rate is stored, and the billing run silently falls back
    // to a default that is not the customer's agreed price.
    await renderWithOnboarding(<AccountRatesCard />, {
      pricing: {
        ...IN_FORCE,
        per_user_rate: 0,
        per_did_rate: 0,
        per_voiceai_location_rate: 0,
      },
    });
    expect(text()).toContain('No rates are set for this account yet.');
    expect(text()).not.toContain('$');
  });

  it('marks a single unset leg without hiding the rates that are set', async () => {
    await renderWithOnboarding(<AccountRatesCard />, {
      pricing: { ...IN_FORCE, per_voiceai_location_rate: 0 },
    });
    expect(text()).toContain('$30.00/month');
    expect(text()).toContain('Not set');
  });
});
