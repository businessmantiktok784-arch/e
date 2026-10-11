# Earth Talk

WhatsApp-based GeoAI platform for Rwanda.

> The repository directory is still named `rock-talk`, and deployed databases
> still contain `rock_talk` and `rock_*` identifiers. Those names are retained
> where changing them would break existing data; migration 014 bridges the
> product rename without rewriting history.

## Stage 8

Geological sites, Community Discovery, and the evidence ladder that keeps community
input separate from expert verification and scientific confirmation.

## Stages

| Stage | Scope | Status |
|-------|-------|--------|
| 1 | WhatsApp webhook verification and text routing | Complete |
| 2 | Multimodal geological AI analysis via Gemini | Complete |
| 3 | Geological Passport generation and observation persistence | Complete |
| 4 | Public GIS map (observations + evidence-coloured geological sites), GeoJSON export, observation API | Complete |
| 5 | Expert verification workflow (Super Admin only) | Complete |
| 6 | Research analytics, dataset export, compliance audit | Complete |
| 7 | Field validation and model evaluation | Infrastructure complete; **no real validation has been run** |
| 8 | Geological sites, Community Discovery, Site Explorer | Complete |
| 9 | Category-first taxonomy and honest public filtering | Complete |
| 10 | Video/3GP/HEIC media pipeline, evidence ladder map colours, attributable admin actions | Complete |
| 11 | Geoscience Intelligence: context-aware layers, nearby context, research opportunities | Complete |
| 12 | Community observation posts, WhatsApp verification login, discussion, moderation | Complete |

## Current functionality

### Stages 1-3: WhatsApp and the Rock Passport

- WhatsApp webhook verification and event routing
- Text message handling (`START`, `HELP`, unknown text)
- WhatsApp media retrieval and secure authenticated download
- Image validation (MIME checking, magic byte verification, file size limits up to 10 MB)
- Multimodal geological AI analysis via Google's `gemini-3.8-flash`
- Structured JSON output with strict runtime schema validation
- Cautious educational WhatsApp message formatting with scientific safety notes
- **Rock Passport generation:** Unique sequential public identifiers (`RT-RW-000001`, `RT-RW-000002`, ...)
- **Supabase PostgreSQL database persistence** across `observations`, `observation_media`,
  `observation_locations` (PostGIS `geometry(Point, 4326)`), and `processing_events`
- In-memory and database event deduplication, protecting against repeated webhook calls

### Stage 4: Public map and observation API

- `GET /api/public/observations`, `/observations.geojson`, `/observations/:passportId`
- `GET /api/public/stats`, `/api/public/districts`
- Location generalization: `district` precision returns a district centre, `approximate`
  returns a coordinate generalised to roughly 2 km, `exact` returns the real point only
  under an explicit consent policy. A missing coordinate is never invented.
- The map draws published geological sites as a separate layer beneath the
  observation points, coloured by `highest_evidence_state`. A site with no
  authorised coordinate is **omitted** rather than drawn at a guessed position,
  and every feature publishes `location_precision` so a consumer can tell a
  precisely located site from a district centroid. The legend states that a
  stronger colour means *more evidence*, not a better answer, and that community
  agreement is not scientific confirmation.

### Stage 5-6: Verification, research and compliance

- **Super Admin only.** There is no expert account system and no passwordless path.
  Access requires `SUPER_ADMIN_EMAIL` plus a scrypt `SUPER_ADMIN_PASSWORD_HASH`
  (`POST /api/expert/auth/login`), issues a signed, revocable session, and every
  review names its reviewer as an attribute of the review itself.
- `GET /api/research/summary`, `/dataset-version`, `/observations.csv`, `/observations.geojson`
- Compliance audit records for exports and for every authoritative verification.
- Operational metrics that are not instrumented are reported as `null` with
  `metrics_instrumented: false`. They are never replaced with plausible constants.

### Stage 7: Field validation and model evaluation

- Labelled dataset and sample management, dataset locking, reference labels
- Evaluation runs scored against expert reference labels only
- Predictions call the real Gemini model. When image bytes cannot be retrieved the
  run fails honestly rather than returning a simulated result.
- Scientific metrics that could not be measured are `null`, flagged by
  `metrics_are_real_measurements`.
- Dashboard is reachable from the header once signed in (`Validation`), because every
  validation route requires an authenticated session.

