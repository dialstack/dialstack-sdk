import { SUPPORTED_COUNTRIES, type SupportedCountryCode } from '../constants/countries';

/** The ways a local number search can name a place. */
export type LocalSearchKind = 'area_code' | 'zip' | 'region';

/** A state or province a local search can name. */
export interface SearchRegion {
  country: SupportedCountryCode;
  /** Its own two-letter code, `QC`. */
  region: string;
  name: string;
}

/** What a location field's text names, read by `readLocalSearch`. */
export type LocalSearchQuery =
  | { kind: 'area_code'; areaCode: string }
  | { kind: 'zip'; zip: string }
  | ({ kind: 'region' } & SearchRegion);

const ALL_KINDS: readonly LocalSearchKind[] = ['area_code', 'zip', 'region'];

/** Lower case, without accents or punctuation: how names are compared. */
function fold(text: string): string {
  return text
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim();
}

function searchableRegions(): SearchRegion[] {
  return SUPPORTED_COUNTRIES.flatMap((c) =>
    c.searchableRegions.map(([region, name]) => ({ country: c.code, region, name }))
  );
}

/**
 * What a single location field holds: a three-digit area code (`212`,
 * `(212)`), a ZIP code (`10001`, `10001-1234`), or a state or province, by its
 * name in any case and without its accents (`quebec`), its code (`QC`) or its
 * ISO 3166-2 code (`CA-QC`). `undefined` when the text names none of the
 * allowed kinds yet. A region code two countries share names neither.
 */
export function readLocalSearch(
  text: string,
  kinds: readonly LocalSearchKind[] = ALL_KINDS
): LocalSearchQuery | undefined {
  const trimmed = text.trim();
  if (kinds.includes('area_code')) {
    const areaCode = /^\(?(\d{3})\)?$/.exec(trimmed)?.[1];
    if (areaCode) return { kind: 'area_code', areaCode };
  }
  if (kinds.includes('zip')) {
    // The search takes the five-digit ZIP; a ZIP+4 narrows nothing further.
    const zip = /^(\d{5})(?:-\d{4})?$/.exec(trimmed)?.[1];
    if (zip) return { kind: 'zip', zip };
  }
  if (kinds.includes('region') && trimmed) {
    const folded = fold(trimmed);
    const upper = trimmed.toUpperCase();
    const matches = searchableRegions().filter(
      (r) => fold(r.name) === folded || r.region === upper || `${r.country}-${r.region}` === upper
    );
    const [only] = matches;
    if (only && matches.length === 1) return { kind: 'region', ...only };
  }
  return undefined;
}

/**
 * The states and provinces a partly typed name could be, best first: names
 * starting with it, then names with a word starting with it. Case and accents
 * don't matter, so `que` finds Québec.
 */
export function suggestRegions(text: string, limit = 6): SearchRegion[] {
  const folded = fold(text);
  if (!folded || /^\d/.test(folded)) return [];
  const regions = searchableRegions();
  const starts = regions.filter((r) => fold(r.name).startsWith(folded));
  const words = regions.filter(
    (r) =>
      !starts.includes(r) &&
      fold(r.name)
        .split(' ')
        .some((w) => w.startsWith(folded))
  );
  return [...starts, ...words].slice(0, limit);
}
