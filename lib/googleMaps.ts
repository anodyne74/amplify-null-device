import {
  classifyLocationPrecision,
  parseAddressComponents,
  type AddressComponents,
  type GeocodedLocation,
  type GeocodedPrecision,
  type GoogleAddressComponent,
} from './locationPrecision';

/** A geocoded address with its Location Precision (lib/locationPrecision.ts). */
export interface GeocodedAddress extends GeocodedLocation {
  locationPrecision: GeocodedPrecision;
  resultTypes: string[];
  partialMatch: boolean;
  addressComponents: AddressComponents;
}

type GeocodeRequest = { address: string } | { placeId: string };

interface GeocodeResult {
  formatted_address?: string;
  geometry?: {
    location?: {
      lat?: number;
      lng?: number;
    };
    location_type?: string;
  };
  types?: string[];
  partial_match?: boolean;
  address_components?: GoogleAddressComponent[];
}

interface GeocodeResponse {
  status: string;
  error_message?: string;
  results?: GeocodeResult[];
}

const GEOCODE_TIMEOUT_MS = 15000;

function withTimeout<T>(promise: Promise<T>, ms: number, message: string): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(message)), ms);
    promise.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (err) => {
        clearTimeout(timer);
        reject(err);
      }
    );
  });
}

let _mapsScriptPromise: Promise<void> | null = null;

/**
 * Lazily loads the Google Maps JavaScript API (with Places library) once.
 * Safe to call multiple times — returns the same promise after first call.
 */
export function loadGoogleMapsScript(): Promise<void> {
  if (typeof window === 'undefined') return Promise.resolve();
  // Already loaded
  if ((window as any).google?.maps?.places) return Promise.resolve();
  if (_mapsScriptPromise) return _mapsScriptPromise;

  _mapsScriptPromise = new Promise((resolve, reject) => {
    const apiKey = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY;
    if (!apiKey) {
      reject(new Error('Google Maps API key is missing. Set NEXT_PUBLIC_GOOGLE_MAPS_API_KEY.'));
      return;
    }
    const script = document.createElement('script');
    script.src = `https://maps.googleapis.com/maps/api/js?key=${apiKey}&libraries=places&loading=async&v=weekly`;
    script.async = true;
    script.defer = true;
    script.onload = () => resolve();
    script.onerror = () => reject(new Error('Failed to load Google Maps script.'));
    document.head.appendChild(script);
  });
  return _mapsScriptPromise;
}

export async function geocodeAddress(address: string): Promise<GeocodedAddress> {
  const trimmedAddress = address.trim();
  if (!trimmedAddress) {
    throw new Error('Address is required.');
  }
  return geocode({ address: trimmedAddress });
}

/** Geocodes an autocomplete pick by its place ID, so it gets the same precision signals as a typed address. */
export async function geocodePlaceId(placeId: string): Promise<GeocodedAddress> {
  return geocode({ placeId });
}

async function geocode(request: GeocodeRequest): Promise<GeocodedAddress> {
  const apiKey = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY;
  if (!apiKey) {
    throw new Error('Google Maps API key is missing. Set NEXT_PUBLIC_GOOGLE_MAPS_API_KEY.');
  }

  if (typeof window !== 'undefined') {
    return toGeocodedAddress((await geocodeInBrowser(request))[0]);
  }

  const params = new URLSearchParams({
    ...('placeId' in request ? { place_id: request.placeId } : { address: request.address }),
    key: apiKey,
  });

  const response = await fetch(`https://maps.googleapis.com/maps/api/geocode/json?${params.toString()}`);
  if (!response.ok) {
    throw new Error('Failed to validate address with Google Geocoding API.');
  }

  const payload = (await response.json()) as GeocodeResponse;
  if (payload.status !== 'OK' || !payload.results || payload.results.length === 0) {
    const reason = payload.error_message ? ` ${payload.error_message}` : '';
    throw new Error(`Address could not be validated.${reason}`.trim());
  }

  return toGeocodedAddress(payload.results[0]);
}

async function geocodeInBrowser(request: GeocodeRequest): Promise<GeocodeResult[]> {
  await withTimeout(
    loadGoogleMapsScript(),
    GEOCODE_TIMEOUT_MS,
    'Google Maps script timed out loading. Check your network connection or ad-blocker and try again.'
  );

  const googleMaps = (window as Window & { google?: any }).google;
  const mapsApi = googleMaps?.maps;
  if (!mapsApi) {
    throw new Error('Google Maps library is unavailable in the browser context.');
  }

  let geocoder: { geocode: (request: GeocodeRequest, callback: (results: any[], status: string) => void) => void };
  if (typeof mapsApi.Geocoder === 'function') {
    geocoder = new mapsApi.Geocoder();
  } else if (typeof mapsApi.importLibrary === 'function') {
    const geocodingLib = await mapsApi.importLibrary('geocoding');
    const GeocoderCtor = (geocodingLib as { Geocoder?: new () => any })?.Geocoder;
    if (typeof GeocoderCtor !== 'function') {
      throw new Error('Google Maps geocoding library failed to initialize.');
    }
    geocoder = new GeocoderCtor();
  } else {
    throw new Error('Google Maps geocoder is unavailable.');
  }

  return withTimeout(
    new Promise<GeocodeResult[]>((resolve, reject) => {
      geocoder.geocode(request, (results: any[], status: string) => {
        if (status === mapsApi.GeocoderStatus.OK && results) {
          // The JS API returns lat/lng as functions; normalise to the REST shape.
          resolve(
            results.map((item: any) => ({
              ...item,
              geometry: {
                location: {
                  lat: item.geometry?.location?.lat(),
                  lng: item.geometry?.location?.lng(),
                },
                location_type: item.geometry?.location_type,
              },
            }))
          );
          return;
        }

        reject(new Error(`Address could not be validated.${status ? ` ${status}` : ''}`.trim()));
      });
    }),
    GEOCODE_TIMEOUT_MS,
    'Address validation timed out. Please try again.'
  );
}

function toGeocodedAddress(result: GeocodeResult | undefined): GeocodedAddress {
  const lat = result?.geometry?.location?.lat;
  const lng = result?.geometry?.location?.lng;
  const formattedAddress = result?.formatted_address;

  if (typeof lat !== 'number' || typeof lng !== 'number' || !formattedAddress) {
    throw new Error('Address validation returned incomplete location data.');
  }

  const locationType = result?.geometry?.location_type;
  const resultTypes = result?.types ?? [];
  const partialMatch = result?.partial_match === true;
  const addressComponents = parseAddressComponents(result?.address_components);

  return {
    formattedAddress,
    latitude: lat,
    longitude: lng,
    locationPrecision: classifyLocationPrecision({
      locationType,
      resultTypes,
      partialMatch,
      streetNumber: addressComponents.streetNumber,
    }),
    ...(locationType ? { locationType } : {}),
    resultTypes,
    partialMatch,
    addressComponents,
  };
}
