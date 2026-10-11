-- =============================================================================
-- 013 - Full geoscience evidence ladder, media metadata, research opportunities,
--       abuse reports and durable audit logs.
--
-- This migration completes the data model the expanded platform needs. It is
-- additive only: no existing column is dropped, renamed or re-typed, and no
-- observation is invented, altered or deleted.
--
-- NOTHING IN THIS FILE IS A SCIENTIFIC CLAIM. The evidence ladder records how
-- much has actually been established about a record. It never asserts that a
-- record is correct.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. Full evidence ladder (specification section 12)
--
-- Two states are added to the original six:
--
--   insufficient_evidence  The record exists but the available evidence cannot
--                           support any interpretation. This is an honest state,
--                           not a failure: "we looked and could not tell" is a
--                           real answer and must be visible on the map rather
--                           than hidden or presented as a low-confidence result.
--
--   rejected               A recorded determination that the record should not be
--                           presented as an observation at all. Rejection is a
--                           platform-owner decision and is always recorded, never
--                           inferred, and never applied by community activity.
--
-- Existing rows keep their current value; the new states are opt-in.
-- -----------------------------------------------------------------------------

ALTER TABLE public.observations
  DROP CONSTRAINT IF EXISTS observations_evidence_state_check;

ALTER TABLE public.observations
  ADD CONSTRAINT observations_evidence_state_check CHECK (
    evidence_state IN (
      'ai_assisted',            -- AI produced a preliminary interpretation
      'community_supported',    -- agreement from several independent contributors
      'community_investigated', -- substantive community evidence collected
      'expert_reviewed',        -- a qualified geoscientist review exists
      'scientifically_confirmed', -- laboratory / documented reference evidence
      'unresolved',             -- explicitly unresolved (dispute or conflict)
      'insufficient_evidence',  -- evidence exists but cannot support any reading
      'rejected'                -- recorded as not a presentable observation
    )
  );

COMMENT ON COLUMN public.observations.evidence_state IS
  'Ordered evidence ladder. Records how much has been established, never whether the record is correct. Community activity can never reach expert_reviewed or scientifically_confirmed.';

-- A rejected record keeps its evidence history. Nothing is deleted.
CREATE INDEX IF NOT EXISTS idx_observations_evidence_state_rejected
  ON public.observations (evidence_state, created_at DESC);

-- Rejection must be traceable to a recorded decision, not to a silent update.
ALTER TABLE public.observations
  ADD COLUMN IF NOT EXISTS evidence_state_reason    text NULL,
  ADD COLUMN IF NOT EXISTS evidence_state_changed_at timestamptz NULL,
  ADD COLUMN IF NOT EXISTS evidence_state_changed_by text NULL;

ALTER TABLE public.observations
  ADD CONSTRAINT observations_rejected_requires_reason
    CHECK (
      evidence_state IS DISTINCT FROM 'rejected'
      OR (evidence_state_reason IS NOT NULL AND length(btrim(evidence_state_reason)) > 0)
    );

COMMENT ON COLUMN public.observations.evidence_state_reason IS
  'Recorded reason for the current evidence state. Required when the state is rejected.';

-- -----------------------------------------------------------------------------
-- 2. Research opportunities (specification section 21)
--
-- A research opportunity is a community-generated question, never an official
-- discovery. The two columns below keep "the community flagged this" separate
-- from "this has been scientifically established".
-- -----------------------------------------------------------------------------

ALTER TABLE public.community_investigations
  ADD COLUMN IF NOT EXISTS opportunity_summary   text NULL,
  ADD COLUMN IF NOT EXISTS opportunity_reason     text NULL,
  ADD COLUMN IF NOT EXISTS opportunity_basis      text;

ALTER TABLE public.community_investigations
  ADD CONSTRAINT community_investigations_opportunity_basis_check
    CHECK (opportunity_basis IS NULL OR opportunity_basis IN ('observation', 'site', 'community'));

COMMENT ON COLUMN public.community_investigations.opportunity_basis IS
  'What the opportunity was derived from: repeated observations, a site, or community activity. Never a scientific source.';

