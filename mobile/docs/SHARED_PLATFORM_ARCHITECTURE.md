# Shared Earth Talk platform architecture

## Source of truth

The native app is a separate Expo client under `mobile/`. It calls the existing Express API at the configured `EXPO_PUBLIC_API_BASE_URL`; it does not connect directly to Supabase or Gemini. Express route routers are mounted directly (no common `/api/v1` prefix) in `src/server.ts`. Public records come from the existing public observation view/resolver. WhatsApp media enters through Meta's signed `/webhook` route, then the existing queue, `geoscience-analysis.service.ts`, Gemini integration, and `observation.service.ts` persist canonical observation records. Native public reads therefore see the same published record identifiers and state; there is no mobile-only production data store.

The backend enforces publication, coordinate privacy, ownership, validation and evidence transitions. The mobile client only displays returned public fields and submits through existing contracts. Community voting and visits call the existing community service and carry an opaque `X-Contributor-Token`; this is a pseudonymous participation identity distinct from a signed-in account. Authenticated comments/profile use a separate bearer session.

## Current mobile contracts

All routes below are actual route paths, not proposed routes. Each is defined in `mobile/services/api.ts` and independently mounted in the existing backend.

| Method and route | Purpose | Authentication and authoritative behavior |
|---|---|---|
| `GET /api/public/observations?page=&limit=&search=&category=` | Public paginated Explore and recent Home items. Returns `{ data, pagination }`. | Public; server filters and visibility rules apply. |
| `GET /api/public/observations/:passportId` | Public observation detail, interpretation, uncertainty and available primary media. | Public; private/unavailable records do not become public through mobile. |
| `GET /api/public/categories` | Category labels/totals. | Public. |
| `GET /api/public/observations.geojson?search=&category=` | Map points as GeoJSON FeatureCollection. | Public safe coordinates only. No per-feature precision or pagination. |
| `GET /api/community/investigations?status=open&limit=50&offset=0` | Community investigations and server-returned option/tally data. | Public; activity is not scientific confirmation. |
| `POST /api/community/contributor-token` | Obtain pseudonymous community write token. | Public token issuance; mobile stores it in SecureStore. |
| `POST /api/community/investigations/:publicId/vote` | Fixed-choice vote `{ option }`. | `X-Contributor-Token`; server owns allowed options, dedupe, and rate limits. |
| `GET /api/community/sites?limit=50`, `GET /api/community/sites/:siteId/visits` | Public site and visit summaries. | Public, pseudonymous returned handles only. |
| `POST /api/community/sites/:siteId/visits` | Record confirmed `visited_on` date. | `X-Contributor-Token`; no device location is sent. |
| `GET /api/posts/:passportId/comments` | Public visible discussion. | Public read with optional backend viewer context. |
| `POST /api/auth/request-code` | Request WhatsApp code `{ phone }`. | Public, backend phone/IP rate limits, code delivered out-of-band. |
| `POST /api/auth/verify-code` | Verify `{ phone, code }`; returns one-time opaque `rt_session_` bearer and user DTO. | Public verification; server code expiry/attempt controls. Mobile does not persist phone or OTP. |
| `GET /api/auth/session` | Resolve session identity. | `Authorization: Bearer …`; always returns authenticated boolean and nullable user. |
| `POST /api/auth/sign-out` | Revoke current session. | Bearer; mobile retains session if server revocation fails. |
| `PATCH /api/auth/profile` | `{ display_name: string \| null }`. | Bearer; backend cleans/limits name and enforces seven-day edit window. |
| `GET /api/me/observations` | Owner-only `{ data: MyPostSummary[] }` account history. | Bearer; may contain owner-only coordinates; mobile deliberately omits coordinate values and does not route private rows through public detail. |
| `POST /api/posts/:passportId/comments` | `{ body, parent_comment_id? }`; returns `{ comment, message }`. | Bearer; server verifies visibility/ownership, rate-limits, and validates length. |

Backend route evidence: `src/routes/public.routes.ts`, `src/routes/community.routes.ts`, `src/routes/auth.routes.ts`, `src/routes/posts.routes.ts`, and the route mounts in `src/server.ts`. Error envelopes and detailed DTO fields are documented in `mobile/docs/MOBILE_API_CONTRACT.md`.

## Identity/session lifecycle

The native app uses the existing WhatsApp-delivered OTP flow; it does not create a parallel account system. It keeps the phone and OTP in component memory only. After verification the opaque session token is saved using Expo SecureStore (native keychain/keystore), then checked at startup with `/api/auth/session`. Expired/revoked sessions are removed; if the API is unreachable the stored token is retained but the identity is not shown until a successful retry. A protected `401` triggers another session check so expired credentials leave the signed-in UI. Sign-out calls the revocation endpoint before deleting local token state. No token or Authorization header is logged. Web preview sign-in is unavailable because SecureStore-backed mobile session handling is native-only.

Community vote/visit pseudonymous tokens remain separate from WhatsApp account sessions. They are stored in SecureStore and sent only to community write routes. A phone number is never inferred from or linked to a pseudonymous token.

## Actual gaps and synchronization limits

- The backend has no route that starts a new observation and the existing Gemini analysis pipeline from a native image upload. `POST /api/posts/:passportId/media` is an authenticated, owner-only attachment to an already existing post; it does not run AI or create a new observation. It accepts JSON base64 and is not integrated in mobile.
- `/api/me/observations` is integrated as an authenticated owner-only Profile list. Private rows are labeled and not linked to public detail; coordinates are intentionally not rendered.
- Native photo gallery/capture, media add, avatar operations, post edits/privacy controls, questions/answers, evidence submission, reports, and moderation are not integrated.
- The backend's WhatsApp webhook deduplicates provider event IDs. There is no verified mobile idempotency key for an analysis submission because no such mobile submission route exists.
- WhatsApp users and native account users only share identity when the backend's verified phone ownership process maps them to the same account. Mobile does not guess or link identities.
- Public GeoJSON can generalize points and does not disclose each feature's precision. Mobile does not reverse or sharpen those coordinates.

## Smallest proposed backend addition (not implemented)

For native photo-to-analysis parity, a backend owner would need to approve an authenticated intake contract that delegates to the exact existing analysis/persistence pipeline, rather than exposing Gemini. One concrete candidate, **proposed only and not present in source**, is:

```text
POST /api/mobile/observations
Authorization: Bearer <existing WhatsApp-verified session>
Idempotency-Key: <client-generated opaque request id>
Content-Type: multipart/form-data
  image: required validated file
  user_report: optional text

202 { request_id, status: "queued" }

GET /api/mobile/observations/requests/:requestId
Authorization: Bearer <same session>
200 { request_id, status, passport_id?: canonical ID, error_code?: safe code }
```

The backend would need to reuse its existing media validation, analysis queue/service, Gemini server credential, and observation persistence; apply per-user ownership and rate/size limits; deduplicate the idempotency key; return only a safe owner status; and make the completed record appear under the canonical passport ID/public or private rules already in force. The mobile client would never receive a Gemini credential. The exact upload limit, consent/location fields, retention behavior, storage, pending-job persistence, and duplicate policy must be decided by the backend owner. These proposed paths and DTOs are not actual API contracts; no route, field, persistence behavior, or idempotency guarantee is asserted to exist, and nothing was implemented in Stage 1–7/master integration.
