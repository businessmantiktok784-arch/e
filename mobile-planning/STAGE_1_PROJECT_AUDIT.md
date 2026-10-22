# Stage 1 project audit

**Scope:** read-only audit of the supplied repository for a separate Expo client. No app, backend, schema, dependency, or web implementation was changed. Environment files were inspected only for variable names; values are deliberately excluded.

## Repository and verified stack

This is one TypeScript project with an Express server and a React/Vite browser client. Root `package.json` runs `tsx src/server.ts`, builds the browser into `dist/client`, and compiles server TypeScript. `src/server.ts` serves Vite middleware in development and static SPA output in production. The browser entry is `web/src/main.tsx` -> `web/src/App.tsx`; `web/src/navigation.ts` and `App.tsx` implement view-state navigation (not React Router). The current web map is MapLibre GL (`web/src/components/MapView.tsx`).

Backend layers are `src/routes`, `src/controllers`, `src/services`, `src/repositories`, `src/config`, and `src/utils`. Supabase/Postgres is used through a server singleton in `src/config/supabase.ts`, initialized with the server secret key. Twenty-eight migrations are supplied in `supabase/migrations`. Gemini calls are implemented in `src/services/gemini.service.ts` and orchestration in `src/services/geoscience-analysis.service.ts` / `src/services/geoscience-intelligence.service.ts`.

Web API clients are under `web/src/services` (`http.ts`, `publicApi.ts`, `communityApi.ts`, `postsApi.ts`, `communityAuth.ts`, and expert/admin/research clients). The web presents public exploration/map, community discovery/sites/investigations, observation/post sidecards, contributor history, WhatsApp sign-in, expert/admin/research/validation workspaces, legal/about, and language controls. These browser components depend on DOM, browser storage, MapLibre GL, and `lucide-react`; they are not React Native components.

## Backend mounting and existing capabilities

Routes register directly in `src/server.ts`, without a versioned `/api/vN` prefix. `publicRouter`, expert/research/admin/validation, community, auth/user, posts, and webhook routers own their literal paths. The server binds `0.0.0.0` on configured `PORT` (default 3000); Vite is configured for 5173. `/health` and `/` health JSON return `{project, tagline, status, stage}`. Errors vary by older route family: public/legacy routes commonly use `{error: string}`, newer auth/community/posts use `{error:{code,message}}`; unexpected server errors are sanitized.

Public GET APIs expose paginated observations and filters, GeoJSON, unlocated rows, details, stats, district/category facets, AI intelligence/context, nearby/similar/compare, and research opportunities. Community APIs expose public sites, investigations, evidence, questions, visits, timelines, and contribution writes. Posts APIs expose observation discussion/media/profile history. Authentication uses a WhatsApp one-time code and bearer session, not Supabase Auth. Webhook `/webhook` receives WhatsApp messages; it is not a mobile upload API.

## Data, map, and evidence model

`src/types/public.types.ts` and repository serializers define public whitelisted shapes. Public listing responses use `{data:[...],pagination:{page,limit,total,totalPages}}`; GeoJSON uses FeatureCollection. Post detail (`src/types/community-posts.types.ts`) carries owner/public identity, privacy-limited location, AI interpretation with uncertainty/limitations/safety disclaimer, media, questions, attachments, and viewer capabilities. Community list responses generally use `{rows,total}` (or `{rows}`); see individual controllers.

Migrations establish observations, media, locations, processing events, GIS/public map views, sites, taxonomy, community posts/attachments, identity, evidence/reports, and durable webhook queue. Public location shaping is implemented in `src/utils/public-location.ts` and repositories. Precision can be private/exact/approximate/district; exact publication has an explicit consent gate in the server/model workflow. Do not infer raw coordinates from a public DTO.

## Findings and limits

- **No mobile-facing observation-create or analysis endpoint found.** Observation intake/AI analysis runs through the WhatsApp webhook and uses WhatsApp media download; the current native client cannot reuse it as a direct multipart endpoint. This blocks in-app capture -> analysis unless a separate backend change is approved.
- **Media persistence is incomplete for some observation sources.** Public media DTOs explicitly permit `url: null` and `available: false` when object storage is unwired; see `PublicMediaItem` comment in `src/types/community-posts.types.ts`. Do not promise every WhatsApp image/video is viewable.
- **Community uploads do exist as a distinct JSON data-URL workflow** (`/api/community/media`), and post media has a dedicated endpoint. This is not evidence of multipart upload or direct Supabase client upload.
- **API usability depends on production configuration and database readiness.** Community controllers deliberately return 503 when configured database is unavailable; validation may be in-memory when durable repository cannot initialize, as documented in `src/server.ts` startup behavior.
- **No separate mobile package, Expo config, native build, or physical-device network setup is supplied.** No live deployment was contacted. Existing automated tests are present, but were not run in this audit.
- No root `AGENTS.md` or additional project-specific agent instructions were found in the enumerated project. `dist`, `node_modules`, and local Supabase metadata exist but were not treated as source of truth.

## Source map

See [`MOBILE_API_INTEGRATION_MAP.md`](MOBILE_API_INTEGRATION_MAP.md), [`MOBILE_FEATURE_INVENTORY.md`](MOBILE_FEATURE_INVENTORY.md), and [`MOBILE_SECURITY_REVIEW.md`](MOBILE_SECURITY_REVIEW.md) for endpoint-by-endpoint and feature detail. This audit is static source inspection only; deployment behavior, database contents, external keys, and production health remain unverified.
