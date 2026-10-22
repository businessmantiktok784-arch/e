# Earth Talk — Priority-0 Audit & Remediation Report

**Project:** Earth Talk
**Scope:** Priority-0 correctness, safety and integrity defects
**Date:** October 2026
**Method:** Static audit, code inspection, schema review, and regression tests
executed without a live database.

---

## 1. Summary

Six Priority-0 remediation tasks were completed. Verification was performed with
`npm run lint`, `npm run build`, the full existing test suite, the security
regression suite and a new webhook-durability suite.

| # | Task | Status |
|---|------|--------|
| 1 | Durable, idempotent inbound webhook queue | FIXED — NOT FULLY VERIFIED |
| 2 | Every webhook message-claim exit path finalised | FIXED — VERIFIED (source) |
| 3 | Scientific-evaluation readiness is policy-driven, not `>= 3` | FIXED — VERIFIED |
| 4 | Production persistence paths trusted only when durable | FIXED — NOT FULLY VERIFIED |
| 5 | Real media access control (moderation ledger + private bucket) | FIXED — BLOCKED (live) |
| 6 | Verification run and evidence | DONE |

**Verification environment:** No Supabase instance or credentials were available.
All database-backed behaviour is therefore *wired and schema-checked* but not
*integration-tested*. This is stated per task below. "NOT FULLY VERIFIED" means
the code path is implemented and type-checks, but a live end-to-end run against
Postgres/Supabase could not be performed in this environment.

### Verification commands and results

| Command | Result |
|---------|--------|
| `npm run lint` (`tsc --noEmit && tsc -p web/tsconfig.json --noEmit`) | exit 0 |
| `npm run build` (`vite build && tsc`) | exit 0 |
| `npm test` (Stages 2–13 + fake-data-audit + security-regressions + webhook-durability) | exit 0, 0 failures |

Per-suite pass counts: 96, 36, 64, 27, 12, 28, 44, 42, 19 — all `0 failed`.

---

## 2. Per-task detail

### Task 1 — Durable, idempotent inbound webhook queue — FIXED — NOT FULLY VERIFIED

**Defect.** Idempotency relied on an in-process duplicate check, so a retried
webhook after a restart (or a multi-instance deployment) could run analysis twice
and attempt a second observation for the same message. The webhook was also
acknowledged to Meta before the event was durably recorded, so an event accepted
with a 200 could be lost.

**Fix.**
- New migration `supabase/migrations/028_durable_webhook_queue.sql`: adds
  `webhook_jobs` (unique `provider_message_id`) with the claim lifecycle
  (`queued` / `processing` / `completed` / `retryable_failure` /
  `terminal_failure`), plus `claim_webhook_job`, `recover_stale_webhook_jobs`,
  `webhook_job_stats`; extends `webhook_message_claims` (`claim_webhook_message`
  maps unique-violation `23505` ⇒ `'duplicate'`, `recover_stale_webhook_claims`
  clears stale `locked_at`).
- New `src/repositories/webhook-job.repository.ts` (`DEFAULT_MAX_ATTEMPTS = 6`).
- New `src/services/webhook-queue.service.ts`.
- `src/controllers/webhook.controller.ts`: **persist before ack** —
  `acceptInbound()` enqueues, then `200 EVENT_RECEIVED`; a persist failure
  returns `503 {error:'EVENT_NOT_PERSISTED'}` so Meta retries.
- `src/server.ts`: starts the drain worker on boot and stops it on shutdown.

**Evidence.** `tests/webhook-durability.test.ts` (19 assertions): migration shape,
repository surface, persist-before-ack ordering, `EVENT_NOT_PERSISTED` on failure,
worker start/stop.

**Not verified.** RPC atomicity (`claim_webhook_job`), restart recovery and
`recover_stale_*` behaviour require a live Postgres.

---

### Task 2 — Every message-claim exit path finalised — FIXED — VERIFIED (source)

**Defect.** A message claim could be left in `processing` when the pipeline threw
between claim and completion, so a retry could be treated as a duplicate (lost
work) or re-run (double work), depending on the error.

**Fix.**
- New `src/repositories/webhook-claim.repository.ts`.
- `src/services/geoscience-analysis.service.ts`: exports `ProcessOutcome`
  (`completed` | `duplicate` | `retryable` | `terminal`) and
  `classifyPipelineError`; `processRockImage` returns `Promise<ProcessOutcome>`
  and calls `markCompleted` / `markRetryable` / `markTerminal` on **every** exit
  path.
