import React, { useEffect, useRef, useState } from 'react';
import * as maplibregl from 'maplibre-gl';
import type { Map as MapLibreMap, GeoJSONSource } from 'maplibre-gl';
import type { PublicObservationGeoJson } from '../types/public.js';
import type { PublicSiteGeoJson } from '../types/community.js';
import {
  EVIDENCE_STATES,
  EVIDENCE_STATE_HEX,
  EVIDENCE_STATE_LABELS,
  NO_EVIDENCE_HEX,
  categoryLabel,
} from '../types/community.js';
import { MAP_CONFIG } from '../config/map.js';
import {
  Crosshair,
  Eye,
  EyeOff,
  Globe,
  Maximize2,
  Menu,
  Minus,
  Navigation,
  Plus,
  Rotate3d,
  RotateCcw,
  RotateCw,
  X,
} from 'lucide-react';
import { MapStyleSelector, type MapStyleId } from './MapStyleSelector.js';
import {
  MapLocationCard,
  type MapLocationCardStatus,
  type MapLocationCardTone,
} from './MapLocationCard.js';
import { preferencesStore } from '../services/preferences.js';

/** Esri public tile endpoints used for the Google-style basemap switch. Both are
 *  standard slippy-map tile sets: World Imagery for satellite, World Topo for
 *  terrain relief with its own labels. The roads view is OpenStreetMap's own
 *  standard raster, so the platform is never forced to leave its own map for
 *  street-level detail: it ships Map, Streets, Satellite and Terrain. */
const BASEMAP_SATELLITE_URL =
  'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}';
const BASEMAP_TERRAIN_URL =
  'https://server.arcgisonline.com/ArcGIS/rest/services/World_Topo_Map/MapServer/tile/{z}/{y}/{x}';
const BASEMAP_STREETS_URL =
  'https://tile.openstreetmap.org/{z}/{x}/{y}.png';

/** Round ground distances for the scale bar, in metres. Each step is the next
 *  readable number at roughly the same pixel width. */
const SCALE_STEPS_METRES = [
  10, 20, 50, 100, 200, 500, 1000, 2000, 5000, 10000, 20000, 50000, 100000, 200000,
];

/** A place the observation side card asks the map to navigate to. The map owns
 *  the whole trip: it resolves the user's own position and draws the route, so
 *  no outside map or app is ever opened. */
export interface MapNavTarget {
  latitude: number;
  longitude: number;
  label: string;
}

/**
 * One of the signed-in contributor's own observations, placed on their private
 * overlay. Coordinates here are the owner's own and may be more precise than
 * anything the public map is allowed to draw, so this layer is only ever built
 * from the owner-only `/api/me/observations` response.
 */
export interface OwnerMapPost {
  passport_id: string;
  title: string;
  observation_category?: string;
  latitude: number;
  longitude: number;
}

function ownerFeatureCollection(posts: OwnerMapPost[] | null | undefined) {
  return {
    type: 'FeatureCollection' as const,
    features: (posts ?? []).map((post) => ({
      type: 'Feature' as const,
      geometry: {
        type: 'Point' as const,
        coordinates: [post.longitude, post.latitude] as [number, number],
      },
      properties: {
        passport_id: post.passport_id,
        post_title: post.title,
        observation_category: post.observation_category ?? 'unknown',
        is_own: true,
      },
    })),
  };
}

/** Public OpenRouteService-style router the route line can follow. When it is
 *  unreachable the card still works - the map falls back to drawing the direct
 *  line and says so - so navigation never depends on a third-party being up. */
const NAV_ROUTE_URL =
  'https://router.project-osrm.org/route/v1/driving/{originLng},{originLat};{destLng},{destLat}?overview=full&geometries=geojson';

interface RoutePoint {
  lng: number;
  lat: number;
}

