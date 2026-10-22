# Stage 7 Test Results

## Test environment

- Windows, Node v25.9.0, npm 11.6.4. Node 25 is outside the package-supported Expo/React Native engine ranges.
- The suite uses Node's built-in `node:test`, mocked `fetch`, and isolated in-memory preference storage. It does not render React Native components.
- No `mobile/.env` and no `EXPO_PUBLIC_API_BASE_URL` were present. No live API or production write was attempted.
- ADB was not available. No emulator, iOS simulator, physical device, or native build environment was used.

## Baseline before fixes

| Command | Result |
|---|---|
| `npm test` | 26 passed, 0 failed. |
| `npm run typecheck` | Passed. |
| `npm run check:expo` | Passed. |
| `npm run` | No lint script is configured. |

The first SDK dependency check then found four outdated patch releases. A compatibility install updated Expo packages and the Expo Font plugin was added to static Expo config.

## Final automated tests

Command: `npm test`

Result: **34 tests passed, 0 failed, 0 skipped**.

Test names and purpose:

1. **“missing and invalid public API configuration returns useful errors”** — missing/malformed origin handling.
2. **“production API configuration requires HTTPS and a non-loopback host”** — release transport constraints.
3. **“observation list builds the verified endpoint URL and accepts its real envelope”** — list contract.
4. **“mocked browse-to-detail journey preserves the backend observation identifier”** — list→detail API/route ID preservation.
5. **“search and category filters are encoded as supported query parameters”** — server filter contract.
6. **“category response is validated and returned as the actual array contract”** — category envelope validation.
7. **“map endpoint builds the verified public GeoJSON URL with supported server filters”** — map URL/response shape.
8. **“network failures and 404 detail responses are classified safely”** — transport and not-found behavior.
9. **“media URLs reject missing values and non-http schemes; WhatsApp validates configured number and falls back safely”** — media scheme and verified/generic destination construction.
10. **“an already-cancelled API request does not start a network fetch”** — pre-cancel behavior.
11. **“aborting an in-flight API request aborts fetch without converting cancellation to network failure”** — active cancellation behavior.
12. **“API request timeout aborts the transport and reports a timeout error”** — mocked 12-second timeout behavior.
13. **“API distinguishes unauthorized and forbidden responses and rejects invalid JSON”** — 401/403/invalid JSON behavior.
14. **“malformed observation detail is rejected instead of reaching presentation”** — DTO validation.
15. **“nested server error envelopes retain status and readable message”** — 429/503 envelopes.
16. **“community reads use verified public contracts and reject malformed payloads”** — investigations read contract.
17. **“community vote sends only selected option and secure contributor header; server must confirm”** — vote POST contract/auth header.
18. **“site visits, comments and pseudonymous token are defensively validated”** — public read/token DTOs.
19. **“site visit writes send the confirmed local date and classify network/malformed failures”** — visit POST contract and failures.
20. **“content UI distinguishes loading, error, empty, and success states”** — shared state classifier.
21. **“pagination stops at the server-reported final page and cards link by real passport id”** — pagination and detail route helper.
22. **“community writes reject invalid inputs and duplicate concurrent actions are suppressed”** — input and write lock.
23. **“observation card presentation uses returned fields and never shows private coordinates”** — privacy-safe model.
24. **“validates WGS84 coordinates including boundaries and rejects malformed values”** — coordinate validation.
25. **“parses GeoJSON [longitude, latitude] without swapping or inventing coordinates”** — coordinate order and invalid/demonstration records.
26. **“map rejects records with missing or blank category values”** — malformed category exclusion.
27. **“category filter and clearing return only the matching genuine records”** — client filtering.
28. **“render items preserve observation ids and cluster counts exactly represent included real points”** — stable marker identity and true counts.
29. **“camera uses a neutral Rwanda view when no points exist and handles the date line”** — initial camera bounds.
30. **“camera bounds handle large unpaginated result sets without argument-limit failures”** — large map result robustness.
31. **“appearance preference defaults safely and round-trips supported modes”** — preference defaults/persistence helper.
32. **“corrupt, outdated, and unavailable preference storage falls back to system”** — storage validation/failure.
33. **“read retry policy retries only one transient network/server failure”** — bounded safe-read retries.
34. **“user-facing errors do not expose raw server details”** — message sanitization.

## Final commands and outcomes

| Command | Observed outcome |
|---|---|
| `npm run typecheck` | Passed after all source and test changes. |
| `npm test` | Passed, 34/34 after fixes. |
| `npm run check:expo` | Passed; SDK 58 config resolved, Expo Font plugin present. |
| `npx expo install --check` | Passed: installed dependencies are up to date for Expo SDK 58. |
| `npx expo-doctor` | Passed 20/20 checks. |
| `npx expo export --platform android --output-dir dist-stage7-final-check` | Passed after final source changes; Android Hermes JS bundle created (1,313 modules). Temporary output was removed. |
| `npx expo start --offline --port 8083` | Reached Metro “Waiting” state; optional DevTools download failed due sandbox cache permissions and Expo used its fallback. Server was stopped after startup confirmation. |
| `npm audit --omit=dev` | Exit 1: 27 advisories (8 moderate/19 high); details and non-remediation decision in `STAGE_7_SECURITY_REVIEW.md`. |
| `npm run` | No lint script exists, so lint was unavailable. |

An intermediate run after adding the cancellation test had one assertion failure: Node’s standard abort reason was `AbortError`, not an error message containing “cancel”. The assertion was corrected to check the error name and the full suite then passed. No test was deleted or weakened to hide a runtime defect.

## Mocked versus live verification

Node emitted `MODULE_TYPELESS_PACKAGE_JSON` warnings for the TypeScript test files because the mobile package does not declare a module type. They did not affect test results; no package-wide module-mode change was made as part of this audit.

All API tests use controlled fake `fetch` responses. The browse-to-detail journey validates API-to-ID-to-route utility flow only; it does not tap a native card or perform React Navigation rendering. Community write tests validate request formation, not live database persistence. Preference persistence uses in-memory test storage, not Android/iOS AsyncStorage across a process restart. WhatsApp tests construct the URL but do not invoke the operating system link handler.

Live API connectivity, permissions, map-provider initialization, native marker selection, map/detail return behavior, native SecureStore, WhatsApp app/browser handoff, screen-reader behavior, larger text and poor-network UI remain **unverified/blocked** by the missing API configuration and device toolchain.
