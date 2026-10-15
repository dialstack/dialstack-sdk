import {
  describeNonPortable,
  type NonPortableMessages,
  type NonPortableNumber,
  type NumberIssue,
  type ParseProblemReason,
} from '@dialstack/sdk-js/pure';

import type { TFn } from './types';

/**
 * Per-order cap enforced by the API. The account's own phone-number limit is a
 * separate, usually lower cap that only the server can evaluate — it arrives as
 * a conflict response rather than being predicted here.
 */
export const MAX_PHONE_NUMBERS_PER_ORDER = 100;

export const REASON_KEY = {
  invalid: 'accountOnboarding.numbers.port.reasonInvalid',
  not_us: 'accountOnboarding.numbers.port.reasonNotUs',
  toll_free: 'accountOnboarding.numbers.port.reasonTollFree',
  ambiguous: 'accountOnboarding.numbers.port.reasonAmbiguous',
  has_extension: 'accountOnboarding.numbers.port.reasonHasExtension',
} as const satisfies Record<ParseProblemReason, string>;

/** Onboarding's wording for why a number cannot be ported. */
export function nonPortableMessages(t: TFn, nameCarrier = true): NonPortableMessages {
  const key = 'accountOnboarding.numbers.port';
  return {
    unsupportedCarrier: (carrier) =>
      carrier && nameCarrier
        ? t(`${key}.unsupportedCarrierNamed`, { carrier })
        : t(`${key}.unsupportedCarrier`),
    unsupportedArea: (area) =>
      area ? t(`${key}.unsupportedAreaNamed`, { area }) : t(`${key}.unsupportedArea`),
    unsupportedNumber: t(`${key}.unsupportedNumber`),
    unknown: t(`${key}.notPortableUnknown`),
  };
}

/** Build issues for numbers the carrier says cannot be ported. */
export function mapNonPortableToIssues(
  nonPortable: readonly NonPortableNumber[],
  messages: NonPortableMessages
): NumberIssue[] {
  return nonPortable.map((np) => ({
    e164: np.phone_number,
    message: describeNonPortable(np, messages),
  }));
}

/**
 * Locale keys for the conflict codes the port paths can return.
 *
 * The API sends a stable `code` and a human-readable `error` that is written for
 * a log, not a customer — decoding the code here is what that contract is for.
 * The wording differs from the admin portal on purpose: an account admin cannot
 * raise their own phone-number limit, so telling them to is a dead end.
 */
export const CONFLICT_KEY: Record<string, string> = {
  phone_number_limit_exceeded: 'accountOnboarding.numbers.port.accountLimit',
  phone_numbers_already_claimed: 'accountOnboarding.numbers.port.numbersUnavailable',
};

/** The `details` shape carried by `phone_numbers_already_claimed`. */
interface AlreadyClaimedDetails {
  already_on_account?: string[];
  in_service_elsewhere?: string[];
}

/**
 * Turn an already-claimed conflict into per-row issues.
 *
 * The API names which numbers conflicted and which situation each is in, so the
 * entry is marked where the customer typed it rather than leaving them to
 * compare the list by hand — the same treatment a number the carrier calls
 * non-portable already gets. Neither message repeats the number, because it sits
 * directly beneath it.
 *
 * Returns an empty array for any other error, so callers can apply it
 * unconditionally.
 */
export function conflictNumberIssues(err: unknown, t: (key: string) => string): NumberIssue[] {
  const details = (err as { details?: AlreadyClaimedDetails } | null | undefined)?.details;
  if (!details) return [];
  return [
    ...(details.already_on_account ?? []).map((e164) => ({
      e164,
      message: t('accountOnboarding.numbers.port.conflictAlreadyOnAccount'),
    })),
    ...(details.in_service_elsewhere ?? []).map((e164) => ({
      e164,
      message: t('accountOnboarding.numbers.port.conflictInServiceElsewhere'),
    })),
  ];
}
