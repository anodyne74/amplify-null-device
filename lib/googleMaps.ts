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

export async function geocodeAddress(address: string): Promise<GeocodedAddress> {
  const apiKey = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY;
  if (!apiKey) {
    throw new Error('Google Maps API key is missing. Set NEXT_PUBLIC_GOOGLE_MAPS_API_KEY.');
  }

  const trimmedAddress = address.trim();
  if (!trimmedAddress) {
    throw new Error('Address is required.');
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
