# Mobile API contract (verified Stage 3)

Contracts were checked against `src/server.ts`, route modules, controllers, services, repositories, DTOs, and the web API client. `src/server.ts` mounts routers directly; there is no additional `/api/v1` prefix. The server defaults to port `3000`, binds `0.0.0.0`, and the mobile client uses `EXPO_PUBLIC_API_BASE_URL` as the origin. Public reads need no authorization header. Community writes described below use the existing pseudonymous `X-Contributor-Token` unless stated otherwise.

## Endpoints used by the mobile application

### `GET /api/public/observations`

- **Use:** Explore, Home recent observations, detail navigation source.
- **Query:** `page` (1-based; default 1), `limit` (default 50, maximum 100; mobile asks 20), optional `search` (trimmed and capped at 100 chars), optional `category` (server taxonomy validated). The backend supports additional filters, but the mobile UI does not expose them yet.
- **Search semantics:** Case-insensitive substring matching across passport ID, possible name, district, classification, observation category/subcategory, and primary interpretation. Search/category run on the server before page results; the UI does not represent a search over only loaded rows.
- **Success:** `{ "data": PublicObservationSummary[], "pagination": { "page": number, "limit": number, "total": number, "totalPages": number } }`.
- **Summary type:** `passport_id`, `observation_category`, `observation_subcategory`, nullable `primary_interpretation`, `classification`, nullable `possible_name`, `confidence`, `confidence_score`, `verification_status` (`unverified | expert_verified`), optional nullable `evidence_state`, nullable `district`, `location_precision` (`private | district | approximate | exact`), `created_at`, optional `published_at`, `is_research_opportunity`, `post_title`, `is_demo`, and optional coordinates where public precision permits.
- **Errors:** `429 {error:{code:"RATE_LIMIT_EXCEEDED",message}}`; `500 {error:{code:"INTERNAL_ERROR",message}}`. Invalid category is rejected by filter processing as no matches rather than silently ignored.
- **Access:** Public; no bearer session required. Results are filtered by the public-observation service/repository. The mobile UI never renders returned coordinates.
- **Source:** `src/routes/public.routes.ts`, `src/controllers/public.controller.ts`, `src/services/public-observation.service.ts`, `src/utils/public-filters.ts`, `src/repositories/public-observation.repository.ts`, `src/types/public.types.ts`.

### `GET /api/public/categories`

- **Use:** Populate category filters without maintaining a duplicate mobile taxonomy.
- **Query:** None.
- **Success:** Array of `{ category: string, label: string, observation_count: number }`; includes taxonomy categories with zero counts. Repository may include labeled demonstration records when demo mode is enabled.
- **Errors:** `429` rate limit, `500` generic internal error.
- **Access:** Public; no bearer session required.
- **Source:** `src/routes/public.routes.ts`, `src/controllers/public.controller.ts`, `src/services/public-observation.service.ts`, `src/repositories/public-observation.repository.ts`, `src/types/public.types.ts`.

### `GET /api/public/observations/:passportId`

- **Use:** Observation detail.
- **Path:** URL-encoded passport ID.
- **Success:** A `PublicObservationDetail` JSON object extending the summary with `geological_context`, `observed_features[]`, `diagnostic_features[]`, `reasoning`, `limitations[]`, `uncertainties[]`, `recommended_next_steps[]`, `safety_note`, optional `data_quality_status`, `media_count`, `public_media_count`, `primary_media_url` (a public still, nullable/optional), site fields, and research-opportunity metadata.
- **Errors:** `404 {error:{code:"PUBLIC_OBSERVATION_NOT_FOUND",message:"Public observation not found."}}` intentionally does not distinguish private from nonexistent IDs; `429` rate limit; `500` generic internal error.
- **Access:** Public only. Mobile treats 404 as unavailable/not found. The detail DTO may contain coordinate fields subject to the API’s publication precision; the mobile screen does not render them.
- **Source:** `src/routes/public.routes.ts`, `src/controllers/public.controller.ts`, `src/services/public-observation.service.ts`, `src/repositories/public-observation.repository.ts`, `src/types/public.types.ts`.

### `GET /api/community/sites?limit=50`

