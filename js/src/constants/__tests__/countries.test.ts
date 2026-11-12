import { phoneNumberListCountry } from '../../utils/phone-list';
import { parseRegionCode, regionCode, SUPPORTED_COUNTRIES, supportedCountry } from '../countries';

describe('supported countries', () => {
  it('gives every region to one country', () => {
    const seen = new Map<string, string>();
    for (const c of SUPPORTED_COUNTRIES) {
      for (const [code] of c.regions) {
        expect(seen.get(code)).toBeUndefined();
        seen.set(code, c.code);
      }
    }
  });

  it('finds a country by code or region, any case', () => {
    expect(supportedCountry('ca')?.code).toBe('CA');
    expect(supportedCountry('JM')).toBeUndefined();
    expect(regionCode('CA', 'QC')).toBe('CA-QC');
    expect(parseRegionCode('ca-on')?.country.code).toBe('CA');
    expect(parseRegionCode('US-NY')?.region).toBe('NY');
    expect(parseRegionCode('CA-NY')).toBeUndefined();
    expect(parseRegionCode('NY')).toBeUndefined();
  });

  it('takes regions from the region data, with our spelling of Québec', () => {
    const ca = supportedCountry('CA');
    const us = supportedCountry('US');
    expect(ca?.regions).toHaveLength(13);
    expect(ca?.regions).toContainEqual(['QC', 'Québec']);
    expect(us?.regions).toContainEqual(['PR', 'Puerto Rico']);
    // Territories' numbers aren't ones we serve.
    expect(us?.searchableRegions.some(([code]) => code === 'PR')).toBe(false);
    expect(us?.searchableRegions).toHaveLength(51);
  });

  it('checks US ZIP codes, ZIP+4 included', () => {
    const zip = supportedCountry('US')?.postalCode;
    expect(zip?.test('10001')).toBe(true);
    expect(zip?.test('10001-1234')).toBe(true);
    expect(zip?.test('1000')).toBe(false);
  });

  it('names the one country of a list of numbers', () => {
    expect(phoneNumberListCountry([])).toBeNull();
    expect(phoneNumberListCountry(['+14165550100', '+15145550100'])).toBe('CA');
    expect(phoneNumberListCountry(['+12125550100', '+14165550100'])).toBe('mixed');
    // Toll-free numbers report the US.
    expect(phoneNumberListCountry(['+18005550100'])).toBe('US');
  });
});