- `src/repositories/observation.repository.ts`: old claim methods removed so
  there is a single owner of the lifecycle.

**Evidence.** `tests/security-regressions.test.ts`: the analysis service contains
`markCompleted`, `markRetryable`, `markTerminal` and reports both `retryable` and
`terminal` outcomes; the claim repository exposes
`claim`/`markCompleted`/`markRetryable`/`markTerminal`/`recoverStale`.

---

### Task 3 — Policy-driven scientific evaluation readiness — FIXED — VERIFIED

**Defect.** A run with `validCount >= 3` was presented as a validated result. A
fixed count of three is not scientific sufficiency: it ignores intended claim,
per-class coverage, reference agreement and excluded/abstained cases, and it could
be read as "this model is accurate".

**Fix.**
- `src/types/validation.types.ts`: new `EvaluationClaim`
  (`exploratory_signal` | `class_level_performance` | `dataset_validation`),
  `EvaluationStatus` (`not_measured` | `insufficient_data` | `preliminary` |
  `reportable`), `SampleSizePolicy`, `EvaluationReadiness`,
  `EvaluationReadinessCriterion`, `EvaluationCounts`; `EvaluationMetricResult`
  now carries `counts` and `readiness`.
- `src/services/validation-evaluation.service.ts`: `METRIC_MIN_EVALUATED_PAIRS = 3`
  is now only the **display floor** (below it, metrics are hidden); sufficiency
  comes from `defaultSampleSizePolicy()` and `assessReadiness(claim, policy, ctx)`.
  Counts expose `attempted_predictions`, `eligible_pairs`, `scored_pairs`,
  `correct`/`incorrect`, `abstentions`, the four exclusion buckets,
  `answered_coverage_pct`, `dataset_coverage_pct`, `abstention_rate_pct`.
  `sufficient_sample_size = (readiness.status === 'reportable')`.
- `src/config/env.ts` / `.env.example`: `VALIDATION_MIN_ANSWERED_TOTAL`,
  `VALIDATION_MIN_PER_CLASS_SUPPORT`, `VALIDATION_MIN_REFERENCE_AGREEMENT_PCT`,
  `VALIDATION_MAX_EXCLUDED_RATIO_PCT` (defaults 20 / 5 / 80 / 50).
- `tests/stage7.test.ts`: replaced "three valid specimens clear the floor" with
  "three valid specimens are computed but not presented as a validated result"
  (sufficient `false`, readiness `preliminary`); added policy-driven readiness and
  counts-reconciliation tests.

**Evidence.** `tests/security-regressions.test.ts`: the hard-coded
`>= 3 is sufficient` rule is gone; readiness is `reportable`-driven; the types
expose all statuses/claims/policy; the policy is env-configurable; denominators
and coverage are reported. `tests/stage7.test.ts`: 96 passed.

**Uncertainty/limitations.** The default policy thresholds are disclosed
defaults, not statistically derived for this dataset; a deployment must set them
for its intended claim.

---

### Task 4 — Production persistence paths — FIXED — NOT FULLY VERIFIED

**Defect.** Several repositories could silently fall back to process memory (or
return empty) when a Supabase query failed, so an outage was indistinguishable
from "no data" — and in auth paths, from "no such session/account".

**Fix.**
- `src/repositories/user.repository.ts`: production throws rather than serving the
  process-local map ("refusing to fall back to process memory").
- `src/repositories/community-post.repository.ts`: read catches throw
  `ServiceUnavailableError`.
- `src/repositories/community-media.repository.ts`: failed lookups throw
  (`unavailable(...)`), never read as absent.
- `src/repositories/expert.repository.ts`: `findObservationsForReview` uses
  `isDatabaseConfigured()` and throws `ServiceUnavailableError` on a DB error
  ("refusing to fall back to process memory"); the in-memory fallback is used only
  when no database is configured.
- `src/utils/admin-auth.ts`, `src/controllers/expert.controller.ts`,
  `src/controllers/community.controller.ts`: outage maps to `503`
  (`DATABASE_UNAVAILABLE` / `COMMUNITY_UNAVAILABLE`).

