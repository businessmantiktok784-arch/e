# Earth Talk Mobile — Stage 5 report

## Work completed

- Replaced the read-only public-sites Community tab with live sections for open investigations, recent public observations, and published sites.
- Added vote controls only for fixed choices returned by the backend. Vote writes use the existing investigation vote route and backend-issued pseudonymous contributor token. The UI waits for the server response and refreshes vote totals; per-record locks and pending state prevent duplicate rapid taps.
- Added site visit history and a confirmation-gated “I visited this site today” write. It sends the user's local calendar date and contributor token; no device coordinates or unnecessary text are collected.
- Added public comments and nested replies to the existing observation detail screen. Only safe public author display names and returned fields are shown. Comment creation is not offered because its existing route requires a WhatsApp account Bearer session and native account sessions are not implemented.
- Added a participation variant of the existing WhatsApp CTA. It uses the same established `START` link and `Linking.openURL` behavior; it sends no message automatically.
- Added response validators and typed API methods for community reads/writes, secure contributor-token persistence through Expo SecureStore, query hooks, and cache invalidation after confirmed writes.
- Updated the API contract, API gap report, setup README, and added `MOBILE_COMMUNITY.md`.

## Files created or changed

Changed mobile files:

- `package.json`, `package-lock.json` — added Expo SDK 58 compatible `expo-secure-store ~58.0.2`.
- `app/(tabs)/community.tsx` — real community data and supported participation.
- `app/observations/[id].tsx` — public comments and replies.
- `services/api.ts`, `types/api.ts`, `hooks/useObservations.ts` — centralized typed community contracts and query hooks.
- `components/WhatsAppSubmissionButton.tsx` — participation label variant; existing URL/deep-link behavior unchanged.
- `tests/api.test.ts` — API contract, write, error, response-validation, and duplicate-tap tests.
- `README.md`, `docs/MOBILE_API_CONTRACT.md`, `docs/MOBILE_API_GAPS.md`.

Added:

- `services/contributorToken.ts` — secure native keychain/keystore storage of pseudonymous token.
- `utils/actionLock.ts` — in-flight duplicate action guard.
- `docs/MOBILE_COMMUNITY.md`, `docs/STAGE_5_REPORT.md`.

## Verified API routes used

- `GET /api/community/investigations?status=open&limit=50&offset=0` — public open investigation summaries and actual vote tallies.
- `POST /api/community/contributor-token` — public issuance of a random pseudonymous token, stored only via SecureStore.
- `POST /api/community/investigations/:publicId/vote` — fixed server-provided option, `X-Contributor-Token`; server returns whether the vote changed and a message.
- `GET /api/community/sites?limit=50` — public site list (existing integration retained).
- `GET /api/community/sites/:siteId/visits` — public visit summaries.
- `POST /api/community/sites/:siteId/visits` — confirmed date-only report with contributor token.
- `GET /api/public/observations?page=1&limit=5` — genuine recent records linked to the existing details screen.
- `GET /api/posts/:passportId/comments` — public visible comments/replies in the detail screen.

Contract methods, shapes, auth boundaries, and backend sources are recorded in `MOBILE_API_CONTRACT.md`. Comment creation `POST /api/posts/:passportId/comments` exists but is not integrated: it requires `requireUser` and the existing WhatsApp Bearer session.

## Privacy and scientific integrity

- No account, phone number, location, or identity is used for community vote/visit writes. Contributor token is random bearer material with no personal data; it is never logged and is stored with Expo SecureStore, not plaintext app storage.
- Device location is not requested or sent. Visit writes require explicit confirmation and send only the local date.
- Public author aliases come only from safe server comment DTOs. Private author details and hidden comments are not queried through administrative endpoints.
- Investigation options/counts are rendered only from returned records. Free-text votes are not offered by mobile. Vote and visit actions are explicitly described as community activity, not evidence or scientific confirmation.
- No sample production data, fake participation, or fabricated community statistics were introduced.

## Checks executed

- `npx expo install expo-secure-store` — installed `~58.0.2` matching SDK 58; package/lockfile only changed within `mobile/`.
- `npm run typecheck` — passed after implementation.
- `npm test` — passed, 22 tests, 0 failures. New tests cover verified community list response/URL, malformed payload handling, vote request method/body/token header and unauthorized response, token/visit/comment read contracts, site-visit write payload and response/network/malformed failures, invalid write inputs, and duplicate concurrent action suppression. Existing API and GIS suites also passed. Node printed the known module-type warning; it did not affect results.
- `npm run check:expo` — passed; Expo SDK 58 public configuration resolved for Android, iOS, and web with no new secret configuration.
- `npx expo export --platform android --output-dir dist-stage5-check` — passed; Metro bundled 1,303 modules into the Android Hermes bundle. Generated export output was removed after verification.
- No live backend request, WhatsApp handoff, native SecureStore operation, emulator, simulator, or physical device was available for verification.
- A repository Git status/diff cannot be reported: this supplied workspace has no `.git` metadata. The deliberate changed paths listed above are within `mobile/`.

## Limitations and recommendation

- Public observation comments are read-only until the mobile app safely integrates the existing WhatsApp OTP/account-session lifecycle. No backend route is missing for comments; this is a mobile auth integration limitation.
- The Community UI uses existing investigations, observations, sites, and visits because no dedicated community feed exists. Questions, answers, evidence/media, checklist, reporting, reputation, and moderation are not yet integrated.
- Backend writes depend on database availability and existing contributor rate limits; the client reports failures and does not claim success optimistically.
- Site-visit POST has no idempotency key in the verified contract. The app does not auto-retry writes, but a manual retry after a timeout could duplicate a visit if the server committed it before the response was lost.
- WhatsApp contact is an optional public build configuration. Without a configured approved number, the existing generic picker opens. App code does not claim the user joined a group or submitted an observation.
- Native SecureStore and WhatsApp behavior should be confirmed in a development build and on device.

Stage 5 acceptance criteria for mobile implementation and automated/config/bundle checks are met. Native SecureStore behavior, live API responses, WhatsApp handoff, and device interaction remain unverified because no device or configured live backend was available. Do not begin Stage 6 without explicit approval.

## Scope confirmation

No backend route/service, database schema/migration/policy/data, web frontend, or WhatsApp backend integration was changed. No populated secrets or server-side credentials were copied into mobile files. Stage 2–4 screens and APIs were retained and their existing API/GIS tests remain in the passing suite.
