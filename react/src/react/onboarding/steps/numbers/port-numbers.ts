import {
  describeNonPortable,
  type NonPortableMessages,
  type NonPortableNumber,
  type NumberIssue,
  type ParseProblemReason,
  phoneNumberListType,
  portingHoliday,
  phoneNumberCountry,
  readyPhoneNumbers,
  type SupportedCountry,
  type SupportedCountryCode,
  supportedCountry,
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
    unassigned: t(`${key}.unassigned`),
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
  toll_free_not_enabled: 'accountOnboarding.numbers.port.tollFreeNotEnabled',
  mixed_carrier: 'accountOnboarding.numbers.port.mixedCarrierOrder',
};

/** Port lists take toll-free numbers; an order is then all toll-free. */
export const PORT_LIST_OPTIONS = { allowTollFree: true } as const;

/**
 * The type of the numbers a port list would submit. Toll-free numbers are ported
 * without the losing-carrier details a local order needs.
 */
export function portListType(
  values: readonly string[],
  issues: readonly NumberIssue[]
): ReturnType<typeof phoneNumberListType> {
  return phoneNumberListType(readyPhoneNumbers(values, issues, PORT_LIST_OPTIONS));
}

/**
 * The country whose rules the port list follows. One order is one country (the
 * API refuses a mix), so the first ready number decides; `undefined` before
 * there is one.
 */
export function portListCountry(
  values: readonly string[],
  issues: readonly NumberIssue[]
): SupportedCountry | undefined {
  const [first] = readyPhoneNumbers(values, issues, PORT_LIST_OPTIONS);
  return first === undefined ? undefined : supportedCountry(phoneNumberCountry(first));
}

/** Whether the customer has typed any part of the service address. */
export function hasAddress(s: {
  portSubscriberHouseNumber: string;
  portSubscriberStreetName: string;
  portSubscriberLine2: string;
  portSubscriberCity: string;
  portSubscriberState: string;
  portSubscriberZip: string;
}): boolean {
  return [
    s.portSubscriberHouseNumber,
    s.portSubscriberStreetName,
    s.portSubscriberLine2,
    s.portSubscriberCity,
    s.portSubscriberState,
    s.portSubscriberZip,
  ].some((v) => v.trim() !== '');
}

/** The `details` shapes carried by `phone_numbers_already_claimed` and `mixed_carrier`. */
interface ConflictDetails {
  already_on_account?: string[];
  in_service_elsewhere?: string[];
  number_groups?: string[][];
}

/**
 * The numbers a `mixed_carrier` refusal partitions by holder, or null for any
 * other error. Onboarding splits the order along them.
 */
export function mixedCarrierNumberGroups(err: unknown): string[][] | null {
  const e = err as { code?: string; details?: ConflictDetails } | null | undefined;
  const groups = e?.code === 'mixed_carrier' ? e.details?.number_groups : undefined;
  return groups && groups.length > 1 ? groups : null;
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
  const details = (err as { details?: ConflictDetails } | null | undefined)?.details;
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

/** A local calendar date as `YYYY-MM-DD`. */
export function localDateKey(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

/**
 * The porting holiday on a local date for a port of `country`'s numbers, or
 * `null`.
 * Weekends are not holidays: the carrier skips them separately.
 */
export function portHolidayOn(d: Date, country: SupportedCountryCode): string | null {
  return portingHoliday(localDateKey(d), country);
}

/** Whether the carrier ports on a local date: a weekday that is no holiday. */
export function isPortDay(d: Date, country: SupportedCountryCode): boolean {
  const day = d.getDay();
  return day !== 0 && day !== 6 && portHolidayOn(d, country) === null;
}

/**
 * The earliest port date the API accepts: five porting days after today, which
 * skip weekends and porting holidays.
 */
export function earliestPortDate(today: Date, country: SupportedCountryCode): Date {
  const d = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  for (let days = 0; days < 5;) {
    d.setDate(d.getDate() + 1);
    if (isPortDay(d, country)) days++;
  }
  return d;
}
