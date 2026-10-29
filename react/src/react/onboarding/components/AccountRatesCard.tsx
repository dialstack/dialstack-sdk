/**
 * The account's standing rates: what it pays each month, and per minute for
 * inbound toll-free calls.
 *
 * Laid out like the admin portal's rates card, so the same customer sees the
 * same figures whether they are in the portal or the embedded experience.
 * Unlike the billing-impact notices, which speak only while a resource is being
 * added, this states what the account pays whether or not anything is
 * happening: the subscription agreement tells the customer their rates are
 * shown in their portal, and the acceptance screen shows them exactly once.
 *
 * Rates shown are the ones in force today, matching the invoice the account is
 * holding. A change is boundary-only, so between the edit and the 1st the new
 * rate appears against its row as a dated follow-on rather than replacing the
 * figure being billed.
 *
 * Reads the account and its rates from onboarding's shared bootstrap, which
 * already fetches both.
 */

import React from 'react';
import { useOnboarding } from '../OnboardingContext';
import { ReceiptIcon } from './icons';

/** Monthly rate fields in display order, paired with their locale key. */
const MONTHLY_ROWS = [
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

  const perMinute = (decimal: string) =>
    fill(copy.perMinute, { rate: centsDecimal(decimal, numberLocale) });

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
    // notice uses. Checked first, so an account that is never billed is not told
    // its rates are unavailable.
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
    // Render only the legs /effective-pricing reports; it omits one the account
    // cannot incur. Absence is not a 0, which is a billable line with no price.
    const rows = MONTHLY_ROWS.flatMap(({ field, label }) => {
      const cents = pricing[field];
      if (cents === undefined) return [];
      // Per leg, not by next's presence: a change is reported whenever ANY rate
      // moves, so an untouched leg must stay silent. Both ends must be real
      // agreed rates, since 0 means unset and the billing run falls back to a
      // catalog default rather than charging nothing.
      const next = pricing.next?.[field] ?? 0;
      const showable = cents > 0 && next > 0 && next !== cents;
      return [{ field, label, cents, pendingCents: showable ? next : undefined }];
    });

    // Toll-free always has a rate and is billed at it, so it alone is enough to
    // show the card.
    const tollFree = pricing.toll_free_minute_rate_decimal;
    if (tollFree === undefined && !rows.some(({ cents }) => cents > 0)) {
      return <p className="portal-rates-note">{copy.noRates}</p>;
    }

    const tollFreeNext = pricing.next?.toll_free_minute_rate_decimal;
    const tollFreePending =
      tollFreeNext !== undefined && tollFreeNext !== tollFree ? tollFreeNext : undefined;
    const pendingFrom = pricing.next?.effective_from;

    // Keyed off a change this card actually shows. The API only sends `next`
    // when the rates really differ, so this is defence in depth rather than a
    // fix for it: a change to one leg still leaves the others with nothing to
    // say, and the note must not claim otherwise.
    const changing =
      rows.some(({ pendingCents }) => pendingCents !== undefined) || tollFreePending !== undefined;

    return (
      <>
        <div className="portal-rates-groups">
          {/* The unit is in the section's heading, so the monthly figures stay
              bare. */}
          <Section title={copy.monthly}>
            {rows.map(({ field, label, cents, pendingCents }) => (
              <Row
                key={field}
                label={copy[label]}
                rate={cents > 0 ? money(cents) : copy.rateNotSet}
                pending={
                  pendingCents !== undefined && pendingFrom
                    ? fill(copy.pendingRate, { rate: money(pendingCents), date: day(pendingFrom) })
                    : undefined
                }
                // Stated whenever the leg is shown: the fee is per location but
                // the trigger is account-level, which is the part a reader would
                // not guess from a per-location label.
                note={
                  field === 'per_voiceai_location_rate' ? copy.voiceAiPerLocationNote : undefined
                }
              />
            ))}
          </Section>
          {/* Present only when the account can incur it. */}
          {tollFree !== undefined && (
            <Section title={copy.calling}>
              <Row
                label={copy.tollFreeMinutes}
                rate={perMinute(tollFree)}
                pending={
                  tollFreePending !== undefined && pendingFrom
                    ? fill(copy.pendingRate, {
                        rate: perMinute(tollFreePending),
                        date: day(pendingFrom),
                      })
                    : undefined
                }
              />
            </Section>
          )}
        </div>
        <p className="portal-rates-note">
          {changing ? `${copy.pendingNote} ${copy.taxesAndFees}` : copy.taxesAndFees}
        </p>
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

const Section: React.FC<{ title: string; children: React.ReactNode }> = ({ title, children }) => (
  <div className="portal-rates-section">
    <h4 className="portal-rates-section-title">{title}</h4>
    <dl className="portal-rates-list">{children}</dl>
  </div>
);

const Row: React.FC<{
  label: string;
  /** The rate as displayed, unit included where the section heading has none. */
  rate: string;
  /** The rate's dated change; only when this leg's own rate moves. */
  pending?: string;
  /** Qualifies this rate only, so it sits under its label. */
  note?: string;
}> = ({ label, rate, pending, note }) => (
  <div className="portal-rates-row">
    <dt>
      <span className="portal-rates-label">{label}</span>
      {note && <span className="portal-rates-row-note">{note}</span>}
    </dt>
    <dd>
      <span className="portal-rates-amount">{rate}</span>
      {pending !== undefined && <span className="portal-rates-pending">{pending}</span>}
    </dd>
  </div>
);

/**
 * A rate quoted in cents as a decimal string ("1.9"), shown in cents with its
 * fraction kept: a toll-free minute usually costs less than a cent.
 */
function centsDecimal(decimal: string, numberLocale: string): string {
  const cents = Number(decimal);
  if (!Number.isFinite(cents)) return `${decimal}¢`;
  if (cents >= 100) {
    return new Intl.NumberFormat(numberLocale, {
      style: 'currency',
      currency: 'USD',
      maximumFractionDigits: 4,
    }).format(cents / 100);
  }
  return `${new Intl.NumberFormat(numberLocale, { maximumFractionDigits: 2 }).format(cents)}¢`;
}

function fill(template: string, values: Record<string, string | number>): string {
  return Object.entries(values).reduce((out, [k, v]) => out.replace(`{${k}}`, String(v)), template);
}