### Stage 8: Geological sites and Community Discovery

- **Geological sites** (`geological_sites`) carry a `grouping_basis`
  (`admin_curated`, `observation_cluster`, `community_suggested`) so a reader can tell a
  curated site from a suggestion. Observations are never silently clustered by a distance
  threshold. `GET /api/community/sites`, `/sites.geojson`, `/sites/:siteId/explorer`,
  `/sites/:siteCode/timeline`.
- **Community Discovery**: investigations, votes, evidence, questions, answers, visits,
  moderation, and a participation-only reputation profile.
- **WhatsApp commands**: `SITES`, `SITE`, `INVESTIGATE`, `VOTE`, `EVIDENCE`, `ASK`,
  `ANSWER`, `VISIT`, `REP`, `COMMUNITYHELP`.
- **The evidence ladder** is the core of the feature and is enforced server-side:

  | State | Established by |
  |-------|----------------|
  | `ai_assisted` | An automated model only |
  | `community_supported` | Agreement from several independent participants |
  | `community_investigated` | Real substantive evidence items |
  | `expert_reviewed` | A recorded human expert review |
  | `scientifically_confirmed` | An expert review backed by laboratory analysis or a documented reference specimen |
  | `unresolved` | A dispute, or conflicting evidence |

  Community activity alone can never reach `expert_reviewed` or `scientifically_confirmed`.
  `unresolved` is ranked highest so a rollup cannot present a disputed record as settled.

- **The Site Explorer** renders the AI interpretation, the community record and any expert
  review as three separate, separately labelled blocks. They are never merged or ranked
  against one another.

### Stage 9-11: Taxonomy, media breadth and Geoscience Intelligence

- A category-first vocabulary (`rock`, `mineral`, `fossil`, `geological_structure`, ...)
  with per-category subcategories, an explicit `unknown`/`non_geoscience`/`insufficient_image`
  set of exits, and a migration that backfills historical rock records without retyping them.
- Media acceptance widened to video (`video/mp4`, `3GP`) and HEIC image containers, all
  validated by magic bytes rather than declared MIME type.
- The evidence ladder drives map colour, and every administrative change (evidence state,
  publication status, media visibility) is recorded with its actor and reason.
- **Geoscience Intelligence** adds a context-aware layer on read (never persisted): nearby
  and similar public observations are context only, geological context is "unavailable"
  unless a real dataset was consulted, and hypotheses carry evidence for *and* against.
  Research opportunities come only from explicitly flagged records.

### Stage 12: Community observation posts and WhatsApp sign-in

- **WhatsApp verification login**: a six-digit code (scrypt-hashed, expiring, attempt-limited)
  opened via `POST /api/auth/request-code` and `POST /api/auth/verify-code`. A phone number
  is never stored or returned; the flow resolves an opaque `rt_session_`-prefixed token
  that is hashed in storage and revocable server-side. Account ownership is claimed
  automatically when the same number submits an observation through WhatsApp.
- **Observation side card**: the contributor's own words and the model's interpretation
  are separate, labelled `user_report` and `ai` blocks; AI questions can be answered by the
  owner; comments and threaded replies open after sign-in; a gallery renders what was
  actually stored and says so when a file is only metadata.
- **Privacy**: `publication_status` (`public`/`private`) and a location precision
  (`exact`/`approximate`/`district`/`private`) are enforced server-side per viewer. A
  private post reads as missing to everyone except its owner.
- **MY EARTH TALK dashboard**: the signed-in contributor's own posts, an editable profile
  name, and honest per-post counts (visible comments, open questions, media).
- **Super-admin moderation**: `GET /api/admin/community/comments` queue and
  `PATCH /api/admin/community/comments/:commentId/moderation` hide/restore/remove with a
  recorded actor and reason; demonstration comments are listed read-only and refuse edits.
- **Demonstration content**: 28 labelled `ET-DEMO-` posts (two for every category) serve
  the map, card and discussion on a fresh deployment when `DEMO_POSTS_ENABLED` is on. Every
  field is flagged `is_demo`, every string says "Demonstration entry: ...", and demo records
  are excluded from research, validation, aggregates and category counts.

## Data honesty

This is a hard constraint of the codebase, enforced by tests:

