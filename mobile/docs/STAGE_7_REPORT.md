# Stage 7 Report — Integration Testing, Security Audit, and Release Readiness

## Scope and environment

Audited the standalone Expo app in `mobile/`, its Stage 1–6 audit/reports, package and Expo configuration, API client, feature screens, map utilities, mobile tests, README, and relevant existing backend route registrations/contracts. Stage 1’s seven planning files and the Stage 2–6 reports were read. Backend sources were cross-checked for route mounting and public/community/post/webhook route names; no backend source was changed.

- App: Earth Talk Mobile 1.0.0, Expo SDK 58 (`expo 58.0.16`), React Native 0.88.0, Expo Router 58.0.24, TypeScript 6.0.3.
- Host: Windows, Node v25.9.0. React Native/Expo package engines require Node 22.13+, 24.3+, or 26+; Node 25 is outside the declared range.
- No Git metadata exists at the workspace root (`git status` reports that this is not a Git repository), so an authoritative diff cannot be generated.
- ADB is unavailable, the app has no local `mobile/.env`, `EXPO_PUBLIC_API_BASE_URL` is unset, and no Android Maps key is configured. The root populated environment file was not opened or copied.

## Baseline before Stage 7 changes

- `npm test`: passed, 26 tests, 0 failures.
- `npm run typecheck`: passed.
- `npm run check:expo`: passed with Expo SDK 58 configuration.
- `npm run`: confirmed no lint script exists.
- First online `npx expo install --check`: found four patch-level mismatches (Expo, Expo Font, Expo Maps, Expo Router). These were corrected to Expo’s reported SDK-compatible patch versions. Expo then required the `expo-font` config plugin in the dynamic app config; it was added to `app.json`.

## Feature inventory

`PASS` means a relevant automated test or direct execution passed. `BLOCKED` means implementation/source is present but the requested runtime behavior could not be exercised in this environment. Mocked contract tests do not count as live backend integration.

| Feature | Status | Evidence and limits |
|---|---|---|
| Expo startup and app bundle | **PASS** | Offline Expo dev server reached “Waiting on http://localhost:8083”; Android JS export completed. Expo emitted a DevTools cache permission warning and used its fallback. This is not a native launch. |
| Main tab navigation | **BLOCKED** | Expo Router tab routes are included in a successful bundle, but no component-renderer/device navigation test or emulator was available. |
| Home | **BLOCKED** | Source connects recent observations and WhatsApp handoff; UI and live feed behavior were not rendered against an API/device. |
| Explore listing, search, filters, pagination | **BLOCKED** | API URL/envelope, filter encoding, pagination helper and states are unit-tested with mocked responses. No live backend or screen interaction was available. |
| Observation detail and Browse→Detail journey | **BLOCKED** | Detail response validation and actual-ID route mapping are tested; a mocked list→detail journey passes. Screen navigation/back behavior was not exercised in a rendered app. |
| Media presentation | **BLOCKED** | URL safety and fallback logic have unit coverage, but no live media URL/device image rendering was tested. |
| Coordinate validation / GeoJSON order | **PASS** | Tests verify WGS84 bounds, `[longitude, latitude]`, missing/malformed points, blank category rejection, and no fabricated points. |
| Map marker derivation, cluster IDs, filters, camera | **PASS** | GIS utility tests validate real record IDs and cluster counts, category filtering, date-line view and 130,000-record camera bounds. |
| Native map provider, marker tap, map→detail/back | **BLOCKED** | Android key absent; ADB unavailable; no native build or iOS toolchain/device. JS export cannot validate Expo Maps native behavior. |
| Community API contracts and write guards | **PASS** | Mock tests cover reads, vote and visit request shapes, contributor header, invalid input and duplicate-action lock. These are not live writes or UI journey checks. |
| Community screen, comments/visits/votes UI | **BLOCKED** | Screen source uses real hooks and server-confirmed mutations, but actual visual/navigation/permission outcomes were not run. No production writes were made. |
| WhatsApp destination construction | **PASS** | Tests validate configured valid number, absent/invalid number generic fallback and prefilled `START` URL. |
| WhatsApp OS handoff | **BLOCKED** | `Linking.openURL` was not exercised on a phone; mobile recipient is not configured. The app does not claim submission/group membership. |
| Profile guest behavior | **BLOCKED** | Source correctly avoids invented identity; UI rendering and Settings navigation were not exercised. Native account/profile flow is **NOT IMPLEMENTED**. |
| Settings preference functions | **PASS** | Tests cover system default, serialization round-trip, corrupt/outdated values and storage failures with an in-memory storage mock. |
| Settings screen and actual persistence across app restarts | **BLOCKED** | AsyncStorage provider is present, but no rendered screen/device restart was tested. |
| Authentication | **NOT IMPLEMENTED** | WhatsApp OTP exists in backend, but no native bearer sign-in/session lifecycle/profile/sign-out is wired. Public browsing and separate pseudonymous community token integration remain distinct. |
| Accessibility | **BLOCKED** | Critical labels/roles and map list alternative are present in source; no TalkBack, VoiceOver, switch-control, or large-text device audit was possible. |
| API errors, retry policy, cancellation and config validation | **PASS** | Tests cover success, HTTP error categories, timeout, cancellation, malformed JSON/DTO, safe error display, read retry policy and production HTTPS/loopback checks. UI-level retry was not rendered. |
| Production API and media transport constraints | **PASS** | Unit tests verify production API origins require non-loopback HTTPS and production media rejects HTTP; development HTTP remains allowed for emulator/LAN. |
| Native location permissions | **NOT APPLICABLE** | Mobile source/config does not request device location or background location. Map browsing does not require it. |
| Documentation/setup | **PASS** | README corrected for the current Expo Maps version and production HTTPS requirement; Stage 7 reports record device/config limitations. |
| Saved observations / user-specific history | **NOT IMPLEMENTED** | No mobile saved-record store or connected account-history screen is present. |
| Education resource library | **NOT IMPLEMENTED** | No mobile resource endpoint/screen is connected. |
| Notifications/messaging inbox | **NOT IMPLEMENTED** | WhatsApp handoff exists; there is no mobile notification feed. |
| Administrative, research and expert workflows | **NOT IMPLEMENTED** | Existing privileged web/API workflows are not exposed by the mobile app. |

