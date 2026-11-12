import { readLocalSearch, suggestRegions } from '../number-search-input';

describe('readLocalSearch', () => {
  it('reads an area code', () => {
    expect(readLocalSearch('212')).toEqual({ kind: 'area_code', areaCode: '212' });
    expect(readLocalSearch(' (514) ')).toEqual({ kind: 'area_code', areaCode: '514' });
  });

  it('reads a ZIP code, ZIP+4 included', () => {
    expect(readLocalSearch('10001')).toEqual({ kind: 'zip', zip: '10001' });
    expect(readLocalSearch('10001-1234')).toEqual({ kind: 'zip', zip: '10001' });
  });

  it('reads a state or province by name, code or ISO code', () => {
    const quebec = { kind: 'region', country: 'CA', region: 'QC', name: 'Québec' };
    expect(readLocalSearch('quebec')).toEqual(quebec);
    expect(readLocalSearch('Québec')).toEqual(quebec);
    expect(readLocalSearch('QC')).toEqual(quebec);
    expect(readLocalSearch('ca-qc')).toEqual(quebec);
    expect(readLocalSearch('new york')).toMatchObject({ country: 'US', region: 'NY' });
  });

  it('names nothing for partial or unknown text', () => {
    expect(readLocalSearch('21')).toBeUndefined();
    expect(readLocalSearch('1000')).toBeUndefined();
    expect(readLocalSearch('Queb')).toBeUndefined();
    expect(readLocalSearch('')).toBeUndefined();
  });

  it('reads only the kinds allowed', () => {
    expect(readLocalSearch('212', ['zip', 'region'])).toBeUndefined();
    expect(readLocalSearch('10001', ['area_code'])).toBeUndefined();
    expect(readLocalSearch('Ontario', ['area_code', 'zip'])).toBeUndefined();
  });

  it('leaves out regions the search refuses', () => {
    expect(readLocalSearch('Yukon')).toBeUndefined();
    expect(readLocalSearch('PR')).toBeUndefined();
  });
});

describe('suggestRegions', () => {
  it('finds names by their start, accents aside', () => {
    expect(suggestRegions('que').map((r) => r.name)).toEqual(['Québec']);
  });

  it('then names with a word that starts with the text', () => {
    const names = suggestRegions('car').map((r) => r.name);
    expect(names).toEqual(['North Carolina', 'South Carolina']);
  });

  it('suggests nothing for digits or empty text', () => {
    expect(suggestRegions('21')).toEqual([]);
    expect(suggestRegions(' ')).toEqual([]);
  });

  it('caps the list', () => {
    expect(suggestRegions('n', 3)).toHaveLength(3);
  });
});