- No fabricated observations, users, experts, votes, visits, locations, or metrics.
- Production repositories have no seed data. They return empty results or `null`.
- There are no placeholder reviewer accounts and no one-click sign-in.
- Unavailable is reported as unavailable. An unconfigured database yields an honest
  empty read on `GET` and `503 COMMUNITY_UNAVAILABLE` on writes, never a fake success
  and never an empty `200` that would imply "no records exist".

## Privacy

- Raw phone numbers are **never stored**; one-way salted HMAC-SHA256 hashes are used.
- Community contributors appear only as derived handles such as `Field Explorer #A82F`.
- Browser contributions use a random localStorage token containing no personal data.
- `publication_status` defaults to `private`, `verification_status` to `unverified`,
  and `is_public` to `false` for all location coordinates.

## Not yet implemented

- Mobile app
- End-to-end encrypted direct chat
- Media object storage (WhatsApp submissions currently keep their metadata and are
  reported as such rather than replayed)

## Development

```bash
npm install
npm run dev
```

## Running Tests

```bash
npm test
```

Runs the full suite: Stage 2 (12), Stage 3 (15), Stage 4 (11), Stage 5 (10),
Stage 6 (33), Stage 8 Community Discovery (28), Stage 9 (36), Stage 10 (64),
Stage 11 (27), Stage 12 (26) — 262 state-stage assertions, plus the 12-assertion
fake-data audit.

## Production build

```bash
npm run build
npm start
```

---

## Target Architecture

```
                    ┌──────────────────────┐
                    │      WhatsApp User   │
                    └──────────┬───────────┘
                               │
                         Rock photograph
                               │
                               ▼
                    ┌──────────────────────┐
                    │ Meta WhatsApp Cloud  │
                    │        API           │
                    └──────────┬───────────┘
                               │
                         Webhook event
                               │
                               ▼
                    ┌──────────────────────┐
                    │ Earth Talk Backend   │
                    │ Node.js + TypeScript │
                    └──────────┬───────────┘
                               │
                     Download & Validate
                               │
                               ▼
                    ┌──────────────────────┐
                    │ Gemini 3.8 Flash     │
                    │ Multimodal Analysis  │
                    └──────────┬───────────┘
                               │
                         Structured JSON
                               │
                               ▼
                    ┌──────────────────────┐
                    │ Observation Service  │
                    │ & Passport Generator │
                    └──────────┬───────────┘
                               │
                               ▼
                    ┌──────────────────────┐
                    │ Supabase PostgreSQL  │
                    │      + PostGIS       │
                    │                      │
                    │ ├── observations     │
                    │ ├── observation_media│
                    │ ├── observation_locs │
                    │ └── processing_events│
                    └──────────┬───────────┘
                               │
                               ▼
                    ┌──────────────────────┐
                    │ WhatsApp Formatter   │
                    └──────────┬───────────┘
                               │
                               ▼
                    ┌──────────────────────┐
                    │ WhatsApp User        │
                    │ (Rock Passport sent) │
                    └──────────────────────┘
```

### Directory Structure

```
rock-talk/
├── src/
│   ├── server.ts                  # Express server entry point
│   ├── config/
│   │   ├── env.ts                 # Environment variable validation
│   │   └── supabase.ts            # Supabase server-side singleton client
│   ├── routes/
│   │   └── webhook.routes.ts      # Webhook GET/POST routing
│   ├── controllers/
│   │   └── webhook.controller.ts  # Verification & message handling
│   ├── services/
│   │   ├── whatsapp.service.ts    # Meta WhatsApp Cloud API messaging client
│   │   ├── whatsapp-media.service.ts # Secure WhatsApp media download client
│   │   ├── gemini.service.ts      # Gemini 3.8 Flash SDK client & timeout
│   │   ├── observation.service.ts # Rock Passport & database orchestration
│   │   └── rock-analysis.service.ts # Analysis pipeline orchestrator & formatter
│   ├── repositories/
│   │   └── observation.repository.ts # Database CRUD repository
│   ├── ai/
│   │   ├── geological.prompt.ts   # System prompt and safe prompt builder
│   │   ├── geological.schema.ts   # JSON response schema & runtime validator
│   │   └── geological.types.ts    # TypeScript definitions
│   ├── types/
│   │   ├── database.types.ts      # Supabase database schema types
│   │   └── whatsapp.types.ts      # WhatsApp Webhook & API types
│   └── utils/
│       ├── logger.ts              # Sanitized structured logger
│       ├── crypto.ts              # HMAC-SHA256 user hashing & media checksum
│       ├── image-validator.ts     # Magic bytes & size validator
│       └── rate-limiter.ts        # In-memory deduplication & rate limiter
├── supabase/
│   └── migrations/
│       ├── 001_extensions.sql     # PostGIS in extensions schema
│       ├── 002_observations.sql   # Sequence & observations table with RLS
│       ├── 003_media.sql          # observation_media table with RLS
│       ├── 004_locations.sql      # observation_locations table with RLS
│       ├── 005_processing_events.sql # processing_events audit table with RLS
│       └── 006_indexes.sql        # B-Tree & GiST spatial indexes
├── tests/
│   ├── stage2.test.ts             # Stage 2 AI unit tests
│   └── stage3.test.ts             # Stage 3 Database & Passport unit tests
├── .env                           # Local credentials (gitignored)
├── .env.example                   # Environment variable template
├── .gitignore                     # Git ignore rules
├── package.json                   # Scripts and dependencies
├── tsconfig.json                  # TypeScript compiler configuration
└── README.md                      # Documentation
```

