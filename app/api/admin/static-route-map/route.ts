import { NextResponse } from 'next/server';

interface StaticMapMarker {
  latitude: number;
  longitude: number;
  sequence?: number | null;
}

function toMarkerLabel(sequence: number | null | undefined, index: number) {
  if (typeof sequence === 'number' && Number.isFinite(sequence) && sequence > 0) {
    return String(sequence % 10);
  }
  return String((index + 1) % 10);
}

export async function POST(request: Request) {
  const googleMapsApiKey = process.env.GOOGLE_MAPS_API_KEY || process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY;
  if (!googleMapsApiKey) {
    return NextResponse.json({ error: 'Google Maps API key is not configured.' }, { status: 500 });
  }

  let markers: StaticMapMarker[] = [];

  try {
    const body = await request.json();
    markers = Array.isArray(body?.markers) ? body.markers : [];
  } catch {
    return NextResponse.json({ error: 'Invalid request payload.' }, { status: 400 });
  }

  const normalizedMarkers = markers
    .filter(
      (marker) =>
        marker &&
        typeof marker.latitude === 'number' &&
        Number.isFinite(marker.latitude) &&
        typeof marker.longitude === 'number' &&
        Number.isFinite(marker.longitude)
    )
    .slice(0, 120);

  if (normalizedMarkers.length === 0) {
    return NextResponse.json({ error: 'At least one valid marker is required.' }, { status: 400 });
  }

  const params = new URLSearchParams({
    size: '960x540',
    scale: '2',
    maptype: 'roadmap',
    key: googleMapsApiKey,
  });

  const path = `weight:3|color:0x1d4ed8AA|${normalizedMarkers
    .map((marker) => `${marker.latitude},${marker.longitude}`)
    .join('|')}`;
  params.append('path', path);

  normalizedMarkers.forEach((marker, index) => {
    const label = toMarkerLabel(marker.sequence, index);
    params.append('markers', `color:0x0ea5e9|label:${label}|${marker.latitude},${marker.longitude}`);
  });

  const mapUrl = `https://maps.googleapis.com/maps/api/staticmap?${params.toString()}`;

  try {
    const mapResponse = await fetch(mapUrl, { cache: 'no-store' });
    if (!mapResponse.ok) {
      return NextResponse.json({ error: 'Failed to fetch static map image.' }, { status: 502 });
    }

    const contentType = mapResponse.headers.get('content-type') || 'image/png';
    const imageBuffer = await mapResponse.arrayBuffer();

    return new Response(imageBuffer, {
      status: 200,
      headers: {
        'Content-Type': contentType,
        'Cache-Control': 'no-store',
      },
    });
  } catch {
    return NextResponse.json({ error: 'Unable to generate static map image.' }, { status: 500 });
  }
}
