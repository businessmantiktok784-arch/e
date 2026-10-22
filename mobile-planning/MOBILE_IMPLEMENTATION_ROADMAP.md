# Mobile implementation roadmap

Effort estimates are engineering person-days for one experienced React Native developer, exclude review/approval wait, infrastructure provisioning, backend gap work, and app-store review. They are planning estimates, not commitments.

| Stage | Work and dependencies | Acceptance criteria | Estimate |
|---|---|---|---:|
| 0. Contract/readiness decisions | Confirm production API origin, database durability/media availability, auth product behavior, map tiles/style/attribution; decide direct observation submission backend scope. | Written deploy/API readiness and explicit decision whether submission is WhatsApp handoff or separately approved backend work. | 2–4 days |
| 1. Expo foundation | Create standalone Expo TS app, Router tabs, theme, env validation, API client/error decoder. Keep repository web build independent. | App builds Android/iOS; points to configured origin; `/health` request works; no secret in source/bundle. | 3–5 days |
| 2. Explore and observation details | Implement public stats/feed/filters/pagination and detail/post/AI uncertainty/media states. | Real API DTOs render; filters/query pages match contract; no raw private coordinates; offline/empty/404 states covered. | 5–8 days |
| 3. Account and profile | WhatsApp OTP, secure bearer storage, refresh/sign-out/profile/avatar and own observation/question lists. | Valid/invalid/expired/rate-limited OTP; token persists securely and revokes; unauthorized writes blocked by server. | 4–7 days |
| 4. Community | Sites/explorer/timeline/investigations/evidence/questions/visits/votes/checklists/comments/reports. | Requests match inputs; contributor token separate from account token; server 400/403/429/503 represented honestly. | 6–10 days |
| 5. Native map | Select native renderer after compatibility review; render observation/site GeoJSON, bbox/filters, detail selection. | Attribution, authorized points, filters, denied-location behavior, performance with realistic data, no web MapLibre dependency. | 5–9 days |
| 6. Observation capture and AI analysis | Blocked pending approved mobile create/upload/analysis contract (current source has no such route). If approved later, use camera/gallery, explicit location/privacy choices, upload progress/cancel/retry, server AI result DTO. | Existing backend performs processing; supported file limits/types and rate limits respected; no model key in app; uncertainty disclaimer retained. | 5–10 mobile days **plus separately scoped backend work** |
| 7. Hardening and release | Accessibility, low-connectivity behavior, crash-safe upload if supported, privacy review, device QA, release config. | Acceptance plan below passes on physical Android/iOS; HTTPS production endpoint; no secret scan findings; existing web smoke check unaffected. | 5–8 days |

## Cross-stage acceptance checklist

- Development emulator and physical device reach the API using environment-specific origin; production uses stable HTTPS.
- Real public observations and actual pagination/filter DTOs load; 404, 429, 503 and offline have distinct UI.
- Existing image/AI pathway is reused only if an approved server contract exists; current supported behavior remains WhatsApp intake.
- WhatsApp login session and protected writes are verified against server ownership checks; no auth bypass.
- GeoJSON details and location precision/consent semantics render exactly as returned.
- Comments, evidence, votes, visits, and other community writes respect server schemas, contributor identity and rate limits.
- Loading, empty, network failure, stale/offline and server error states are exercised.
- Existing web build/smoke workflow remains independently operational; mobile adds no modification to web/backend source.
- Release bundle and Expo configuration contain no Gemini/WhatsApp/database/Supabase service/admin secrets.

These are proposed future tests and criteria. No tests were executed for this audit.