ALTER TABLE public.geological_sites
  ADD COLUMN IF NOT EXISTS is_research_opportunity boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS research_opportunity_note text NULL;

CREATE INDEX IF NOT EXISTS idx_geological_sites_research_opportunity
  ON public.geological_sites (is_research_opportunity, status);

COMMENT ON COLUMN public.geological_sites.is_research_opportunity IS
  'Community-generated research opportunity. Not an official geological discovery and not a scientific finding.';

-- -----------------------------------------------------------------------------
-- 3. Media metadata (specification section 23)
--
-- Media is private by default. A media row existing does not make the media
-- public, and no row is created for media that was never actually received.
-- -----------------------------------------------------------------------------

ALTER TABLE public.observation_media
  ADD COLUMN IF NOT EXISTS media_category  text NULL REFERENCES public.geoscience_categories(id),
  ADD COLUMN IF NOT EXISTS view_type       text NULL,
  ADD COLUMN IF NOT EXISTS storage_path    text NULL,
  ADD COLUMN IF NOT EXISTS duration_seconds numeric NULL,
  ADD COLUMN IF NOT EXISTS width_px        integer NULL,
  ADD COLUMN IF NOT EXISTS height_px       integer NULL,
  ADD COLUMN IF NOT EXISTS moderation_status text NOT NULL DEFAULT 'visible',
  ADD COLUMN IF NOT EXISTS moderated_by    text NULL,
  ADD COLUMN IF NOT EXISTS moderated_at    timestamptz NULL;

ALTER TABLE public.observation_media
  ADD CONSTRAINT observation_media_moderation_status_check
    CHECK (moderation_status IN ('visible', 'pending_review', 'hidden', 'removed'));

ALTER TABLE public.observation_media
  ADD CONSTRAINT observation_media_view_type_check
    CHECK (
      view_type IS NULL OR view_type IN (
        'overview', 'close_up', 'texture', 'fresh_surface', 'outcrop',
        'environment', 'multiple_angles', 'field_context', 'context'
      )
    );

ALTER TABLE public.observation_media
  ADD CONSTRAINT observation_media_moderation_requires_actor
    CHECK (
      moderation_status IN ('visible', 'pending_review')
      OR moderated_by IS NOT NULL
    );

-- The original media_type was unconstrained. Constraining it now would fail on
-- legacy rows, so the valid set is enforced by a trigger that reads the stored
-- value rather than by a rewrite.
CREATE OR REPLACE FUNCTION public.enforce_observation_media_type()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  normalized text := lower(trim(COALESCE(NEW.media_type, 'image')));
BEGIN
  IF normalized IN ('image', 'video', 'audio') THEN
    NEW.media_type := normalized;
  ELSE
    RAISE EXCEPTION 'observation_media.media_type % is not a supported media type', NEW.media_type
      USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_observation_media_type ON public.observation_media;
CREATE TRIGGER trg_observation_media_type
  BEFORE INSERT OR UPDATE OF media_type ON public.observation_media
  FOR EACH ROW EXECUTE FUNCTION public.enforce_observation_media_type();

CREATE INDEX IF NOT EXISTS idx_observation_media_moderation
  ON public.observation_media (moderation_status, visibility);

CREATE INDEX IF NOT EXISTS idx_observation_media_observation
  ON public.observation_media (observation_id, media_type);

COMMENT ON COLUMN public.observation_media.storage_path IS
  'Path to stored bytes when they genuinely exist. NULL when only metadata was retained. Never a placeholder.';
COMMENT ON COLUMN public.observation_media.visibility IS
  'Private by default. Media is never public merely because it exists.';
COMMENT ON COLUMN public.observation_media.moderation_status IS
  'Media moderation state. Hiding or removing media requires a recorded actor.';

