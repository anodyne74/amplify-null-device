export type MapTheme = 'light' | 'dark' | 'satellite' | 'streets' | 'navigation' | 'outdoors' | 'toner' | 'osmfr';

export interface MapThemeDefinition {
  key: MapTheme;
  label: string;
  tileUrl: string;
  attribution: string;
}

export const MAP_THEMES: MapThemeDefinition[] = [
  {
    key: 'light',
    label: 'Light',
    tileUrl: 'https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png',
    attribution: '&copy; OpenStreetMap contributors &copy; CARTO',
  },
  {
    key: 'dark',
    label: 'Dark',
    tileUrl: 'https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png',
    attribution: '&copy; OpenStreetMap contributors &copy; CARTO',
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
