'use client';

import { MapContainer, TileLayer, CircleMarker, Polyline, Tooltip } from 'react-leaflet';
import type { Stop } from '@/amplify/types';
import styles from './RouteStopsMap.module.css';

interface RouteStopsMapProps {
  stops: Stop[];
}

type StopWithCoords = Stop & { latitude: number; longitude: number };

function hasCoordinates(stop: Stop): stop is StopWithCoords {
  return typeof stop.latitude === 'number' && typeof stop.longitude === 'number';
}

function markerColor(serviceType?: string | null) {
  if (serviceType === 'pickup') return '#52c0ff';
  if (serviceType === 'inspection') return '#39d98a';
  return '#00e5ff';
}

export function RouteStopsMap({ stops }: RouteStopsMapProps) {
  const orderedStops = [...stops].sort((a, b) => (a.sequence ?? 0) - (b.sequence ?? 0));
  const mappedStops = orderedStops.filter(hasCoordinates);

  if (orderedStops.length === 0) {
    return (
      <div className={styles.emptyState}>
        Add stops to see route order and map preview.
      </div>
    );
  }

  if (mappedStops.length === 0) {
    return (
      <div className={styles.emptyState}>
        Stops exist, but none have coordinates yet. Edit or re-save a stop to geocode it.
      </div>
    );
  }

  const center: [number, number] = [mappedStops[0].latitude, mappedStops[0].longitude];
  const polylinePositions: Array<[number, number]> = mappedStops.map((stop) => [
    stop.latitude,
    stop.longitude,
  ]);

  return (
    <div className={styles.wrapper}>
      <MapContainer center={center} zoom={12} scrollWheelZoom className={styles.map}>
        <TileLayer
          attribution='&copy; OpenStreetMap contributors'
          url='https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png'
        />

        <Polyline positions={polylinePositions} pathOptions={{ color: '#00e5ff', weight: 4 }} />

        {mappedStops.map((stop) => (
          <CircleMarker
            key={stop.id}
            center={[stop.latitude, stop.longitude]}
            radius={10}
            pathOptions={{ color: '#10131a', weight: 1, fillColor: markerColor(stop.serviceType), fillOpacity: 0.95 }}
          >
            <Tooltip permanent direction='center' opacity={1}>
              <span className={styles.sequenceLabel}>{stop.sequence ?? '?'}</span>
            </Tooltip>
            <Tooltip direction='top' offset={[0, -12]} opacity={0.95}>
              <span>{stop.formattedAddress || stop.address || 'Unknown address'}</span>
            </Tooltip>
          </CircleMarker>
        ))}
      </MapContainer>

      <div className={styles.addressRail}>
        {orderedStops.map((stop) => (
          <div key={stop.id} className={styles.addressItem}>
            <span className={styles.sequenceChip}>{stop.sequence ?? '?'}</span>
            <span className={styles.addressText}>{stop.formattedAddress || stop.address || 'Unknown address'}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
