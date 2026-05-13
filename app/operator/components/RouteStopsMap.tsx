'use client';

import { useEffect, useRef, useState } from 'react';
import type { Map as LeafletMap } from 'leaflet';
import type { Stop } from '@/amplify/types';
import { getMapTheme, type MapTheme } from '@/lib/mapThemes';
import styles from './RouteStopsMap.module.css';

interface RouteStopsMapProps {
  stops: Stop[];
  activeStopId?: string | null;
  currentPosition?: { latitude: number; longitude: number } | null;
  mapTheme?: MapTheme;
}

type StopWithCoords = Stop & { latitude: number; longitude: number };
type DevicePosition = { latitude: number; longitude: number; accuracy?: number };

function updateViewport(
  map: LeafletMap,
  activeStop: StopWithCoords,
  devicePosition: DevicePosition | null,
  L: typeof import('leaflet')
) {
  if (!devicePosition) {
    map.setView([activeStop.latitude, activeStop.longitude], 13, { animate: true });
    return;
  }

  const bounds = L.latLngBounds([
    [activeStop.latitude, activeStop.longitude],
    [devicePosition.latitude, devicePosition.longitude],
  ]);

  map.fitBounds(bounds, {
    padding: [48, 48],
    maxZoom: 16,
    animate: true,
  });
}

function hasCoordinates(stop: Stop): stop is StopWithCoords {
  return typeof stop.latitude === 'number' && typeof stop.longitude === 'number';
}

function markerColor(serviceType?: string | null) {
  if (serviceType === 'pickup') return '#52c0ff';
  if (serviceType === 'inspection') return '#39d98a';
  return '#00e5ff';
}

export function RouteStopsMap({ stops, activeStopId, currentPosition, mapTheme = 'light' }: RouteStopsMapProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<LeafletMap | null>(null);
  const leafletRef = useRef<typeof import('leaflet') | null>(null);
  const [devicePosition, setDevicePosition] = useState<DevicePosition | null>(null);

  // Use provided currentPosition, or fallback to device geolocation if not provided
  const displayPosition = currentPosition 
    ? { latitude: currentPosition.latitude, longitude: currentPosition.longitude, accuracy: undefined } 
    : devicePosition;

  const orderedStops = [...stops].sort((a, b) => (a.sequence ?? 0) - (b.sequence ?? 0));
  const mappedStops = orderedStops.filter(hasCoordinates);
  const selectedMapTheme = getMapTheme(mapTheme);

  // Only set up independent geolocation if currentPosition is not provided
  useEffect(() => {
    if (currentPosition || !('geolocation' in navigator)) return;

    const watchId = navigator.geolocation.watchPosition(
      (position) => {
        setDevicePosition({
          latitude: position.coords.latitude,
          longitude: position.coords.longitude,
          accuracy: position.coords.accuracy,
        });
      },
      () => {
        setDevicePosition(null);
      },
      {
        enableHighAccuracy: true,
        maximumAge: 10000,
        timeout: 10000,
      }
    );

    return () => navigator.geolocation.clearWatch(watchId);
  }, [currentPosition]);

  useEffect(() => {
    if (!containerRef.current || mappedStops.length === 0) return;

    // cancelled flag prevents the async import callback from running after cleanup
    let cancelled = false;

    import('leaflet').then((mod) => {
      if (cancelled || !containerRef.current) return;

      const L = mod.default;
      leafletRef.current = L;

      // Destroy any existing instance before creating a new one.
      // This handles both React StrictMode double-mount and stops changing.
      if (mapRef.current) {
        mapRef.current.remove();
        mapRef.current = null;
      }

      const activeStop = mappedStops.find((stop) => stop.id === activeStopId) ?? mappedStops.find((stop) => !stop.actualDepartureTime) ?? mappedStops[0];
      const map = L.map(containerRef.current, { scrollWheelZoom: true });
      mapRef.current = map;

      L.tileLayer(selectedMapTheme.tileUrl, {
        attribution: selectedMapTheme.attribution,
        maxZoom: 20,
      }).addTo(map);

      const positions = mappedStops.map((s): [number, number] => [s.latitude, s.longitude]);
      L.polyline(positions, { color: '#1a73e8', weight: 5, opacity: 0.45 }).addTo(map);

      mappedStops.forEach((stop) => {
        const isCompleted = Boolean(stop.actualDepartureTime);
        const isActive = stop.id === activeStop.id;

        if (isActive) {
          L.circleMarker([stop.latitude, stop.longitude], {
            radius: 24,
            color: '#fbbf24',
            weight: 4,
            fillOpacity: 0,
            opacity: 1,
          }).addTo(map);
        }

        const circle = L.circleMarker([stop.latitude, stop.longitude], {
          radius: isActive ? 21 : 18,
          color: isActive ? '#fbbf24' : '#1a73e8',
          weight: isActive ? 3 : 1,
          fillColor: markerColor(stop.serviceType),
          fillOpacity: isCompleted ? 0.22 : 0.95,
          opacity: isCompleted ? 0.35 : 1,
        }).addTo(map);

        // Permanent centred sequence label
        circle.bindTooltip(String(stop.sequence ?? '?'), {
          permanent: true,
          direction: 'center',
          opacity: 1,
          className: styles.sequenceLabel,
        });

        // Address shown on hover
        circle.on('mouseover', () => {
          circle.unbindTooltip();
          circle.bindTooltip(stop.formattedAddress || stop.address || 'Unknown address', {
            direction: 'top',
            offset: [0, -12],
            opacity: 0.95,
          }).openTooltip();
        });
        circle.on('mouseout', () => {
          circle.unbindTooltip();
          circle.bindTooltip(String(stop.sequence ?? '?'), {
            permanent: true,
            direction: 'center',
            opacity: 1,
            className: styles.sequenceLabel,
          });
        });
      });

      if (displayPosition) {
        L.circle([displayPosition.latitude, displayPosition.longitude], {
          radius: Math.max(displayPosition.accuracy ?? 20, 20),
          color: '#2563eb',
          weight: 1,
          fillColor: '#60a5fa',
          fillOpacity: 0.12,
        }).addTo(map);

        L.circleMarker([displayPosition.latitude, displayPosition.longitude], {
          radius: 8,
          color: '#ffffff',
          weight: 2,
          fillColor: '#2563eb',
          fillOpacity: 1,
        })
          .addTo(map)
          .bindTooltip('Your position', {
            direction: 'top',
            offset: [0, -8],
            className: styles.deviceLabel,
          });
      }

      updateViewport(map, activeStop, displayPosition, L);
      map.invalidateSize();
    });

    return () => {
      cancelled = true;
      if (mapRef.current) {
        mapRef.current.remove();
        mapRef.current = null;
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeStopId, stops, currentPosition, mapTheme]);

  useEffect(() => {
    if (!mapRef.current || !leafletRef.current || mappedStops.length === 0) return;

    const activeStop = mappedStops.find((stop) => stop.id === activeStopId) ?? mappedStops.find((stop) => !stop.actualDepartureTime) ?? mappedStops[0];
    updateViewport(mapRef.current, activeStop, displayPosition, leafletRef.current);
  }, [activeStopId, currentPosition, devicePosition, mappedStops]);

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

  return (
    <div className={styles.wrapper}>
      <div ref={containerRef} className={styles.map} />
    </div>
  );
}
