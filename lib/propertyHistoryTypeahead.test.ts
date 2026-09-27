import { buildTypeaheadOptions, matchTypeaheadOptions } from './propertyHistoryTypeahead';

const STOPS = [
  { propertyKey: 'epping|2121|cliff road|14', address: '14 Cliff Rd, Epping', addressSuburb: 'Epping', addressStreet: 'Cliff Road' },
  { propertyKey: 'epping|2121|cliff road|14', address: '14 Cliff Road, Epping NSW 2121' },
  { propertyKey: 'epping|2121|cliff road|96', address: '96 Cliff Rd, Epping' },
  { propertyKey: 'north epping|2121|malton road|3', address: '3 Malton Rd, North Epping' },
  { propertyKey: null, address: 'No key yet' },
];

describe('buildTypeaheadOptions', () => {
  it('offers each suburb, street and Property once, with an exact search for each', () => {
    const options = buildTypeaheadOptions(STOPS);

    expect(options.map((option) => [option.label, option.search])).toEqual([
      ['Epping 2121', { level: 'suburb', suburb: 'epping', postcode: '2121' }],
      ['North Epping 2121', { level: 'suburb', suburb: 'north epping', postcode: '2121' }],
      ['Cliff Road, Epping 2121', { level: 'street', suburb: 'epping', postcode: '2121', street: 'cliff road' }],
      ['Malton Road, North Epping 2121', { level: 'street', suburb: 'north epping', postcode: '2121', street: 'malton road' }],
      ['14 Cliff Road, Epping NSW 2121', { level: 'address', propertyKey: 'epping|2121|cliff road|14' }],
      ['96 Cliff Rd, Epping', { level: 'address', propertyKey: 'epping|2121|cliff road|96' }],
      ['3 Malton Rd, North Epping', { level: 'address', propertyKey: 'north epping|2121|malton road|3' }],
    ]);
  });

  it('labels a suburb with no postcode by name alone', () => {
    expect(buildTypeaheadOptions([{ propertyKey: 'epping||cliff road|14', address: '14 Cliff Rd' }])[0].label).toBe('Epping');
  });
});

describe('matchTypeaheadOptions', () => {
  const options = buildTypeaheadOptions(STOPS);

  it('matches every word of the query, in any order, ignoring case', () => {
    expect(matchTypeaheadOptions(options, 'cliff EPP').map((option) => option.label)).toEqual([
      'Cliff Road, Epping 2121',
      '14 Cliff Road, Epping NSW 2121',
      '96 Cliff Rd, Epping',
    ]);
  });

  it('offers suburbs before streets before Properties, up to the limit', () => {
    expect(matchTypeaheadOptions(options, 'epping', 3).map((option) => option.search.level)).toEqual(['suburb', 'suburb', 'street']);
  });

  it('offers nothing for a query under two characters', () => {
    expect(matchTypeaheadOptions(options, ' e ')).toEqual([]);
  });
});
