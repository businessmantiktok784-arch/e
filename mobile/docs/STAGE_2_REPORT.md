# Stage 2 report

## Implemented

- Created a separate Expo Router application named **Earth Talk** with strict TypeScript, safe-area support, TanStack Query, and native icons.
- Added bottom tabs for Home, Explore, Map, Community, and Profile; added settings and dynamic observation detail routes.
- Home provides product identity, navigation, recent API records, an honest no-record state, submission limitation, and AI uncertainty note.
- Explore loads real paginated public observation summaries, supports pull-to-refresh/load-more, errors and empty responses, and opens detail.
- Detail loads `/api/public/observations/:passportId`, renders returned values, excludes private location coordinates from presentation, and separates AI confidence/uncertainty/limitations from expert verification status.
- Community loads public site records from `/api/community/sites`.
- Map loads real `/api/public/observations.geojson` feature counts but clearly reports that native map rendering is not configured.
- Profile does not invent an account or claim sign-in. Settings surfaces API configuration state.
- Central API client validates configuration and response shapes, handles both bare and nested API error envelopes, request timeout, cancellation, and malformed responses.

## API endpoints connected

- `GET /api/public/observations?page&limit`
- `GET /api/public/observations/:passportId`
- `GET /api/community/sites?limit=50`
- `GET /api/public/observations.geojson`

These exact routes and response structures were confirmed in existing source. No backend endpoint was created or changed.

## Configuration

Set `EXPO_PUBLIC_API_BASE_URL` in a local `mobile/.env`; `.env.example` has only the public variable name. Android emulator uses `10.0.2.2` for host loopback; a physical device uses a reachable LAN address and production must use HTTPS. No populated local API URL was supplied in this task, so runtime API success cannot be presumed.

## Verification

- `npm run typecheck` — passed (strict TypeScript).
- `npm test` — passed, 6 tests (configuration validation, verified URL construction, valid/malformed/error API envelopes, UI loading/error/empty/success state selection, and private-coordinate exclusion in observation card data).
- `npm run check:expo` — passed; Expo reported SDK 58 with Android, iOS, and web platforms.
- `npx expo export --platform android --output-dir dist-check` — passed; Metro bundled 1,284 modules into an Android JS bundle.
- `npx expo start --offline --port 8081` — Metro reached “Waiting on http://localhost:8081”. Expo DevTools emitted a permission warning for its AppData cache and used a fallback. No emulator or physical device was available/started, so native UI interaction and device API connectivity were not tested.
- `adb` was not available on PATH, and no API URL was supplied; therefore a device run, tab-tap verification, and live observation/site response check remain outstanding.
- `npx expo install --check` — sandbox attempt failed with `EACCES` during remote metadata access; elevated retry passed with “Dependencies are up to date”.
- npm install reported 27 dependency audit advisories (8 moderate, 19 high); no automatic audit fixes or dependency upgrades were applied.

Automated API tests use mocked responses only inside the test suite and do not add fake records to the app. The environment ran Node 25.9, which npm reported as outside this generated Expo SDK/React Native package engine range (Node 22.13+, 24.3+, or 26+). Bundle export and typecheck still completed; use a supported Node version for routine development.

## Known limitations

- No direct mobile image-upload/AI-analysis endpoint exists in inspected backend; capture workflow is deferred.
- Native map drawing awaits a selected map package and approved style/tile configuration.
- WhatsApp OTP and secure native session persistence are not implemented in this foundation.
- Public media may be unavailable; images appear only with an actual API URL.

## Existing project preservation

Only files under `mobile/` were created or modified. Root backend, database/migrations, and web frontend sources were not edited. Stage 1 reports were preserved.
