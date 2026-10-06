export type MapTheme = 'light' | 'dark' | 'satellite' | 'streets' | 'navigation' | 'outdoors' | 'toner' | 'osmfr';

export interface MapThemeDefinition {
  key: MapTheme;
  label: string;
  tileUrl: string;
  attribution: string;
  /** Optional CSS `filter` applied to the tile pane to derive this theme's look
   *  from a key-free tile source (see 'light'/'dark' below). */
  tileFilter?: string;
}

// CARTO's basemaps.cartocdn.com raster tiles (light_all/dark_all) started requiring
// a registered API key and now serve an "API KEY REQUIRED" watermark for anonymous
// requests. 'light' and 'dark' are derived from the still-anonymous OSM standard
// tile source instead, styled via CSS filter on the tile pane (see RouteStopsMap).
export const MAP_THEMES: MapThemeDefinition[] = [
  {
    key: 'light',
    label: 'Light',
    tileUrl: 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',
    attribution: '&copy; OpenStreetMap contributors',
    tileFilter: 'grayscale(20%) brightness(1.05) contrast(0.95)',
  },
  {
    key: 'dark',
    label: 'Dark',
    tileUrl: 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',
    attribution: '&copy; OpenStreetMap contributors',
    tileFilter: 'invert(100%) hue-rotate(180deg) brightness(0.95) contrast(0.9)',
  },
  {
    key: 'streets',
    label: 'OSM Standard',
    tileUrl: 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',
    attribution: '&copy; OpenStreetMap contributors',
  },
  {
    key: 'navigation',
    label: 'Navigation (MapTiler)',
    tileUrl: 'https://api.maptiler.com/maps/navigation/{z}/{x}/{y}.png?key=GetYourOwnKey',
    attribution: 'MapTiler &copy; OpenStreetMap contributors',
  },
  {
    key: 'outdoors',
    label: 'Outdoors',
    tileUrl: 'https://tile.thunderforest.com/outdoors/{z}/{x}/{y}.png?apikey=GetYourOwnKey',
    attribution: 'Thunderforest, OpenStreetMap contributors',
  },
  {
    key: 'toner',
    label: 'Toner (Stamen)',
    tileUrl: 'https://stamen-tiles.a.ssl.fastly.net/toner/{z}/{x}/{y}.png',
    attribution: 'Map tiles by Stamen Design, CC BY 3.0 — Map data &copy; OpenStreetMap contributors',
  },
  {
    key: 'osmfr',
    label: 'OSM France',
    tileUrl: 'https://{s}.tile.openstreetmap.fr/osmfr/{z}/{x}/{y}.png',
    attribution: '&copy; OpenStreetMap France contributors',
  },
  {
    key: 'satellite',
    label: 'Satellite',
    tileUrl: 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
    attribution: 'Tiles &copy; Esri',
  },
];

export function getMapTheme(theme?: string | null): MapThemeDefinition {
  return MAP_THEMES.find((item) => item.key === theme) || MAP_THEMES[0];
}
