/**
 * Pure, platform-agnostic helpers for the softphone's emergency-address form,
 * shared by the web and React Native EmergencyBanner. No DOM/RN deps.
 */

// Full name → 2-letter code. The MSAG validator only accepts the abbreviated
// code, but users type the full name ("California") into the form and get a
// silent "could not be validated" failure. Normalize the field before submit so
// either form works. Covers US states + DC/territories and Canadian provinces
// (the form's country may be CA); anything already abbreviated or unrecognized
// passes through untouched.
const STATE_CODES: Record<string, string> = {
  alabama: 'AL',
  alaska: 'AK',
  arizona: 'AZ',
  arkansas: 'AR',
  california: 'CA',
  colorado: 'CO',
  connecticut: 'CT',
  delaware: 'DE',
  'district of columbia': 'DC',
  florida: 'FL',
  georgia: 'GA',
  hawaii: 'HI',
  idaho: 'ID',
  illinois: 'IL',
  indiana: 'IN',
  iowa: 'IA',
  kansas: 'KS',
  kentucky: 'KY',
  louisiana: 'LA',
  maine: 'ME',
  maryland: 'MD',
  massachusetts: 'MA',
  michigan: 'MI',
  minnesota: 'MN',
  mississippi: 'MS',
  missouri: 'MO',
  montana: 'MT',
  nebraska: 'NE',
  nevada: 'NV',
  'new hampshire': 'NH',
  'new jersey': 'NJ',
  'new mexico': 'NM',
  'new york': 'NY',
  'north carolina': 'NC',
  'north dakota': 'ND',
  ohio: 'OH',
  oklahoma: 'OK',
  oregon: 'OR',
  pennsylvania: 'PA',
  'rhode island': 'RI',
  'south carolina': 'SC',
  'south dakota': 'SD',
  tennessee: 'TN',
  texas: 'TX',
  utah: 'UT',
  vermont: 'VT',
  virginia: 'VA',
  washington: 'WA',
  'west virginia': 'WV',
  wisconsin: 'WI',
  wyoming: 'WY',
  'puerto rico': 'PR',
  guam: 'GU',
  'u.s. virgin islands': 'VI',
  'american samoa': 'AS',
  'northern mariana islands': 'MP',
  alberta: 'AB',
  'british columbia': 'BC',
  manitoba: 'MB',
  'new brunswick': 'NB',
  'newfoundland and labrador': 'NL',
  'nova scotia': 'NS',
  'northwest territories': 'NT',
  nunavut: 'NU',
  ontario: 'ON',
  'prince edward island': 'PE',
  quebec: 'QC',
  saskatchewan: 'SK',
  yukon: 'YT',
};

/** Map a state/province full name to its 2-letter code; pass through if already a code or unknown. */
export function normalizeStateCode(state: string): string {
  const trimmed = state.trim();
  const mapped = STATE_CODES[trimmed.toLowerCase()];
  if (mapped) return mapped;
  // Already a 2-letter code (e.g. "ny") — upper-case it so the MSAG validator,
  // which only accepts the uppercase abbreviation, doesn't silently reject it.
  // Anything else (a mistyped full name) passes through untouched.
  if (/^[a-z]{2}$/i.test(trimmed)) return trimmed.toUpperCase();
  return trimmed;
}
