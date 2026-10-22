# Earth Talk Mobile

Standalone Expo Router and React Native client for Earth Talk’s existing HTTP API. The web application and backend remain separate and are not imported by this project.

## Prerequisites and setup

- Node.js 20.19.4+ (React Native 0.81 requirement for Expo SDK 54).
- npm and an existing Earth Talk backend reachable from the selected device.

From this directory:

```sh
npm install
Copy-Item .env.example .env   # PowerShell; configure public values
npm start
```

For macOS/Linux, use `cp .env.example .env`. Restart Expo after changing environment variables. `npm run web` starts a browser preview; app screens are native React Native components, not a WebView.

## Project structure

There is no `src/` folder; each module owns a top-level folder:

- `app/` – Expo Router routes (`(tabs)/`, `observations/[id].tsx`, `settings.tsx`).
- `components/` – shared UI (Screen, AsyncState/AsyncPanel, ObservationCard, ObservationImage, WhatsAppSubmissionButton).
- `hooks/` – `useObservations` React Query hooks.
- `services/` – typed API client and contributor token storage.
- `features/map/` – GeoJSON parsing and the native/web map views.
- `auth/` – `AuthProvider` (SecureStore session).
- `theme/` – palettes (`theme.ts`) and `ThemeProvider` (`theme-provider.tsx`).
- `types/`, `utils/` – API types and pure helpers.
- `tests/`, `docs/`, `scripts/`, `assets/` – tests, documentation, asset generator, and static assets.

## Environment and network address

Configure `EXPO_PUBLIC_API_BASE_URL` as a complete HTTP(S) origin with no path, credentials, query, or fragment. `EXPO_PUBLIC_WHATSAPP_NUMBER` is an optional public recipient number in international digits; operators should copy it from the existing verified web `VITE_WHATSAPP_NUMBER` configuration. The example file is blank and contains no populated deployment values. If not configured, the WhatsApp action opens the same generic picker fallback used by the website.

Example API addresses:

```dotenv
EXPO_PUBLIC_API_BASE_URL=http://10.0.2.2:3000
EXPO_PUBLIC_WHATSAPP_NUMBER=
```

- Android Studio’s standard emulator uses `10.0.2.2` to reach the development computer; `localhost` is the emulator itself.
- iOS simulator can generally use `localhost` for a backend on the same Mac.
- A physical phone needs the computer’s LAN address (for example `http://192.168.1.20:3000`), the same network, and firewall access.
- Production should use the deployment’s stable HTTPS origin. Do not keep a temporary tunnel URL as a production value.

The existing server listens on `0.0.0.0` and defaults to port `3000`. Development may use HTTP on an emulator or trusted LAN. Production builds reject non-HTTPS origins and localhost/loopback API hosts; configure a stable HTTPS service origin before producing a release bundle. The application calls the server’s public HTTP endpoints and does not connect directly to Supabase. Never place Gemini, WhatsApp access tokens, database passwords, Supabase service-role keys, or other server credentials in this client.

## Native geological map

Stage 4 uses the SDK-matched `expo-maps` package (`~0.12.7`) with Expo SDK 54. The native map uses Apple Maps on iOS and Google Maps on Android. Expo Maps requires a native development build; it does not render in Expo Go. The web preview displays a clear native-app requirement rather than a fake map.

For Android, enable the **Maps SDK for Android** in Google Cloud, create an Android-restricted API key for package `org.earthtalk.mobile` and the signing certificate SHA-1 used by the development/release build, and place that public, application-restricted key in local `EXPO_PUBLIC_GOOGLE_MAPS_API_KEY`. Never use a server key or an unrestricted key. The config plugin adds it to native Android Maps configuration; a new native build is required after changing it. No key is required by this app for the iOS Apple Maps provider. The iOS deployment target is 18.0 (set through the `expo-build-properties` config plugin) so marker tap callbacks are available.

Build and launch the native app with the platform tools installed:

```sh
npx expo run:android
npx expo run:ios
```

The Android emulator also needs the configured Google key. On a physical Android phone, the backend URL must use a LAN-reachable host. The map itself does not request device location or ask for location permission. Map search and category filters use the public GeoJSON endpoint; panning is local and does not claim nearby/radius search. Pins can be generalized and the backend does not expose the precision of each returned map feature.

## Development and validation