---

## Supabase PostgreSQL & PostGIS Setup

Follow these steps to configure your Supabase instance:

1. **Create a Supabase Project:**
   - Log into the Supabase Dashboard and create a new project.
2. **Enable PostGIS:**
   - Go to **Database** → **Extensions**.
   - Search for `postgis` and enable it.
   - Per Supabase best practice, install the extension in the `extensions` schema.
3. **Execute Database Migrations:**
   - In the Supabase SQL Editor, run the migration scripts sequentially from `supabase/migrations/`:
     - `001_extensions.sql`
     - `002_observations.sql`
     - `003_media.sql`
     - `004_locations.sql`
     - `005_processing_events.sql`
     - `006_indexes.sql`
4. **Configure Environment Variables:**
   - Obtain your Project URL (`https://<project-ref>.supabase.co`) and `service_role` secret key from **Project Settings** → **API**.
   - Add them to `.env`.
5. **Verify Security:**
   - Ensure Row Level Security (RLS) is enabled on all tables (applied automatically in migrations).
   - Only backend services using `SUPABASE_SECRET_KEY` write to the database.

---

## Environment Variables

Copy `.env.example` to `.env` and fill in your Meta WhatsApp, Gemini, and Supabase credentials:

```bash
cp .env.example .env
```

| Variable | Description | Default / Example |
| :--- | :--- | :--- |
| `PORT` | Local port the HTTP server listens on | `3000` |
| `NODE_ENV` | Runtime environment (`development` / `production`) | `development` |
| `WHATSAPP_ACCESS_TOKEN` | Meta Graph API permanent/system access token | `EAAG...` |
| `WHATSAPP_PHONE_NUMBER_ID` | Phone Number ID from WhatsApp App Dashboard | `100000000000000` |
| `WHATSAPP_BUSINESS_ACCOUNT_ID` | WhatsApp Business Account ID | `200000000000000` |
| `WHATSAPP_VERIFY_TOKEN` | Random verification token shared with Meta Webhook | `replace_with_a_long_random_string` |
| `WHATSAPP_GRAPH_API_VERSION` | Meta Graph API version | `v21.0` |
| `GEMINI_API_KEY` | Google Gemini API key | `AIza...` |
| `GEMINI_MODEL` | Gemini Multimodal Model | `gemini-3.8-flash` |
| `GEMINI_TIMEOUT_MS` | AI inference timeout in milliseconds | `30000` |
| `MAX_IMAGE_SIZE_BYTES` | Maximum allowed image payload size | `10000000` (10 MB) |
| `AI_RATE_LIMIT_PER_USER` | Maximum image analyses per user per window | `10` |
| `AI_RATE_LIMIT_WINDOW_SECONDS` | Rate limit rolling window in seconds | `3600` (1 hour) |
| `SUPABASE_URL` | Supabase Project URL | `https://xxxx.supabase.co` |
| `SUPABASE_SECRET_KEY` | Supabase Server-side Service Role secret key | `eyJhbG...` |
| `USER_HASH_SECRET` | Salt/Secret for HMAC-SHA256 user phone number hashing | `replace_with_a_long_random_string` |

*Security notice: Never commit `.env` or expose access tokens or API keys in logs or client-facing code.*
