import { locateEditedStop, locateNewStop } from './stopLocation';
import { geocodeAddress } from './googleMaps';
import { stopLocationFields, type GeocodedLocation } from './locationPrecision';

jest.mock('./googleMaps', () => ({
  geocodeAddress: jest.fn(),
}));

const PICKED: GeocodedLocation = {
  formattedAddress: '12 Smith St, Fitzroy VIC 3065, Australia',
  latitude: -37.8,
  longitude: 144.98,
  locationPrecision: 'precise',
  locationType: 'ROOFTOP',
  resultTypes: ['street_address'],
  partialMatch: false,
  addressComponents: { streetNumber: '12', street: 'Smith Street', suburb: 'Fitzroy', postcode: '3065' },
};

const GEOCODED: GeocodedLocation = {
  ...PICKED,
  formattedAddress: '14 Smith St, Fitzroy VIC 3065, Australia',
  latitude: -37.81,
  locationPrecision: 'approximate',
  locationType: 'GEOMETRIC_CENTER',
  addressComponents: { streetNumber: '14', street: 'Smith Street', suburb: 'Fitzroy', postcode: '3065' },
};

beforeEach(() => {
  (geocodeAddress as jest.Mock).mockReset().mockResolvedValue(GEOCODED);
});

describe('locateNewStop', () => {
  it('uses the autocomplete pick without geocoding again', async () => {
    await expect(locateNewStop({ address: '12 Smith St', resolvedLocation: PICKED })).resolves.toEqual(
      stopLocationFields(PICKED)
    );
    expect(geocodeAddress).not.toHaveBeenCalled();
  });

  it('geocodes a typed address, recording its precision and address components', async () => {
    await expect(locateNewStop({ address: '14 Smith St' })).resolves.toEqual(stopLocationFields(GEOCODED));
    expect(geocodeAddress).toHaveBeenCalledWith('14 Smith St');
  });
});

describe('locateEditedStop', () => {
  const located = { address: '12 Smith St', latitude: -37.8, longitude: 144.98, locationPrecision: 'precise' };

  it('changes nothing about the location when the address is unchanged (#58)', async () => {
    await expect(locateEditedStop(located, { address: ' 12 Smith St ' })).resolves.toEqual({});
    expect(geocodeAddress).not.toHaveBeenCalled();
  });

  it('re-geocodes a changed address', async () => {
    await expect(locateEditedStop(located, { address: '14 Smith St' })).resolves.toEqual(stopLocationFields(GEOCODED));
  });

  it('geocodes an unchanged address that never had coordinates', async () => {
    await expect(locateEditedStop({ address: '14 Smith St' }, { address: '14 Smith St' })).resolves.toEqual(
      stopLocationFields(GEOCODED)
    );
  });

  it('applies a new autocomplete pick', async () => {
    await expect(locateEditedStop(located, { address: '12 Smith St', resolvedLocation: PICKED })).resolves.toEqual(
      stopLocationFields(PICKED)
    );
  });

  it('leaves a Confirmed Stop where it is, whatever the geocode says', async () => {
    const confirmed = { ...located, locationPrecision: 'confirmed' };

    for (const values of [{ address: '14 Smith St' }, { address: '12 Smith St', resolvedLocation: PICKED }]) {
      const update = await locateEditedStop(confirmed, values);
      expect(update).not.toHaveProperty('latitude');
      expect(update).not.toHaveProperty('longitude');
      expect(update).not.toHaveProperty('locationPrecision');
    }
  });
});
