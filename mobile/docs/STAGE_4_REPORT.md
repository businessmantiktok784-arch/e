# Earth Talk Mobile — Stage 4 report

## Summary

Added a native interactive map using Expo SDK 58's SDK-matched Expo Maps package (`expo-maps ~58.0.9`). The map requests real features from `GET /api/public/observations.geojson`, uses existing public category and search filters, validates WGS84 GeoJSON Points, excludes demonstration records and malformed/unlocated features, clusters real points, and opens the existing public detail route from selected observations. No new backend route, database access, location permission, or device-location collection was introduced.

## Mapping library and compatibility

- Expo Maps provides native Apple Maps on iOS and Google Maps on Android. Web uses an explicit non-map fallback.
- Expo Maps is a native module and requires a custom development/release build; it is not available in Expo Go. iOS target is 18.0 for annotation tap callbacks.
- Android requires a Google Maps Android SDK API key restricted to package `org.earthtalk.mobile` and the development/release signing SHA-1. No key was supplied or copied. Android shows a configuration-required state when it is absent.
- `expo-maps` plugin is present in Expo configuration. `app.config.ts` forwards the optional key to native Android config and exposes only a configured boolean to app runtime.
- Reference: [Expo SDK 58 Maps documentation](https://docs.expo.dev/versions/v58.0.0/sdk/maps/).

## Verified API and map behavior

- `GET /api/public/observations.geojson?search=…&category=…`, public read-only endpoint; no authorization header. The API client applies the existing timeout, abort signal, HTTP classification, and GeoJSON envelope validation.
- `GET /api/public/categories`, existing API supplies category labels; filters are not hard-coded in mobile.
- GeoJSON geometry is Point with `[longitude, latitude]` order. Mobile validates finite WGS84 ranges and does not swap fields.
- The backend generates public coordinates under its existing location resolver and omits features without safe coordinates. The response does not expose each feature's precision; the app warns that points may be generalized and does not print raw coordinates.
- Mobile filters labeled demo records and rejects malformed records; valid public list records without map geometry remain accessible from Explore.
- Search and category filters are sent to the server. The endpoint has no pagination. Mobile client-clusters the returned real points on a 64-pixel Web Mercator grid at current zoom, which keeps co-located/generalized district points grouped. Cluster counts are source feature counts, never fabricated.
- Selecting a point opens a compact preview with available actual fields and the existing detail route. Cluster selection zooms and shows a real member list. Camera initial position derives from returned points; the neutral Rwanda camera is used only when no safe point is available. No current-location control is included.
- Native map loading timeout, map failure, API loading/error/retry, stale results, empty/filtered states, missing images, Android missing-key and web-not-native states are represented.

## Files added or changed

Added:

- `app.config.ts`
- `features/map/geojson.ts`
- `features/map/ObservationMap.native.tsx`
- `features/map/ObservationMap.tsx`
- `tests/map.test.ts`
- `docs/MOBILE_GIS.md`
- `docs/STAGE_4_REPORT.md`

Changed:

- `package.json` and lockfile (SDK-compatible `expo-maps` dependency only)
- `app.json` (Expo Maps plugin, Android package ID, iOS 18 map-interaction target)
- `.env.example` (blank public Google Android Maps key name)
- `app/(tabs)/map.tsx`
- `types/api.ts`, `services/api.ts`, `hooks/useObservations.ts` (typed FeatureCollection validation and filtered map query)
- `components/ObservationImage.tsx` (compact safe thumbnail variant)
- `tests/api.test.ts`
- `README.md`, `docs/MOBILE_API_CONTRACT.md`, `docs/MOBILE_API_GAPS.md`

All these paths are within `mobile/`.

## Commands run and observed results

- `npm run typecheck` — passed.
- `npm test` — passed: 17 tests, 0 failures, including coordinate boundaries/rejections/order, malformed and demo feature exclusion, filters, real IDs, clustering counts, empty camera and date-line behavior, and verified map URL/filter/error shape.
- `npm run check:expo` — passed; SDK 58 config resolved, Expo Maps plugin present, no Android key configured.
- `npx expo export --platform android --output-dir dist-stage4-check` — passed; Android Hermes JS bundle completed with 1,299 modules. Generated output was removed after verification.
- No lint script exists in `mobile/package.json`; no lint command was run.
- Android SDK/`adb`/emulator and Xcode/iOS simulator were unavailable. No native development build or device map interaction was run. No live backend or map-provider requests were made.
- Git status/diff could not be obtained because this workspace has no Git metadata. Deliberate edits and generated cleanup were confined to `mobile/`.

## Limitations and outstanding verification

- Android native rendering needs an operator-provided restricted Google Maps key and a rebuild. The checked-in example remains blank.
- iOS/Android native marker taps, map rendering, camera controls, map provider failure behavior, and the Android key setup remain device/build-unverified. JS export and Expo configuration do not prove native map rendering.
- The API returns a non-paginated full filtered FeatureCollection. Current camera movement does not submit `bbox`; there is no map viewport/radius search or server-side clustering. Client clustering does not reduce network transfer.
- Location precision is absent per GeoJSON feature, so the app cannot distinguish exact from generalized public points in individual preview labels.
- Search/category, API retry, and coordinates are automated unit-tested; native map event interactions and navigation from a device were not instrumented by a component-test harness.

## Scope confirmation and Stage 5

No existing backend, database schema/migration/policy, or web frontend files were changed. No server-side key, credential, populated environment value, fabricated record, or invented coordinate was added. Stage 4 mobile implementation and automated checks are complete; native platform/provider verification remains outstanding. Stage 5 should not begin until explicit approval and should start with an Android key plus iOS/Android development builds and device QA, then measure response size before deciding whether separately approved backend viewport support is needed.
