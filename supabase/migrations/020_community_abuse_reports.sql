-- 020_community_abuse_reports.sql
-- Community abuse reports (specification section 25).
--
-- A report is an allegation made by a reader about a record, a question, a
-- comment or a site. It is stored as a moderation work item and nothing else:
-- it never changes an evidence state, never hides content by itself, and is
-- never counted as community support or agreement.
--
-- Anyone may file a report, including a signed-out visitor. To keep anonymous
-- reporting honest without collecting personal data, the reporter is recorded
-- only as a one-way hash (or null when no token was supplied). The hash is used
-- for duplicate suppression on read and is never returned to any client.

CREATE TABLE IF NOT EXISTS public.community_abuse_reports (
  id                      uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  public_id               text NOT NULL UNIQUE,
  -- What was reported. Constrained to the vocabulary the platform knows so a
  -- typo cannot create an unreachable category of allegation.
  target_type             text NOT NULL CHECK (target_type IN (
                            'observation', 'investigation', 'question',
                            'comment', 'site', 'evidence', 'media'
                          )),
  -- The id of the reported object: a passport id, an investigation public id,
  -- a question/answer public id, a comment id, or a site code.
  target_id               text NOT NULL,
  -- When the target belongs to an observation, the passport id is kept here so
  -- a moderator can group every report about one record without a join.
  observation_passport_id text NULL,
  reason_code             text NOT NULL CHECK (reason_code IN (
                            'incorrect_information', 'privacy_concern',
                            'misleading_claim', 'commercial_or_spam',
                            'abusive_content', 'duplicate_record',
                            'sensitive_location', 'other'
                          )),
  details                 text NULL,
  reported_by_hash        text NULL,
  status                  text NOT NULL DEFAULT 'open' CHECK (status IN (
                            'open', 'acknowledged', 'actioned', 'dismissed'
                          )),
  resolution_note         text NULL,
  resolved_by             text NULL,
  resolved_at             timestamptz NULL,
  created_at              timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.community_abuse_reports IS
  'Reader-filed abuse reports. An allegation only: never evidence, never a verdict.';
COMMENT ON COLUMN public.community_abuse_reports.reported_by_hash IS
  'One-way reporter hash for duplicate suppression. Null for an anonymous report. Never returned to a client.';

-- The moderation queue reads open reports newest first.
CREATE INDEX IF NOT EXISTS idx_community_abuse_reports_open
  ON public.community_abuse_reports (created_at DESC)
  WHERE status = 'open';

-- The observation-grouping lookup index that used to live here targeted
-- observation_passport_id, which does not exist until 022. It is defined
-- there instead, after the column is added.
