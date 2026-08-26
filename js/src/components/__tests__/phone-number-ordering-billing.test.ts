import '../phone-number-ordering';
import type { DialStackInstanceImpl } from '../../types/core';
import type { EffectivePricing } from '../../types/account-onboarding';
import type { AvailablePhoneNumber } from '../../types/phone-number-ordering';

const flush = () => new Promise((resolve) => setTimeout(resolve, 0));
const settle = async () => {
  await flush();
  await flush();
  await flush();
};

const AVAILABLE: AvailablePhoneNumber[] = ['+15145551234', '+15145555678'].map((pn) => ({
  phone_number: pn,
  city: 'Montreal',
  state: 'QC',
  rate_center: 'MONTREAL',
  lata: '',
}));

/**
 * An effective-pricing response whose `next` deliberately holds different
 * figures, so quoting the scheduled change instead of the rate in force is
 * caught rather than passing by coincidence. Where `perDid` is 0 the scheduled
 * rate stays nonzero, because a wrong read there flips an unpriced account to a
 * priced one, which is worse than a wrong price.
 */
function effectivePricing(perDid: number): EffectivePricing {
  return {
    object: 'effective_pricing',
    per_user_rate: 3000,
    per_did_rate: perDid,
    per_voiceai_location_rate: 10000,
    effective_from: '2026-08-01',
    next: {
      per_user_rate: 9900,
      per_did_rate: 9900,
      per_voiceai_location_rate: 9900,
      effective_from: '2026-09-01',
    },
  };
}

interface BillingContext {
  pricing?: EffectivePricing | null;
  /** Defaults to live; false exercises the sandbox/demo wording. */
  livemode?: boolean;
}

function makeInstance({ pricing, livemode = true }: BillingContext) {
  const reject = () => Promise.reject(new Error('not available'));
  return {
    livemode,
    getAppearance: () => undefined,
    availablePhoneNumbers: { search: jest.fn(async () => AVAILABLE) },
    routingTargets: jest.fn(async () => []),
    account: {
      effectivePricing: {
        retrieve: jest.fn(() => (pricing ? Promise.resolve(pricing) : reject())),
      },
    },
  } as unknown as DialStackInstanceImpl;
}

type OrderingEl = HTMLElement & {
  setInstance: (i: DialStackInstanceImpl) => void;
  shadowRoot: ShadowRoot;
};

const click = (el: OrderingEl, action: string) =>
  el.shadowRoot.querySelector<HTMLElement>(`[data-action="${action}"]`)?.click();

/** Mounts the widget and drives it to the confirm step with both numbers selected. */
async function confirmStep(context: BillingContext): Promise<OrderingEl> {
  const el = document.createElement('dialstack-phone-number-ordering') as OrderingEl;
  el.setInstance(makeInstance(context));
  document.body.appendChild(el);
  await settle();

  const input = el.shadowRoot.querySelector<HTMLInputElement>('#search-area-code');
  if (input) {
    input.value = '514';
    input.dispatchEvent(new Event('input', { bubbles: true }));
  }
  click(el, 'search');
  await settle();
  click(el, 'select-all');
  await settle();
  click(el, 'continue');
  await settle();
  return el;
}

const disclosure = (el: OrderingEl) =>
  el.shadowRoot.querySelector('.billing-impact')?.textContent?.replace(/\s+/g, ' ').trim() ?? null;

describe('PhoneNumberOrdering billing disclosure', () => {
  afterEach(() => {
    document.body.innerHTML = '';
    jest.restoreAllMocks();
  });

  it('quotes the account rate and the resulting monthly change', async () => {
    const el = await confirmStep({ pricing: effectivePricing(500) });

    const text = disclosure(el);
    expect(text).toContain('$10.00');
    expect(text).toContain('2 phone numbers at $5.00 each per month');
    expect(text).toContain('Taxes and fees are additional');
  });

  it('states that a sandbox account is not billed instead of quoting a price', async () => {
    // A test-mode key only ever reaches sandbox or demo accounts, so this needs
    // no account read to be certain.
    const el = await confirmStep({ pricing: effectivePricing(500), livemode: false });

    const text = disclosure(el);
    expect(text).toContain('not billed');
    expect(text).not.toContain('$5.00');
  });

  it('keeps the billable status but drops the price when no rate is agreed', async () => {
    // 0 is how an unset rate is stored, and the billing run falls back to a
    // catalog default. Quoting either would misstate the customer's price.
    const el = await confirmStep({ pricing: effectivePricing(0) });

    const text = disclosure(el);
    expect(text).toContain('billable');
    expect(text).not.toContain('$');
  });

  it('says nothing at all when the billing context cannot be read', async () => {
    const el = await confirmStep({});
    expect(disclosure(el)).toBeNull();
  });

  it('does not block the order flow when the reads fail', async () => {
    const el = await confirmStep({});
    expect(el.shadowRoot.querySelector('[data-action="continue-to-route"]')).not.toBeNull();
  });
});
