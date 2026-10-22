# Earth Talk — Production Deployment & Hardening Guide

## 1. System Overview

Earth Talk is a high-integrity geological citizen-science system for Rwanda that receives specimen photographs through WhatsApp, executes multimodal AI preliminary interpretations via Gemini Vision, persists immutable records in Supabase PostgreSQL + PostGIS, visualizes anonymized observations on an interactive map, and provides authorized geological experts with an auditable verification workflow and research export pipeline.

```text
WhatsApp User → Meta Cloud API → Backend (Express/TS) → Gemini Vision
      ↓
Rock Passport (HMAC Contributor Anonymization) → PostGIS Database
      ↓
Public Rwanda Observation Map ←→ Authorized Expert Verification Dashboard
      ↓
Research Analytics & Controlled Exports (CSV / GeoJSON)
```

---

## 2. Environment Configuration

All production deployments must supply the following environment variables (no hardcoded credentials):

| Variable | Description | Security Level |
|---|---|---|
| `PORT` | Listening port (default: 3000) | Public |
| `NODE_ENV` | `production` | Public |
| `WHATSAPP_ACCESS_TOKEN` | Meta Graph API permanent access token | Secret |
| `WHATSAPP_PHONE_NUMBER_ID`| WhatsApp Business Account Phone Number ID | Secret |
| `WHATSAPP_VERIFY_TOKEN` | Webhook subscription challenge token | Secret |
| `GEMINI_API_KEY` | Google AI Studio API Key for multimodal model | Secret |
| `GEMINI_MODEL` | Default `gemini-3.8-flash` | Public |
| `SUPABASE_URL` | Supabase Cloud instance URL | Secret |
| `SUPABASE_SECRET_KEY` | Service role key for backend storage/queries | Critical Secret |
| `USER_HASH_SECRET` | 256-bit cryptographic salt for HMAC phone anonymization | Critical Secret |
| `EXPERT_SESSION_SECRET` | 256-bit secret for signing expert tokens & media URLs | Critical Secret |
| `RESEARCH_DATASET_VERSION`| Version tag for reproducible research (e.g., `RT-RW-RESEARCH-2026-001`) | Public |
| `CORS_ALLOWED_ORIGINS` | Comma-separated list of authorized web origins | Config |
| `ENABLE_SECURITY_HEADERS` | `true` to enable CSP, X-Frame-Options, HSTS | Config |

---

## 3. Defense-in-Depth Security Controls

### 3.1 PII & Contributor Privacy
- **Raw Phone Numbers Are Never Stored**: Ingestion immediately hashes WhatsApp phone numbers with a keyed HMAC-SHA256 salt (`USER_HASH_SECRET`).
- **Reviewer Anonymization**: The expert dashboard exposes only anonymized handles (`RW-CONTRIBUTOR-XXXXXX`).
- **Location Generalization**: Exact GPS coordinates are generalized to district level or approximate centroids (~2km offset) for public map displays.

### 3.2 Server-Side Session Hardening
- Session tokens use HMAC-SHA256 signatures with 24-hour expiration.
- Sessions are validated against a server-side registry (`expert_sessions`).
- Only the SHA-256 hash of the session token is recorded; raw tokens are never written to database tables.
- Logout immediately writes `revoked_at` timestamp, invalidating tokens across all endpoints.

### 3.3 Strict Whitelisting on Research Exports
- All export endpoints (`/api/research/observations.csv`, `/api/research/observations.geojson`) enforce an explicit field whitelist.
- Phone numbers, contributor hashes, source message IDs, session tokens, and exact private coordinates are omitted from output schemas.

### 3.4 Multi-Tier Rate Limiting
- WhatsApp AI Vision: 10 analyses per user / hour.
- Expert Authentication: 60 attempts / minute per IP.
- Research Exports: 10 downloads / minute per IP to protect server compute.

---

## 4. Build & Deployment Commands

```bash
# 1. Install dependencies
npm ci

# 2. Execute automated regression test suite
npm test

# 3. Validate TypeScript types across frontend and backend
npm run lint

# 4. Compile frontend SPA and backend bundle
npm run build

# 5. Launch production server
npm run start
```