/** Ground distance between two points (Haversine), in metres. */
function haversineMetres(a: RoutePoint, b: RoutePoint): number {
  const R = 6371000;
  const toRad = (deg: number) => (deg * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

/** A straight connector split into steps, used only when the router is silent. */
function straightLinePoints(a: RoutePoint, b: RoutePoint): [number, number][] {
  const steps = 32;
  const points: [number, number][] = [];
  for (let i = 0; i <= steps; i += 1) {
    const t = i / steps;
    points.push([a.lng + (b.lng - a.lng) * t, a.lat + (b.lat - a.lat) * t]);
  }
  return points;
}

/** Attempts a real driving route from a public router. Returns nothing on any
 *  failure (offline, blocked, no route), which the caller treats as
 *  "use the direct line" rather than as an error. */
async function fetchDrivingRoute(
  origin: RoutePoint,
  destination: RoutePoint
): Promise<{ geometry: [number, number][]; distance: number; duration: number } | null> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 8000);
  try {
    const response = await fetch(
      NAV_ROUTE_URL.replace('{originLng}', String(origin.lng))
        .replace('{originLat}', String(origin.lat))
        .replace('{destLng}', String(destination.lng))
        .replace('{destLat}', String(destination.lat)),
      { signal: controller.signal }
    );
    if (!response.ok) return null;
    const data: {
      code?: string;
      routes?: { geometry?: { coordinates?: [number, number][] }; distance?: number; duration?: number }[];
    } = await response.json();
    const route = data.routes?.[0];
    if (data.code !== 'Ok' || !route?.geometry?.coordinates?.length) return null;
    return {
      geometry: route.geometry.coordinates,
      distance: route.distance ?? 0,
      duration: route.duration ?? 0,
    };
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

/** Formats a metre distance the way a south-facing nav card reads. */
function formatNavMetres(metres: number): string {
  return metres >= 1000 ? `${(metres / 1000).toFixed(1)} km` : `${Math.round(metres)} m`;
}

/** The tile bases the style selector can switch between; terrain is a
 *  mix-over choice of its own, exactly as on desktop Maps. */
type BaseLayerId = 'map' | 'streets' | 'satellite';
type Basemap = BaseLayerId | 'terrain';

/** Everything the floating location preview needs, taken from one real feature. */
interface MapLocationCardData {
  id: string;
  title: string;
  category: string;
  rating?: string | null;
  secondary?: string | null;
  description?: string | null;
  status?: MapLocationCardStatus | null;
  accentColor: string;
  latitude?: number | null;
  longitude?: number | null;
  /** A real photo for the preview band; null falls back to the category symbol. */
  imageUrl?: string | null;
}

/** The card is a fixed 240px wide, so its anchor is clamped by half that. */
const CARD_WIDTH = 240;
const CARD_ESTIMATED_HEIGHT = 236;

/** Rungs that read as a settled finding are green; a disputed or withdrawn one
 *  is red; everything in between - and "nothing concluded" - is neutral grey. */
function evidenceTone(state: string | null | undefined): MapLocationCardTone {
  switch (state) {
    case 'scientifically_confirmed':
    case 'expert_reviewed':
      return 'positive';
    case 'unresolved':
    case 'rejected':
      return 'negative';
    default:
      return 'neutral';
  }
}

function capitalise(value: string): string {
  const spaced = value.replace(/_/g, ' ');
  return spaced.charAt(0).toUpperCase() + spaced.slice(1);
}

interface MapViewProps {
  geojson: PublicObservationGeoJson | null;
  loading: boolean;
  selectedPassportId?: string | null;
  onSelectObservation: (passportId: string) => void;
  /** Published geological sites, already filtered to publicly shareable coordinates. */
  sitesGeoJson?: PublicSiteGeoJson | null;
  onSelectSite?: (siteId: string) => void;
  /** Whether the geological site layer is drawn. Owned by the sidebar. */
  showSites: boolean;
  /** The navigation sidebar has been closed with its X. Owned by App. */
  sidebarHidden?: boolean;
  /** Reopens the closed navigation sidebar. */
  onOpenSidebar?: () => void;
  /** A navigation request coming from outside the map (e.g. the observation
   *  side card): reach this place from the user, entirely on our own map. */
  navTarget?: MapNavTarget | null;
  /**
   * The contributor's own located posts, drawn as a distinct private overlay
   * so they can see their own records even where the location is withheld.
   *
   * Only ever populated from the owner-only endpoint, and only made visible
   * when the reader turns the overlay on.
   */
  ownerPosts?: OwnerMapPost[] | null;
  /**
   * The private "My Map" view: only the contributor's own posts are drawn, and
   * the overlay is on from the start. The public layers are supplied empty by
   * the caller, so nothing here can reveal a location the reader does not own.
   */
  ownOnly?: boolean;
}

const EMPTY_SITES: PublicSiteGeoJson = { type: 'FeatureCollection', features: [] };

/**
 * Category colours for the observation layer.
 *
 * The category is decided before any interpretation, so it is the honest thing to
 * colour a pin by: a reader can tell a fossil from a landslide without trusting
 * an identification. Colours are spaced for separability at marker size, and the
 * three "no reading" categories share slate tones on purpose - they mean the same
 * thing, which is that there is nothing here to interpret.
 *
 * The GeoJSON property is `observation_category`; falling back to the legacy
 * `classification` keeps pre-taxonomy feature collections from rendering as one
 * undifferentiated mass.
 */
export const CATEGORY_COLORS: Record<string, string> = {
  rock: '#ea580c',
  mineral: '#7c3aed',
  fossil: '#b45309',
  geological_structure: '#0f766e',
  geological_layer: '#0369a1',
  geomorphology: '#15803d',
  volcanic_feature: '#c2410c',
  hydrogeological_feature: '#0e7490',
  mining_observation: '#a16207',
  engineering_geology: '#4d7c0f',
  other_geoscience: '#334155',
  unknown: '#64748b',
  insufficient_image: '#94a3b8',
  non_geoscience: '#cbd5e1',
};

// Built from the palette rather than written out literally, so adding a category
// to CATEGORY_COLORS cannot be forgotten here.
//
// The `unknown` hop is needed because a MapLibre `match` is typed as a tuple
// whose labels and outputs alternate, and `flatMap` widens that to `string[]`.
// The values are genuinely label/output pairs, so the cast is sound; only the
// compiler's tuple inference gives up.
const CATEGORY_COLOR_PAIRS = Object.entries(CATEGORY_COLORS).flatMap(([category, color]) => [
  category,
  color,
]) as unknown as string[];

// `case` rather than `coalesce`: a `match` always returns its fallback, so
// wrapping one in `coalesce` would make the legacy branch unreachable and every
// pre-taxonomy pin would fall to grey. The category branch is only taken when
// the property is actually present.
const CATEGORY_COLOR_EXPRESSION = [
  'case',
  ['has', 'observation_category'],
  [
    'match',
    ['get', 'observation_category'],
    ...CATEGORY_COLOR_PAIRS,
    '#78716c', // stone-500: a category this build has never seen
  ],
  // Legacy rock-type colour for a feature collection that predates the category
  // field, so an older cached response is still readable rather than uniformly grey.
  [
    'match',
    ['get', 'classification'],
    'igneous',
    CATEGORY_COLORS.rock,
    'sedimentary',
    '#ca8a04',
    'metamorphic',
    '#0d9488',
    '#78716c',
  ],
] as unknown as maplibregl.ExpressionSpecification;

/**
 * Category-specific pin markers (Stage 12).
 *
 * A Google-Maps-style teardrop pin replaces the plain dot for individual
 * observations. Each category is a separate registered image, tinted with the
 * same colour the legend uses, so a pin and its legend entry cannot disagree.
 * The image names are data-driven through the same category fallback chain as
 * the colours, so an unknown category gets the neutral stone pin rather than a
 * missing image.
 */
const PIN_WIDTH = 42;
const PIN_HEIGHT = 52;
// The pin is rasterised at twice its display size so it stays crisp on a retina
// screen; `pixelRatio` tells MapLibre that the pixels arrive in pairs.
const PIN_PIXEL_RATIO = 2;

/**
 * Rasterises one teardrop pin.
 *
 * MapLibre's `loadImage` refuses SVG outright ("Note that SVGs are not
 * supported"), so the SVG data URI this used to return failed for every colour
 * and demoted the whole layer to plain dots. The pin is drawn onto a canvas
 * instead and handed over as pixels: same teardrop, filled with the category
 * colour, white outline, and a white eye that stays legible on any basemap.
 *
 * Returns `null` when there is no document (server-side render); the caller then
 * keeps its dot layer rather than draw nothing.
 */
export function buildPinImage(color: string): ImageData | null {
  if (typeof document === 'undefined') return null;
  const safe = /^#[0-9a-fA-F]{6}$/.test(color) ? color : '#78716c';
  const canvas = document.createElement('canvas');
  canvas.width = PIN_WIDTH * PIN_PIXEL_RATIO;
  canvas.height = PIN_HEIGHT * PIN_PIXEL_RATIO;
  const ctx = canvas.getContext('2d');
  if (!ctx) return null;
  ctx.scale(PIN_PIXEL_RATIO, PIN_PIXEL_RATIO);
  ctx.beginPath();
  ctx.moveTo(21, 2);
  ctx.bezierCurveTo(10.5, 2, 2, 10.1, 2, 20.6);
  ctx.bezierCurveTo(2, 35.9, 21, 49.6, 21, 49.6);
  ctx.bezierCurveTo(21, 49.6, 40, 35.9, 40, 20.6);
  ctx.bezierCurveTo(40, 10.1, 31.5, 2, 21, 2);
  ctx.closePath();
  ctx.fillStyle = safe;
  ctx.fill();
  ctx.lineWidth = 3;
  ctx.strokeStyle = '#ffffff';
  ctx.stroke();
  ctx.beginPath();
  ctx.arc(21, 20, 6.5, 0, Math.PI * 2);
  ctx.fillStyle = 'rgba(255,255,255,0.92)';
  ctx.fill();
  return ctx.getImageData(0, 0, canvas.width, canvas.height);
}

const CATEGORY_PIN_COLORS: Record<string, string> = {
  ...CATEGORY_COLORS,
  _fallback: '#78716c',
};

const CATEGORY_PIN_PAIRS = Object.entries(CATEGORY_COLORS).flatMap(([category]) => [
  category,
  `pin-${category}`,
]) as unknown as string[];

const CATEGORY_PIN_EXPRESSION = [
  'match',
  ['get', 'observation_category'],
  ...CATEGORY_PIN_PAIRS,
  'pin-_fallback',
] as unknown as maplibregl.ExpressionSpecification;

/**
 * Site markers use the same teardrop pin, tinted by the highest evidence
 * state instead of the observation category. `NO_EVIDENCE_HEX` is the
 * fallback, so an unestablished site reads as neutral rather than as a
 * missing image.
 */
const SITE_PIN_COLORS: Record<string, string> = {
  ...Object.fromEntries(EVIDENCE_STATES.map((state) => [state, EVIDENCE_STATE_HEX[state]])),
  _fallback: NO_EVIDENCE_HEX,
};

const SITE_PIN_PAIRS = EVIDENCE_STATES.flatMap((state) => [
  state,
  `site-pin-${state}`,
]) as unknown as string[];

const SITE_PIN_EXPRESSION = [
  'match',
  ['get', 'highest_evidence_state'],
  ...SITE_PIN_PAIRS,
  'site-pin-_fallback',
] as unknown as maplibregl.ExpressionSpecification;

function registerPinImages(map: MapLibreMap): void {
  const register = (prefix: string, colors: Record<string, string>) => {
    Object.entries(colors).forEach(([slug, color]) => {
      const name = `${prefix}-${slug}`;
      if (map.hasImage(name)) return;
      const image = buildPinImage(color);
      if (!image) return;
      try {
        map.addImage(name, image, { pixelRatio: PIN_PIXEL_RATIO });
      } catch {
        // One bad image must not blank the whole marker set; any other category
        // still registers its own pin.
      }
    });
  };
  register('pin', CATEGORY_PIN_COLORS);
  register('site-pin', SITE_PIN_COLORS);
}

/**
 * Evidence-state colours for the geological site layer.
 *
 * Derived from `EVIDENCE_STATE_HEX` in types/community.ts rather than
 * hand-maintained here, so a marker on the map and a badge in a panel cannot
 * drift to different colours for the same rung of the ladder.
 *
 * A site with no recorded state falls back to `NO_EVIDENCE_HEX`, which reads as
 * "nothing established" rather than as a weak positive.
 */
export const SITE_STATE_COLORS: Record<string, string> = EVIDENCE_STATE_HEX;

/**
 * MapLibre `match` expression covering every canonical evidence state.
 *
 * The list is generated from `EVIDENCE_STATES` so a state added to the ladder
 * cannot be silently left out of the map, which previously left
 * `insufficient_evidence` rendering in the same colour as `ai_assisted`.
 */
const STATE_COLOR_EXPRESSION: maplibregl.ExpressionSpecification = [
  'match',
  ['get', 'highest_evidence_state'],
  ...EVIDENCE_STATES.flatMap((state) => [state, EVIDENCE_STATE_HEX[state]]),
  NO_EVIDENCE_HEX,
] as unknown as maplibregl.ExpressionSpecification;

export const MapView: React.FC<MapViewProps> = ({
  geojson,
  loading,
  selectedPassportId,
  onSelectObservation,
  sitesGeoJson,
  onSelectSite,
  showSites,
  sidebarHidden,
  onOpenSidebar,
  navTarget,
  ownerPosts,
  ownOnly = false,
}) => {
  const mapContainerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<MapLibreMap | null>(null);
  const [mapLoaded, setMapLoaded] = useState(false);
  const [styleError, setStyleError] = useState(false);
  const [locating, setLocating] = useState(false);
  const [base, setBase] = useState<BaseLayerId>('map');
  const [terrainOn, setTerrainOn] = useState(false);
  // Google-style view controls: a 2D/3D toggle that tilts the camera, a compass
  // that shows the current rotation and returns the map to north, and the live
  // bearing/pitch the map reports as the reader drags.
  const [is3d, setIs3d] = useState(false);
  const [bearing, setBearing] = useState(0);
  // The live camera tilt. The 2D/3D toggle moves it between flat and oblique;
  // the slider lets it rest at any angle in between.
  const [pitch, setPitch] = useState(0);
  // Globe or flat projection. Flat is right for one district; the globe gives
  // the continental context of where those rocks sit.
  const [globeOn, setGlobeOn] = useState(false);
  // Whether the contributor's own private overlay is drawn. Starts off so a
  // reader is never shown their withheld locations before asking for them.
  const [showOwn, setShowOwn] = useState(ownOnly);
  // Width and label of the scale bar drawn beside the attribution.
  const [scaleBar, setScaleBar] = useState({ width: 64, label: '100 m' });
  const hoveredPassport = useRef<string | null>(null);
  // In-map navigation: the destination being reached, the phase of the attempt,
  // what went wrong when it did, and the figures shown once a route is ready.
  const [nav, setNav] = useState<{
    label: string;
    destLongitude: number;
    destLatitude: number;
  } | null>(null);
  const [navStatus, setNavStatus] = useState<'locating' | 'routing' | 'ready' | 'error'>('ready');
  const [navError, setNavError] = useState<string | null>(null);
  const [navInfo, setNavInfo] = useState<{
    distance: number | null;
    duration: number | null;
    straight: boolean;
  } | null>(null);
  // The last outside `navTarget` handled, so a prop that stops changing never
  // restarts the trip (ending navigation locally does not clear App's value).
  const handledNavTarget = useRef<MapNavTarget | null>(null);
  // The floating location preview under the cursor: where to anchor it on the
  // canvas, and the real feature it describes. Null when nothing is hovered.
  const [hoverCard, setHoverCard] = useState<{
    x: number;
    y: number;
    data: MapLocationCardData;
  } | null>(null);
  // Saved places are held for the session, so a bookmark made from the preview
  // is a real state change on this screen.
  const [savedLocations, setSavedLocations] = useState<Set<string>>(() => new Set());
  const hoverCardHideTimer = useRef<number | null>(null);
  const basemap: Basemap = terrainOn ? 'terrain' : base;
  // What the selector shows as chosen, derived from the basemap itself: there
  // is no Transit/Biking tile because the OpenStreetMap reads those would need
  // are unreachable from this network, so they would draw nothing.
  const activeStyle: MapStyleId = terrainOn ? 'terrain' : base;
  // Computed once so the attribution JSX can branch on it without TypeScript
  // narrowing `basemap` to `'map'` inside the ternary's else branch.
  const satelliteView = basemap === 'satellite';

  // One entry point for every style choice the selector offers.
  const handleStyleSelect = (id: MapStyleId) => {
    if (id === 'terrain') {
      setTerrainOn(true);
      return;
    }
    setTerrainOn(false);
    setBase(id === 'satellite' ? 'satellite' : id === 'streets' ? 'streets' : 'map');
  };

  /** Recomputes the scale bar for the map's current centre and zoom. */
  const updateScaleBar = (map: MapLibreMap) => {
    const latitude = map.getCenter().lat;
    const metresPerPixel =
      (40075016.686 * Math.cos((latitude * Math.PI) / 180)) / (256 * 2 ** map.getZoom());
    let step = SCALE_STEPS_METRES[0];
    for (const candidate of SCALE_STEPS_METRES) {
      if (candidate / metresPerPixel <= 100) step = candidate;
    }
    setScaleBar({
      width: Math.min(100, Math.max(28, Math.round(step / metresPerPixel))),
      label: step >= 1000 ? `${step / 1000} km` : `${step} m`,
    });
  };

  /**
   * Converts a location into a pixel anchor for the preview, held inside the
   * canvas: horizontally centred on the pin and never so close to an edge that
   * the 240px card is cut off, and far enough down that the card fits above it.
   */
  const anchorHoverCard = (map: MapLibreMap, lngLat: { lng: number; lat: number }) => {
    const point = map.project(lngLat);
    const canvas = map.getCanvas();
    const half = CARD_WIDTH / 2;
    const maxX = Math.max(half + 8, (canvas.clientWidth || 0) - half - 8);
    return {
      x: Math.min(Math.max(point.x, half + 8), maxX),
      y: Math.max(point.y, CARD_ESTIMATED_HEIGHT + 16),
    };
  };

  // The preview has to survive the pointer travelling from the pin to the card,
  // so leaving a marker only hides it after a short grace period; entering the
  // card cancels that timer.
  const cancelHoverCardHide = () => {
    if (hoverCardHideTimer.current !== null) {
      window.clearTimeout(hoverCardHideTimer.current);
      hoverCardHideTimer.current = null;
    }
  };
  const hideHoverCardSoon = () => {
    cancelHoverCardHide();
    hoverCardHideTimer.current = window.setTimeout(() => setHoverCard(null), 140);
  };

  const toggleSavedLocation = (data: MapLocationCardData) => {
    if (!data.id) return;
    setSavedLocations((previous) => {
      const next = new Set(previous);
      if (next.has(data.id)) next.delete(data.id);
      else next.add(data.id);
      return next;
    });
  };

  // Initialize MapLibre
  useEffect(() => {
    if (!mapContainerRef.current || mapRef.current) return;

    try {
      if (typeof window !== 'undefined') {
        try {
          const workerUrl = new URL('/maplibre-gl-worker.mjs', window.location.href).href;
          maplibregl.setWorkerUrl(workerUrl);
        } catch {
          maplibregl.setWorkerUrl('/maplibre-gl-worker.mjs');
        }
      }

      const map = new maplibregl.Map({
        container: mapContainerRef.current,
        style: MAP_CONFIG.defaultStyleUrl,
        center: MAP_CONFIG.initialCenter,
        zoom: MAP_CONFIG.initialZoom,
        maxBounds: [
          [28.2, -3.2], // Southwest boundary
          [31.4, -0.6], // Northeast boundary
        ],
        attributionControl: false, // Customized visible attribution below
      });

      map.on('error', (e) => {
        console.warn('MapLibre notice:', e?.error?.message || e);
      });

      // Zoom lives at the bottom of the map, above nothing that overlaps it, the
      // way Google Maps keeps the map controls clear of the search band. The
      // location button sits in the same stack. Ground distance is drawn beside
      // the attribution instead of down here, where it crowded the style card.

      map.on('load', () => {
        setMapLoaded(true);

        // Keep the compass and the 2D/3D state in step with the camera however
        // it is moved - our own controls, a right-drag, or a two-finger gesture.
        map.on('rotate', () => setBearing(map.getBearing()));
        map.on('pitch', () => {
          setIs3d(map.getPitch() > 1);
          setPitch(map.getPitch());
        });

        // Google-style basemap switch. The opaque raster tiles sit above the
        // vector base style but below every data layer, so satellite, streets
        // and terrain replace the streets rather than being drawn over the pins.
        // All layers start hidden; the `basemap` state toggles visibility.
        map.addSource('basemap-satellite', {
          type: 'raster',
          tiles: [BASEMAP_SATELLITE_URL],
          tileSize: 256,
          maxzoom: 19,
        });
        map.addLayer({
          id: 'basemap-satellite',
          type: 'raster',
          source: 'basemap-satellite',
          layout: { visibility: 'none' },
        });
        map.addSource('basemap-terrain', {
          type: 'raster',
          tiles: [BASEMAP_TERRAIN_URL],
          tileSize: 256,
          maxzoom: 19,
        });
        map.addLayer({
          id: 'basemap-terrain',
          type: 'raster',
          source: 'basemap-terrain',
          layout: { visibility: 'none' },
        });
        // The streets layer is OpenStreetMap's own raster, so the platform's
        // map carries full road detail and is not dependent on an outside map.
        map.addSource('basemap-streets', {
          type: 'raster',
          tiles: [BASEMAP_STREETS_URL],
          tileSize: 256,
          maxzoom: 19,
        });
        map.addLayer({
          id: 'basemap-streets',
          type: 'raster',
          source: 'basemap-streets',
          layout: { visibility: 'none' },
        });

        // Geological sites sit underneath the observation points so a site is
        // visible as context rather than competing with individual records.
        // The main marker is a round dot here only as a fallback; once the pin
        // images register it is swapped for an evidence-tinted teardrop pin.
        map.addSource('geological-sites', {
          type: 'geojson',
          data: sitesGeoJson || EMPTY_SITES,
        });

        map.addLayer({
          id: 'geological-sites-halo',
          type: 'circle',
          source: 'geological-sites',
          layout: { visibility: showSites ? 'visible' : 'none' },
          paint: {
            'circle-radius': 15,
            'circle-color': STATE_COLOR_EXPRESSION,
            'circle-opacity': 0.18,
          },
        });

        map.addLayer({
          id: 'geological-sites',
          type: 'circle',
          source: 'geological-sites',
          layout: { visibility: showSites ? 'visible' : 'none' },
          paint: {
            'circle-radius': 9,
            'circle-color': STATE_COLOR_EXPRESSION,
            'circle-stroke-width': 2.5,
            'circle-stroke-color': '#ffffff',
          },
        });

        // Add clustered GeoJSON source
        map.addSource('observations', {
          type: 'geojson',
          data: geojson || { type: 'FeatureCollection', features: [] },
          cluster: true,
          clusterMaxZoom: 14,
          clusterRadius: 45,
        });

        // 1. Cluster circles
        map.addLayer({
          id: 'clusters',
          type: 'circle',
          source: 'observations',
          filter: ['has', 'point_count'],
          paint: {
            'circle-color': [
              'step',
              ['get', 'point_count'],
              '#d97706', // amber-600 (small clusters)
              5,
              '#b45309', // amber-700
              15,
              '#78350f', // amber-900 (large clusters)
            ],
            'circle-radius': [
              'step',
              ['get', 'point_count'],
              16,
              5,
              22,
              15,
              28,
            ],
            'circle-stroke-width': 2,
            'circle-stroke-color': '#ffffff',
          },
        });

        // 2. Cluster text counts
        map.addLayer({
          id: 'cluster-count',
          type: 'symbol',
          source: 'observations',
          filter: ['has', 'point_count'],
          layout: {
            'text-field': '{point_count_abbreviated}',
            'text-font': ['Open Sans Semibold', 'Arial Unicode MS Bold'],
            'text-size': 12,
          },
          paint: {
            'text-color': '#ffffff',
          },
        });

        // 3. Individual observation points. Pins are registered as images so
        //    the whole set can fail together and degrade to the plain
        //    category-coloured dots rather than half a legend of pins. The
        //    navigation route line is registered before the pins, so the pins
        //    always draw above it and are never hidden by the route.
        map.addSource('nav-route', {
          type: 'geojson',
          data: { type: 'FeatureCollection', features: [] },
        });
        map.addLayer({
          id: 'nav-route-casing',
          type: 'line',
          source: 'nav-route',
          layout: { 'line-cap': 'round', 'line-join': 'round' },
          paint: { 'line-color': '#ffffff', 'line-width': 7, 'line-opacity': 0.95 },
        });
        map.addLayer({
          id: 'nav-route-line',
          type: 'line',
          source: 'nav-route',
          layout: { 'line-cap': 'round', 'line-join': 'round' },
          paint: { 'line-color': '#0b57d0', 'line-width': 4 },
        });
        setupObservationPins(map);

        // The contributor's own located posts, drawn as a violet overlay so
        // their private records are visible to them without ever pretending the
        // location is public. Added after the observation pins so it draws on
        // top, and only built from the owner-only endpoint.
        map.addSource('owner-posts', {
          type: 'geojson',
          data: ownerFeatureCollection(ownerPosts),
        });
        map.addLayer({
          id: 'owner-posts-halo',
          type: 'circle',
          source: 'owner-posts',
          layout: { visibility: showOwn ? 'visible' : 'none' },
          paint: {
            'circle-radius': 15,
            'circle-color': '#7c3aed',
            'circle-opacity': 0.18,
          },
        });
        map.addLayer({
          id: 'owner-posts',
          type: 'circle',
          source: 'owner-posts',
          layout: { visibility: showOwn ? 'visible' : 'none' },
          paint: {
            'circle-radius': 8,
            'circle-color': '#7c3aed',
            'circle-stroke-width': 2.5,
            'circle-stroke-color': '#ffffff',
          },
        });
        map.on('mouseenter', 'owner-posts', () => {
          map.getCanvas().style.cursor = 'pointer';
        });
        map.on('mouseleave', 'owner-posts', () => {
          map.getCanvas().style.cursor = '';
        });
        map.on('click', 'owner-posts', (e) => {
          const passportId = e.features?.[0]?.properties?.passport_id;
          if (passportId) {
            setHoverCard(null);
            onSelectObservation(String(passportId));
          }
        });

        // "Show my location" renders a blue dot over the accuracy radius. The
        // radius is scaled to ground distance so the circle means something.
        map.addSource('user-location', {
          type: 'geojson',
          data: { type: 'FeatureCollection', features: [] },
        });
        map.addLayer({
          id: 'user-location-accuracy',
          type: 'circle',
          source: 'user-location',
          paint: {
            'circle-radius': [
              'interpolate',
              ['linear'],
              ['zoom'],
              4,
              ['*', ['get', 'accuracy'], 0.004],
              14,
              ['*', ['get', 'accuracy'], 0.105],
              20,
              ['*', ['get', 'accuracy'], 1.7],
            ],
            'circle-color': '#0b57d0',
            'circle-opacity': 0.12,
          },
        });
        map.addLayer({
          id: 'user-location-dot',
          type: 'circle',
          source: 'user-location',
          paint: {
            'circle-radius': 7,
            'circle-color': '#0b57d0',
            'circle-stroke-width': 2.5,
            'circle-stroke-color': '#ffffff',
          },
        });

        // Interactive cursor
        // Any pan or zoom invalidates the preview's pixel anchor, so it closes
        // rather than drift away from the pin it describes.
        map.on('movestart', () => setHoverCard(null));
        map.on('mouseenter', 'clusters', () => {
          map.getCanvas().style.cursor = 'pointer';
        });
        map.on('mouseleave', 'clusters', () => {
          map.getCanvas().style.cursor = '';
        });
        map.on('mouseenter', 'unclustered-point', () => {
          map.getCanvas().style.cursor = 'pointer';
        });
        map.on('mouseleave', 'unclustered-point', () => {
          map.getCanvas().style.cursor = '';
        });

        // Site hover and click
        map.on('mouseenter', 'geological-sites', () => {
          map.getCanvas().style.cursor = 'pointer';
        });
        map.on('mouseleave', 'geological-sites', () => {
          map.getCanvas().style.cursor = '';
        });

        map.on('mousemove', 'geological-sites', (e) => {
          const feature = e.features?.[0];
          if (!feature || feature.geometry.type !== 'Point') return;
          const p = feature.properties ?? {};
          const state = p.highest_evidence_state ? String(p.highest_evidence_state) : null;
          const observationCount = Number(p.observation_count ?? 0);
          const investigationCount = Number(p.investigation_count ?? 0);
          const [longitude, latitude] = feature.geometry.coordinates;
          cancelHoverCardHide();
          setHoverCard({
            ...anchorHoverCard(map, e.lngLat),
            data: {
              id: String(p.site_id ?? ''),
              title: String(p.title || p.site_code || 'Geoscience site'),
              category: 'Geoscience site',
              rating: observationCount > 0 ? `${observationCount} observations` : null,
              secondary: investigationCount > 0 ? `${investigationCount} investigations` : null,
              description: null,
              status: {
                label: state
                  ? (EVIDENCE_STATE_LABELS as Record<string, string>)[state] ??
                    capitalise(state)
                  : 'Unestablished',
                tone: evidenceTone(state),
              },
              accentColor: state
                ? (EVIDENCE_STATE_HEX as Record<string, string>)[state] ?? NO_EVIDENCE_HEX
                : NO_EVIDENCE_HEX,
              latitude,
              longitude,
            },
          });
        });
        map.on('mouseleave', 'geological-sites', hideHoverCardSoon);

        map.on('click', 'geological-sites', (e) => {
          const feature = e.features?.[0];
          const siteId = feature?.properties?.site_id;
          if (siteId && onSelectSite) {
            setHoverCard(null);
            onSelectSite(String(siteId));
          }
        });

        // Click on cluster -> zoom in
        map.on('click', 'clusters', (e) => {
          const features = map.queryRenderedFeatures(e.point, { layers: ['clusters'] });
          const clusterId = features[0]?.properties?.cluster_id;
          const source = map.getSource('observations') as GeoJSONSource;

          if (source && clusterId !== undefined) {
            source
              .getClusterExpansionZoom(clusterId)
              .then((zoom) => {
                const geom = features[0]?.geometry;
                if (geom && geom.type === 'Point') {
                  map.easeTo({
                    center: geom.coordinates as [number, number],
                    zoom: (zoom ?? 10) + 0.5,
                  });
                }
              })
              .catch(() => {
                // Ignore zoom error
              });
          }
        });
      });

      map.on('error', () => {
        // Safe fallback if tile provider temporarily fails
        setStyleError(true);
      });

      mapRef.current = map;
    } catch {
      setStyleError(true);
    }

    return () => {
      if (mapRef.current) {
        mapRef.current.remove();
        mapRef.current = null;
      }
    };
  }, []);

  // Update GeoJSON source when data changes
  useEffect(() => {
    if (!mapRef.current || !mapLoaded) return;
    const source = mapRef.current.getSource('observations') as GeoJSONSource;
    if (source && geojson) {
      source.setData(geojson);
    }
  }, [geojson, mapLoaded]);

  // Sync geological sites.
  useEffect(() => {
    if (!mapRef.current || !mapLoaded) return;
    const source = mapRef.current.getSource('geological-sites') as GeoJSONSource | undefined;
    if (source) {
      source.setData(sitesGeoJson || EMPTY_SITES);
    }
  }, [sitesGeoJson, mapLoaded]);

  // Toggle site layer visibility.
  useEffect(() => {
    if (!mapRef.current || !mapLoaded) return;
    const visibility = showSites ? 'visible' : 'none';
    for (const layerId of ['geological-sites', 'geological-sites-halo']) {
      if (mapRef.current.getLayer(layerId)) {
        mapRef.current.setLayoutProperty(layerId, 'visibility', visibility);
      }
    }
  }, [showSites, mapLoaded]);

  // Sync the contributor's own overlay data.
  useEffect(() => {
    if (!mapRef.current || !mapLoaded) return;
    const source = mapRef.current.getSource('owner-posts') as GeoJSONSource | undefined;
    if (source) source.setData(ownerFeatureCollection(ownerPosts));
  }, [ownerPosts, mapLoaded]);

  // "My Map" always shows the owner overlay: there is no other layer here, and
  // the overlay is the whole point of the view.
  useEffect(() => {
    if (ownOnly) setShowOwn(true);
  }, [ownOnly]);

  // Toggle the owner overlay visibility.
  useEffect(() => {
    if (!mapRef.current || !mapLoaded) return;
    const visibility = showOwn ? 'visible' : 'none';
    for (const layerId of ['owner-posts', 'owner-posts-halo']) {
      if (mapRef.current.getLayer(layerId)) {
        mapRef.current.setLayoutProperty(layerId, 'visibility', visibility);
      }
    }
  }, [showOwn, mapLoaded]);

  // Toggle the basemap raster overlay for the active layer.
  useEffect(() => {
    if (!mapRef.current || !mapLoaded) return;
    const visibility = (on: boolean) => (on ? 'visible' : 'none');
    if (mapRef.current.getLayer('basemap-satellite')) {
      mapRef.current.setLayoutProperty(
        'basemap-satellite',
        'visibility',
        visibility(basemap === 'satellite')
      );
    }
    if (mapRef.current.getLayer('basemap-terrain')) {
      mapRef.current.setLayoutProperty(
        'basemap-terrain',
        'visibility',
        visibility(basemap === 'terrain')
      );
    }
    if (mapRef.current.getLayer('basemap-streets')) {
      mapRef.current.setLayoutProperty(
        'basemap-streets',
        'visibility',
        visibility(basemap === 'streets')
      );
    }
  }, [basemap, mapLoaded]);

  // One listener redraws the scale bar when the viewport or zoom changes.
  // `moveend` fires once per gesture, so there is nothing here to debounce.
  useEffect(() => {
    if (!mapLoaded || !mapRef.current) return;
    const map = mapRef.current;
    const refresh = () => updateScaleBar(map);
    refresh();
    map.on('moveend', refresh);
    map.on('resize', refresh);
    return () => {
      map.off('moveend', refresh);
      map.off('resize', refresh);
    };
    // `updateScaleBar` only reads the map instance, which the listeners below
    // already capture, so it never needs to re-bind them.
  }, [mapLoaded]);

  /**
   * Draws the selected-pin halo so the reader's eye lands on the observation
   * the side card is describing. The halo is a circle at the pin tip, filtered
   * to the selected passport; when nothing is selected the filter matches no
   * feature and the layer is simply empty.
   */
  const setupObservationPins = (map: MapLibreMap) => {
    const wire = () => {
      // Halo beneath the selected pin, Google-Maps style.
      map.addLayer({
        id: 'observation-selected-halo',
        type: 'circle',
        source: 'observations',
        filter: ['==', ['get', 'passport_id'], selectedPassportId ?? ''],
        paint: {
          'circle-radius': 14,
          'circle-color': '#0b57d0',
          'circle-opacity': 0.28,
          'circle-stroke-width': 2,
          'circle-stroke-color': '#ffffff',
          'circle-stroke-opacity': 0.9,
        },
      });

      map.on('mousemove', 'unclustered-point', (e) => {
        const feature = e.features?.[0];
        if (!feature || feature.geometry.type !== 'Point') return;
        const p = feature.properties ?? {};
        const category = String(p.observation_category ?? p.classification ?? 'unknown');
        const evidence = p.evidence_state ? String(p.evidence_state) : null;
        const mediaCount = Number(p.media_count ?? 0);
        const [longitude, latitude] = feature.geometry.coordinates;
        cancelHoverCardHide();
        setHoverCard({
          ...anchorHoverCard(map, e.lngLat),
          data: {
            id: String(p.passport_id ?? ''),
            title: (p.possible_name as string) || categoryLabel(category),
            category: categoryLabel(category),
            rating: p.confidence ? capitalise(String(p.confidence)) : null,
            secondary: mediaCount > 0 ? `${mediaCount} attached` : null,
            description: (p.primary_interpretation as string) || null,
            status: {
              label: evidence
                ? (EVIDENCE_STATE_LABELS as Record<string, string>)[evidence] ??
                  capitalise(evidence)
                : 'Unestablished',
              tone: evidenceTone(evidence),
            },
            accentColor: CATEGORY_COLORS[category] ?? '#78716c',
            latitude,
            longitude,
            imageUrl: (p.primary_media_url as string) || null,
          },
        });
      });
      map.on('mouseleave', 'unclustered-point', hideHoverCardSoon);

      map.on('click', 'unclustered-point', (e) => {
        const feature = e.features?.[0];
        const passportId = feature?.properties?.passport_id;
        if (passportId) {
          setHoverCard(null);
          onSelectObservation(passportId);
        }
      });
    };

    const addObservationDots = () => {
      map.addLayer({
        id: 'unclustered-point',
        type: 'circle',
        source: 'observations',
        filter: ['!', ['has', 'point_count']],
        paint: {
          'circle-color': CATEGORY_COLOR_EXPRESSION,
          'circle-radius': 7,
          'circle-stroke-width': 2,
          'circle-stroke-color': '#ffffff',
        },
      });
    };

    registerPinImages(map);
    // Only use pin symbols when the fallback image actually registered;
    // otherwise degrade to the category-coloured dots rather than adding
    // layers that reference images the style does not have.
    if (!map.hasImage('pin-_fallback')) {
      addObservationDots();
      wire();
      return;
    }

    try {
      map.addLayer({
        id: 'unclustered-point',
        type: 'symbol',
        source: 'observations',
        filter: ['!', ['has', 'point_count']],
        layout: {
          'icon-image': CATEGORY_PIN_EXPRESSION,
          // MapLibre divides a raster image's display size by its pixelRatio, so
          // the icon scales are doubled to keep the pin the size it was when the
          // 1x SVG was the source. 0.34 is the medium pin: about 14px wide.
          'icon-size': 0.34 * PIN_PIXEL_RATIO,
          'icon-anchor': 'bottom',
          'icon-allow-overlap': false,
          'icon-ignore-placement': false,
        },
      });
      // Hover emphasis, Google-Maps style: a second symbol layer draws the
      // pin under the pointer slightly larger, so it visibly lifts out of the
      // set. The filter matches one passport; when nothing is hovered the
      // layer filters to nothing and draws nothing.
      map.addLayer({
        id: 'pin-hover',
        type: 'symbol',
        source: 'observations',
        filter: ['==', ['get', 'passport_id'], hoveredPassport.current ?? ''],
        layout: {
          'icon-image': CATEGORY_PIN_EXPRESSION,
          'icon-size': 0.47 * PIN_PIXEL_RATIO,
          'icon-anchor': 'bottom',
          'icon-allow-overlap': true,
          'icon-ignore-placement': true,
        },
      });
      const syncHover = (passportId: string | null) => {
        hoveredPassport.current = passportId;
        // The layer is gone while a basemap swap rebuilds the style; setting a
        // filter on a missing layer throws, so check first.
        if (map.getLayer('pin-hover')) {
          map.setFilter('pin-hover', ['==', ['get', 'passport_id'], passportId ?? '']);
        }
      };
      map.on('mousemove', 'unclustered-point', (e) => {
        const p = e.features?.[0]?.properties;
        syncHover(p?.passport_id ? String(p.passport_id) : null);
      });
      map.on('mouseleave', 'unclustered-point', () => {
        syncHover(null);
      });

      // Geological sites upgrade from the round fallback dot to the same
      // teardrop pin, tinted by evidence state, and drop back underneath the
      // observation pins so the layering the load handler set up is kept.
      if (map.getLayer('geological-sites')) {
        map.removeLayer('geological-sites');
      }
      map.addLayer({
        id: 'geological-sites',
        type: 'symbol',
        source: 'geological-sites',
        layout: {
          visibility: map.getLayoutProperty(
            'geological-sites-halo',
            'visibility'
          ) as 'visible' | 'none',
          'icon-image': SITE_PIN_EXPRESSION,
          'icon-size': 0.30 * PIN_PIXEL_RATIO,
          'icon-anchor': 'bottom',
          'icon-allow-overlap': false,
          'icon-ignore-placement': false,
        },
      });
      wire();
      map.moveLayer('geological-sites', 'unclustered-point');
    } catch {
      // Fall back to the category-coloured dots, which need no registered
      // images, rather than leave the observation layer blank.
      if (map.getLayer('pin-hover')) map.removeLayer('pin-hover');
      if (map.getLayer('unclustered-point')) map.removeLayer('unclustered-point');
      addObservationDots();
      wire();
    }
  };

  // Keep the selected halo honest: the filter follows whichever passport is
  // currently open, so the map cannot light up a pin the card is not about.
  useEffect(() => {
    if (!mapRef.current || !mapLoaded) return;
    const layer = mapRef.current.getLayer('observation-selected-halo');
    if (layer) {
      mapRef.current.setFilter('observation-selected-halo', [
        '==',
        ['get', 'passport_id'],
        selectedPassportId ?? '',
      ]);
    }
  }, [selectedPassportId, mapLoaded]);

  // Center on Rwanda view
  const handleResetRwanda = () => {
    if (!mapRef.current) return;
    mapRef.current.flyTo({
      center: MAP_CONFIG.initialCenter,
      zoom: MAP_CONFIG.initialZoom,
      essential: true,
    });
  };

  const handleZoomIn = () => {
    if (mapRef.current) mapRef.current.zoomIn();
  };

  const handleZoomOut = () => {
    if (mapRef.current) mapRef.current.zoomOut();
  };

  // Tilt the camera between the flat plan (2D) and a Google-style tilt (3D).
  const handleToggle3d = () => {
    const map = mapRef.current;
    if (!map) return;
    const next = !is3d;
    setIs3d(next);
    setPitch(next ? 60 : 0);
    map.easeTo({ pitch: next ? 60 : 0, duration: 500 });
  };

  // Tilt is continuous, not just a two-state step: the slider drives the camera
  // pitch directly so a reader can hold an oblique view at any angle.
  const handlePitchChange = (value: number) => {
    const map = mapRef.current;
    if (!map) return;
    setPitch(value);
    map.setPitch(value);
  };

  // Rotate the camera a fixed step each way. The compass beside these buttons
  // reports the resulting bearing and returns the map to north.
  const handleRotate = (delta: number) => {
    const map = mapRef.current;
    if (!map) return;
    map.easeTo({ bearing: map.getBearing() + delta, duration: 300 });
  };

  // The compass: the map is not level while it is rotated, and this is how it is
  // set back to north.
  const handleCompass = () => {
    const map = mapRef.current;
    if (!map) return;
    map.easeTo({ bearing: 0, duration: 400 });
  };

  // Globe or flat. The projection is a real style change, not a zoom trick.
  const handleToggleGlobe = () => {
    const map = mapRef.current;
    if (!map) return;
    const next = !globeOn;
    setGlobeOn(next);
    map.setProjection({ type: next ? 'globe' : 'mercator' });
  };

  // "Show my location": one honest attempt at a real GPS fix, then a blue dot on
  // the map. The browser prompts for permission; denial is reported, not silent.
  const handleLocate = () => {
    if (!mapRef.current || locating) return;
    if (!preferencesStore.get().allowLocation) {
      alert(
        'Location is switched off. Turn it on in Location sharing (sidebar, Personal tools) to use this.'
      );
      return;
    }
    if (!('geolocation' in navigator)) {
      alert('Your browser does not support geolocation.');
      return;
    }
    setLocating(true);
    navigator.geolocation.getCurrentPosition(
      (position) => {
        setLocating(false);
        const map = mapRef.current;
        if (!map) return;
        const { longitude, latitude } = position.coords;
        const accuracy = position.coords.accuracy;
        map.flyTo({
          center: [longitude, latitude],
          zoom: Math.max(map.getZoom(), 14),
          essential: true,
        });
        const source = map.getSource('user-location') as GeoJSONSource | undefined;
        if (source) {
          source.setData({
            type: 'FeatureCollection',
            features: [
              {
                type: 'Feature',
                properties: { accuracy },
                geometry: { type: 'Point', coordinates: [longitude, latitude] },
              },
            ],
          });
        }
      },
      (error) => {
        setLocating(false);
        const messages: Record<number, string> = {
          1: 'Location permission was denied. Allow location access for this site in your browser and try again.',
          2: 'Your location could not be determined right now.',
          3: 'Timed out waiting for your location.',
        };
        alert(messages[error.code] ?? 'Unable to get your location.');
      },
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 30000 }
    );
  };

  // -------------------------------------------------------------------------
  // In-map navigation
  // -------------------------------------------------------------------------
  // Reaching a chosen observation starts and ends inside this component: the
  // user's own position resolves by browser geolocation, the route is drawn by
  // this map, and no outside map or app is ever opened.

  const setRouteSource = (coordinates: [number, number][] | null) => {
    const source = mapRef.current?.getSource('nav-route') as GeoJSONSource | undefined;
    if (!source) return;
    source.setData(
      coordinates
        ? {
            type: 'FeatureCollection',
            features: [
              {
                type: 'Feature',
                properties: {},
                geometry: { type: 'LineString', coordinates },
              },
            ],
          }
        : { type: 'FeatureCollection', features: [] }
    );
  };

  const beginNavigation = (longitude: number, latitude: number, label: string) => {
    const map = mapRef.current;
    if (!map) return;
    setHoverCard(null);
    setNav({ destLongitude: longitude, destLatitude: latitude, label });
    setNavStatus('locating');
    setNavError(null);
    setNavInfo(null);
    setRouteSource(null);

    if (!preferencesStore.get().allowLocation) {
      setNavStatus('error');
      setNavError(
        'Location is switched off, so the route cannot start. Turn it on in Location sharing.'
      );
      return;
    }
    if (!('geolocation' in navigator)) {
      setNavStatus('error');
      setNavError('Your browser does not support geolocation.');
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (position) => {
        const { longitude: oLng, latitude: oLat } = position.coords;
        const userSource = map.getSource('user-location') as GeoJSONSource | undefined;
        userSource?.setData({
          type: 'FeatureCollection',
          features: [
            {
              type: 'Feature',
              properties: { accuracy: position.coords.accuracy },
              geometry: { type: 'Point', coordinates: [oLng, oLat] },
            },
          ],
        });
        void (async () => {
          setNavStatus('routing');
          const origin = { lng: oLng, lat: oLat };
          const destination = { lng: longitude, lat: latitude };
          const route = await fetchDrivingRoute(origin, destination);
          const straight = !route;
          const coordinates =
            route?.geometry ?? straightLinePoints(origin, destination);
          setRouteSource(coordinates);
          setNavInfo({
            distance: route?.distance ?? haversineMetres(origin, destination),
            duration: route?.duration ?? null,
            straight,
          });
          setNavStatus('ready');
          map.fitBounds(
            [
              [Math.min(oLng, longitude), Math.min(oLat, latitude)],
              [Math.max(oLng, longitude), Math.max(oLat, latitude)],
            ],
            { padding: 120, duration: 800, essential: true }
          );
        })();
      },
      (error) => {
        setNavStatus('error');
        const messages: Record<number, string> = {
          1: 'Location permission was denied. Allow location access for this site so the map can show the way.',
          2: 'Your location could not be determined right now.',
          3: 'Timed out waiting for your location.',
        };
        setNavError(messages[error.code] ?? 'Unable to get your location.');
      },
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 30000 }
    );
  };

  const endNavigation = () => {
    setRouteSource(null);
    setNav(null);
    setNavStatus('ready');
    setNavError(null);
    setNavInfo(null);
  };

  // An outside request (the observation side card) starts the same trip as the
  // hover card, so both surfaces share one navigation implementation. A target
  // that stays the same across renders is handled exactly once.
  useEffect(() => {
    if (!navTarget || handledNavTarget.current === navTarget) return;
    handledNavTarget.current = navTarget;
    beginNavigation(navTarget.longitude, navTarget.latitude, navTarget.label);
    // beginNavigation is stable by closure over the map ref only.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [navTarget]);

  return (
    <div className="relative w-full h-full min-h-[420px] bg-[#f0f4f9] overflow-hidden">
      {/* Map Container */}
      <div ref={mapContainerRef} className="w-full h-full min-h-[420px]" />

      {/* Map controls. Bottom-right stack like Google Maps: reset, show my
          location, then the zoom buttons. The search field owns the top of the
          map. */}

      {/* Loading is a 3px progress line on the very top edge of the canvas, the
          way Google Maps indicates a fetch. It never overlaps the search field. */}
      {loading && (
        <div className="absolute top-0 left-0 right-0 h-[3px] overflow-hidden z-20 bg-[#d3e3fd]">
          <div className="h-full w-1/3 bg-[#0b57d0] animate-pulse" />
        </div>
      )}
      {/* The tilt slider, shown only while the camera is oblique. It sits just to
          the left of the control stack, where Google Maps puts its tilt readout. */}
      {is3d && (
        <div className="absolute bottom-8 right-14 z-10 flex items-center gap-2 rounded-xl border border-[#e3e3e3] bg-white px-3 py-2 shadow-[var(--g-elev-1)]">
          <span className="text-[11px] font-medium text-[#5e5e5e]">Tilt</span>
          <input
            type="range"
            min={0}
            max={70}
            step={1}
            value={Math.round(pitch)}
            onChange={(e) => handlePitchChange(Number(e.target.value))}
            aria-label="Map tilt"
            className="w-28 accent-[#0b57d0]"
          />
          <span className="w-7 text-right text-[11px] tabular-nums text-[#5e5e5e]">
            {Math.round(pitch)}°
          </span>
        </div>
      )}
      <div className="absolute bottom-8 right-3 z-10 flex flex-col items-center overflow-hidden rounded-xl border border-[#e3e3e3] shadow-[var(--g-elev-1)] bg-white text-[#5e5e5e]">
        {/* Show the reader's own posts. Only offered when they actually have a
            located post of their own to show, and never in "My Map", where the
            overlay is the view itself rather than an optional layer. */}
        {!ownOnly && ownerPosts && ownerPosts.length > 0 && (
          <button
            onClick={() => setShowOwn((prev) => !prev)}
            title={showOwn ? 'Hide my posts' : 'Show my posts'}
            aria-label={showOwn ? 'Hide my posts' : 'Show my posts'}
            aria-pressed={showOwn}
            className={`h-9 w-9 flex items-center justify-center transition-colors border-b border-[#e3e3e3] ${
              showOwn ? 'bg-[#ede9fe] text-[#6d28d9]' : 'hover:bg-[#f0f4f9]'
            }`}
          >
            {showOwn ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
          </button>
        )}
        {/* Globe or flat. */}
        <button
          onClick={handleToggleGlobe}
          title={globeOn ? 'Switch to the flat map' : 'Switch to the globe'}
          aria-label={globeOn ? 'Switch to the flat map' : 'Switch to the globe'}
          aria-pressed={globeOn}
          className={`h-9 w-9 flex items-center justify-center transition-colors border-b border-[#e3e3e3] ${
            globeOn ? 'bg-[#ede9fe] text-[#6d28d9]' : 'hover:bg-[#f0f4f9]'
          }`}
        >
          <Globe className="w-4 h-4" />
        </button>
        {/* 2D/3D tilt, with the continuous slider beside it. */}
        <button
          onClick={handleToggle3d}
          title={is3d ? 'Switch to 2D' : 'Switch to 3D'}
          aria-label={is3d ? 'Switch to 2D view' : 'Switch to 3D view'}
          aria-pressed={is3d}
          className={`h-9 w-9 flex items-center justify-center text-[11px] font-semibold tracking-tight transition-colors border-b border-[#e3e3e3] ${
            is3d ? 'bg-[#e8f0fe] text-[#0b57d0]' : 'hover:bg-[#f0f4f9]'
          }`}
        >
          {is3d ? '2D' : '3D'}
        </button>
        {/* Rotate left, reset to north, rotate right. The compass needle turns
            with the map so a rotated view is visibly off-north. */}
        <button
          onClick={() => handleRotate(-45)}
          title="Rotate left"
          aria-label="Rotate left"
          className="h-9 w-9 flex items-center justify-center hover:bg-[#f0f4f9] transition-colors border-b border-[#e3e3e3]"
        >
          <RotateCcw className="w-4 h-4" aria-hidden="true" />
        </button>
        <button
          onClick={handleCompass}
          title="Reset to north"
          aria-label="Reset to north"
          disabled={Math.abs(bearing) < 0.01}
          className="h-9 w-9 flex items-center justify-center hover:bg-[#f0f4f9] transition-colors border-b border-[#e3e3e3] disabled:opacity-40"
        >
          <Rotate3d
            className="w-4 h-4 transition-transform duration-200"
            style={{ transform: `rotate(${-bearing}deg)` }}
            aria-hidden="true"
          />
        </button>
        <button
          onClick={() => handleRotate(45)}
          title="Rotate right"
          aria-label="Rotate right"
          className="h-9 w-9 flex items-center justify-center hover:bg-[#f0f4f9] transition-colors border-b border-[#e3e3e3]"
        >
          <RotateCw className="w-4 h-4" aria-hidden="true" />
        </button>
        <button
          onClick={handleResetRwanda}
          title="Reset View to Rwanda"
          aria-label="Reset view to Rwanda"
          className="h-9 w-9 flex items-center justify-center hover:bg-[#f0f4f9] transition-colors border-b border-[#e3e3e3]"
        >
          <Maximize2 className="w-4 h-4" />
        </button>
        <button
          onClick={handleLocate}
          disabled={locating}
          title="Show my location"
          aria-label="Show my location"
          className="h-9 w-9 flex items-center justify-center hover:bg-[#f0f4f9] transition-colors border-b border-[#e3e3e3] disabled:opacity-50"
        >
          <Crosshair className="w-4 h-4" />
        </button>
        <button
          onClick={handleZoomIn}
          title="Zoom in"
          aria-label="Zoom in"
          className="h-9 w-9 flex items-center justify-center hover:bg-[#f0f4f9] transition-colors border-b border-[#e3e3e3]"
        >
          <Plus className="w-4 h-4" />
        </button>
        <button
          onClick={handleZoomOut}
          title="Zoom out"
          aria-label="Zoom out"
          className="h-9 w-9 flex items-center justify-center hover:bg-[#f0f4f9] transition-colors"
        >
          <Minus className="w-4 h-4" />
        </button>
      </div>

      {/* Google-style map chrome, bottom-left. The style selector changes the
          basemap (and offers the visual-only layers); the "show sidebar"
          button brings the navigation column back after it has been closed
          with its X. */}
      <div className="absolute bottom-8 left-3 z-20 flex flex-col items-start gap-2">
        {sidebarHidden && onOpenSidebar && (
          <button
            type="button"
            onClick={onOpenSidebar}
            className="h-10 pl-3 pr-4 flex items-center gap-2 rounded-full border border-[#e3e3e3] bg-white shadow-[var(--g-elev-2)] text-[13px] font-medium text-[#1f1f1f] hover:bg-[#f0f4f9] transition-colors"
          >
            <Menu className="w-4 h-4 text-[#5e5e5e]" aria-hidden="true" />
            Show sidebar
          </button>
        )}
        {/* The map-style selector: a medium 96x96 card that grows sideways
            into the style panel on hover, exactly like desktop Google Maps.
            Satellite is one of the tiles, so no second card is needed. */}
        <MapStyleSelector active={activeStyle} onSelect={handleStyleSelect} />
      </div>

      {/* Attribution Requirement (Section 65). The source follows the active
          layer: the vector base is OpenStreetMap, as are the streets overlay
          and its default fallback, and the raster overlays are Esri. The scale
          bar heads this line, where there is room for it - it used to sit
          under the style card at the bottom-left corner and crowd it. */}
      {/* Over satellite imagery the grey text disappears into the photo, so
          that one view switches to white with a dark halo, the way Google
          Maps labels its own imagery attribution. */}
      <div
        className={`absolute bottom-1 right-3 z-10 flex items-center gap-2 text-[10px] ${
          satelliteView
            ? 'text-white [text-shadow:0_1px_3px_rgba(0,0,0,0.9)]'
            : 'text-[#5e5e5e]'
        }`}
      >
        <span
          className="flex items-center gap-1"
          title="Ground distance at the centre of the map"
        >
          <span
            className="block h-[6px] border-x border-b border-current"
            style={{ width: `${scaleBar.width}px` }}
            aria-hidden="true"
          />
          <span className="leading-none">{scaleBar.label}</span>
        </span>
        <span>
          {basemap === 'satellite' ? (
            'Imagery © Esri, Maxar, Earthstar Geographics'
          ) : basemap === 'terrain' ? (
            'Terrain © Esri, USGS, NOAA'
          ) : (
            <>
              ©{' '}
              <a
                href="https://www.openstreetmap.org/copyright"
                target="_blank"
                rel="noreferrer"
                className={`underline ${
                  satelliteView ? 'hover:text-[#e8eaed]' : 'hover:text-[#1f1f1f]'
                }`}
              >
                OpenStreetMap contributors
              </a>
            </>
          )}{' '}
          · Earth Talk GeoAI
        </span>
      </div>

      {/* In-map navigation card: bottom-centre, above the attribution but under
          the pins' hover card. Every step of the trip runs on this map. */}
      {nav && (
        <div className="absolute bottom-24 left-1/2 z-20 w-[min(340px,calc(100vw-32px))] -translate-x-1/2 rounded-xl border border-[#e3e3e3] bg-white p-3 shadow-[var(--g-elev-2)]">
          <div className="flex items-center gap-2.5">
            <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-[#e8f0fe] text-[#0b57d0]">
              {navStatus === 'locating' || navStatus === 'routing' ? (
                <span className="h-4 w-4 animate-spin rounded-full border-2 border-[#0b57d0] border-t-transparent" />
              ) : (
                <Navigation className="h-4 w-4" aria-hidden="true" />
              )}
            </span>
            <div className="min-w-0 flex-1">
              <p className="truncate text-[13px] font-medium text-[#1f1f1f]">
                Navigate to {nav.label}
              </p>
              <p className="text-[11px] text-[#5e5e5e]">
                {navStatus === 'locating' && 'Finding your location…'}
                {navStatus === 'routing' && 'Calculating the route on our map…'}
                {navStatus === 'error' && 'Navigation could not start.'}
                {navStatus === 'ready' &&
                  navInfo &&
                  (navInfo.straight
                    ? `${formatNavMetres(navInfo.distance ?? 0)} · straight line`
                    : `${formatNavMetres(navInfo.distance ?? 0)} · about ${Math.max(
                        1,
                        Math.round((navInfo.duration ?? 0) / 60)
                      )} min`)}
              </p>
            </div>
            <button
              type="button"
              onClick={endNavigation}
              title="End navigation"
              aria-label="End navigation"
              className="g-icon-btn h-8 w-8 border border-[#e3e3e3] bg-white text-[#5e5e5e] hover:bg-[#f0f4f9]"
            >
              <X className="h-4 w-4" aria-hidden="true" />
            </button>
          </div>
          {navStatus === 'error' && navError && (
            <p className="mt-2 text-[11px] leading-snug text-[#c5221f]">{navError}</p>
          )}
          {navStatus === 'ready' && (
            <button
              type="button"
              onClick={endNavigation}
              className="mt-2.5 h-8 w-full rounded-full bg-[#e8f0fe] text-[12px] font-medium text-[#0b57d0] transition-colors hover:bg-[#d3e3fd]"
            >
              End navigation
            </button>
          )}
        </div>
      )}

      {/* Floating location preview over the hovered pin, Google-Maps style: a
          white card with a landscape header, the essentials, and a single round
          action (save) beside the title. `pointer-events-auto` so its buttons work even though the
          whole map surface beneath it is inert to clicks. */}
      {hoverCard && (
        <div
          className="absolute z-30"
          style={{
            left: hoverCard.x,
            top: hoverCard.y,
            transform: 'translate(-50%, calc(-100% - 16px))',
          }}
          onMouseEnter={cancelHoverCardHide}
          onMouseLeave={hideHoverCardSoon}
        >
          <MapLocationCard
            title={hoverCard.data.title}
            category={hoverCard.data.category}
            rating={hoverCard.data.rating}
            secondary={hoverCard.data.secondary}
            description={hoverCard.data.description}
            status={hoverCard.data.status}
            accentColor={hoverCard.data.accentColor}
            latitude={hoverCard.data.latitude}
            longitude={hoverCard.data.longitude}
            imageUrl={hoverCard.data.imageUrl}
            saved={savedLocations.has(hoverCard.data.id)}
            onToggleSave={() => toggleSavedLocation(hoverCard.data)}
            onNavigate={
              hoverCard.data.longitude !== null &&
              hoverCard.data.longitude !== undefined &&
              hoverCard.data.latitude !== null &&
              hoverCard.data.latitude !== undefined
                ? () =>
                    beginNavigation(
                      hoverCard.data.longitude!,
                      hoverCard.data.latitude!,
                      hoverCard.data.title
                    )
                : undefined
            }
          />
        </div>
      )}
    </div>
  );
};
