# Mobile API integration map

## Base path, configuration, and network access

`src/server.ts` registers routers directly at their literal paths (`app.use(router)`), so paths below are complete and there is no `/api/v1` prefix. Express listens on `0.0.0.0:${PORT}` (default 3000). Vite listens at 5173 in its standalone config; the combined dev server mounts Vite middleware onto Express. Web API base is `VITE_API_BASE_URL` or empty same-origin in `web/src/services/http.ts`. For mobile use a separate public `EXPO_PUBLIC_API_BASE_URL` pointing to the server origin, with no secret values. Production must use the deployment's HTTPS origin, not a tunnel URL.

From Android emulator, `localhost` addresses the emulator; Android Studio's standard host-loopback alias is `10.0.2.2` (other emulators differ). A physical device needs a reachable LAN IP and server bound to `0.0.0.0`, same network/firewall access, or a temporary HTTPS tunnel for development only. The source does not configure a permanent mobile origin or deployment domain. Verify CORS only matters for browser clients; native fetch is not browser CORS, but server network/TLS still applies.

## Core public contracts

| Method / path | Request | Success | Auth / errors / source |
|---|---|---|---|
| GET `/health` or GET `/` with JSON Accept | No body | `{project,tagline,status,stage}` | Public; 200. `src/server.ts`. |
| GET `/api/public/observations` | Query `page`, `limit`, `district`, `classification`, `category`, `subcategory`, `confidence`, `verification`, `evidence_state`, `community_status`, `site`, `has_investigation`, `research_opportunity`, `has_evidence`, `from`, `to`, `search` | `{data: PublicObservationSummary[], pagination:{page,limit,total,totalPages}}` | Public; rate limit 429, generic 500; 404 not applicable. `public.routes.ts`, `public.controller.ts`, `publicApi.ts`. |
| GET `/api/public/observations.geojson` | Same relevant filters plus `bbox=minLon,minLat,maxLon,maxLat` | GeoJSON FeatureCollection | Public; 429/500. `public.controller.ts`, `public-observation.service.ts`. |
| GET `/api/public/observations/unlocated` | Observation filters + `page`,`limit` | Same paginated shape | Public; 429/500. |
| GET `/api/public/observations/:passportId` | Passport id | Public observation detail; 404 `{error:{code,message}}` | Public; 429/500. |
| GET `/api/public/observations/:passportId/intelligence` | Passport id | `GeoscienceIntelligenceResult` | Public; 404/429/500. |
| GET `/api/public/observations/:passportId/context` | Passport id | Observation intelligence context DTO | Public; 404/429/500. |
| GET `/:passportId/nearby`, `/:passportId/similar` | Public prefix `/api/public/observations`; optional query limits as implemented in controller | Related observations response | Public; 404/429/500. |
| GET `/api/public/observations/compare` | Compare query (controller validates required records) | Comparison DTO | Public; 400/404/429/500. |
| GET `/api/public/research-opportunities` | Query filters as in `publicApi.ts` | `{count,items}` | Public; 429/500. |
| GET `/api/public/stats`, `/districts`, `/categories` | No required body | Stats object; district/category count arrays | Public; 429/500. |

The detailed observation DTOs are in `src/types/public.types.ts`; API query forwarding is in `web/src/services/publicApi.ts`. Public map output applies server-side location policy; mobile must not substitute private database coordinates.

## Authentication and post/community contracts