- **Use:** Community tab’s published geological sites.
- **Query:** `limit` (mobile 50; server caps at 200), optional `offset`, optional `district` (supported by controller). Mobile does not currently paginate sites.
- **Success:** Repository result shape `{ rows: PublicSite[], total: number }`; a site includes `site_id`, `site_code`, `title`, nullable `district`, nullable `description`, and optional `is_demo`.
- **Errors:** Existing shared community error responder; mobile validates the expected rows/total shape and presents retry on failure. No route-specific authentication guard is applied.
- **Access:** Published public sites.
- **Source:** `src/routes/community.routes.ts`, `src/controllers/community.controller.ts` (`listSites`), site repository/type; mobile integration uses `mobile/services/api.ts`.

### `GET /api/public/observations.geojson`

- **Use:** Native Map tab markers, selection, client-side clustering of the returned points, and server-side search/category filtering.
- **Query used by mobile:** optional `search` (trimmed, maximum 100 characters), `category` (validated against backend category vocabulary). The backend also accepts public filters such as `bbox=minLon,minLat,maxLon,maxLat`, but mobile currently does not send a viewport bounding box.
- **Success:** `{ "type": "FeatureCollection", "features": Feature[] }`. Each returned feature is `type: "Feature"`, has `geometry: { "type": "Point", "coordinates": [longitude, latitude] }`, and properties including `passport_id`, `observation_category`, `observation_subcategory`, `primary_interpretation`, `classification`, `possible_name`, `confidence`, `verification_status`, `evidence_state`, `is_research_opportunity`, `media_count`, `primary_media_url`, `district`, `created_at`, and `is_demo`. Properties are populated according to the public DTO and can be nullable. Mobile only requires the id, category, and valid Point; other fields are optional presentation data.
- **Filtering and completeness:** Search/category are applied in the backend before a FeatureCollection is returned. This route has no pagination. It omits records for which the public-location resolver cannot produce coordinates. It can also include labeled demonstration features when demo mode is enabled; mobile explicitly excludes `is_demo: true`. The UI count is the number of validated, non-demo public map points in the current filtered result, not a database-wide observation count.
- **Location/privacy:** The repository resolves `district` to a representative district point, `approximate` to a generalized point, and `exact` only where the upstream public view/consent gate permits. It does not return a per-feature location-precision field, so mobile describes displayed points as potentially generalized and does not disclose raw coordinates.
- **Errors:** `429 {error:{code:"RATE_LIMIT_EXCEEDED",message}}`; `500 {error:{code:"INTERNAL_ERROR",message:"Failed to generate map data."}}`. Error details are not shown beyond the API client's safe message.
- **Access:** Public; no bearer token. Existing controller IP rate limiting and response cache headers remain in force.
- **Source:** `src/routes/public.routes.ts`, `src/controllers/public.controller.ts`, `src/services/public-observation.service.ts`, `src/repositories/public-observation.repository.ts`, `src/utils/public-filters.ts`, `src/utils/public-location.ts`, `src/types/public.types.ts`.
- **Mobile implementation:** `mobile/services/api.ts`, `mobile/features/map/geojson.ts`, `mobile/hooks/useObservations.ts`, and `mobile/app/(tabs)/map.tsx`.

## Authentication, uploads, and WhatsApp

- None of these GET requests sends a token. They do not depend on the backend’s WhatsApp OTP session. This is appropriate only for the public records and site listings returned by these specific routes.
- No mobile create/upload/analyze API is called. The WhatsApp inbound webhook remains the actual observation intake/AI processing path; the app does not upload images or call Gemini.
- `web/src/services/whatsapp.ts` builds `https://wa.me/{configured number}?text=START` when `VITE_WHATSAPP_NUMBER` is set, or `https://wa.me/?text=START` otherwise. Mobile mirrors both branches using optional `EXPO_PUBLIC_WHATSAPP_NUMBER`; the example is blank. The setting was found in an environment file, but its value was intentionally not read, printed, or copied into mobile files. Operators should synchronize the public recipient from their approved deployment configuration.
- The mobile API client sends `Accept: application/json`, sets no credential headers, times out after 12 seconds, propagates query cancellation, parses nested `{error:{code,message}}` and bare error messages safely, and rejects malformed successful response shapes. It does not log request payloads or server response bodies.

