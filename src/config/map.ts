/**
 * Map configuration for Earth Talk
 */

export interface MapConfig {
  initialCenter: [number, number]; // [longitude, latitude]
  initialZoom: number;
  rwandaBounds: [[number, number], [number, number]]; // [[minLon, minLat], [maxLon, maxLat]]
  defaultStyleUrl: string;
}

export const MAP_CONFIG: MapConfig = {
  // Center of Rwanda: ~1.9403° S, 29.8739° E
  initialCenter: [29.8739, -1.9403],
  initialZoom: 8.5,
  rwandaBounds: [
    [28.85, -2.85], // Southwest [minLon, minLat]
    [30.90, -1.04], // Northeast [maxLon, maxLat]
  ],
  // Standard open-source styled raster tile endpoint with OSM attribution
  defaultStyleUrl:
    'https://basemaps.cartocdn.com/gl/positron-gl-style/style.json',
};
