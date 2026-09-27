'use client';

import { useEffect, useRef } from 'react';
import type { Map as LeafletMap, Marker as LeafletMarker } from 'leaflet';
import type { Pin } from '@/lib/locationReview';
import { getMapTheme } from '@/lib/mapThemes';
import styles from './PropertyPinMap.module.css';

interface PropertyPinMapProps {
  /** The pin being confirmed; the administrator drags it to the house. */
  pin: Pin;
  /** Where the Stops' pin is now, shown for reference while the pin is moved. */
  currentPin: Pin | null;
  /** The operator placement GPS fix (#285), if there is one. */
  suggestedPin: Pin | null;
  onPinChange: (pin: Pin) => void;
}

function markerIcon(L: typeof import('leaflet'), className: string, label: string) {
  return L.divIcon({
    className: styles.markerIcon,
    html: `<span class="${styles.marker} ${className}" aria-hidden="true">${label}</span>`,
    iconSize: [28, 28],
    iconAnchor: [14, 14],
  });
}

/**
 * A map for one Property in the Location review queue (#286): its current pin,
 * the suggested pin from placement GPS, and a draggable pin to confirm. Remount
 * it (key) for another Property; the draggable pin follows `pin` after that.
 */
export function PropertyPinMap({ pin, currentPin, suggestedPin, onPinChange }: PropertyPinMapProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<LeafletMap | null>(null);
  const draggableRef = useRef<LeafletMarker | null>(null);
  const onPinChangeRef = useRef(onPinChange);
  onPinChangeRef.current = onPinChange;
  const initialRef = useRef({ pin, currentPin, suggestedPin });

  useEffect(() => {
    let cancelled = false;

    void import('leaflet').then((mod) => {
      if (cancelled || !containerRef.current) return;
      const L = mod.default;
      const { pin: startPin, currentPin: current, suggestedPin: suggested } = initialRef.current;

      const map = L.map(containerRef.current, { scrollWheelZoom: true });
      mapRef.current = map;
      const theme = getMapTheme('streets');
      L.tileLayer(theme.tileUrl, { attribution: theme.attribution, maxZoom: 20 }).addTo(map);

      if (current) {
        L.marker([current.latitude, current.longitude], { icon: markerIcon(L, styles.current, 'C'), interactive: false }).addTo(map);
      }
      if (suggested) {
        L.marker([suggested.latitude, suggested.longitude], { icon: markerIcon(L, styles.suggested, 'G'), interactive: false }).addTo(
          map
        );
      }

      const draggable = L.marker([startPin.latitude, startPin.longitude], {
        icon: markerIcon(L, styles.confirming, ''),
        draggable: true,
        keyboard: true,
        title: 'Pin to confirm -- drag it to the house',
        zIndexOffset: 1000,
      }).addTo(map);
      draggable.on('dragend', () => {
        const { lat, lng } = draggable.getLatLng();
        onPinChangeRef.current({ latitude: lat, longitude: lng });
      });
      draggableRef.current = draggable;

      const points = [startPin, current, suggested].filter((point): point is Pin => point !== null);
      map.fitBounds(L.latLngBounds(points.map((point) => [point.latitude, point.longitude] as [number, number])), {
        padding: [48, 48],
        maxZoom: 18,
        animate: false,
      });
    });

    return () => {
      cancelled = true;
      mapRef.current?.remove();
      mapRef.current = null;
      draggableRef.current = null;
    };
  }, []);

  useEffect(() => {
    draggableRef.current?.setLatLng([pin.latitude, pin.longitude]);
  }, [pin.latitude, pin.longitude]);

  return (
    <div className={styles.wrapper}>
      <div ref={containerRef} className={styles.map} role="region" aria-label="Property location map" />
      <ul className={styles.legend}>
        <li>
          <span className={`${styles.swatch} ${styles.confirming}`} aria-hidden="true" /> Pin to confirm (drag it)
        </li>
        {currentPin && (
          <li>
            <span className={`${styles.swatch} ${styles.current}`} aria-hidden="true" /> C: current pin
          </li>
        )}
        {suggestedPin && (
          <li>
            <span className={`${styles.swatch} ${styles.suggested}`} aria-hidden="true" /> G: operator GPS at placement
          </li>
        )}
      </ul>
    </div>
  );
}
