import {
  classifyLocationPrecision,
  locationPrecisionIndicator,
  parseAddressComponents,
  pickStopLocationFields,
  stopLocationFields,
  stopLocationUpdate,
  type GeocodedLocation,
} from './locationPrecision';

const COMPONENTS = [
  { long_name: '12', short_name: '12', types: ['street_number'] },
  { long_name: 'Smith Street', short_name: 'Smith St', types: ['route'] },
  { long_name: 'Fitzroy', short_name: 'Fitzroy', types: ['locality', 'political'] },
  { long_name: 'Victoria', short_name: 'VIC', types: ['administrative_area_level_1', 'political'] },
  { long_name: '3065', short_name: '3065', types: ['postal_code'] },
];

describe('classifyLocationPrecision', () => {
  it('is Precise for a rooftop result with a street number', () => {
    expect(
      classifyLocationPrecision({ locationType: 'ROOFTOP', resultTypes: ['street_address'], streetNumber: '12' })
    ).toBe('precise');
  });

  it('is not Precise for a rooftop result without a street number', () => {
    expect(classifyLocationPrecision({ locationType: 'ROOFTOP', resultTypes: ['premise'] })).toBe('approximate');
  });

  it('is Interpolated for a range-interpolated result', () => {
    expect(
      classifyLocationPrecision({
        locationType: 'RANGE_INTERPOLATED',
        resultTypes: ['street_address'],
        streetNumber: '12',
      })
    ).toBe('interpolated');
  });

  it.each(['GEOMETRIC_CENTER', 'APPROXIMATE'])('is Approximate for a %s result', (locationType) => {
    expect(classifyLocationPrecision({ locationType, resultTypes: ['street_address'], streetNumber: '12' })).toBe(
      'approximate'
    );
  });

  it.each(['route', 'locality'])('is Approximate when the top result is a %s, whatever its location type', (type) => {
    expect(classifyLocationPrecision({ locationType: 'ROOFTOP', resultTypes: [type, 'political'], streetNumber: '12' })).toBe(
      'approximate'
    );
  });

  it('is Approximate for a partial match, even at rooftop precision', () => {
    expect(
      classifyLocationPrecision({
        locationType: 'ROOFTOP',
        resultTypes: ['street_address'],
        partialMatch: true,
        streetNumber: '12',
      })
    ).toBe('approximate');
  });

  it('is Approximate when Google gives no location type', () => {
    expect(classifyLocationPrecision({})).toBe('approximate');
  });
});

describe('parseAddressComponents', () => {
  it('picks the street number, street, suburb and postcode', () => {
    expect(parseAddressComponents(COMPONENTS)).toEqual({
      streetNumber: '12',
      street: 'Smith Street',
      suburb: 'Fitzroy',
      postcode: '3065',
    });
  });

  it('leaves out components Google did not return', () => {
    expect(parseAddressComponents([{ long_name: 'Fitzroy', types: ['locality'] }])).toEqual({ suburb: 'Fitzroy' });
    expect(parseAddressComponents(undefined)).toEqual({});
  });
});

const GEOCODED: GeocodedLocation = {
  formattedAddress: '12 Smith St, Fitzroy VIC 3065, Australia',
  latitude: -37.8,
  longitude: 144.98,
  locationPrecision: 'precise',
  locationType: 'ROOFTOP',
  resultTypes: ['street_address'],
  partialMatch: false,
  addressComponents: { streetNumber: '12', street: 'Smith Street', suburb: 'Fitzroy', postcode: '3065' },
};

describe('stopLocationFields', () => {
  it('maps a geocode onto the Stop location fields', () => {
    expect(stopLocationFields(GEOCODED)).toEqual({
      latitude: -37.8,
      longitude: 144.98,
      formattedAddress: '12 Smith St, Fitzroy VIC 3065, Australia',
      locationPrecision: 'precise',
      geocodeLocationType: 'ROOFTOP',
      geocodeResultTypes: ['street_address'],
      geocodePartialMatch: false,
      addressStreetNumber: '12',
      addressStreet: 'Smith Street',
      addressSuburb: 'Fitzroy',
      addressPostcode: '3065',
    });
  });

  it('writes only coordinates when the geocode carries no precision signals', () => {
    expect(stopLocationFields({ formattedAddress: 'x', latitude: 1, longitude: 2 })).toEqual({
      formattedAddress: 'x',
      latitude: 1,
      longitude: 2,
    });
  });
});

describe('stopLocationUpdate', () => {
  it('applies a re-geocode to a Stop that is not Confirmed', () => {
    expect(stopLocationUpdate({ locationPrecision: 'approximate' }, GEOCODED)).toEqual(stopLocationFields(GEOCODED));
    expect(stopLocationUpdate(undefined, GEOCODED)).toEqual(stopLocationFields(GEOCODED));
  });

  it('never moves a Confirmed Stop or changes its precision', () => {
    const update = stopLocationUpdate({ locationPrecision: 'confirmed' }, { ...GEOCODED, locationPrecision: 'approximate' });

    expect(update).toEqual({
      addressStreetNumber: '12',
      addressStreet: 'Smith Street',
      addressSuburb: 'Fitzroy',
      addressPostcode: '3065',
    });
  });
});

describe('pickStopLocationFields', () => {
  it('keeps only the Stop location fields that are set', () => {
    const source = { ...stopLocationFields(GEOCODED), address: '12 Smith St', notes: 'gate code 1234', resolvedLocation: GEOCODED };

    expect(pickStopLocationFields(source)).toEqual(stopLocationFields(GEOCODED));
    expect(pickStopLocationFields({ latitude: 1, longitude: 2, locationPrecision: null })).toEqual({ latitude: 1, longitude: 2 });
  });
});

describe('locationPrecisionIndicator', () => {
  it('flags Interpolated subtly and Approximate clearly', () => {
    expect(locationPrecisionIndicator('interpolated')).toEqual({ level: 'subtle', label: 'Interpolated location' });
    expect(locationPrecisionIndicator('approximate')).toEqual({ level: 'clear', label: 'Approximate location' });
  });

  it.each(['precise', 'confirmed', null, undefined])('shows nothing for %s', (precision) => {
    expect(locationPrecisionIndicator(precision)).toBeNull();
  });
});