**Evidence.** `tests/security-regressions.test.ts`: every DB-backed repository
contains a refusal/`ServiceUnavailableError` guard; expert and community reads
answer 503 on outage.

**Documented findings (deliberately unchanged — no live DB to refactor against).**
- `ExpertRepository.registerObservation` has no callers, so the in-memory review
  store is never populated in production; `getObservationForExpert`
  (`src/controllers/research.controller.ts`) reads memory only and would 404.
- `ExpertRepository.submitVerification` mutates memory then best-effort mirrors to
  Supabase, swallowing a write failure ("Could not mirror verification to
  Supabase, local state intact"), so it can report success on a missed write.
- `site.repository.ts`, `abuse-report.repository.ts`, `user-avatar.repository.ts`
  return `null` / `[]` on a read error; public read paths degrade quietly. The
  abuse-report write path logs and swallows a store failure.

These are **NOT FULLY VERIFIED** and recorded for a follow-up behind a live DB.

---

### Task 5 — Real media access control — FIXED — BLOCKED (live)

**Defect.** `community-media.service.ts` wrote bytes to the `community-media`
bucket and returned a URL without ever writing a moderatable record. Nothing
distinguished a moderated attachment from a fresh anonymous upload, and the bucket
was not guaranteed private.

**Fix (verified by code + schema).**
- New `src/repositories/community-media.repository.ts`: `insertPending()`,
  `findById()`, `setModerationStatus()`; a failed lookup throws rather than being
  read as "absent".
- `src/services/community-media.service.ts`: an upload writes a
  `pending_review` / `is_public = false` row **before** a URL is served, and
  removes the stored object if the row cannot be written; a public read requires
  `moderation_status === 'visible' && is_public` and then issues a short-lived
  signed URL (`SIGNED_URL_TTL_SECONDS = 300`).
- `src/routes/admin.routes.ts` +
  `src/controllers/admin.controller.ts`: `PATCH
  /api/admin/community/media/:mediaId/moderation` behind `requireSuperAdmin`,
  reason required — the only path that can publish bytes.
- Migration `supabase/migrations/026_community_media_moderation.sql`: adds
  `mime_type`, `caption`, `contributor_hash`, `moderated_by`, `moderated_at`,
  `moderation_reason`; defaults new rows to `pending_review`; enables RLS with a
  public-read policy `USING (moderation_status = 'visible' AND is_public = true)`;
  forces the bucket private (`ON CONFLICT (id) DO UPDATE SET public = false`).

**Evidence.** `tests/security-regressions.test.ts`: bucket forced private + RLS
policy present; read refused unless visible+public; signed-URL TTL asserted;
publish route behind `requireSuperAdmin`; a failed lookup is not read as absent.

**BLOCKED.** Live signed-URL issuance, RLS enforcement, private-bucket behaviour
and the migration itself could not be exercised — no Supabase storage/instance was
available.

---

## 3. Blocked / Unverifiable In This Environment

- **All live database paths** (Tasks 1, 4, 5 and the durable validation store):
  no Supabase URL/secret or instance, so durable persistence, RPC atomicity, RLS
  enforcement, signed-URL issuance, unique-constraint idempotency and DB-outage
  branches are implemented and type-checked but not integration-tested.
- **Meta webhook signing:** verified with crafted HMACs, not real Meta deliveries.

## 4. Test & Build Evidence

- Existing suites: Stages 2–13 + fake-data-audit — 0 failures.
- `tests/security-regressions.test.ts`: 42 passed, 0 failed — wired into
  `package.json` `test`.
- `tests/webhook-durability.test.ts`: 19 passed, 0 failed — wired into
  `package.json` `test`.
- `tests/stage7.test.ts`: 96 passed (evaluation readiness).
- `npm run lint` → exit 0. `npm run build` → exit 0. `npm test` → exit 0.

## 5. Follow-ups

1. Run Tasks 1, 4 and 5 against a real Supabase project (integration tests +
   apply migrations 026/027/028).
2. Resolve the `expert.repository.ts` memory-first detail/verify gap
   (`getObservationForExpert`, `submitVerification`) and the uncalled
   `registerObservation` once a live DB is available.
3. Decide whether `site`/`abuse-report`/`user-avatar` public reads should also
   surface a 503 on outage instead of degrading to empty.
4. Set `VALIDATION_MIN_*` policy thresholds for the intended claim before
   publishing any evaluation result.
