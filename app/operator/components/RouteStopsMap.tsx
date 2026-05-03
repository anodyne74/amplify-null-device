'use client';

import { useEffect, useRef } from 'react';
import type { Map as LeafletMap } from 'leaflet';
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
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<LeafletMap | null>(null);

  const orderedStops = [...stops].sort((a, b) => (a.sequence ?? 0) - (b.sequence ?? 0));
  const mappedStops = orderedStops.filter(hasCoordinates);

  useEffect(() => {
    if (!containerRef.current || mappedStops.length === 0) return;

    // cancelled flag prevents the async import callback from running after cleanup
    let cancelled = false;

    import('leaflet').then((mod) => {
      if (cancelled || !containerRef.current) return;

      const L = mod.default;

      // Destroy any existing instance before creating a new one.
      // This handles both React StrictMode double-mount and stops changing.
      if (mapRef.current) {
        mapRef.current.remove();
        mapRef.current = null;
      }

      const center: [number, number] = [mappedStops[0].latitude, mappedStops[0].longitude];
      const map = L.map(containerRef.current, { scrollWheelZoom: true });
      map.setView(center, 12);
      mapRef.current = map;

      L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: '&copy; OpenStreetMap contributors',
      }).addTo(map);

      const positions = mappedStops.map((s): [number, number] => [s.latitude, s.longitude]);
      L.polyline(positions, { color: '#00e5ff', weight: 4 }).addTo(map);

      mappedStops.forEach((stop) => {
        const circle = L.circleMarker([stop.latitude, stop.longitude], {
          radius: 10,
          color: '#10131a',
          weight: 1,
          fillColor: markerColor(stop.serviceType),
          fillOpacity: 0.95,
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
    });

    return () => {
      cancelled = true;
      if (mapRef.current) {
        mapRef.current.remove();
        mapRef.current = null;
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stops]);

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
