/**
 * The account's standing monthly rates.
 *
 * Mirrors the admin portal's rates card, so the same customer sees the same
 * figures whether they are in the portal or the embedded experience. Unlike the
 * billing-impact notices, which speak only while a resource is being added,
 * this states what the account pays whether or not anything is happening: the
 * subscription agreement tells the customer their rates are shown in their
 * portal, and the acceptance screen shows them exactly once.
 *
 * Reads the account and its rates from onboarding's shared bootstrap, which
 * already fetches both.
 */

import React from 'react';
import { useOnboarding } from '../OnboardingContext';
import { ReceiptIcon } from './icons';

/** Rate fields in display order, paired with their locale key. */
const RATE_ROWS = [
  { field: 'per_user_rate', label: 'perUser' },
  { field: 'per_did_rate', label: 'perPhoneNumber' },
  { field: 'per_voiceai_location_rate', label: 'perVoiceAiLocation' },
] as const;

export const AccountRatesCard: React.FC = () => {
  const { dialstack, pricing, locale, formatting } = useOnboarding();
  const copy = locale.onboardingPortal.rates;
  const numberLocale = formatting?.dateLocale ?? 'en-US';

  const money = (cents: number) =>
    new Intl.NumberFormat(numberLocale, { style: 'currency', currency: 'USD' }).format(cents / 100);

  // effective_from is a month-boundary date-only value. A date-only string parses
  // as UTC midnight, so formatting it in UTC is what keeps the 1st from reading
  // as the last day of the previous month for anyone west of UTC.
  const day = (iso: string) =>
    new Intl.DateTimeFormat(numberLocale, {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      timeZone: 'UTC',
    }).format(new Date(iso));

  const body = () => {
    // Billability comes from the key's livemode, not a fetched account mode: a
    // test-mode key only ever reaches sandbox and demo accounts, so this needs no
    // request and cannot be wrong about a live one. Same signal the point-of-action
    // notice uses.
    if (!dialstack.livemode) return <p className="portal-rates-note">{copy.notBilled}</p>;
    // Absent rates are a failed read, not an account without prices. The
    // bootstrap folds pricing in with the agreement and nulls both when that
    // fetch fails, so asserting "no rates are set" here would tell a paying
    // customer their agreed price does not exist.
    if (!pricing) return <p className="portal-rates-note">{copy.unavailable}</p>;

    // This is the effective-pricing resource: the rates in force. The agreed
    // schedule lives on /pricing and holds next month's rates after a mid-month
    // change, so quoting that one would promise a price the current invoice does
    // not use. Reading the wrong resource is the mistake to avoid here.
    const rows = RATE_ROWS.map(({ field, label }) => {
      const cents = pricing[field] ?? 0;
      const next = pricing.next?.[field] ?? 0;
      // Per leg, not by pending's presence: a change is reported whenever ANY
      // rate moves, so an untouched leg must stay silent. Both ends must be real
      // agreed rates, since 0 means unset and the billing run falls back to a
      // catalog default rather than charging nothing. Undefined exactly when the
      // row will say nothing, so the change note below cannot disagree with it.
      const showable = cents > 0 && next > 0 && next !== cents;
      return { field, label, cents, pendingCents: showable ? next : undefined };
    });

    // 0 is how an unset rate is stored, so an account with no leg set has no
    // agreed price to show.
    if (!rows.some(({ cents }) => cents > 0)) {
      return <p className="portal-rates-note">{copy.noRates}</p>;
    }

    return (
      <>
        <dl className="portal-rates-list">
          {rows.map(({ field, label, cents, pendingCents }) => (
            <div className="portal-rates-row" key={field}>
              <dt>{copy[label]}</dt>
              <dd>
                <span className="portal-rates-amount">
                  {cents > 0 ? fill(copy.perMonth, { rate: money(cents) }) : copy.rateNotSet}
                </span>
                {pendingCents !== undefined && pricing.next && (
                  <span className="portal-rates-pending">
                    {fill(copy.pendingRate, {
                      rate: money(pendingCents),
                      date: day(pricing.next.effective_from),
                    })}
                  </span>
                )}
              </dd>
            </div>
          ))}
        </dl>
        {/* Keyed off a change this card actually shows. The API only sends `next`
            when the rates really differ, so this is defence in depth rather than a
            fix for it: a change to one leg still leaves the other two with nothing
            to say, and the note must not claim otherwise. */}
        {rows.some(({ pendingCents }) => pendingCents !== undefined) && (
          <p className="portal-rates-note">{copy.pendingNote}</p>
        )}
        <p className="portal-rates-note">{copy.taxesAndFees}</p>
      </>
    );
  };

  return (
    <section className="portal-rates" aria-label={copy.title}>
      <div className="portal-rates-header">
        <span className="portal-rates-icon" aria-hidden="true">
          <ReceiptIcon />
        </span>
        <div>
          <h3>{copy.title}</h3>
          <p className="portal-rates-subtitle">{copy.subtitle}</p>
        </div>
      </div>
      {body()}
    </section>
  );
};

function fill(template: string, values: Record<string, string | number>): string {
  return Object.entries(values).reduce((out, [k, v]) => out.replace(`{${k}}`, String(v)), template);
}
