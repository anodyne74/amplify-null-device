import { enteredStreetNumber, propertyKey, propertyKeyPrefix } from './propertyKey';

const CLIFF_ROAD = { streetNumber: '14', street: 'Cliff Road', suburb: 'Epping', postcode: '2121' };

describe('propertyKey', () => {
  it('gives "14 Cliff Rd, Epping" and "14 Cliff Road, Epping NSW 2121" the same key', () => {
    expect(propertyKey('14 Cliff Rd, Epping', CLIFF_ROAD)).toBe('epping|2121|cliff road|14');
    expect(propertyKey('14 Cliff Road, Epping NSW 2121', CLIFF_ROAD)).toBe('epping|2121|cliff road|14');
  });

  it('gives two houses geocoded to the same street midpoint different keys', () => {
    // A street-midpoint result carries the street but no street number.
    const midpoint = { street: 'Cliff Road', suburb: 'Epping', postcode: '2121' };

    expect(propertyKey('14 Cliff Rd, Epping', midpoint)).toBe('epping|2121|cliff road|14');
    expect(propertyKey('96 Cliff Rd, Epping', midpoint)).toBe('epping|2121|cliff road|96');
  });

  it("keeps the entered address's suburb when the geocoder disagrees", () => {
    const geocoded = { ...CLIFF_ROAD, suburb: 'North Epping', postcode: '2121' };

    expect(propertyKey('14 Cliff Rd, Epping NSW 2121', geocoded)).toBe('epping|2121|cliff road|14');
  });

  it("drops the geocoder's postcode when it belongs to a suburb the entered address doesn't name", () => {
    const geocoded = { ...CLIFF_ROAD, suburb: 'Carlingford', postcode: '2118' };

    expect(propertyKey('14 Cliff Rd, Epping', geocoded)).toBe('epping||cliff road|14');
  });

  it("uses the geocoder's suburb when the entered address names none", () => {
    expect(propertyKey('14 Cliff Rd', CLIFF_ROAD)).toBe('epping|2121|cliff road|14');
  });

  it('normalises case, spacing, punctuation and street-type abbreviations', () => {
    const geocoded = { streetNumber: '3', street: "St. Kilda  Rd", suburb: 'Melbourne', postcode: '3004' };

    expect(propertyKey('3 St Kilda Rd, MELBOURNE VIC 3004', geocoded)).toBe('melbourne|3004|st kilda road|3');
  });

  it("falls back to the entered street when the geocoder returned only a suburb", () => {
    expect(propertyKey('14 Cliff Rd, Epping', { suburb: 'Epping', postcode: '2121' })).toBe('epping|2121|cliff road|14');
  });

  it('never uses coordinates or place IDs, so it has no key without a street number, street and suburb', () => {
    expect(propertyKey('Cliff Rd, Epping', { street: 'Cliff Road', suburb: 'Epping' })).toBeUndefined();
    expect(propertyKey('14', {})).toBeUndefined();
  });
});

describe('enteredStreetNumber', () => {
  it.each([
    ['14 Cliff Rd, Epping', '14'],
    ['14A Cliff Rd', '14a'],
    ['14-16 Cliff Rd', '14-16'],
    ['2/14 Cliff Rd', '14'],
    ['Unit 2, 14 Cliff Rd', '14'],
    ['Cliff Rd, Epping', undefined],
  ])('reads %s as %s', (address, expected) => {
    expect(enteredStreetNumber(address)).toBe(expected);
  });
});

describe('propertyKeyPrefix', () => {
  it('builds exact, delimited prefixes for suburb and street searches', () => {
    expect(propertyKeyPrefix({ suburb: 'Epping' })).toBe('epping|');
    expect(propertyKeyPrefix({ suburb: 'Epping', postcode: '2121' })).toBe('epping|2121|');
    expect(propertyKeyPrefix({ suburb: 'Epping', postcode: '2121', street: 'Cliff Rd' })).toBe('epping|2121|cliff road|');
  });

  it('never lets a suburb prefix match a longer suburb name', () => {
    expect('north epping|2121|cliff road|14'.startsWith(propertyKeyPrefix({ suburb: 'Epping' }))).toBe(false);
    expect('epping north|2121|cliff road|14'.startsWith(propertyKeyPrefix({ suburb: 'Epping' }))).toBe(false);
  });
});
