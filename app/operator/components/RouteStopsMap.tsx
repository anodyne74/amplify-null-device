'use client';

import { useEffect, useRef, useState } from 'react';
import type { Circle as LeafletCircle, CircleMarker as LeafletCircleMarker, Map as LeafletMap } from 'leaflet';
import type { Stop } from '@/amplify/types';
import { getMapTheme, type MapTheme } from '@/lib/mapThemes';
import styles from './RouteStopsMap.module.css';

interface RouteStopsMapProps {
  stops: Stop[];
  activeStopId?: string | null;
  currentPosition?: { latitude: number; longitude: number } | null;
  mapTheme?: MapTheme;
  onStopSelect?: (stopId: string) => void;
}

type StopWithCoords = Stop & { latitude: number; longitude: number };
type DevicePosition = { latitude: number; longitude: number; accuracy?: number };
const MIN_POSITION_UPDATE_METERS = 5;

function distanceMeters(a: { latitude: number; longitude: number }, b: { latitude: number; longitude: number }) {
  const toRadians = (value: number) => (value * Math.PI) / 180;
  const earthRadiusMeters = 6371000;
  const dLat = toRadians(b.latitude - a.latitude);
  const dLng = toRadians(b.longitude - a.longitude);
  const lat1 = toRadians(a.latitude);
  const lat2 = toRadians(b.latitude);

  const h =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) * Math.sin(dLng / 2);

  return 2 * earthRadiusMeters * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h));
}

function calculateBearingDegrees(
  from: { latitude: number; longitude: number },
  to: { latitude: number; longitude: number }
) {
  const toRadians = (value: number) => (value * Math.PI) / 180;
  const toDegrees = (value: number) => (value * 180) / Math.PI;

  const lat1 = toRadians(from.latitude);
  const lat2 = toRadians(to.latitude);
  const dLng = toRadians(to.longitude - from.longitude);

  const y = Math.sin(dLng) * Math.cos(lat2);
  const x =
    Math.cos(lat1) * Math.sin(lat2) -
    Math.sin(lat1) * Math.cos(lat2) * Math.cos(dLng);

  const bearing = (toDegrees(Math.atan2(y, x)) + 360) % 360;
  return bearing;
}

function applyMapOrientation(map: LeafletMap, headingDegrees: number) {
  const mapPane = map.getPane('mapPane');
  if (!mapPane) return;

  const baseTransform = (mapPane.style.transform || '').replace(/\s*rotateZ\([^)]*\)/g, '');
  mapPane.style.transform = `${baseTransform} rotateZ(${-headingDegrees.toFixed(2)}deg)`;
  mapPane.style.transformOrigin = '50% 50%';
}

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