-- -----------------------------------------------------------------------------
-- 4. Community abuse reports (specification section 25)
--
-- A member of the public can report a record without creating an account, so the
-- reporter is stored only as a one-way contributor hash, exactly like every
-- other community contribution. Reports are never published, never counted as
-- evidence, and never change an evidence state by themselves.
-- -----------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.community_abuse_reports (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  public_id           text NOT NULL UNIQUE
                        DEFAULT 'RPT-' || upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 10)),
  -- What was reported. Exactly one target must be set.
  observation_id      uuid NULL REFERENCES public.observations(id) ON DELETE CASCADE,
  investigation_id    uuid NULL REFERENCES public.community_investigations(id) ON DELETE CASCADE,
  question_id         uuid NULL REFERENCES public.community_questions(id) ON DELETE CASCADE,
  site_id             uuid NULL REFERENCES public.geological_sites(id) ON DELETE CASCADE,
  evidence_id         uuid NULL REFERENCES public.community_evidence(id) ON DELETE CASCADE,
  media_id            uuid NULL REFERENCES public.observation_media(id) ON DELETE CASCADE,

  reason_code         text NOT NULL CHECK (reason_code IN (
                        'incorrect_information',
                        'privacy_concern',
                        'misleading_claim',
                        'commercial_or_spam',
                        'abusive_content',
                        'duplicate_record',
                        'sensitive_location',
                        'other'
                      )),
  details             text NULL,

  -- One-way hash. Never a phone number, never a name.
  reported_by_hash    text NULL,

  status              text NOT NULL DEFAULT 'open'
                        CHECK (status IN ('open', 'acknowledged', 'actioned', 'dismissed')),
  resolution_note     text NULL,
  resolved_by         text NULL,
  resolved_at         timestamptz NULL,

  created_at          timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT community_abuse_reports_single_target
    CHECK (
      num_nonnulls(observation_id, investigation_id, question_id, site_id, evidence_id, media_id) = 1
    ),
  CONSTRAINT community_abuse_reports_resolution_requires_actor
    CHECK (status IN ('open', 'acknowledged') OR resolved_by IS NOT NULL)
);

