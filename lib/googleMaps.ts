export interface GeocodedAddress {
  formattedAddress: string;
  latitude: number;
  longitude: number;
}

interface GeocodeResponse {
  status: string;
  error_message?: string;
  results?: Array<{
    formatted_address?: string;
    geometry?: {
      location?: {
        lat?: number;
        lng?: number;
      };
    };
  }>;
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
  const apiKey = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY;
  if (!apiKey) {
    throw new Error('Google Maps API key is missing. Set NEXT_PUBLIC_GOOGLE_MAPS_API_KEY.');
  }

  const trimmedAddress = address.trim();
  if (!trimmedAddress) {
    throw new Error('Address is required.');
  }

  if (typeof window !== 'undefined') {
    await loadGoogleMapsScript();

    const googleMaps = (window as Window & { google?: any }).google;
    const mapsApi = googleMaps?.maps;
    if (!mapsApi) {
      throw new Error('Google Maps library is unavailable in the browser context.');
    }

    let geocoder: { geocode: (request: { address: string }, callback: (results: any[], status: string) => void) => void };
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

    const result = await new Promise<GeocodeResponse>((resolve, reject) => {
      geocoder.geocode({ address: trimmedAddress }, (results: any[], status: string) => {
        if (status === mapsApi.GeocoderStatus.OK && results) {
          resolve({
            status: 'OK',
            results: results.map((item: any) => ({
              formatted_address: item.formatted_address,
              geometry: {
                location: {
                  lat: item.geometry?.location?.lat(),
                  lng: item.geometry?.location?.lng(),
                },
              },
            })),
          });
          return;
        }

        reject(new Error(`Address could not be validated.${status ? ` ${status}` : ''}`.trim()));
      });
    });

    const topResult = result.results?.[0];
    const lat = topResult?.geometry?.location?.lat;
    const lng = topResult?.geometry?.location?.lng;
    const formattedAddress = topResult?.formatted_address;

    if (typeof lat !== 'number' || typeof lng !== 'number' || !formattedAddress) {
      throw new Error('Address validation returned incomplete location data.');
    }

    return {
      formattedAddress,
      latitude: lat,
      longitude: lng,
    };
  }

  const params = new URLSearchParams({
    address: trimmedAddress,
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

  const topResult = payload.results[0];
  const lat = topResult.geometry?.location?.lat;
  const lng = topResult.geometry?.location?.lng;
  const formattedAddress = topResult.formatted_address;

  if (typeof lat !== 'number' || typeof lng !== 'number' || !formattedAddress) {
    throw new Error('Address validation returned incomplete location data.');
  }

  return {
    formattedAddress,
    latitude: lat,
    longitude: lng,
  };
}