export function RouteStopsMap({
  stops,
  activeStopId,
  currentPosition,
  mapTheme = 'light',
  onStopSelect,
}: RouteStopsMapProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<LeafletMap | null>(null);
  const leafletRef = useRef<typeof import('leaflet') | null>(null);
  const deviceAccuracyRef = useRef<LeafletCircle | null>(null);
  const deviceMarkerRef = useRef<LeafletCircleMarker | null>(null);
  const lastRenderedPositionRef = useRef<{ latitude: number; longitude: number; accuracy?: number } | null>(null);
  const headingRef = useRef(0);
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
      deviceAccuracyRef.current = null;
      deviceMarkerRef.current = null;
      lastRenderedPositionRef.current = null;

      const activeStop = mappedStops.find((stop) => stop.id === activeStopId) ?? mappedStops.find((stop) => !stop.actualDepartureTime) ?? mappedStops[0];
      const map = L.map(containerRef.current, { scrollWheelZoom: true });
      mapRef.current = map;

      const syncOrientation = () => {
        applyMapOrientation(map, headingRef.current);
      };
      map.on('move zoom zoomanim resize', syncOrientation);

      L.tileLayer(selectedMapTheme.tileUrl, {
        attribution: selectedMapTheme.attribution,
        maxZoom: 20,
      }).addTo(map);

      mappedStops.forEach((stop) => {
        const isCompleted = Boolean(stop.actualDepartureTime);
        const isActive = stop.id === activeStop.id;

        const serviceClass =
          stop.serviceType === 'pickup'
            ? styles.stopMarkerPickup
            : stop.serviceType === 'inspection'
            ? styles.stopMarkerInspection
            : styles.stopMarkerDelivery;

        const markerClasses = [
          styles.stopMarker,
          serviceClass,
          isActive ? styles.stopMarkerActive : '',
          isCompleted ? styles.stopMarkerCompleted : '',
        ]
          .filter(Boolean)
          .join(' ');

        const marker = L.marker([stop.latitude, stop.longitude], {
          icon: L.divIcon({
            className: styles.stopMarkerIcon,
            html: `<span class="${markerClasses}">${String(stop.sequence ?? '?')}</span>`,
            iconSize: [36, 36],
            iconAnchor: [18, 18],
          }),
          keyboard: true,
        }).addTo(map);

        marker.bindTooltip(stop.formattedAddress || stop.address || 'Unknown address', {
          direction: 'top',
          offset: [0, -14],
          opacity: 0.95,
        });

        if (onStopSelect) {
          marker.on('click', () => onStopSelect(stop.id));
        }
      });

      if (displayPosition) {
        const accuracyCircle = L.circle([displayPosition.latitude, displayPosition.longitude], {
          radius: Math.max(displayPosition.accuracy ?? 20, 20),
          color: '#2563eb',
          weight: 1,
          fillColor: '#60a5fa',
          fillOpacity: 0.12,
        }).addTo(map);

        const positionMarker = L.circleMarker([displayPosition.latitude, displayPosition.longitude], {
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

        deviceAccuracyRef.current = accuracyCircle;
        deviceMarkerRef.current = positionMarker;
        lastRenderedPositionRef.current = {
          latitude: displayPosition.latitude,
          longitude: displayPosition.longitude,
          accuracy: displayPosition.accuracy,
        };
      }

      updateViewport(map, activeStop, displayPosition, L);
      map.invalidateSize();
      syncOrientation();
    });

    return () => {
      cancelled = true;
      if (mapRef.current) {
        mapRef.current.remove();
        mapRef.current = null;
      }
      deviceAccuracyRef.current = null;
      deviceMarkerRef.current = null;
      lastRenderedPositionRef.current = null;
      headingRef.current = 0;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeStopId, stops, mapTheme]);

  useEffect(() => {
    if (!mapRef.current || !leafletRef.current) return;

    if (!displayPosition) {
      if (deviceAccuracyRef.current) {
        deviceAccuracyRef.current.remove();
        deviceAccuracyRef.current = null;
      }
      if (deviceMarkerRef.current) {
        deviceMarkerRef.current.remove();
        deviceMarkerRef.current = null;
      }
      lastRenderedPositionRef.current = null;
      headingRef.current = 0;
      if (mapRef.current) {
        applyMapOrientation(mapRef.current, headingRef.current);
      }
      return;
    }

    const L = leafletRef.current;
    const latLng: [number, number] = [displayPosition.latitude, displayPosition.longitude];

    if (!deviceAccuracyRef.current) {
      deviceAccuracyRef.current = L.circle(latLng, {
        radius: Math.max(displayPosition.accuracy ?? 20, 20),
        color: '#2563eb',
        weight: 1,
        fillColor: '#60a5fa',
        fillOpacity: 0.12,
      }).addTo(mapRef.current);
    } else {
      deviceAccuracyRef.current.setLatLng(latLng);
      deviceAccuracyRef.current.setRadius(Math.max(displayPosition.accuracy ?? 20, 20));
    }

    if (!deviceMarkerRef.current) {
      deviceMarkerRef.current = L.circleMarker(latLng, {
        radius: 8,
        color: '#ffffff',
        weight: 2,
        fillColor: '#2563eb',
        fillOpacity: 1,
      })
        .addTo(mapRef.current)
        .bindTooltip('Your position', {
          direction: 'top',
          offset: [0, -8],
          className: styles.deviceLabel,
        });
    } else {
      const lastRendered = lastRenderedPositionRef.current;
      const movedEnough =
        !lastRendered ||
        distanceMeters(lastRendered, displayPosition) >= MIN_POSITION_UPDATE_METERS;

      if (movedEnough) {
        if (lastRendered) {
          const rawHeading = calculateBearingDegrees(lastRendered, displayPosition);
          const previousHeading = headingRef.current;
          const shortestDelta = ((rawHeading - previousHeading + 540) % 360) - 180;
          headingRef.current = (previousHeading + shortestDelta * 0.35 + 360) % 360;
          if (mapRef.current) {
            applyMapOrientation(mapRef.current, headingRef.current);
          }
        }

        deviceMarkerRef.current.setLatLng(latLng);
        deviceAccuracyRef.current.setLatLng(latLng);
      }

      const previousRadius = Math.max(lastRendered?.accuracy ?? 20, 20);
      const nextRadius = Math.max(displayPosition.accuracy ?? 20, 20);
      if (Math.abs(nextRadius - previousRadius) >= MIN_POSITION_UPDATE_METERS) {
        deviceAccuracyRef.current.setRadius(nextRadius);
      }
    }

    lastRenderedPositionRef.current = {
      latitude: displayPosition.latitude,
      longitude: displayPosition.longitude,
      accuracy: displayPosition.accuracy,
    };
  }, [displayPosition]);

  useEffect(() => {
    if (!mapRef.current || !leafletRef.current || mappedStops.length === 0) return;

    const activeStop = mappedStops.find((stop) => stop.id === activeStopId) ?? mappedStops.find((stop) => !stop.actualDepartureTime) ?? mappedStops[0];
    updateViewport(mapRef.current, activeStop, displayPosition, leafletRef.current);
  }, [activeStopId, mappedStops, stops]);

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
