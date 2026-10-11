import '@testing-library/jest-dom';
import React from 'react';
import { render, waitFor } from '@testing-library/react';
import { RouteStopsMap } from '../RouteStopsMap';

jest.mock('@/app/operator/components/RouteStopsMap.module.css', () => ({}), { virtual: true });

const polylines: unknown[][] = [];
const markers: { latlng: unknown; html: string }[] = [];

jest.mock('leaflet', () => {
  const layer = () => {
    const chain: Record<string, unknown> = {};
    chain.addTo = () => chain;
    chain.bindTooltip = () => chain;
    chain.on = () => chain;
    return chain;
  };
  const map = {
    on: jest.fn(),
    off: jest.fn(),
    stop: jest.fn(),
    remove: jest.fn(),
    getPane: () => null,
    getContainer: () => ({ style: { setProperty: jest.fn() } }),
    setView: jest.fn(),
    fitBounds: jest.fn(),
    invalidateSize: jest.fn(),
  };
  return {
    __esModule: true,
    default: {
      map: () => map,
      tileLayer: layer,
      polyline: (points: unknown[]) => {
        polylines.push(points);
        return layer();
      },
      marker: (latlng: unknown, options: { icon: { html: string } }) => {
        markers.push({ latlng, html: options.icon.html });
        return layer();
      },
      divIcon: (options: { html: string }) => options,
      circle: layer,
      circleMarker: layer,
      latLngBounds: () => ({}),
    },
  };
});

const stops = [
  { id: 's1', routeId: 'r1', sequence: 1, latitude: -33.7, longitude: 151.2 },
  { id: 's2', routeId: 'r1', sequence: 2, latitude: -33.6, longitude: 151.3 },
] as never;

beforeEach(() => {
  polylines.length = 0;
  markers.length = 0;
});

describe('RouteStopsMap estimate overlay', () => {
  it('draws each Leg in order after the Stop connector, and marks home base', async () => {
    const overlay = {
      home: { latitude: -33.8, longitude: 151.1 },
      legs: [
        [[-33.8, 151.1], [-33.7, 151.2]] as [number, number][],
        [[-33.7, 151.2], [-33.6, 151.3]] as [number, number][],
        [[-33.6, 151.3], [-33.8, 151.1]] as [number, number][],
      ],
    };

    render(<RouteStopsMap stops={stops} estimateOverlay={overlay} />);

    await waitFor(() => expect(markers.length).toBe(3));
    expect(polylines.slice(1)).toEqual(overlay.legs);
    expect(markers.filter((marker) => marker.html.includes('Home base'))).toHaveLength(1);
    expect(markers.find((marker) => marker.html.includes('Home base'))?.latlng).toEqual([-33.8, 151.1]);
  });

  it('draws nothing extra without an estimate', async () => {
    render(<RouteStopsMap stops={stops} />);

    await waitFor(() => expect(markers.length).toBe(2));
    expect(polylines).toHaveLength(1);
    expect(markers.some((marker) => marker.html.includes('Home base'))).toBe(false);
  });
});
