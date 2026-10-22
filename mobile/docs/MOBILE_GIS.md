# Earth Talk Mobile GIS

## Rendering architecture

`app/(tabs)/map.tsx` owns query/filter/selection/camera UI state. It uses `useMapData()` and the centralized API service; `features/map/geojson.ts` validates and converts the public GeoJSON into a small presentation model. Expo Router's platform resolver loads `ObservationMap.native.tsx` in iOS/Android builds and the honest text fallback `ObservationMap.tsx` in the web preview. `ObservationImage` handles map preview thumbnails using the existing HTTP(S)-only URL guard and image-failure placeholder.

The native renderer uses Expo SDK 54's matching `expo-maps ~0.12.7`: Apple Maps on iOS and Google Maps on Android. It is a native view and requires a development/release build; Expo Go and the web preview do not provide that native module. iOS deployment target is 18.0 because Expo Maps documents marker click callbacks for iOS 18+; pins are rendered as `markers` on both platforms so a tap selects an observation or a cluster. No location permission, location layer, or background location feature is enabled.

## API and coordinates

Mobile calls `GET /api/public/observations.geojson` with optional existing `search` and `category` query parameters. The source route is `src/routes/public.routes.ts`; response generation is `src/controllers/public.controller.ts` and `src/repositories/public-observation.repository.ts`. The public repository returns a GeoJSON FeatureCollection and omits features when the privacy-aware coordinate resolver returns no location. This endpoint has no pagination and may include records labeled `is_demo` when demo mode is enabled; mobile excludes them.

GeoJSON Point coordinates follow WGS84 order `[longitude, latitude]`, verified from the repository and `src/utils/public-location.ts`. `validateGeographicCoordinate(latitude, longitude)` rejects non-numeric, non-finite, or out-of-range values. The parser requires exactly two numeric coordinates in GeoJSON order and never swaps them. Missing geometry, non-Point geometries, malformed coordinates, or missing IDs/categories do not create markers. Demonstration records are omitted separately.

The backend may resolve public points as district representative locations, generalized approximate locations, or exact points after its consent gate. GeoJSON does not provide a per-point precision value. The app therefore does not render numeric coordinates and tells users that public points may be generalized. Map features without a safe coordinate remain discoverable through Explore when returned by its API.

## Categories, search, and clustering

The filter taxonomy comes from `GET /api/public/categories`; mobile does not duplicate category names. The selected category and debounced search text are passed to the existing GeoJSON endpoint and represented in the React Query key. The backend applies them server-side. The screen does not claim global radius search or viewport search. Although the backend accepts a `bbox` filter, the mobile map does not currently issue bbox requests when the camera moves.

`createMapRenderItems` groups valid real points into 64-pixel Web Mercator cells at the current zoom. A cell with one record is an individual marker; a cell with multiple records remains a cluster, including when points share the same generalized district coordinate. Cluster counts are the number of included non-demo observations in each group. Selecting a cluster zooms to its center and shows a horizontal preview of up to eight real members, plus the actual total. A member opens its existing public observation detail route by `passport_id`. Clustering is client-side; all filtered GeoJSON features are still transferred and parsed.

## Camera behavior and controls

With valid points, the initial camera is derived from the returned coordinates and uses the smallest longitude arc to handle the international date line. Single-point zoom is capped at 8.5 to avoid an excessively close initial view; multiple-point zoom is bounded between 2.5 and 8.5. With no safe points, a neutral Rwanda view (`-1.9403, 29.8739`) is used, matching the existing public resolver fallback. It is a neutral map camera only; it does not create an observation or marker. User pan/zoom updates the clustering zoom. Zoom controls and a fit-to-results control operate on the camera. No control requests current device location.

## Empty and failure behavior

- Initial request displays a loading indicator.
- No safe points explains why observations can still be available in Explore.
- Empty category/search results provide an Explore link.
- API errors show a retry action; when React Query has prior data, that data stays visible with a stale-result retry notice.
- Invalid or demonstration features are never markers; invalid records are counted as omitted in the current valid-point summary.
- Missing/invalid/unreachable public images use the existing image placeholder.
- A map that fails to initialize shows retry and Explore actions.
- Android without its Google Maps key shows a configuration-required state and retains access to Explore/API data.
- Web preview shows a native-map requirement and does not draw a decorative map.

## Native build and provider configuration

`expo-maps` is installed at the SDK-compatible version and added through the Expo config plugin. `mobile/app.config.ts` reads optional `EXPO_PUBLIC_GOOGLE_MAPS_API_KEY` and passes it to the Android Google Maps SDK config. The key is a public app credential and must be restricted in Google Cloud to the Android Maps SDK, application package `org.earthtalk.mobile`, and the development/release signing certificate SHA-1. It must never be a server credential or unrestricted key. Rebuild native binaries after adding/changing the key. The key is blank in `.env.example`; none was supplied for this implementation.

iOS uses Apple Maps and no app-supplied provider key. The mobile app's iOS deployment target is set to 18.0 through the `expo-build-properties` config plugin for marker interaction support. Use `npx expo run:android` or `npx expo run:ios` with the corresponding native toolchain. `npx expo export --platform android` validates JS bundling but does not verify native provider setup or a device-rendered map.
