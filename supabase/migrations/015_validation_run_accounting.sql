-- =============================================================================
-- Earth Talk - Stage 7 evaluation run accounting
-- =============================================================================
--
-- Why this migration exists
--
-- `validation_ai_runs.total_samples` was written as the size of the whole
-- dataset, not the number of specimens the run actually attempted. A run
-- stopped by the per-run sample cap therefore reported a total it never
-- reached, so `successful_samples + failed_samples` did not equal
-- `total_samples` and the record claimed coverage it did not have.
--
-- A partial run still produces real, valid measurements of the subset it
-- scored. It must not be destroyed or hidden - it just must not be
-- presented as a validation of the entire dataset. `is_partial_run` carries
-- that distinction on the run row itself, so it survives export and cannot be
-- lost by a caller that forgets to re-derive it.
--
-- Existing rows are backfilled as partial only when their accounting does not
-- reconcile, which is exactly the population the bug produced. Rows whose
-- counts add up are left alone.
-- =============================================================================

ALTER TABLE public.validation_ai_runs
  ADD COLUMN IF NOT EXISTS is_partial_run boolean NOT NULL DEFAULT false;

-- Backfill: a historical row is partial when its recorded counts do not sum to
-- the recorded total, or when it scored fewer specimens than its dataset holds.
-- Rows still queued or running are skipped; their counts are incomplete by
-- design, not because of the defect this migration repairs.
UPDATE public.validation_ai_runs r
   SET is_partial_run = true
  FROM (
         SELECT dataset_id, COUNT(*)::integer AS captured_count
           FROM public.validation_samples
          GROUP BY dataset_id
       ) d
 WHERE d.dataset_id = r.dataset_id
   AND r.is_partial_run = false
   AND r.status NOT IN ('queued', 'running')
   AND (
         r.successful_samples + r.failed_samples <> r.total_samples
         OR r.total_samples < COALESCE(d.captured_count, r.total_samples)
       );

COMMENT ON COLUMN public.validation_ai_runs.total_samples IS
  'Number of specimens this run actually attempted. Equals successful_samples + failed_samples. It is not the dataset size.';

COMMENT ON COLUMN public.validation_ai_runs.is_partial_run IS
  'True when the per-run sample cap stopped this run early, so the run covers only a subset of its dataset and must not be reported as a dataset-wide validation.';


-- -----------------------------------------------------------------------------
-- Dataset versioning and the freeze instant
-- -----------------------------------------------------------------------------
--
-- Two further integrity problems, both in the dataset registry rather than the
-- run records above.
--
-- 1. `dataset_code` was UNIQUE on its own. Locking a dataset blocks any further
--    specimen, and every one of those refusals tells the admin to "create a new
--    dataset version" - a remedy the schema forbade, because the code was
--    already taken. The only sanctioned way to extend a frozen reference set was
--    therefore unavailable. Uniqueness belongs on (dataset_code, version): the
--    same reference set, revised.
--
-- 2. There was no `locked_at`. `updated_at` moves on every write, so it cannot
--    answer "when was this frozen", and the freeze instant is part of what makes
--    a validation result reproducible.

ALTER TABLE public.validation_datasets
  ADD COLUMN IF NOT EXISTS locked_at timestamptz NULL;

COMMENT ON COLUMN public.validation_datasets.locked_at IS
  'Instant the dataset was frozen. Null until locked. Held separately from updated_at, which moves on every write.';

-- Replace the single-column uniqueness with the version-aware pair. The original
-- constraint is dropped first because Postgres will not create a second unique
-- index over a superset of the first; leaving it in place is what makes v2 of a
-- dataset impossible.
DO $$
DECLARE
  old_constraint text;
BEGIN
  SELECT conname INTO old_constraint
    FROM pg_constraint
   WHERE conrelid = 'public.validation_datasets'::regclass
     AND contype = 'u'
     AND pg_get_constraintdef(oid) LIKE '%dataset_code%'
     AND pg_get_constraintdef(oid) NOT LIKE '%version%'
   LIMIT 1;

  IF old_constraint IS NOT NULL THEN
    EXECUTE format('ALTER TABLE public.validation_datasets DROP CONSTRAINT %I', old_constraint);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'validation_datasets_code_version_key'
  ) THEN
    ALTER TABLE public.validation_datasets
      ADD CONSTRAINT validation_datasets_code_version_key
      UNIQUE (dataset_code, version);
  END IF;
END
$$;

COMMENT ON COLUMN public.validation_datasets.dataset_code IS
  'Stable identifier of the reference set, shared across versions, e.g. ET-VAL-2026-V1. Unique in combination with version, not on its own.';

-- A finished run must never be stored with counts that contradict each other.
-- Enforced as a constraint rather than left to application code so that a
-- database-backed repository cannot reintroduce the original defect.
--
-- Only terminal states are checked. A queued or running row legitimately has
-- incomplete counters - the run reserves its attempt budget on insert and fills
-- the counters in as specimens finish - so holding it to the invariant at
-- creation time would reject every run the instant it started.
--
-- Partial runs are exempt. The rows this migration backfills above are exactly
-- the terminal rows whose counters do not reconcile: total_samples still holds
-- the dataset size the old bug wrote, while the counters hold the subset the
-- run actually scored. Demanding reconciliation from them would make the
-- backfill above impossible to follow with this constraint.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'validation_ai_runs_accounting_reconciles'
  ) THEN
    ALTER TABLE public.validation_ai_runs
      ADD CONSTRAINT validation_ai_runs_accounting_reconciles
      CHECK (
        is_partial_run
        OR status IN ('queued', 'running')
        OR successful_samples + failed_samples = total_samples
      );
  END IF;
END
$$;