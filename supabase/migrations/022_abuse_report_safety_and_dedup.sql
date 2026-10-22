-- 022_abuse_report_safety_and_dedup.sql
-- Reporting improvements: the humanitarian/community/safety reason, a
-- reconciliation of the two historical shapes of community_abuse_reports, and
-- a duplicate-suppression index.
--
-- Background: migration 013 created `community_abuse_reports` with one column
-- per target kind (observation_id, investigation_id, ...). Migration 020 tried
-- to create the same table with a generic (target_type, target_id) shape using
-- `CREATE TABLE IF NOT EXISTS`, so on any deployment that had already applied
-- 013 it silently did nothing. The repository writes the generic shape, so this
-- migration makes the table match what the application actually stores, without
-- deleting any existing rows.

-- 1. Add the generic target columns the application writes.
ALTER TABLE public.community_abuse_reports
  ADD COLUMN IF NOT EXISTS target_type text NULL,
  ADD COLUMN IF NOT EXISTS target_id text NULL,
  ADD COLUMN IF NOT EXISTS observation_passport_id text NULL;

-- 2. Backfill target_type/target_id from the per-kind columns where they are
--    still in use, so no historical row is left without a generic target.
UPDATE public.community_abuse_reports
SET target_type = CASE
      WHEN observation_id   IS NOT NULL THEN 'observation'
      WHEN investigation_id IS NOT NULL THEN 'investigation'
      WHEN question_id      IS NOT NULL THEN 'question'
      WHEN site_id          IS NOT NULL THEN 'site'
      WHEN evidence_id      IS NOT NULL THEN 'evidence'
      WHEN media_id         IS NOT NULL THEN 'media'
    END,
    target_id = COALESCE(
      observation_id::text, investigation_id::text, question_id::text,
      site_id::text, evidence_id::text, media_id::text
    )
WHERE target_type IS NULL;

-- 3. Drop the per-kind single-target constraint: it required exactly one of the
--    legacy columns and would reject the generic rows the application inserts.
ALTER TABLE public.community_abuse_reports
  DROP CONSTRAINT IF EXISTS community_abuse_reports_single_target;

-- 4. Widen the reason vocabulary with the safety/humanitarian principle.
DO $$
BEGIN
  ALTER TABLE public.community_abuse_reports
    DROP CONSTRAINT IF EXISTS community_abuse_reports_reason_code_check;
EXCEPTION WHEN undefined_table THEN
  NULL;
END $$;

ALTER TABLE public.community_abuse_reports
  ADD CONSTRAINT community_abuse_reports_reason_code_check CHECK (reason_code IN (
    'incorrect_information', 'privacy_concern', 'misleading_claim',
    'commercial_or_spam', 'abusive_content', 'duplicate_record',
    'sensitive_location', 'safety_principles', 'other'
  ));

-- 5. Grouping every report about one observation is a common moderator lookup.
--    The column is added by this migration, so the index cannot live in 020.
--    The name differs from 013's idx_community_abuse_reports_observation,
--    which is already taken by an index on the legacy observation_id column.
CREATE INDEX IF NOT EXISTS idx_community_abuse_reports_observation_passport
  ON public.community_abuse_reports (observation_passport_id)
  WHERE observation_passport_id IS NOT NULL;

-- 6. One reporter may report a given target only once. Anonymous (hashless)
--    reports are unaffected because NULL values are excluded from the index.
CREATE UNIQUE INDEX IF NOT EXISTS idx_community_abuse_reports_dedup
  ON public.community_abuse_reports (target_type, target_id, reported_by_hash)
  WHERE reported_by_hash IS NOT NULL;

COMMENT ON COLUMN public.community_abuse_reports.target_type IS
  'Generic target kind: observation, investigation, question, comment, site, evidence or media.';
COMMENT ON COLUMN public.community_abuse_reports.target_id IS
  'The id of the reported object (passport id, public id, comment id or site code).';