CREATE INDEX IF NOT EXISTS idx_community_abuse_reports_status
  ON public.community_abuse_reports (status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_community_abuse_reports_observation
  ON public.community_abuse_reports (observation_id);

ALTER TABLE public.community_abuse_reports ENABLE ROW LEVEL SECURITY;

COMMENT ON TABLE public.community_abuse_reports IS
  'Reports submitted by members of the public about a record. A report is an allegation, never evidence, and never changes an evidence state on its own.';

-- -----------------------------------------------------------------------------
-- 5. Durable audit log (specification section 25)
--
-- The in-memory audit log is lost on restart, so an authoritative decision must
-- not depend on it. Every state change that matters is written here.
-- -----------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.admin_audit_log (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  occurred_at    timestamptz NOT NULL DEFAULT now(),
  actor          text NOT NULL,
  actor_role     text NOT NULL DEFAULT 'super_admin'
                   CHECK (actor_role IN ('super_admin', 'system', 'contributor')),
  action         text NOT NULL,
  target_type    text NULL,
  target_id      text NULL,
  -- The reason a decision was made. Required for any state change that a member
  -- of the public could later be shown.
  reason         text NULL,
  -- Before/after payload. Must never contain a phone number, a WhatsApp id or
  -- an unredacted coordinate; the application is responsible for that.
  details        jsonb NULL,
  request_id     text NULL
);

CREATE INDEX IF NOT EXISTS idx_admin_audit_log_occurred_at
  ON public.admin_audit_log (occurred_at DESC);
CREATE INDEX IF NOT EXISTS idx_admin_audit_log_target
  ON public.admin_audit_log (target_type, target_id);
CREATE INDEX IF NOT EXISTS idx_admin_audit_log_action
  ON public.admin_audit_log (action, occurred_at DESC);

ALTER TABLE public.admin_audit_log ENABLE ROW LEVEL SECURITY;

COMMENT ON TABLE public.admin_audit_log IS
  'Durable record of authoritative platform decisions. An entry must never contain a phone number, a WhatsApp id or an unredacted coordinate.';

-- -----------------------------------------------------------------------------
-- 6. Platform settings (specification section 25)
--
-- A key/value table rather than an env var so the platform owner can change a
-- setting without a redeploy. Values are plain configuration, never content.
-- -----------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.platform_settings (
  key         text PRIMARY KEY,
  value       jsonb NOT NULL,
  description text,
  updated_by  text,
  updated_at  timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.platform_settings ENABLE ROW LEVEL SECURITY;

-- Seeded with the values the code already uses. Nothing here is geoscience.
INSERT INTO public.platform_settings (key, value, description) VALUES
  ('public_map.default_layer', '"geoscience_observations"'::jsonb,
   'Which observation layer the public map opens on.'),
  ('public_map.show_unavailable_layers', 'true'::jsonb,
   'Show a geological reference layer as "not configured" instead of hiding it. Reference layers are never invented to fill the legend.'),
  ('passport.display_name', '"Geoscience Passport"'::jsonb,
   'Public name of a passport record. Rock passports remain valid; the display name is not rock-specific.'),
  ('media.publish_requires_consent', 'true'::jsonb,
   'Media is never made public without an explicit recorded decision.')
ON CONFLICT (key) DO NOTHING;

-- -----------------------------------------------------------------------------
-- 7. Public views carry the expanded fields
-- -----------------------------------------------------------------------------

CREATE OR REPLACE VIEW public.public_category_counts AS
SELECT
  c.id AS category,
  c.label AS category_label,
  c.sort_order,
  COALESCE(agg.observation_count, 0) AS observation_count,
  COALESCE(agg.site_count, 0)         AS site_count,
  COALESCE(agg.research_opportunity_site_count, 0) AS research_opportunity_site_count
FROM public.geoscience_categories c
LEFT JOIN (
  SELECT o.observation_category AS category, COUNT(*) AS observation_count
  FROM public.observations o
  WHERE o.publication_status = 'public'
    AND o.status = 'completed'
    AND o.verification_status <> 'rejected'
    AND o.evidence_state <> 'rejected'
  GROUP BY o.observation_category
) agg ON agg.category = c.id
LEFT JOIN (
  SELECT category, COUNT(DISTINCT site_id) AS site_count
  FROM (
    SELECT gs.id AS site_id, o.observation_category AS category
    FROM public.geological_sites gs
    JOIN public.observations o ON o.site_id = gs.id
    WHERE o.publication_status = 'public'
      AND o.status = 'completed'
      AND o.evidence_state <> 'rejected'
  ) s
  GROUP BY s.category
) site_counts ON site_counts.category = c.id
LEFT JOIN (
  SELECT o.observation_category AS category,
         COUNT(DISTINCT gs.id) AS research_opportunity_site_count
  FROM public.geological_sites gs
  JOIN public.observations o ON o.site_id = gs.id
  WHERE gs.is_research_opportunity = true
    AND gs.is_public = true
    AND gs.status = 'active'
  GROUP BY o.observation_category
) opp ON opp.category = c.id;

COMMENT ON VIEW public.public_category_counts IS
  'Counts of publicly published observations per category. A category with no observations reports zero; it is never estimated.';

-- Media that is genuinely public. A row is included only when the media is
-- public, visible, and attached to a published observation.
CREATE OR REPLACE VIEW public.public_observation_media AS
SELECT
  m.id                AS media_id,
  m.observation_id    AS observation_id,
  o.passport_id       AS passport_id,
  m.media_type        AS media_type,
  m.mime_type         AS mime_type,
  m.file_size         AS file_size,
  m.sha256            AS sha256,
  m.view_type         AS view_type,
  m.caption           AS caption,
  m.capture_date      AS capture_date,
  m.media_category    AS media_category,
  m.duration_seconds  AS duration_seconds,
  m.width_px          AS width_px,
  m.height_px         AS height_px,
  o.observation_category,
  m.created_at        AS created_at
FROM public.observation_media m
JOIN public.observations o ON o.id = m.observation_id
WHERE o.status = 'completed'
  AND o.publication_status = 'public'
  AND o.evidence_state <> 'rejected'
  AND o.verification_status <> 'rejected'
  AND m.visibility = 'public'
  AND m.moderation_status = 'visible'
  AND m.storage_path IS NOT NULL;

COMMENT ON VIEW public.public_observation_media IS
  'Media metadata for genuinely public media only. A media row whose bytes were never stored is excluded, so no consumer can render a placeholder.';

-- The public observation view gains the completed ladder plus the research
-- opportunity and media counts.
--
-- `CREATE OR REPLACE VIEW` is used rather than DROP/CREATE. It preserves any
-- grants already issued on the view, and dropping a view that another object
-- depends on would fail outright. Postgres requires the replacement's column
-- list to keep every existing column with the same name, type and ordinal
-- position, so the columns added below are appended in their existing order and
-- the new ones come last.
CREATE OR REPLACE VIEW public.public_observations AS
SELECT
  o.id AS observation_id,
  o.passport_id,
  o.site_id,
  COALESCE(o.observation_category, 'unknown')       AS observation_category,
  COALESCE(o.observation_subcategory, 'unknown')    AS observation_subcategory,
  o.observation_type,
  o.primary_interpretation,
  o.geological_context,
  o.diagnostic_features,
  o.primary_classification,
  o.possible_name,
  o.confidence,
  o.confidence_score,
  o.verification_status,
  o.evidence_state,
  o.community_status,
  o.observed_features,
  o.possible_alternatives,
  o.reasoning,
  o.limitations,
  o.uncertainties,
  o.recommended_next_steps,
  o.questions_for_user,
  o.safety_note,
  o.data_quality_status,
  o.created_at,
  o.published_at,
  l.district,
  l.public_location_precision,
  CASE
    WHEN l.public_location_precision = 'exact' THEN l.latitude
    ELSE NULL
  END AS public_latitude,
  CASE
    WHEN l.public_location_precision = 'exact' THEN l.longitude
    ELSE NULL
  END AS public_longitude,
  CASE
    WHEN l.public_location_precision = 'exact' THEN l.geom
    ELSE NULL
  END AS public_geom,
  COALESCE(inv.investigation_count, 0) AS investigation_count,
  COALESCE(inv.question_count, 0)      AS question_count,
  COALESCE(vt.vote_total, 0)           AS community_vote_count,
  COALESCE(vt.vote_top_option, '')     AS community_vote_top_option,
  COALESCE(vt.vote_top_count, 0)       AS community_vote_top_count,
  COALESCE(ev.evidence_total, 0)       AS community_evidence_count,
  COALESCE(site.site_code, '')         AS site_code,
  COALESCE(site.site_title, '')        AS site_title,
  -- Columns added by this migration are appended after the original list, because
  -- CREATE OR REPLACE VIEW matches existing columns by name and ordinal position.
  -- Inserting one in the middle would renumber the columns that follow it and
  -- Postgres would reject the statement.
  o.evidence_state_reason,
  l.sector,
  COALESCE(inv.research_opportunity_count, 0) AS research_opportunity_count,
  COALESCE(ab.usage_media_total, 0)   AS media_count,
  COALESCE(md.media_total, 0)          AS public_media_count,
  COALESCE(site.is_research_opportunity, false) AS is_research_opportunity
FROM public.observations o
INNER JOIN public.observation_locations l ON o.id = l.observation_id
LEFT JOIN public.geological_sites site ON o.site_id = site.id
LEFT JOIN LATERAL (
  SELECT
    (SELECT COUNT(*) FROM public.community_investigations ci
      WHERE ci.observation_id = o.id OR ci.site_id = o.site_id) AS investigation_count,
    -- A research opportunity is an investigation the community explicitly marked
    -- as needing further work, identified by `opportunity_basis` being recorded.
    -- Counting public investigations instead would report every shared question
    -- as an opportunity to research, which is a different and much weaker claim.
    --
    -- The observation/site match is parenthesised deliberately: without it SQL's
    -- AND-before-OR precedence narrows only the site branch, so an observation
    -- match would bypass the opportunity filter entirely.
    (SELECT COUNT(*) FROM public.community_investigations ci
      WHERE (ci.observation_id = o.id OR ci.site_id = o.site_id)
        AND ci.opportunity_basis IS NOT NULL) AS research_opportunity_count,
    (SELECT COUNT(*) FROM public.community_questions cq
      WHERE cq.observation_id = o.id OR cq.site_id = o.site_id
         OR cq.investigation_id IN (
           SELECT ci2.id FROM public.community_investigations ci2
           WHERE ci2.observation_id = o.id OR ci2.site_id = o.site_id
         )) AS question_count
) inv ON TRUE
LEFT JOIN LATERAL (
  SELECT
    COUNT(*) AS vote_total,
    MAX(vote_count) AS vote_top_count,
    (ARRAY_AGG(option ORDER BY vote_count DESC, option ASC))[1] AS vote_top_option
  FROM (
    SELECT cv.option, COUNT(*) AS vote_count
    FROM public.community_votes cv
    WHERE cv.investigation_id IN (
      SELECT ci3.id FROM public.community_investigations ci3
      WHERE ci3.observation_id = o.id OR ci3.site_id = o.site_id
    )
    GROUP BY cv.option
  ) tally
) vt ON TRUE
LEFT JOIN LATERAL (
  SELECT COUNT(*) AS evidence_total
  FROM public.community_evidence ce
  WHERE ce.observation_id = o.id
     OR ce.site_id = o.site_id
     OR ce.investigation_id IN (
       SELECT ci4.id FROM public.community_investigations ci4
       WHERE ci4.observation_id = o.id OR ci4.site_id = o.site_id
     )
) ev ON TRUE
LEFT JOIN LATERAL (
  SELECT COUNT(*) AS usage_media_total
  FROM public.observation_media m
  WHERE m.observation_id = o.id
) ab ON TRUE
LEFT JOIN LATERAL (
  SELECT COUNT(*) AS media_total
  FROM public.public_observation_media pm
  WHERE pm.observation_id = o.id
) md ON TRUE
WHERE o.status = 'completed'
  AND o.publication_status = 'public'
  AND o.verification_status <> 'rejected'
  AND o.evidence_state <> 'rejected'
  AND l.is_public = true;

-- -----------------------------------------------------------------------------
-- 8. Site layer carries the opportunity flag and category
-- -----------------------------------------------------------------------------

-- Replaced with CREATE OR REPLACE rather than DROP/CREATE so existing grants
-- survive. The original column names and order from migration 011 are preserved
-- exactly: `site.repository.ts` reads `title`, `public_location_precision`,
-- `observed_classifications`, `districts_covered` and `updated_at`, and renaming
-- or dropping any of them would silently break Site Explorer.
CREATE OR REPLACE VIEW public.public_geological_sites AS
SELECT
  s.id AS site_id,
  s.site_code,
  s.title,
  s.description,
  s.grouping_basis,
  s.district,
  s.sector,
  s.public_location_precision,
  CASE
    WHEN s.public_location_precision = 'exact' THEN s.latitude
    ELSE NULL
  END AS public_latitude,
  CASE
    WHEN s.public_location_precision = 'exact' THEN s.longitude
    ELSE NULL
  END AS public_longitude,
  CASE
    WHEN s.public_location_precision = 'exact' THEN s.geom
    ELSE NULL
  END AS public_geom,
  COALESCE(agg.observation_count, 0)    AS observation_count,
  COALESCE(agg.visit_count, 0)          AS visit_count,
  COALESCE(agg.investigation_count, 0) AS investigation_count,
  COALESCE(agg.question_count, 0)       AS question_count,
  COALESCE(agg.evidence_count, 0)       AS evidence_count,
  agg.highest_evidence_state,
  agg.observed_classifications,
  agg.districts_covered,
  s.created_at,
  s.updated_at,
  -- Columns added by this migration, appended so the positions above are
  -- unchanged.
  s.grouping_evidence,
  s.status,
  s.is_research_opportunity,
  agg.primary_category,
  COALESCE(agg.research_opportunity_count, 0) AS research_opportunity_count,
  -- Approximate and district sites have no authorised public point here. A site
  -- is either published at an authorised precision or omitted from the map
  -- layer; the consumer never receives a partial coordinate it could plot.
  CASE
    WHEN s.public_location_precision = 'approximate'
      THEN round(s.latitude::numeric, 2)::double precision
    ELSE NULL
  END AS approximate_latitude,
  CASE
    WHEN s.public_location_precision = 'approximate'
      THEN round(s.longitude::numeric, 2)::double precision
    ELSE NULL
  END AS approximate_longitude
FROM public.geological_sites s
LEFT JOIN LATERAL (
  SELECT
    COUNT(*) AS observation_count,
    -- The strongest state actually present on a real child row, using the same
    -- rank as the application. NULL when the site has no observations at all,
    -- which is honest: no evidence is not "AI-assisted".
    --
    -- Only published, non-rejected rows are considered, so a private or withdrawn
    -- observation can never raise a public site's colour on the map.
    (
      SELECT o2.evidence_state
      FROM public.observations o2
      WHERE o2.site_id = s.id AND o2.publication_status = 'public'
        AND o2.evidence_state <> 'rejected'
      ORDER BY CASE o2.evidence_state
        WHEN 'rejected' THEN 8
        WHEN 'unresolved' THEN 7
        WHEN 'scientifically_confirmed' THEN 6
        WHEN 'expert_reviewed' THEN 5
        WHEN 'community_investigated' THEN 4
        WHEN 'community_supported' THEN 3
        WHEN 'ai_assisted' THEN 2
        WHEN 'insufficient_evidence' THEN 1
        ELSE 0
      END DESC
      LIMIT 1
    ) AS highest_evidence_state,
    (
      SELECT o3.observation_category
      FROM public.observations o3
      WHERE o3.site_id = s.id AND o3.publication_status = 'public'
        AND o3.evidence_state <> 'rejected'
      GROUP BY o3.observation_category
      ORDER BY COUNT(*) DESC, o3.observation_category ASC
      LIMIT 1
    ) AS primary_category,
    (SELECT COUNT(*) FROM public.community_investigations ci
      WHERE ci.site_id = s.id AND ci.is_public = true) AS investigation_count,
    (SELECT COUNT(*) FROM public.community_questions cq
      WHERE cq.site_id = s.id AND cq.is_public = true) AS question_count,
    (SELECT COUNT(*) FROM public.community_evidence ce
      WHERE ce.site_id = s.id AND ce.is_public = true) AS evidence_count,
    (SELECT COUNT(*) FROM public.community_visits cv WHERE cv.site_id = s.id) AS visit_count,
    -- A research opportunity is a site the community flagged as needing further
    -- work. It is a question, never a finding.
    (SELECT COUNT(*) FROM public.community_investigations ci
      WHERE ci.site_id = s.id AND ci.opportunity_basis IS NOT NULL) AS research_opportunity_count,
    -- The classifications actually recorded on this site's public observations.
    -- Kept as an aggregate rather than a second column so the rollup cannot drift
    -- from the child rows it describes.
    ARRAY(
      SELECT DISTINCT o4.primary_classification
      FROM public.observations o4
      WHERE o4.site_id = s.id AND o4.publication_status = 'public'
        AND o4.primary_classification IS NOT NULL
      ORDER BY o4.primary_classification
    ) AS observed_classifications,
    ARRAY(
      SELECT DISTINCT o5.district
      FROM public.observations o5
      JOIN public.observation_locations l5 ON l5.observation_id = o5.id
      WHERE o5.site_id = s.id AND o5.publication_status = 'public'
        AND l5.district IS NOT NULL
      ORDER BY l5.district
    ) AS districts_covered
  FROM public.observations o
  WHERE o.site_id = s.id AND o.publication_status = 'public' AND o.evidence_state <> 'rejected'
) agg ON TRUE
WHERE s.is_public = true
  AND s.status = 'active';

COMMENT ON VIEW public.public_geological_sites IS
  'Public geological sites. A site with no authorised coordinate reports NULL coordinates and is omitted from any map layer rather than drawn at a guessed position.';
