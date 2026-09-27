import {
  assessStop,
  classifyLocationPrecision,
  parseAddressComponents,
  parseArgs,
  selectAssessCandidates,
  summarizeAssessment,
  toGeocodedLocation,
} from '../backfill-geocodes.js';
import * as app from '../../lib/locationPrecision';

const COMPONENTS = [
  { long_name: '12', short_name: '12', types: ['street_number'] },
  { long_name: 'Smith Street', short_name: 'Smith St', types: ['route'] },
  { long_name: 'Fitzroy', short_name: 'Fitzroy', types: ['locality', 'political'] },
  { long_name: '3065', short_name: '3065', types: ['postal_code'] },
];

const RESULT = {
  formatted_address: '12 Smith St, Fitzroy VIC 3065, Australia',
  geometry: { location: { lat: -37.8, lng: 144.98 }, location_type: 'ROOFTOP' },
  types: ['street_address'],
  address_components: COMPONENTS,
};

describe('mirrors lib/locationPrecision.ts', () => {
  it.each([
    { locationType: 'ROOFTOP', resultTypes: ['street_address'], streetNumber: '12' },
    { locationType: 'ROOFTOP', resultTypes: ['premise'] },
    { locationType: 'RANGE_INTERPOLATED', resultTypes: ['street_address'], streetNumber: '12' },
    { locationType: 'GEOMETRIC_CENTER', resultTypes: ['street_address'], streetNumber: '12' },
    { locationType: 'APPROXIMATE', resultTypes: ['street_address'], streetNumber: '12' },
    { locationType: 'ROOFTOP', resultTypes: ['route'], streetNumber: '12' },
    { locationType: 'ROOFTOP', resultTypes: ['locality', 'political'], streetNumber: '12' },
    { locationType: 'ROOFTOP', resultTypes: ['street_address'], partialMatch: true, streetNumber: '12' },
    {},
  ])('classifies %j the same as the app', (signals) => {
    expect(classifyLocationPrecision(signals)).toBe(app.classifyLocationPrecision(signals));
  });

  it('parses address components the same as the app', () => {
    expect(parseAddressComponents(COMPONENTS)).toEqual(app.parseAddressComponents(COMPONENTS));
    expect(parseAddressComponents(undefined)).toEqual(app.parseAddressComponents(undefined));
  });
});

describe('toGeocodedLocation', () => {
  it('carries the precision signals from a REST result', () => {
    expect(toGeocodedLocation(RESULT)).toEqual({
      formattedAddress: '12 Smith St, Fitzroy VIC 3065, Australia',
      latitude: -37.8,
      longitude: 144.98,
      locationPrecision: 'precise',
      locationType: 'ROOFTOP',
      resultTypes: ['street_address'],
      partialMatch: false,
      addressComponents: { streetNumber: '12', street: 'Smith Street', suburb: 'Fitzroy', postcode: '3065' },
    });
  });
});

describe('assessStop', () => {
  const stop = {
    id: 's1',
    address: '12 Smith St, Fitzroy VIC 3065',
    formattedAddress: 'hand-corrected',
    latitude: -37.1,
    longitude: 144.1,
  };

  it('writes only the precision level, geocode signals and address components', () => {
    expect(assessStop(stop, toGeocodedLocation(RESULT)).update).toEqual({
      id: 's1',
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

  it('never writes the address or coordinates', () => {
    const { update } = assessStop(stop, toGeocodedLocation(RESULT));
    for (const field of ['address', 'formattedAddress', 'latitude', 'longitude']) {
      expect(update).not.toHaveProperty(field);
    }
  });

  it('flags a suburb mismatch when the geocoder moved the address to another suburb', () => {
    expect(assessStop(stop, toGeocodedLocation(RESULT)).suburbMismatch).toBe(false);
    expect(assessStop({ ...stop, address: '12 Smith St, Collingwood VIC 3066' }, toGeocodedLocation(RESULT)).suburbMismatch).toBe(
      true
    );
  });

  it('matches the suburb case-insensitively and on whole words only', () => {
    const geocoded = toGeocodedLocation(RESULT);
    expect(assessStop({ ...stop, address: '12 smith st fitzroy' }, geocoded).suburbMismatch).toBe(false);
    expect(assessStop({ ...stop, address: '12 Fitzroyal St, Carlton' }, geocoded).suburbMismatch).toBe(true);
  });

  it('cannot call a mismatch when the geocoder returned no suburb', () => {
    const geocoded = toGeocodedLocation({ ...RESULT, address_components: [] });
    expect(assessStop(stop, geocoded).suburbMismatch).toBe(false);
  });
});

describe('selectAssessCandidates', () => {
  it('never touches a Confirmed Stop, and includes Stops whatever their coordinates', () => {
    const stops = [
      { id: 'a', address: '1 A St', latitude: 1, longitude: 2, locationPrecision: 'approximate' },
      { id: 'b', address: '2 B St', latitude: 1, longitude: 2, locationPrecision: 'confirmed' },
      { id: 'c', address: '3 C St' },
      { id: 'd', address: '  ' },
    ];

    expect(selectAssessCandidates(stops).map((stop: { id: string }) => stop.id)).toEqual(['a', 'c']);
  });
});

describe('summarizeAssessment', () => {
  it('counts each precision level and lists the Approximate Stops and suburb mismatches', () => {
    const assessments = [
      { stop: { id: 'a', address: '1 A St' }, update: { locationPrecision: 'precise' }, suburbMismatch: false },
      { stop: { id: 'b', address: '2 B St' }, update: { locationPrecision: 'approximate' }, suburbMismatch: false },
      { stop: { id: 'c', address: '3 C St' }, update: { locationPrecision: 'interpolated' }, suburbMismatch: true },
      { stop: { id: 'd', address: '4 D St' }, update: { locationPrecision: 'approximate' }, suburbMismatch: true },
    ];

    expect(summarizeAssessment(assessments)).toEqual({
      counts: { precise: 1, interpolated: 1, approximate: 2 },
      approximate: [assessments[1].stop, assessments[3].stop],
      suburbMismatches: [assessments[2].stop, assessments[3].stop],
    });
  });
});

describe('parseArgs', () => {
  it('reads --assess alongside the existing dry-run / apply modes', () => {
    expect(parseArgs(['node', 'script', '--assess'])).toMatchObject({ assess: true, mode: 'dry-run' });
    expect(parseArgs(['node', 'script', '--assess', '--mode', 'apply', '--confirm-apply'])).toMatchObject({
      assess: true,
      mode: 'apply',
      confirmApply: true,
    });
    expect(parseArgs(['node', 'script', '--customer-id', 'c1'])).toMatchObject({ assess: false });
  });
});
