import { CA, US } from 'country-region-data';

/**
 * The countries whose numbers can be searched, ordered and ported, with the
 * rules that differ from one country to the next. Regions come from the region
 * data (ISO 3166-2); the rest is what differs at the carrier and in our
 * product. Code reads these rules rather than testing for a country, so adding
 * one is an entry here, its twin on the server, and whatever is genuinely new
 * about it.
 */

/** ISO 3166-1 alpha-2 code of a supported country. */
export type SupportedCountryCode = 'US' | 'CA';

/** A state, province or other first-level region, as `[code, name]`. */
export type Region = readonly [code: string, name: string];

export interface SupportedCountry {
  code: SupportedCountryCode;
  /** Its regions. No two countries share a code, so a region names its country. */
  regions: readonly Region[];
  /** The regions a number search accepts. */
  searchableRegions: readonly Region[];
  /** What the country calls a region. */
  regionKind: 'state' | 'province';
  /** What the country calls a postal code. */
  postalCodeKind: 'zip' | 'postalCode';
  /** A postal code to show as an example. */
  postalCodeExample: string;
  /** The postal code's format, any case, with or without spaces; absent accepts any. */
  postalCode?: RegExp;
  /** A port names the reseller the customer pays: the country's carriers require it. */
  requiresLosingReseller: boolean;
  /**
   * The losing carrier's record of the account that can back a port: a US
   * customer service record (CSR), or the equipment record Bell and Telus give
   * their Canadian customers on request.
   */
  carrierRecord: 'csr' | 'equipmentRecord';
  /**
   * Onboarding asks for a recent phone bill before a port goes ahead. Our
   * choice for the US, to head off rejections; the carrier's Canadian porting
   * guide says a bill isn't required there.
   */
  portRequiresBillCopy: boolean;
}

/**
 * A country's regions from the region data, as `[code, name]`, with our
 * spelling where it differs from the data's English name.
 */
function regionsOf(
  [, , regions]: typeof US | typeof CA,
  nameOverrides: Readonly<Record<string, string>> = {}
): readonly Region[] {
  return regions.map(([name, code]) => [code, nameOverrides[code] ?? name] as const);
}

/**
 * A country's entry, with the regions its number search can't take instead of
 * the ones it can: the data lists every region, and each country names its
 * exceptions.
 */
type CountryDefinition = Omit<SupportedCountry, 'searchableRegions'> & {
  unsearchableRegions: readonly string[];
};

function defineCountry({ unsearchableRegions, ...country }: CountryDefinition): SupportedCountry {
  const refused = new Set(unsearchableRegions);
  return {
    ...country,
    searchableRegions: country.regions.filter(([code]) => !refused.has(code)),
  };
}

/** The supported countries, in the order they are offered. The first is the default. */
export const SUPPORTED_COUNTRIES: readonly SupportedCountry[] = [
  defineCountry({
    code: 'US',
    regions: regionsOf(US),
    unsearchableRegions: [
      // Territories: their numbers belong to separate countries in the +1 plan.
      'AS',
      'GU',
      'MP',
      'PR',
      'VI',
      // Freely associated states, with their own country codes.
      'FM',
      'MH',
      'PW',
      // Military mail, which has no numbers.
      'AA',
      'AE',
      'AP',
    ],
    regionKind: 'state',
    postalCodeKind: 'zip',
    postalCodeExample: '10001',
    postalCode: /^\d{5}(?:[ -]?\d{4})?$/,
    requiresLosingReseller: false,
    carrierRecord: 'csr',
    portRequiresBillCopy: true,
  }),
  defineCountry({
    code: 'CA',
    regions: regionsOf(CA, { QC: 'Québec' }),
    // The carrier's search refuses them; their area code, 867, finds their
    // numbers.
    unsearchableRegions: ['YT', 'NT'],
    regionKind: 'province',
    postalCodeKind: 'postalCode',
    postalCodeExample: 'M5V 2T6',
    postalCode: /^[ABCEGHJ-NPRSTVXY]\d[ABCEGHJ-NPRSTV-Z] ?\d[ABCEGHJ-NPRSTV-Z]\d$/i,
    // The carrier's Canadian porting guide lists it as required.
    requiresLosingReseller: true,
    carrierRecord: 'equipmentRecord',
    portRequiresBillCopy: false,
  }),
];

/** The supported country with an ISO alpha-2 code, any case. */
export function supportedCountry(code: string | undefined): SupportedCountry | undefined {
  const upper = code?.trim().toUpperCase();
  return SUPPORTED_COUNTRIES.find((c) => c.code === upper);
}

/**
 * A region's ISO 3166-2 code, `CA-QC`. Unlike a region's own code (`QC`), it is
 * unique across countries — `WA` is both Washington and Western Australia — so
 * it is what a region menu spanning countries carries.
 */
export function regionCode(country: SupportedCountryCode, region: string): string {
  return `${country}-${region}`;
}

/** The supported country and region of an ISO 3166-2 code, `CA-QC`, any case. */
export function parseRegionCode(
  value: string | undefined
): { country: SupportedCountry; region: string } | undefined {
  const [countryCode, region] = value?.trim().toUpperCase().split('-', 2) ?? [];
  const country = supportedCountry(countryCode);
  if (!country || !region || !country.regions.some(([code]) => code === region)) return undefined;
  return { country, region };
}