## Defects fixed

1. **Expo package drift:** the SDK check identified four patch-level versions outside the SDK’s expected set. Updated only mobile Expo packages to `expo 58.0.16`, `expo-font 58.0.9`, `expo-maps 58.0.10`, and `expo-router 58.0.24`; added Expo Font’s required config plugin. `npx expo install --check` and Expo Doctor then passed.
2. **Production cleartext endpoints/media:** API origin validation accepted HTTP in production, and media URL validation accepted HTTP unconditionally. Production now requires a non-loopback HTTPS API origin and rejects HTTP media; development HTTP remains available for local network testing. Added regression tests.
3. **Pre-aborted request:** a signal already aborted before API invocation could otherwise proceed to `fetch`. The request now rejects before starting transport; in-flight cancellation continues to abort the request. Added tests for both paths.
4. **Large map camera arrays:** map camera bounds used spread arguments over the full unpaginated feature set and could exceed JavaScript’s argument limit. Replaced spread min/max with a linear scan and added a 130,000 point regression test.
5. **Malformed map category:** empty or whitespace category strings could produce markers. These features are now rejected and counted as invalid.
6. **Malformed WhatsApp config:** digit stripping could turn a partial configured contact into a different short phone number. The client now accepts 7–15 digits only and otherwise uses the existing generic picker URL; no destination is fabricated.
7. **Dark not-found screen contrast:** the not-found screen used platform-default title color on a theme canvas. It now uses palette text/background colors.

## Files changed

- `mobile/package.json`, `mobile/package-lock.json` — Expo SDK-compatible patch versions only; no Expo/RN major upgrade.
- `mobile/app.json`, `mobile/app/+not-found.tsx`, `mobile/README.md`.
- `mobile/services/api.ts`, `mobile/utils/media.ts`, `mobile/utils/whatsapp.ts`, `mobile/features/map/geojson.ts`.
- `mobile/tests/api.test.ts`, `mobile/tests/map.test.ts`.
- Added `mobile/docs/STAGE_7_REPORT.md`, `mobile/docs/STAGE_7_TEST_RESULTS.md`, and `mobile/docs/STAGE_7_SECURITY_REVIEW.md`.

## Commands and observed results

| Command | Result |
|---|---|
| Baseline `npm test` | Passed 26/26 before fixes. |
| Baseline `npm run typecheck` | Passed. |
| Baseline `npm run check:expo` | Passed. |
| `npx expo install --check` after fix | Passed: “Dependencies are up to date.” |
| Final `npm test` | Passed 34 tests, 0 failures, 0 skipped. |
| Final `npm run typecheck` | Passed (`tsc --noEmit`) after final source and test changes. |
| Final `npm run check:expo` | Passed; Expo SDK 58 config resolves with `expo-router`, `expo-font`, `expo-splash-screen`, and `expo-maps` plugins. |
| `npx expo-doctor` | Passed 20/20 checks, no issues detected. |
| `npx expo export --platform android --output-dir dist-stage7-final-check` | Passed after final source changes; Metro bundled 1,313 modules into the Android JS bundle. Export directory was removed after verification. |
| `npx expo start --offline --port 8083` | Dev server reached “Waiting on http://localhost:8083”; optional DevTools download/cache failed under filesystem permissions and Expo used fallback. Server was stopped after startup confirmation. |
| `npm run` | No lint script is defined; lint was not run. |
| `npm audit --omit=dev` | Failed security gate: 27 advisories (8 moderate, 19 high) in the reported dependency graph. Details are in the Security Review. |
| High-confidence secret-pattern scan of mobile source/tests/docs/config | Clear. Root `.env` contents were not read. No mobile `.env` exists. |
| Tool/config availability check | `adb=False`, `mobileApiEnv=False`, `lintScript=False`, Node `v25.9.0`. |

