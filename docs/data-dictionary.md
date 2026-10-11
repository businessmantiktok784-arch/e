# Earth Talk — Research Data Dictionary

## 1. Overview

This document specifies all data attributes exported for scientific research and analysis via the Earth Talk API (`/api/research/observations.csv` and `/api/research/observations.geojson`).

---

## 2. Research Data Attributes

| Field Name | Type | Generator | Privacy Level | Definition & Description |
|---|---|---|---|---|
| `observation_id` | UUID | System | Public / Research | Global unique identifier for the observation entity. |
| `passport_id` | String | System | Public / Research | Sequential public tracking code formatted as `RT-RW-XXXXXX`. |
| `classification` | Enum | AI (Gemini) | Public / Research | Preliminary geological class: `igneous`, `sedimentary`, `metamorphic`, `unclassified`, `non_rock`, `insufficient_image`. |
| `possible_name` | String | AI (Gemini) | Public / Research | Preliminary lithological name (e.g., *Granite*, *Basalt*, *Quartzite*). |
| `ai_confidence` | Enum | AI (Gemini) | Public / Research | Qualitative model confidence: `high`, `moderate`, `low`, `insufficient`. |
| `ai_confidence_score` | Float | AI (Gemini) | Public / Research | Continuous model certainty score between `0.0` and `1.0`. |
| `verification_status` | Enum | System / Expert | Public / Research | Current lifecycle state: `unverified`, `under_review`, `expert_verified`, `rejected`. |
| `expert_classification` | Enum | Expert | Public / Research | Authoritative classification determined by an authorized geological reviewer. |
| `expert_decision` | String | Expert | Public / Research | Authoritative verification determination code (`expert_verified` or `rejected`). |
| `data_quality_score` | Integer | System | Public / Research | Deterministic data completeness assessment score (0 to 100). |
| `district` | String | User / Admin | Public / Research | Rwanda administrative district name (one of 30 official districts). |
| `public_location_precision` | Enum | System | Public / Research | Spatial generalization level: `district` (centroid) or `approximate` (~2km jitter). |
| `created_at` | Timestamp | System | Public / Research | UTC ISO 8601 submission timestamp. |
| `expert_reviewed_at` | Timestamp | System | Public / Research | UTC ISO 8601 completion timestamp for expert review. |

---

## 3. Explicitly Excluded Attributes (Privacy & Security Whitelist)

The following fields are **strictly prohibited** from research exports to protect user privacy and system security:

| Excluded Field | Justification |
|---|---|
| `source_phone_number` | Raw contributor PII (Never stored in database). |
| `source_user_hash` | Contributor HMAC identifier (Restricted to internal deduplication). |
| `source_message_id` | WhatsApp messaging identifier (Restricted to internal webhook idempotency). |
| `raw_latitude` / `raw_longitude` | Exact private coordinates (Protected to prevent illegal specimen harvesting or property infringement). |
| `session_token` / `token_hash` | Authentication credentials. |
| `api_keys` / `internal_secrets` | System infrastructure credentials. |
