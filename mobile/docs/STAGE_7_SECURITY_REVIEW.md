# Stage 7 Mobile Security Review

## Scope

Focused source/config/test review of the separate `mobile/` client. This is not a production penetration test, backend security audit, database/RLS review, dependency proof-of-exploit assessment, or verification of production deployment/keys. No secret values or populated environment files were printed or copied.

## Environment variables and secrets

- Runtime client configuration uses `EXPO_PUBLIC_API_BASE_URL`, optional public `EXPO_PUBLIC_WHATSAPP_NUMBER`, and optional application-restricted Android Maps key `EXPO_PUBLIC_GOOGLE_MAPS_API_KEY`.
- `.env.example` contains blank placeholders. No `mobile/.env` exists and the process did not have `EXPO_PUBLIC_API_BASE_URL` set.
- The root populated `.env` was not opened. The mobile client does not connect directly to Supabase and contains no mobile code for Gemini or WhatsApp server APIs.
- A targeted high-confidence pattern scan over mobile runtime source, tests, docs, app config and `.env.example` found no key-like values/private key blocks. This is a source scan, not proof about every build artifact or all possible credential formats.
- No runtime `console.log/error/warn` call was found in mobile app code. API origins, headers and payloads are not logged by the central request client.
- Google Maps keys are public native app credentials and must be restricted by package/signing identity at Google. No such key is configured in this workspace; if configured later, it will be embedded in native Android configuration and must not be treated as a server secret.

## Authentication and session boundaries

- The backend has WhatsApp OTP/bearer auth, but the mobile app has no account login, native bearer session lifecycle, profile endpoint integration, token refresh, or sign-out. Profile accurately describes guest mode; protected comment creation is not offered.
- Public observation/community reads are unauthenticated according to their existing contracts.
- Community voting and visit records use a separate random pseudonymous contributor token received from the existing API and persisted through Expo SecureStore in native runtime. This is not a user identity/account session. SecureStore’s native operation was not device-tested; browser preview is not the supported contribution storage path.
- No auth bypass was found in the mobile client. Server authorization remains authoritative.

## Transport, links, and error handling

- Before Stage 7, `getApiBaseUrl` allowed HTTP for any build and the media helper accepted HTTP unconditionally. Production now rejects non-HTTPS API origins and localhost/loopback hosts; production media accepts HTTPS only. Development HTTP remains permitted for emulator/LAN work.
- URL validation rejects API origins with embedded credentials, path, query or fragment. The app reads its base origin from Expo public configuration and does not hardcode a deployment host.
- No TLS verification disablement, custom insecure certificate handler, or certificate pinning code was found. TLS continues to use platform fetch trust; HTTPS production connectivity still requires deployment validation.
- WhatsApp uses HTTPS `wa.me` with a `START` prefill only; no message is sent automatically. Configured phone strings are normalized and accepted only when they produce 7–15 digits; invalid/missing values fall back to the generic WhatsApp picker. The configured business recipient and OS handoff were not verifiable here.
- `ApiError` may carry server-provided message text internally for handling, while `userFacingError` exposes only mapped short messages. No raw error logging was found. Tests verify that user-facing text does not expose a server-provided sensitive string.
- API request timeout and abort are implemented and tested. No unsafe automatic write retries are configured; the global retry policy applies to one transient safe read.

## Location, records, and scientific integrity

- No `expo-location`, foreground/background location permission, device location request, location history, or automatic location transmission exists in mobile source/config.
- Map markers derive only from returned GeoJSON coordinates in `[longitude, latitude]` order; WGS84 range validation excludes invalid points. The app never derives precise coordinates from district labels or text. Public server location precision is not supplied per map feature, so UI does not assert a point is exact.
- Observation cards/details use public DTO fields and omit private lat/long. Community identities/handles shown come from public response fields; no admin/private record endpoint is used.
- AI interpretations are labelled preliminary and community activity is not described as scientific validation. No generated/fake production content or inferred geology was introduced.
- No analytics, advertising, background tasks, or new personal data persistence was added. AsyncStorage stores only versioned theme selection; contributor token uses SecureStore.

## Dependency advisories and release action

`npm audit --omit=dev` exited 1 with **27 advisories (8 moderate, 19 high)** in the reported dependency graph. The report includes `braces` (through Metro/micromatch), `node-forge` (through Expo signing/config), and `uuid` (through Expo config/Xcode). npm’s displayed forced remediation proposed downgrading Expo to 44.0.6 and Expo Splash Screen to 55.0.25. That breaks the selected SDK line, so no `npm audit fix --force` or speculative transitive override was applied.

This is an unresolved release blocker. Before release, resolve the affected transitive versions through an Expo-compatible upstream update or carefully tested targeted override, rerun audit, Expo Doctor, native builds, and full app tests. The workspace’s dependency advisories do not establish exploitability in the distributed mobile runtime; they do require a documented resolution before release approval.

## Findings fixed in Stage 7

- Production API and media cleartext restrictions added.
- Malformed configured WhatsApp number now falls back rather than creating a partial destination.
- Already-aborted API request now exits before issuing a fetch.
- Expo SDK patch mismatches and missing Expo Font plugin config were corrected.
- No production credentials were rotated or external settings changed.

## Remaining risks and external actions

1. Resolve the 27 dependency advisories without leaving Expo SDK 58 compatibility; then rerun the security and build checks.
2. Use a supported Node version (24.x or 26+) for native builds.
3. Configure the approved HTTPS API origin and restricted Android Maps SDK key; verify that key restrictions match the release package and signing certificate.
4. Perform native Android/iOS build and device review of SecureStore, map permissions/behavior, WhatsApp handoff, TLS, accessibility, and larger text. This Windows workspace had no ADB and no iOS toolchain.
5. Perform live read/write testing against an isolated approved backend environment; none was configured here.
6. Git metadata is absent, preventing independent audit of tracked-file boundaries. No backend, database, or web frontend file was intentionally modified.