An intermediate regression run had one failing assertion because Node’s abort reason is named `AbortError` without the word “cancel” in its message; the assertion was corrected to check the error name, then the complete suite passed. No failing test was deleted.

## Integration journeys

- **A — Browse observation:** mocked API list→detail plus ID/route helper passed. Actual Expo screen selection and back navigation are **BLOCKED** (no UI harness/device).
- **B — Map exploration:** API/GIS helper checks passed. Native map load, marker selection, preview, detail route, and return behavior are **BLOCKED** (no Android key/ADB/native build/device).
- **C — Community:** API contract and duplicate-write guard tests passed. Community screen navigation and any live backend response/write are **BLOCKED** (no API origin/device; no production writes attempted).
- **D — Settings:** preference utility tests passed using mock storage. Profile-to-Settings UI and cross-restart AsyncStorage persistence are **BLOCKED** (no UI harness/device).
- **E — WhatsApp:** generated URL checks passed. External OS handoff is **BLOCKED**; no mobile recipient number or device is configured. No message is automatically sent.
- **F — Network failure/recovery:** API network/timeout/error/cancel behavior and safe-read retry policy passed unit tests. Full screen error→retry→success transition and rapid filter navigation are **BLOCKED** without UI integration tooling/live service.

All API responses in automated tests are isolated fixtures passed to mocked `fetch`. No live backend request or production write was performed.

## Security and scientific integrity

No high-confidence credential pattern was found in mobile source, tests, docs, app config or `.env.example`. `.env.example` contains placeholders. The mobile environment has no populated `.env`; the root populated `.env` was deliberately not opened. No service-role/Gemini/WhatsApp server secret was copied. The Android Maps key is absent; only its public configuration name is documented. No app logging call was found in mobile runtime code. API error text is sanitized at the UI boundary.

The mobile client calls verified public routes; backend mounting and actual route families were rechecked in `src/server.ts`, `src/routes/public.routes.ts`, `src/routes/community.routes.ts`, `src/routes/posts.routes.ts`, and `src/routes/webhook.routes.ts`. Native user authentication remains absent; community contribution uses its separate pseudonymous token in SecureStore, not a user account. No device location permission or transmission exists. Public coordinates are parsed only from backend GeoJSON and never inferred. AI-assisted interpretation and community voting remain explicitly distinct from scientific confirmation.

## Dependency and Expo compatibility

Expo SDK 58 compatibility now passes `expo install --check`, `expo-doctor` and the Android JS export. A native Android/iOS build was not performed. Expo Maps still requires a development/release native build; the Android Maps key is unconfigured, and Expo Go cannot validate it. Node 25.9 is outside package engine declarations and should be replaced with Node 24 or 26 before release builds.

`npm audit --omit=dev` reports advisories involving `braces` (through Metro/micromatch), `node-forge` (Expo code-signing dependency), and `uuid` (Expo config/Xcode dependency). The npm-suggested `--force` action would downgrade Expo to 44 or Expo Splash Screen to 55. No forced downgrade or unverified package override was applied. This remains a release-readiness blocker requiring a compatible upstream Expo SDK dependency update or separately validated targeted remediation.

## Preservation and readiness recommendation

All deliberate Stage 7 edits were confined to `mobile/` source, tests, package metadata/lockfile, Expo config, and mobile docs. No backend, database/migration/policy, or web frontend source was intentionally edited. Git metadata is absent, so this cannot be independently certified by Git diff.

**Recommendation: not ready for release or broad field testing yet.** The app is suitable for continued controlled development and mocked QA: type, unit, config, SDK compatibility, Expo Doctor and bundle checks pass. Before broader testing/release, resolve the audited dependency advisories using an Expo-compatible path, use a supported Node version, configure a restricted Android Maps key and approved HTTPS API origin, and execute Android/iOS native builds plus device/live-backend journeys and accessibility checks. Stage 8 has not started.
