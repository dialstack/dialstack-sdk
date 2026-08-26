/**
 * Discloses what adding a billable resource does to the account's bill, at the
 * point of the action. Mirrors the admin portal's notice and the ordering
 * widget's, so the same customer sees the same statement wherever they add a
 * seat or a number.
 *
 * Reads the account and its agreed rates from onboarding's shared bootstrap,
 * which already fetches both, so a step pays nothing extra to disclose.
 */

import React from 'react';
import { useOnboarding } from '../OnboardingContext';
import { ReceiptIcon } from './icons';

export type BillableResource = 'userSeat' | 'phoneNumber';

export interface BillingImpactNoticeProps {
  resource: BillableResource;
  /** How many units the pending action adds. Nothing renders for zero. */
  count: number;
  /**
   * How the disclosure is framed.
   *
   * `action` states the total for one pending, countable act: confirming an
   * order of four numbers. It belongs where the user is about to commit.
   *
   * `rate` states the price per unit and no total. It belongs on a control used
   * repeatedly, like the add-a-member form, which sits above the list of
   * members already added: quoting "1 user seat" there reads as a claim about
   * the account rather than about the next add, and goes stale the moment a
   * second member is added.
   */
  variant?: 'action' | 'rate';
}

export const BillingImpactNotice: React.FC<BillingImpactNoticeProps> = ({
  resource,
  count,
  variant = 'action',
}) => {
  const { dialstack, pricing, locale, formatting } = useOnboarding();
  const copy = locale.accountOnboarding.billing;

  // The rates in force. The account may also have a rate change agreed for next
  // month; naming it at the point of adding a member is noise, not disclosure.
  if (count <= 0) return null;

  const body = () => {
    // A sandbox or demo account never bills. Known from the publishable key's
    // prefix, so this needs no request and cannot be wrong about a live account.
    if (!dialstack.livemode) return copy.notBilled;

    const rate = (resource === 'userSeat' ? pricing?.per_user_rate : pricing?.per_did_rate) ?? 0;
    // 0 is how an unset rate is stored, and the billing run falls back to a
    // catalog default. Neither is the customer's agreed price, so name the
    // billable resource and stop there.
    if (rate <= 0) {
      return variant === 'rate'
        ? copy.noPriceRate[resource]
        : fill(plural(copy.noPrice[resource], count), { count });
    }

    const money = (cents: number) =>
      new Intl.NumberFormat(formatting?.dateLocale ?? 'en-US', {
        style: 'currency',
        currency: 'USD',
      }).format(cents / 100);

    if (variant === 'rate') {
      return (
        <>
          <div className="billing-impact-headline">
            {fill(copy.rateHeadline[resource], { rate: money(rate) })}
          </div>
          <div>
            {[
              copy.rateDetail[resource],
              ...(resource === 'phoneNumber' ? [copy.startsOnActivation] : []),
              copy.taxesAndFees,
            ].join(' ')}
          </div>
        </>
      );
    }

    return (
      <>
        <div className="billing-impact-headline">
          {fill(copy.headline, { amount: money(rate * count) })}
        </div>
        <div>
          {[
            fill(plural(copy.detail[resource], count), { count, rate: money(rate) }),
            ...(resource === 'phoneNumber' ? [copy.startsOnActivation] : []),
            copy.taxesAndFees,
          ].join(' ')}
        </div>
      </>
    );
  };

  return (
    <div className="billing-impact" role="note" aria-label={copy.label}>
      <span className="billing-impact-icon" aria-hidden="true">
        <ReceiptIcon />
      </span>
      <div className="billing-impact-body">{body()}</div>
    </div>
  );
};

function plural(forms: { one: string; other: string }, count: number): string {
  return count === 1 ? forms.one : forms.other;
}

function fill(template: string, values: Record<string, string | number>): string {
  return Object.entries(values).reduce((out, [k, v]) => out.replace(`{${k}}`, String(v)), template);
}