## Community contracts used in Stage 5

### `GET /api/community/investigations?status=open&limit=50&offset=0`

- **Use:** Open investigation voting in Community.
- **Response:** `{ rows: PublicInvestigationSummary[], total: number }`. Each row has `public_id`, `question`, `status`, nullable `site_id` / `observation_id` / `passport_id` / `site_code`, participation/evidence/vote counts, fixed `options[]`, `vote_distribution[]` (`option`, `count`, `share_pct`), context/category/checklist/media metadata, pseudonymous `opened_by_handle`, `is_demo`, timestamps and disclaimer. Mobile validates fields required for rendering; demo records stay visibly labelled.
- **Auth:** Public read. An optional contributor token changes owner/viewer flags and cache policy; mobile does not send it for this read.
- **Errors:** Shared `{error:{code,message}}`; database unavailable may return `503`, generic failures `500`.
- **Source:** `src/routes/community.routes.ts`, `src/controllers/community.controller.ts:listInvestigations`, `src/services/community.service.ts`, `src/types/community.types.ts`.

### `POST /api/community/contributor-token`

- **Use:** Obtain the opaque pseudonymous identity required for one-contributor/one-vote behavior.
- **Request:** Empty JSON object; no user identity, device location, or account credentials.
- **Response:** `{ contributor_token: string, handle_preview: string, note: string }`; server creates 24 random bytes encoded base64url and sets `Cache-Control: no-store`.
- **Auth:** Public. The bearer token is secret even though it contains no personal data. Mobile stores it with Expo SecureStore and never logs it.
- **Errors:** Shared `{error:{code,message}}` / `500` on service failure.
- **Source:** `src/routes/community.routes.ts`, `src/controllers/community.controller.ts:issueContributorToken`, `src/utils/contributor.ts`.

### `POST /api/community/investigations/:publicId/vote`

- **Use:** Cast one vote for one server-published fixed option.
- **Request:** `Content-Type: application/json`, `X-Contributor-Token: <opaque token>`, body `{ "option": string }`. Mobile only presents server-returned `options`; free-text investigations are not offered for voting in this UI.
- **Response:** `{ option: string, changed: boolean, message: string }`. Mobile reports the server message and refetches totals. Existing same-option votes are returned as unchanged; duplicate prevention is enforced by the service/repository.
- **Auth:** No WhatsApp account session; valid contributor token required (`401 CONTRIBUTOR_TOKEN_REQUIRED` otherwise). This is community participation, not scientific validation.
- **Errors:** Shared shape; `400` validation/not found, `401` missing token, `429` contributor rate limit, `503` database unavailable, `500` unexpected failure.
- **Source:** `src/routes/community.routes.ts`, `src/controllers/community.controller.ts:castVote`, `src/services/community.service.ts:castVote`, community vote repository/types.

### `GET /api/community/sites/:siteId/visits`

- **Use:** Read site visit history when a site is expanded.
- **Response:** `{ rows: PublicVisitSummary[] }`, each item has `id`, `site_id`, pseudonymous `contributor_handle`, `visited_on`, nullable `notes` / `media_id`, and `created_at`.
- **Auth:** Public; mobile displays only returned pseudonymous fields.
- **Errors:** Shared community error response, including `500`/`503` where appropriate.
- **Source:** `src/routes/community.routes.ts`, `src/controllers/community.controller.ts:listVisits`, `src/services/community.service.ts:listVisits`, `src/types/community.types.ts`.

### `POST /api/community/sites/:siteId/visits`

- **Use:** User-confirmed record of a site visit today.
- **Request:** `Content-Type: application/json`, `X-Contributor-Token`, body `{ "visited_on": "YYYY-MM-DD" }`. The app asks for confirmation and sends no device location.
- **Response:** A `PublicVisitSummary` object with the same fields as visit-list rows; HTTP `201`.
- **Auth:** Backend permits anonymous ephemeral contributions, but mobile supplies its stored pseudonymous token so future participation can be attributed to the same public handle.
- **Errors:** Shared shape; validation, rate-limit, database-unavailable and unexpected errors are surfaced; the app only shows success after receiving a valid created record.
- **Source:** `src/routes/community.routes.ts`, `src/controllers/community.controller.ts:recordVisit`, `src/services/community.service.ts:recordVisit`.

