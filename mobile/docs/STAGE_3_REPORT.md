# Earth Talk Mobile — Stage 3 report

## Work completed

- Expanded the existing mobile API client with a verified filter contract, defensive response validation, timeout/cancellation handling, and typed error kinds for configuration, network, malformed data, HTTP, authorization, not-found, rate-limit, and server failures.
- Explore now uses the existing public search/category filters, loads its category choices and counts from the backend, preserves filter state while navigating within the tab, paginates using the server `pagination` object, supports pull-to-refresh, and reports empty, stale, load-more, and retry states. Search is server-side and debounced; it is not limited to already loaded rows.
- Observation cards show returned category, district/privacy summary, creation date, evidence state and verification status when available. Cards navigate with the actual `passport_id`.
- Detail treats a 404 as unavailable/not public, shows the public detail fields with scientific uncertainty and expert verification kept distinct, and renders a single primary public image only when its URL is HTTP(S). Missing, invalid, or failed images show an accessible placeholder. Coordinates are not rendered.
- Added an observation-submission action on Home and Explore. It matches the web client's `START` message and uses optional `EXPO_PUBLIC_WHATSAPP_NUMBER`; absent it opens the existing generic `wa.me` picker. The app explains that image analysis continues in WhatsApp and is not an in-app upload.
- Added `docs/MOBILE_API_CONTRACT.md` with the exact routes, request shapes, public access, pagination/search behavior, DTO shapes, and errors verified from backend source.
- Updated the mobile setup and gap documentation. The existing Map tab remains a GeoJSON count/unavailable native renderer; the Community tab remains a genuine public site listing.

## Files added or changed

Changed mobile-only files:

- `app/(tabs)/explore.tsx`, `app/(tabs)/index.tsx`, `app/observations/[id].tsx`
- `services/api.ts`, `types/api.ts`, `hooks/useObservations.ts`
- `components/ObservationCard.tsx`
- `tests/api.test.ts`
- `.env.example`, `README.md`, `docs/MOBILE_API_GAPS.md`

Added:

- `components/ObservationImage.tsx`, `components/WhatsAppSubmissionButton.tsx`
- `utils/media.ts`, `utils/whatsapp.ts`, `utils/observationNavigation.ts`
- `docs/MOBILE_API_CONTRACT.md`, `docs/STAGE_3_REPORT.md`

## Verified APIs used

- `GET /api/public/observations?page&limit&search&category` — real paginated public response; search and category are applied server-side.
- `GET /api/public/categories` — category taxonomy labels and real observation counts.
- `GET /api/public/observations/:passportId` — public detail and optional primary public still; 404 is intentionally non-disclosing.
- `GET /api/community/sites?limit=50` — public site records already used in Community.
- `GET /api/public/observations.geojson` — public feature data used by Map to report count only.

Full contracts and sources are in `docs/MOBILE_API_CONTRACT.md`.

## Commands run and results

- `npm run typecheck` — passed.
- `npm test` — passed, 11 tests. Tests cover API origin validation, verified list URL/response, query filter encoding, category response validation, network errors, not-found detail, malformed data, nested 429/503 errors, media URL filtering, configured/generic WhatsApp URL building, UI state selection, pagination/detail route mapping, and privacy-safe card data. Node emitted a module-type performance warning; it did not affect test results.
- `npm run check:expo` — passed; Expo public config resolved for SDK 58 and Android/iOS/web.
- `npx expo export --platform android --output-dir dist-stage3-check` — passed; Metro bundled 1,288 modules into the Android Hermes bundle.
- Backend/API connection, WhatsApp device handoff, simulator/emulator interaction, and physical-device network behavior were **not** tested: no deployment URL or device was available/configured. No production or mocked data was displayed as app content during these checks.
- `git status` was not available because this supplied workspace has no Git repository metadata. Scope was reviewed by file paths; all deliberate edits are inside `mobile/`.

## Stage 2 issue found

Stage 2 exposed only page/limit in the mobile observation client and did not provide category/search filtering or a safe detail-image failure state. The backend already supports these behaviors, so mobile-only integration completed them without modifying backend logic. Stage 2’s honest public-only/authentication and native-map limitations remain.

## Preservation and secrets

No backend routes/services, database schemas/migrations/policies, web frontend source, or existing populated environment file were modified. No secret values were read into output or copied into mobile. The presence of `VITE_WHATSAPP_NUMBER` in an environment file was checked without reading or displaying the value; the mobile example contains only blank public configuration names.

## Remaining limitations

- Native screen interaction and live data behavior require a reachable backend and device; those remain unverified.
- The current configured business contact is not copied into the app. Supply the approved public destination as `EXPO_PUBLIC_WHATSAPP_NUMBER`; without it, WhatsApp opens its generic chat picker.
- No direct photo-upload/AI, native login/session, community write operation, full media gallery/video, or native map renderer was added.
- `npm` advisory findings from the Stage 2 install remain unchanged; no dependency versions were upgraded.

## Recommendation for Stage 4

After explicit approval, perform device-backed QA against an approved reachable backend and WhatsApp recipient configuration, then prioritize a native map renderer only after tile/style licensing and attribution are settled. Treat native authentication and direct observation submission as separate designs; do not infer their contracts from the public read APIs.
