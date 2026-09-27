import { locateEditedStop, locateNewStop } from './stopLocation';
import { geocodeAddress } from './googleMaps';
import { stopLocationFields, type GeocodedLocation } from './locationPrecision';
import { propertyKey } from './propertyKey';
import { getConfirmedPin } from './propertyLocations';

jest.mock('./googleMaps', () => ({
  geocodeAddress: jest.fn(),
}));

jest.mock('./propertyLocations', () => ({
  getConfirmedPin: jest.fn(),
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

/** What a Stop at this address, located by this geocode, should get. */
function locatedAt(address: string, geocoded: GeocodedLocation) {
  return { ...stopLocationFields(geocoded), propertyKey: propertyKey(address, geocoded.addressComponents ?? {}) };
}

beforeEach(() => {
  (geocodeAddress as jest.Mock).mockReset().mockResolvedValue(GEOCODED);
  (getConfirmedPin as jest.Mock).mockReset().mockResolvedValue(null);
});

describe('locateNewStop', () => {
  it('uses the autocomplete pick without geocoding again', async () => {
    await expect(locateNewStop({ address: '12 Smith St', resolvedLocation: PICKED })).resolves.toEqual(
      locatedAt('12 Smith St', PICKED)
    );
    expect(geocodeAddress).not.toHaveBeenCalled();
  });

  it('geocodes a typed address, recording its precision and address components', async () => {
    await expect(locateNewStop({ address: '14 Smith St' })).resolves.toEqual(locatedAt('14 Smith St', GEOCODED));
    expect(geocodeAddress).toHaveBeenCalledWith('14 Smith St');
  });
});

describe('Property key (#287)', () => {
  it('keys a new Stop by its entered address and geocoded components', async () => {
    await expect(locateNewStop({ address: '14 Smith St, Fitzroy VIC 3065' })).resolves.toMatchObject({
      propertyKey: 'fitzroy|3065|smith street|14',
    });
  });

  it('re-keys an edited Stop whose address changed, even a Confirmed one', async () => {
    const confirmed = { address: '12 Smith St', latitude: -37.8, longitude: 144.98, locationPrecision: 'confirmed' };

    await expect(locateEditedStop(confirmed, { address: '14 Smith St, Fitzroy' })).resolves.toMatchObject({
      propertyKey: 'fitzroy|3065|smith street|14',
    });
  });

  it('keys by the entered address alone when the geocode carries no address components', async () => {
    (geocodeAddress as jest.Mock).mockResolvedValue({ formattedAddress: 'x', latitude: 1, longitude: 2 });

    await expect(locateNewStop({ address: '14 Smith St, Fitzroy' })).resolves.toMatchObject({
      propertyKey: 'fitzroy||smith street|14',
    });
    await expect(locateNewStop({ address: '14 Smith St' })).resolves.not.toHaveProperty('propertyKey');
  });
});

describe('locateEditedStop', () => {
  const located = { address: '12 Smith St', latitude: -37.8, longitude: 144.98, locationPrecision: 'precise' };

  it('changes nothing about the location when the address is unchanged (#58)', async () => {
    await expect(locateEditedStop(located, { address: ' 12 Smith St ' })).resolves.toEqual({});
    expect(geocodeAddress).not.toHaveBeenCalled();
  });

  it('re-geocodes a changed address', async () => {
    await expect(locateEditedStop(located, { address: '14 Smith St' })).resolves.toEqual(locatedAt('14 Smith St', GEOCODED));
  });

  it('geocodes an unchanged address that never had coordinates', async () => {
    await expect(locateEditedStop({ address: '14 Smith St' }, { address: '14 Smith St' })).resolves.toEqual(
      locatedAt('14 Smith St', GEOCODED)
    );
  });

  it('applies a new autocomplete pick', async () => {
    await expect(locateEditedStop(located, { address: '12 Smith St', resolvedLocation: PICKED })).resolves.toEqual(
      locatedAt('12 Smith St', PICKED)
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

describe('a Confirmed Property (#286)', () => {
  const CONFIRMED_PIN = { latitude: -37.9, longitude: 145.0 };

  beforeEach(() => {
    (getConfirmedPin as jest.Mock).mockResolvedValue(CONFIRMED_PIN);
  });

  it("gives a new Stop at the address the Property's Confirmed pin, not the geocode", async () => {
    const located = await locateNewStop({ address: '14 Smith St, Fitzroy VIC 3065' });

    expect(getConfirmedPin).toHaveBeenCalledWith('fitzroy|3065|smith street|14');
    expect(located).toMatchObject({ ...CONFIRMED_PIN, locationPrecision: 'confirmed', propertyKey: 'fitzroy|3065|smith street|14' });
  });

  it('gives an edited Stop moved to the address the Confirmed pin too', async () => {
    const located = { address: '12 Smith St', latitude: -37.8, longitude: 144.98, locationPrecision: 'precise' };

    await expect(locateEditedStop(located, { address: '14 Smith St, Fitzroy' })).resolves.toMatchObject({
      ...CONFIRMED_PIN,
      locationPrecision: 'confirmed',
    });
  });

  it("doesn't look up a Stop with no Property key", async () => {
    (geocodeAddress as jest.Mock).mockResolvedValue({ formattedAddress: 'x', latitude: 1, longitude: 2 });

    await expect(locateNewStop({ address: 'Smith St' })).resolves.toMatchObject({ latitude: 1, longitude: 2 });
    expect(getConfirmedPin).not.toHaveBeenCalled();
  });

  it('fails the write when the lookup fails, as a failed geocode does', async () => {
    (getConfirmedPin as jest.Mock).mockRejectedValue(new Error('offline'));

    await expect(locateNewStop({ address: '14 Smith St, Fitzroy' })).rejects.toThrow('offline');
  });
});