```sh
npm start
npm run typecheck
npm run check:expo
npx expo install --check
npx expo-doctor
npm test
npx expo export --platform android --output-dir dist-stage-check
```

Expo is pinned to SDK `54.0.8` with its matching `react-native@0.81.4` dependency matrix, so `npx expo install --check` may suggest the later SDK 54 patch releases (`expo ~54.0.37`, `react-native 0.81.5`); that suggestion is expected while the pin is kept.

Use `npm run android` or `npm run ios` when the corresponding simulator/device tooling is available. API calls use a typed centralized service, request cancellation/timeouts, and response-shape checks. Explore supports API-backed search and categories, refresh, and pagination. Community displays real open investigations, recent observations, public sites, and site visits; it supports verified fixed-choice votes and a confirmed site-visit record. The native map uses real public coordinates when available. Detail screens show public fields, the primary image when provided, and public comments.

The Home, Explore, Community, and Profile screens link into the established WhatsApp `START` flow. They do not capture or upload a new photo to the AI service. Anonymous community voting and visit reports use the backend-issued pseudonymous token stored with Expo SecureStore on native devices. The Profile tab also supports the existing WhatsApp OTP sign-in, SecureStore-backed bearer session, owner-only observation history, profile display-name update, and server-revoked sign-out. Signed-in users can post comments through the existing authorized comments route.

## Profile, settings, and appearance

Profile supports optional guest browsing and the backend's WhatsApp verification flow. The phone number and one-time code remain in screen memory only; the opaque session token is stored using native SecureStore, checked against the API on startup, and revoked through the server on sign-out. No native sign-in is available in web preview. Settings offers System, Light, and Dark appearance. The selected mode is stored locally in AsyncStorage under a versioned preference key; it contains no account or location data. The default is System, and React Native text scaling remains enabled so device accessibility text-size settings apply. See `docs/MOBILE_SETTINGS.md`.

## Splash and brand assets

Expo's `expo-splash-screen` plugin shows the Earth Talk geological-layer symbol on the `#F5F7F4` native splash background. The same mobile-owned mark is used for the launcher/adaptive icons and Home identity. Home tagline: **Every rock has a story.** Asset sources can be regenerated with `node scripts/create-brand-assets.mjs` from this directory. Native splash, launcher masks, and platform launch transitions still require an Android/iOS build and device review; JS export alone does not verify them. See `docs/SPLASH_SCREEN_AND_BRANDING.md`.

## Known limitations

- The backend has no direct mobile observation-create/image-upload/AI-analysis API. Submission continues in WhatsApp.
- Direct new-observation photo submission and AI analysis are not exposed through an existing mobile API; use the verified WhatsApp submission flow. `POST /api/posts/:passportId/media` only attaches media to an existing contributor-owned post and does not invoke AI.
- Question/answer, evidence, reporting, moderation, avatar, media attachment, and post-edit features remain unintegrated even where backend routes exist.
- Expo SecureStore is a native module; use a development/release build for secure community token storage. Web preview does not provide the supported native participation storage flow.
- The public GeoJSON endpoint returns all filtered map points without pagination; mobile clusters points only after receiving them. No general viewport/radius search is wired to map gestures.
- Expo Maps uses Apple/Google native basemaps rather than the website's MapLibre style. Offline geology tiles and a custom geology basemap are not configured. Android map rendering requires the restricted key described above.
- Public observation list responses do not include image URLs. Detail exposes one primary public still when available; the mobile UI has an honest placeholder on absent, invalid, or failed media. No video playback or gallery API is integrated.
- Real API, WhatsApp, and device interactions require a configured reachable deployment; tests use isolated mocked responses and do not create production records.
- Stage 7's `npm audit --omit=dev` reported 27 dependency advisories (8 moderate, 19 high). The suggested forced fix would downgrade Expo across major versions; do not apply it blindly. Resolve the dependency tree through an Expo-compatible update and rerun the audit before release.

See `docs/STAGE_3_REPORT.md`, `docs/STAGE_4_REPORT.md`, `docs/STAGE_5_REPORT.md`, `docs/STAGE_6_REPORT.md`, `docs/MOBILE_API_CONTRACT.md`, `docs/MOBILE_COMMUNITY.md`, `docs/MOBILE_SETTINGS.md`, and `docs/MOBILE_QUALITY_REVIEW.md`.