### `GET /api/posts/:passportId/comments`

- **Use:** Read public observation discussion on the detail screen.
- **Response:** `{ data: PublicComment[], total: number }`. Public rows include comment/reply IDs, safe author `public_user_id` and `display_name`, body, creation/edit time, moderation status, reply count, nested replies, and demo label when applicable. The service filters hidden/restricted material according to its existing policy.
- **Auth:** Public read; `attachViewer` may attach an existing WhatsApp bearer session for viewer-specific visibility. Mobile includes the restored bearer session when available; signed-out readers receive the public view.
- **Errors:** Shared `{error:{code,message}}` from `sendError`, including non-disclosing missing observation behavior.
- **Source:** `src/routes/posts.routes.ts`, `src/controllers/posts.controller.ts:listCommentsHandler`, `src/services/community-post.service.ts`, `src/types/community-posts.types.ts`.

### `POST /api/posts/:passportId/comments`

- **Use:** Create a public comment or nested reply from observation details.
- **Request:** JSON `{ "body": string, "parent_comment_id"?: string }` plus `Authorization: Bearer <session token>`.
- **Response:** HTTP `201`, `{ "comment": PublicComment, "message": string }`. The mobile client validates the created comment and clears the text only after this response.
- **Auth/validation:** Existing WhatsApp OTP bearer session required by `requireUser`; service checks visible/public target and valid parent, trims text, rejects empty and over-limit content (configured server limit, default 2000), and rate-limits. `401 AUTH_REQUIRED`, `400` validation, `404` unavailable target, `429` rate limit, and service/unexpected errors are possible.
- **Source:** `src/routes/posts.routes.ts`, `src/controllers/posts.controller.ts:createCommentHandler`, `src/services/community-post.service.ts:createComment`, `src/utils/user-auth.ts`.

### Existing WhatsApp account session routes integrated by mobile

- `POST /api/auth/request-code` body `{ "phone": string }`; successful `200` response `{ delivery: "whatsapp" | "development_console", message, expires_in_seconds }`. The code is delivered outside the response. Invalid phone and rate/delivery errors use `{ error: { code, message } }`.
- `POST /api/auth/verify-code` body `{ "phone": string, "code": string }`; successful `200` response `{ token: "rt_session_…", expires_at, user: { public_user_id, display_name, is_demo, display_name_updated_at } }`. The token is returned once; mobile persists it only in native SecureStore.
- `GET /api/auth/session` with `Authorization: Bearer <token>` returns `{ authenticated: boolean, user: AccountUser | null }` and intentionally returns `200` for missing/invalid sessions.
- `POST /api/auth/sign-out` with bearer token returns `{ ok: true }` after session revocation.
- `PATCH /api/auth/profile` with bearer token and `{ "display_name": string | null }` returns `{ user: AccountUser }`; backend trims/truncates and enforces a seven-day name-change interval.
- `GET /api/me/observations` with bearer token returns `{ data: MyPostSummary[] }` containing the account's own public and private records, status, date, category, and server counts; the owner DTO may include exact coordinates. Mobile does not render coordinate fields and labels private entries without linking them to the public detail route.
- **Source:** `src/routes/auth.routes.ts`, `src/controllers/auth.controller.ts`, `src/services/auth.service.ts`, `src/utils/user-auth.ts`.
- **Mobile handling:** `mobile/auth/AuthProvider.tsx`, `mobile/app/(tabs)/profile.tsx`, `mobile/services/api.ts`. Phone and OTP are not stored; bearer session is not logged. No account session is available in web preview.

### Additional existing but unused community routes

- Questions/list/detail/answers, investigation detail/checklists, evidence, report, reputation, site explorer/timeline, and site GeoJSON routes exist in the backend. They are not called by this mobile Stage 5 UI and are not represented as mobile capabilities. See backend `src/routes/community.routes.ts` and Stage 1 planning for full route inventory.
