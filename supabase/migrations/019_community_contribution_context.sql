-- 019_community_contribution_context.sql
-- Community Discovery: richer contributions, survey investigations and files.
--
-- Adds the fields the community composers now send:
--
--   * investigations may be run as a survey (`options`), carry extra context and
--     a subject `category`, and attach media;
--   * evidence may attach several media items instead of one;
--   * questions may ask for a qualified practitioner (`requested_expert`) and
--     carry context, a category and media;
--   * answers may carry media and be marked as an expert answer.
--
-- Two notes on intent:
--
--   * `options` is stored as jsonb (an ordered array of short strings) rather
--     than a child table. The choices are fixed when the investigation is opened
--     and votes reference them by text, so a single ordered array keeps the
--     survey legible without a join.
--   * `media_ids` is a uuid[] with no foreign key. Postgres arrays cannot carry a
--     per-element foreign key, and the ids point at objects in the
--     `community-media` storage bucket rather than rows, so an array of ids is
--     the honest shape. Referential cleanup is handled on read.
--
-- Deployment note: database mode stores uploaded bytes in Supabase Storage under
-- the `community-media` bucket. Create that bucket (private is fine) before
-- enabling community uploads; migrations do not provision buckets in this
-- project. Demo mode holds bytes in process memory and needs no bucket.

-- ----------------------------------------------------------------------------
-- Investigations: survey options, context, category and media
-- ----------------------------------------------------------------------------
ALTER TABLE public.community_investigations
  ADD COLUMN IF NOT EXISTS options  jsonb NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS context  text NULL,
  ADD COLUMN IF NOT EXISTS category text NULL,
  ADD COLUMN IF NOT EXISTS media_ids uuid[] NOT NULL DEFAULT '{}'::uuid[];

COMMENT ON COLUMN public.community_investigations.options IS
  'Ordered, fixed answer choices when the investigation is run as a survey. Empty for a free-form investigation.';
COMMENT ON COLUMN public.community_investigations.context IS
  'Extra context the opener supplied. Unverified; shown alongside the question.';
COMMENT ON COLUMN public.community_investigations.category IS
  'Optional geoscience subject category id.';
COMMENT ON COLUMN public.community_investigations.media_ids IS
  'Attached community-media ids stored in the community-media bucket.';

-- ----------------------------------------------------------------------------
-- Evidence: multiple attachments
-- ----------------------------------------------------------------------------
ALTER TABLE public.community_evidence
  ADD COLUMN IF NOT EXISTS media_ids uuid[] NOT NULL DEFAULT '{}'::uuid[];

COMMENT ON COLUMN public.community_evidence.media_ids IS
  'Attached community-media ids. The legacy single media_id column is retained for older rows.';

-- ----------------------------------------------------------------------------
-- Questions: expert routing, context, category and media
-- ----------------------------------------------------------------------------
ALTER TABLE public.community_questions
  ADD COLUMN IF NOT EXISTS requested_expert boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS context          text NULL,
  ADD COLUMN IF NOT EXISTS category         text NULL,
  ADD COLUMN IF NOT EXISTS media_ids        uuid[] NOT NULL DEFAULT '{}'::uuid[];

COMMENT ON COLUMN public.community_questions.requested_expert IS
  'The asker asked for an answer from a qualified practitioner. It does not by itself make any answer an expert answer.';
COMMENT ON COLUMN public.community_questions.context IS
  'Extra context the asker supplied. Unverified; shown alongside the question.';
COMMENT ON COLUMN public.community_questions.category IS
  'Optional geoscience subject category id.';
COMMENT ON COLUMN public.community_questions.media_ids IS
  'Attached community-media ids stored in the community-media bucket.';

-- ----------------------------------------------------------------------------
-- Answers: media and expert marking
-- ----------------------------------------------------------------------------
ALTER TABLE public.community_answers
  ADD COLUMN IF NOT EXISTS media_ids uuid[] NOT NULL DEFAULT '{}'::uuid[],
  ADD COLUMN IF NOT EXISTS is_expert boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN public.community_answers.media_ids IS
  'Attached community-media ids stored in the community-media bucket.';
COMMENT ON COLUMN public.community_answers.is_expert IS
  'Set only by a named, authenticated reviewer. Never inferred from votes or agreement.';

-- ----------------------------------------------------------------------------
-- Indexes for the new query paths
-- ----------------------------------------------------------------------------
-- Questions that asked for a practitioner are the worklist an expert reads
-- first, so they are worth a partial index rather than a full scan.
CREATE INDEX IF NOT EXISTS idx_community_questions_requested_expert
  ON public.community_questions (created_at DESC)
  WHERE requested_expert = true;

-- Expert answers are rare and looked up as a set when a question is opened.
CREATE INDEX IF NOT EXISTS idx_community_answers_expert
  ON public.community_answers (question_id)
  WHERE is_expert = true;

-- Survey investigations filter/among themselves by whether they carry options.
CREATE INDEX IF NOT EXISTS idx_community_investigations_survey
  ON public.community_investigations (created_at DESC)
  WHERE jsonb_array_length(options) > 0;