| Method / path | Request | Success | Auth/errors/source |
|---|---|---|---|
| POST `/api/auth/request-code` | JSON `{phone:string}` | `{delivery,message,expires_in_seconds}`; code is never returned | Public but phone/IP rate-limited; 400,429,503,500 nested error. `auth.controller.ts`, `auth.service.ts`. |
| POST `/api/auth/verify-code` | JSON `{phone:string,code:string}` | `{token,expires_at,user:{public_user_id,display_name,is_demo,display_name_updated_at}}` | Public; 400/429 and code-specific errors, 503/500. Token returned once. |
| GET `/api/auth/session` | `Authorization: Bearer <token>` optional | `{authenticated:boolean,user:...\|null}` | Always 200; server resolves token hash/session. |
| POST `/api/auth/sign-out` | Bearer token | `{ok:true}` | Session is revoked server-side. |
| PATCH `/api/auth/profile` | Bearer; JSON profile patch | `{user:...}` | `requireUser`; 401/400/409/503/500 per controller/service. |
| POST `/api/auth/avatar`, DELETE `/api/auth/avatar` | Bearer; JSON payload defined in `user-avatar.service.ts` / web client | `{ok:true}` or user response | `requireUser`, validation/size limits; inspect corresponding service before implementing native. |
| GET `/api/posts/:passportId` | Optional bearer | `CommunityPostDetail` (`ai`, `location`, `media`, `attachments`, questions, capabilities); 404 if absent/not visible | `attachViewer`; `posts.controller.ts`, `community-post.service.ts`. |
| GET `/api/posts/:passportId/comments` | Optional bearer | `{data:PublicComment[],total}` | Public/viewer context; common error envelope. |
| POST `/api/posts/:passportId/comments` | Bearer; `{body,parent_comment_id?}` | `{comment,message}` | `requireUser`; 401, validation/rate errors. |
| PATCH `/api/posts/:passportId` | Bearer; allowed patch fields `post_title`, `user_report`, `is_public`, `location_precision` | Updated CommunityPostDetail | `requireUser`, owner enforced; validation/privacy checks. |
| PATCH `/api/posts/:passportId/attachments/:attachmentId` | Bearer; `{allow_download:boolean}` | Updated post | Owner required. |
| POST `/api/posts/:passportId/questions/:questionId/answer` | Bearer; `{answer:string}` | Service result / updated post | `requireUser`; owner restrictions. |
| POST `/api/posts/:passportId/media` | Bearer; JSON body contract in `posts.controller.ts` and `community-post.service.ts` | `{media}` (201) | Owner required; JSON, not multipart. |
| GET `/api/me/observations`, `/api/me/questions` | Bearer | `{data:[...]}` | `requireUser`; 401 otherwise. |
| POST `/api/community/contributor-token` | No body | pseudonymous token response | Public; persists client-side in browser currently. |
| GET `/api/community/sites` | `district`, `limit` | `{rows,total}` | Public; 503 if DB unavailable. |
| GET `/api/community/sites.geojson` | `district`,`bbox`,`limit` | GeoJSON | Public; authorized-coordinate features only. |
| GET `/api/community/investigations` | `site_id`,`status`,`research_interest`,`limit`,`offset` | `{rows,total}` | Public; 503,429/500. |
| POST `/api/community/investigations` | JSON snake_case fields from `communityApi.ts`; `X-Contributor-Token` | investigation record, 201 | Anonymous pseudonymous contributor; service validates identity/input. |
| GET/PATCH `/api/community/investigations/:publicId` | PATCH supported fields listed in web client; contributor token | Detail/updated record | Public GET; opener token required for PATCH (403/404/503). |
| POST `.../:publicId/vote`, `.../:publicId/checklist` | `{option}` or `{item_id,checked}` plus contributor token | `{option,changed,message}` or `{checked,check_count,message}` | Server rate/validation/identity controls. |
| GET/POST `/api/community/evidence` | GET `site_id`,`investigation_id`; POST `{investigation_id,site_id,observation_id,evidence_type,explanation,media_ids}` | `{rows}` or evidence record | Public read; contributor token write. |
| GET/POST `/api/community/questions` | Query `site_id`,`limit`; POST schema in `communityApi.ts` | `{rows,total}` or question | Public read; contributor token write. |
| GET `/api/community/questions/:publicId`; POST `.../:publicId/answers` | Answer JSON defined in community client | question detail / answer | Public read; contributor identity and validation for writes. |
| GET/POST `/api/community/sites/:siteId/visits` | Visit JSON schema in client; contributor token | `{rows}` / visit record | Public reads; contributor write. |
| GET `/api/community/sites/:siteId/explorer`, `/:siteCode/timeline` | Path id/code | explorer payload / timeline array | Public; 404/503 as applicable. |
| POST `/api/community/media` | JSON data URL plus metadata per `communityApi.ts` | media descriptor (201) | Contributor token, MIME/size validation; **not multipart nor presigned URL**. |
| GET `/api/community/media/:mediaId` | media id | Binary media bytes or error | Access/download permission checked server-side. |
| POST `/api/community/reports` | Abuse-report JSON; optional `X-Contributor-Token` | `{report,message}` | Public; 400/429/503. |
| GET `/api/users/:publicUserId/avatar` | public user id | image bytes | Public; 404 if none. |

Community controller success/errors use row/item records and nested error `{error:{code,message}}`; exact input constraints are in `src/services/community*.ts` and should be mirrored only for UX, with server as authority.

## Existing ingestion, AI, admin APIs, and upload limitation

The observed intake route is `src/routes/webhook.routes.ts` mounted at `/webhook`; the controller verifies Meta signature and queues received events. `whatsapp-media.service.ts` downloads media; `geoscience-analysis.service.ts` validates buffers and invokes `gemini.service.ts`; observation persistence follows. This is an inbound WhatsApp protocol flow, not a public authenticated mobile endpoint. No multipart upload, signed-upload URL, or mobile observation-create/analysis endpoint was found. Do not call private `/internal/observations/:passportId` (requires Supabase secret as `X-Admin-Key`) from a client.

Relevant privileged endpoints live in `expert.routes.ts`, `research.routes.ts`, `admin.routes.ts`, and `validation.routes.ts`; they are intentionally omitted from the initial mobile API surface. Research exports are rate-limited and admin/expert endpoints require server-issued privileged sessions/tokens. The web clients document exact paths if a separately approved mobile admin scope is ever considered.

## Errors, pagination, and mobile client behavior

Public requests commonly use 429 rate limit and generic 500 errors; missing public records return 404. Community/posts/auth newer handlers use nested `{error:{code,message}}`; older paths sometimes emit `{error:string}`. `web/src/services/http.ts` normalizes both. Add timeout/abort, request-id capture (`X-Request-Id` response), bounded retries only for safe GETs, and explicit 401/403/404/429/503/offline UI. Paginated public observations use page/limit; community listings use limit/offset in relevant controllers. No universal pagination envelope exists.
