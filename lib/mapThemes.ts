export type MapTheme = 'light' | 'dark' | 'satellite' | 'streets';

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
    label: 'Streets',
    tileUrl: 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',
    attribution: '&copy; OpenStreetMap contributors',
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
