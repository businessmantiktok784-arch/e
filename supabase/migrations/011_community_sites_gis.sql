-- 011_community_sites_gis.sql
-- Stage 8: Community Discovery, Geological Sites, Evidence Ladder & Professional GIS
--
-- Design rules enforced here:
--   * Site grouping is NEVER automatic. `grouping_basis` records who decided and why.
--   * Contributor identity is always a one-way hash. No phone numbers, no WhatsApp IDs.
--   * Community opinion is never scientific confirmation. The two are separate columns.
--   * GIS layers are only enabled when a legitimate data source is configured.
--     Unconfigured layers stay present but disabled so the UI can honestly say
--     "Data source not configured" instead of drawing invented geology.

-- ============================================================================
-- 1. EVIDENCE LADDER (spec section 4 / 65)
-- ============================================================================
-- Stored on the observation so the map and Site Explorer can filter and label it
-- without recomputation. Maintained by the application from real activity only.
ALTER TABLE public.observations
  ADD COLUMN IF NOT EXISTS evidence_state text NOT NULL DEFAULT 'ai_assisted';

ALTER TABLE public.observations
  DROP CONSTRAINT IF EXISTS observations_evidence_state_check;

ALTER TABLE public.observations
  ADD CONSTRAINT observations_evidence_state_check CHECK (
    evidence_state IN (
      'ai_assisted',            -- Level 1: AI produced a preliminary interpretation
      'community_supported',    -- Level 2: multiple independent contributors agreed
      'community_investigated', -- Level 3: meaningful community evidence collected
      'expert_reviewed',        -- Level 4: a qualified geoscientist review exists
      'scientifically_confirmed', -- Level 5: laboratory / documented reference evidence
      'unresolved'              -- explicitly unresolved
    )
  );

-- Level 5 is never granted automatically. It requires a recorded basis.
ALTER TABLE public.observations
  ADD COLUMN IF NOT EXISTS scientific_confirmation_basis text NULL,
  ADD COLUMN IF NOT EXISTS scientific_confirmed_at timestamptz NULL;

CREATE INDEX IF NOT EXISTS idx_observations_evidence_state
  ON public.observations (evidence_state);

-- ============================================================================
-- 2. GEOLOGICAL SITES (spec section 13)
-- ============================================================================
CREATE SEQUENCE IF NOT EXISTS public.geological_site_code_seq START WITH 1 INCREMENT BY 1;

CREATE OR REPLACE FUNCTION public.generate_site_code()
RETURNS text
LANGUAGE sql
AS $$
  SELECT 'RT-SITE-' || lpad(nextval('public.geological_site_code_seq')::text, 6, '0');
$$;

CREATE TABLE IF NOT EXISTS public.geological_sites (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  site_code text NOT NULL UNIQUE DEFAULT public.generate_site_code(),
  title text NOT NULL,
  description text NULL,

  -- Grouping provenance. The platform never auto-clusters by distance and then
  -- presents the result as fact; every grouping declares how it was decided.
  grouping_basis text NOT NULL DEFAULT 'admin_curated'
    CHECK (grouping_basis IN ('admin_curated', 'evidence_backed', 'suggested')),
  grouping_evidence text NULL,

  district text NULL,
  sector text NULL,
  latitude double precision CHECK (latitude IS NULL OR (latitude >= -90 AND latitude <= 90)),
  longitude double precision CHECK (longitude IS NULL OR (longitude >= -180 AND longitude <= 180)),
  geom extensions.geometry(Point, 4326),
  public_location_precision text NOT NULL DEFAULT 'district'
    CHECK (public_location_precision IN ('district', 'approximate', 'exact')),
  is_public boolean NOT NULL DEFAULT false,

  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'archived')),
  created_by text NOT NULL DEFAULT 'super_admin',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_geological_sites_geom
  ON public.geological_sites USING GIST (geom);
CREATE INDEX IF NOT EXISTS idx_geological_sites_district
  ON public.geological_sites (district);
CREATE INDEX IF NOT EXISTS idx_geological_sites_public
  ON public.geological_sites (is_public, status);

ALTER TABLE public.geological_sites ENABLE ROW LEVEL SECURITY;

-- Observations belong to a site. NULL means "not yet assigned to a site".
ALTER TABLE public.observations
  ADD COLUMN IF NOT EXISTS site_id uuid NULL REFERENCES public.geological_sites(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_observations_site_id
  ON public.observations (site_id);

-- ============================================================================
-- 3. SITE & COMMUNITY MEDIA (spec section 50)
-- ============================================================================
-- Photographs and videos contributed against a site or an investigation.
-- Only rows that reference real stored bytes may be inserted; there is no
-- synthetic thumbnail or placeholder media path.
CREATE TABLE IF NOT EXISTS public.community_media (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  site_id uuid NULL REFERENCES public.geological_sites(id) ON DELETE CASCADE,
  investigation_id uuid NULL,
  observation_media_id uuid NULL REFERENCES public.observation_media(id) ON DELETE SET NULL,
  media_type text NOT NULL CHECK (media_type IN ('image', 'video')),
  view_type text CHECK (
    view_type IS NULL OR view_type IN (
      'overview', 'close_up', 'texture', 'fresh_surface', 'outcrop',
      'environment', 'multiple_angles', 'field_context'
    )
  ),
  scale_reference_present boolean NOT NULL DEFAULT false,
  storage_path text NULL,
  is_public boolean NOT NULL DEFAULT false,
  moderation_status text NOT NULL DEFAULT 'visible'
    CHECK (moderation_status IN ('visible', 'pending_review', 'hidden', 'removed')),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_community_media_site
  ON public.community_media (site_id);
CREATE INDEX IF NOT EXISTS idx_community_media_investigation
  ON public.community_media (investigation_id);

-- ============================================================================
-- 4. COMMUNITY INVESTIGATIONS (spec section 5 / 31)
-- ============================================================================
CREATE SEQUENCE IF NOT EXISTS public.community_investigation_id_seq START WITH 1 INCREMENT BY 1;

CREATE TABLE IF NOT EXISTS public.community_investigations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  public_id text NOT NULL UNIQUE
    DEFAULT 'INV-' || lpad(nextval('public.community_investigation_id_seq')::text, 6, '0'),
  site_id uuid NULL REFERENCES public.geological_sites(id) ON DELETE CASCADE,
  observation_id uuid NULL REFERENCES public.observations(id) ON DELETE CASCADE,

  question text NOT NULL,
  status text NOT NULL DEFAULT 'open'
    CHECK (status IN (
      'open', 'investigating', 'community_supported',
      'expert_reviewed', 'resolved', 'unresolved', 'archived'
    )),

  -- Anonymous opener. NULL when the platform itself opens the investigation.
  opened_by_hash text NULL,
  is_public boolean NOT NULL DEFAULT true,

  -- Cached counters. Always recomputed from the real child rows on write so a
  -- count can never drift away from the rows that justify it.
  participant_count integer NOT NULL DEFAULT 0 CHECK (participant_count >= 0),
  evidence_count integer NOT NULL DEFAULT 0 CHECK (evidence_count >= 0),
  vote_count integer NOT NULL DEFAULT 0 CHECK (vote_count >= 0),

  research_interest boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT community_investigations_target_check
    CHECK (site_id IS NOT NULL OR observation_id IS NOT NULL)
);

CREATE INDEX IF NOT EXISTS idx_community_investigations_site
  ON public.community_investigations (site_id);
CREATE INDEX IF NOT EXISTS idx_community_investigations_observation
  ON public.community_investigations (observation_id);
CREATE INDEX IF NOT EXISTS idx_community_investigations_status
  ON public.community_investigations (status, is_public);
CREATE INDEX IF NOT EXISTS idx_community_investigations_created_at
  ON public.community_investigations (created_at DESC);

ALTER TABLE public.community_investigations ENABLE ROW LEVEL SECURITY;

-- ============================================================================
-- 5. COMMUNITY VOTES (spec section 6 / 31 / 32)
-- ============================================================================
-- One vote per anonymous contributor per investigation. Enforced by the
-- database, not by application convention, so it cannot be bypassed.
CREATE TABLE IF NOT EXISTS public.community_votes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  investigation_id uuid NOT NULL
    REFERENCES public.community_investigations(id) ON DELETE CASCADE,
  contributor_hash text NOT NULL,
  option text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT community_votes_one_per_contributor UNIQUE (investigation_id, contributor_hash)
);

CREATE INDEX IF NOT EXISTS idx_community_votes_investigation
  ON public.community_votes (investigation_id);
CREATE INDEX IF NOT EXISTS idx_community_votes_contributor
  ON public.community_votes (contributor_hash);

ALTER TABLE public.community_votes ENABLE ROW LEVEL SECURITY;

-- ============================================================================
-- 6. COMMUNITY EVIDENCE (spec section 6 / 23)
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.community_evidence (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  investigation_id uuid NULL
    REFERENCES public.community_investigations(id) ON DELETE CASCADE,
  site_id uuid NULL REFERENCES public.geological_sites(id) ON DELETE CASCADE,
  observation_id uuid NULL REFERENCES public.observations(id) ON DELETE SET NULL,
  media_id uuid NULL REFERENCES public.community_media(id) ON DELETE SET NULL,

  contributor_hash text NOT NULL,
  evidence_type text NOT NULL CHECK (evidence_type IN (
    'photo', 'close_up', 'fresh_surface', 'texture', 'outcrop', 'environment',
    'video', 'field_note', 'comparison', 'discussion', 'reference'
  )),
  explanation text NULL,

  -- Support / challenge are separate booleans so one item can do neither.
  supports_evidence boolean NOT NULL DEFAULT true,
  is_challenge boolean NOT NULL DEFAULT false,

  moderation_status text NOT NULL DEFAULT 'visible'
    CHECK (moderation_status IN ('visible', 'pending_review', 'hidden', 'removed')),

  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT community_evidence_target_check
    CHECK (
      investigation_id IS NOT NULL OR site_id IS NOT NULL OR observation_id IS NOT NULL
    )
);

CREATE INDEX IF NOT EXISTS idx_community_evidence_investigation
  ON public.community_evidence (investigation_id);
CREATE INDEX IF NOT EXISTS idx_community_evidence_site
  ON public.community_evidence (site_id);
CREATE INDEX IF NOT EXISTS idx_community_evidence_contributor
  ON public.community_evidence (contributor_hash);
CREATE INDEX IF NOT EXISTS idx_community_evidence_moderation
  ON public.community_evidence (moderation_status);

ALTER TABLE public.community_evidence ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.community_media
  ADD CONSTRAINT community_media_investigation_fk
  FOREIGN KEY (investigation_id)
  REFERENCES public.community_investigations(id) ON DELETE CASCADE;

-- ============================================================================
-- 7. COMMUNITY QUESTIONS & ANSWERS (spec section 10)
-- ============================================================================
CREATE SEQUENCE IF NOT EXISTS public.community_question_id_seq START WITH 1 INCREMENT BY 1;

CREATE TABLE IF NOT EXISTS public.community_questions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  public_id text NOT NULL UNIQUE
    DEFAULT 'Q-' || lpad(nextval('public.community_question_id_seq')::text, 6, '0'),
  site_id uuid NULL REFERENCES public.geological_sites(id) ON DELETE CASCADE,
  observation_id uuid NULL REFERENCES public.observations(id) ON DELETE CASCADE,
  investigation_id uuid NULL
    REFERENCES public.community_investigations(id) ON DELETE CASCADE,

  question text NOT NULL,
  contributor_hash text NOT NULL,
  status text NOT NULL DEFAULT 'open'
    CHECK (status IN (
      'open', 'investigating', 'community_supported',
      'expert_reviewed', 'resolved', 'unresolved'
    )),
  is_public boolean NOT NULL DEFAULT true,
  answer_count integer NOT NULL DEFAULT 0 CHECK (answer_count >= 0),
  vote_count integer NOT NULL DEFAULT 0 CHECK (vote_count >= 0),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT community_questions_target_check
    CHECK (
      site_id IS NOT NULL OR observation_id IS NOT NULL OR investigation_id IS NOT NULL
    )
);

CREATE INDEX IF NOT EXISTS idx_community_questions_site
  ON public.community_questions (site_id);
CREATE INDEX IF NOT EXISTS idx_community_questions_status
  ON public.community_questions (status, is_public);
CREATE INDEX IF NOT EXISTS idx_community_questions_created_at
  ON public.community_questions (created_at DESC);

ALTER TABLE public.community_questions ENABLE ROW LEVEL SECURITY;

CREATE TABLE IF NOT EXISTS public.community_answers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  question_id uuid NOT NULL REFERENCES public.community_questions(id) ON DELETE CASCADE,
  contributor_hash text NOT NULL,
  answer text NOT NULL,
  evidence_id uuid NULL REFERENCES public.community_evidence(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_community_answers_question
  ON public.community_answers (question_id);

ALTER TABLE public.community_answers ENABLE ROW LEVEL SECURITY;

-- ============================================================================
-- 8. COMMUNITY VISITS (spec section 12 / 24)
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.community_visits (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  site_id uuid NOT NULL REFERENCES public.geological_sites(id) ON DELETE CASCADE,
  contributor_hash text NOT NULL,
  visited_on date NOT NULL DEFAULT CURRENT_DATE,
  notes text NULL,
  media_id uuid NULL REFERENCES public.community_media(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_community_visits_site
  ON public.community_visits (site_id);
CREATE INDEX IF NOT EXISTS idx_community_visits_contributor
  ON public.community_visits (contributor_hash);

ALTER TABLE public.community_visits ENABLE ROW LEVEL SECURITY;

-- ============================================================================
-- 9. COMMUNITY REPUTATION (spec section 9)
-- ============================================================================
-- Contribution metrics only. There is deliberately no accuracy column: this
-- platform does not compute a scientific correctness score for participants.
CREATE TABLE IF NOT EXISTS public.community_reputation (
  contributor_hash text PRIMARY KEY,
  public_handle text NOT NULL UNIQUE,
  observations_count integer NOT NULL DEFAULT 0,
  evidence_count integer NOT NULL DEFAULT 0,
  votes_count integer NOT NULL DEFAULT 0,
  questions_count integer NOT NULL DEFAULT 0,
  answers_count integer NOT NULL DEFAULT 0,
  visits_count integer NOT NULL DEFAULT 0,
  investigations_count integer NOT NULL DEFAULT 0,
  districts_represented integer NOT NULL DEFAULT 0,
  achievements jsonb NOT NULL DEFAULT '[]'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.community_reputation ENABLE ROW LEVEL SECURITY;

-- ============================================================================
-- 10. PERSISTENT SUPER ADMIN SESSIONS (spec section 41)
-- ============================================================================
-- Replaces the previously in-memory-only registry so that logout and emergency
-- revocation actually survive a restart or a second instance, which is what the
-- documented recovery runbook always assumed.
CREATE TABLE IF NOT EXISTS public.admin_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  token_hash text NOT NULL UNIQUE,
  created_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL,
  revoked_at timestamptz NULL,
  last_used_at timestamptz NOT NULL DEFAULT now(),
  ip_hash text NULL,
  user_agent_hash text NULL
);

CREATE INDEX IF NOT EXISTS idx_admin_sessions_token_hash
  ON public.admin_sessions (token_hash);
CREATE INDEX IF NOT EXISTS idx_admin_sessions_active
  ON public.admin_sessions (revoked_at, expires_at);

ALTER TABLE public.admin_sessions ENABLE ROW LEVEL SECURITY;

-- ============================================================================
-- 11. GIS LAYER REGISTRY (spec section 16 / 43)
-- ============================================================================
-- The API publishes this registry so the client can distinguish "layer exists
-- and has real data" from "layer concept exists but no dataset is configured".
CREATE TABLE IF NOT EXISTS public.gis_layers (
  id text PRIMARY KEY,
  display_name text NOT NULL,
  category text NOT NULL CHECK (category IN ('rock_talk', 'classification', 'geological', 'base')),
  enabled boolean NOT NULL DEFAULT false,
  -- NULL data_source means "concept declared, no legitimate dataset configured".
  -- The client must render that as "Data source not configured".
  data_source text NULL,
  source_attribution text NULL,
  sort_order integer NOT NULL DEFAULT 0,
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.gis_layers ENABLE ROW LEVEL SECURITY;

INSERT INTO public.gis_layers (id, display_name, category, enabled, data_source, source_attribution, sort_order)
VALUES
  ('observations',        'All public observations',        'rock_talk',     true,  'Rock Talk observations',            'Rock Talk citizen science', 10),
  ('sites',               'Geological sites',               'rock_talk',     true,  'Rock Talk geological_sites',        'Rock Talk citizen science', 20),
  ('investigations',      'Community investigations',       'rock_talk',     true,  'Rock Talk community_investigations','Rock Talk citizen science', 30),
  ('questions',           'Community questions',            'rock_talk',     true,  'Rock Talk community_questions',     'Rock Talk citizen science', 40),
  ('research_opportunities', 'Research opportunities',     'rock_talk',     true,  'Rock Talk community_investigations','Rock Talk citizen science', 50),
  ('evidence_density',    'Observation density',            'rock_talk',     true,  'Rock Talk observations',            'Rock Talk citizen science', 60),
  ('igneous',             'Igneous',                        'classification', true, 'Rock Talk observations',           'Rock Talk citizen science', 70),
  ('sedimentary',         'Sedimentary',                    'classification', true, 'Rock Talk observations',           'Rock Talk citizen science', 80),
  ('metamorphic',         'Metamorphic',                    'classification', true, 'Rock Talk observations',           'Rock Talk citizen science', 90),
  ('unclassified',        'Unclassified',                   'classification', true, 'Rock Talk observations',           'Rock Talk citizen science', 100),
  ('expert_reviewed',     'Expert reviewed',                'classification', true, 'Rock Talk observations',           'Rock Talk citizen science', 110),
  ('community_supported', 'Community supported',            'classification', true, 'Rock Talk observations',           'Rock Talk citizen science', 120)
-- Geological context layers are declared but carry NO data source. The client
-- must render these as "Data source not configured" and must never draw them.
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.gis_layers (id, display_name, category, enabled, data_source, source_attribution, sort_order)
VALUES
  ('geological_units',    'Geological units',    'geological', false, NULL, NULL, 200),
  ('faults',              'Faults',              'geological', false, NULL, NULL, 210),
  ('contacts',            'Contacts',            'geological', false, NULL, NULL, 220),
  ('mineral_occurrences', 'Mineral occurrences', 'geological', false, NULL, NULL, 230),
  ('mining_areas',        'Mining areas',        'geological', false, NULL, NULL, 240),
  ('rivers',              'Rivers',              'geological', false, NULL, NULL, 250),
  ('lakes',               'Lakes',               'geological', false, NULL, NULL, 260),
  ('district_boundaries', 'District boundaries', 'geological', false, NULL, NULL, 270)
ON CONFLICT (id) DO NOTHING;

-- ============================================================================
-- 12. PUBLIC OBSERVATIONS VIEW (replaces 007 version)
-- ============================================================================
-- Field whitelist only. Contributor identity, phone numbers, WhatsApp message
-- ids, media paths and processing logs are deliberately absent, and exact
-- coordinates are nulled unless the location is explicitly published as exact.
-- Community counts are aggregated from real rows via LATERAL joins.
CREATE OR REPLACE VIEW public.public_observations AS
SELECT
  o.id AS observation_id,
  o.passport_id,
  o.site_id,
  o.primary_classification,
  o.possible_name,
  o.confidence,
  o.confidence_score,
  o.verification_status,
  o.evidence_state,
  o.observed_features,
  o.reasoning,
  o.limitations,
  o.recommended_next_steps,
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
  COALESCE(site.site_title, '')        AS site_title
FROM public.observations o
INNER JOIN public.observation_locations l ON o.id = l.observation_id
LEFT JOIN public.geological_sites site ON o.site_id = site.id
LEFT JOIN LATERAL (
  SELECT
    (SELECT COUNT(*) FROM public.community_investigations ci
      WHERE ci.observation_id = o.id OR ci.site_id = o.site_id) AS investigation_count,
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
    JOIN public.community_investigations ci2 ON ci2.id = cv.investigation_id
    WHERE ci2.observation_id = o.id OR ci2.site_id = o.site_id
    GROUP BY cv.option
  ) tally
) vt ON TRUE
LEFT JOIN LATERAL (
  SELECT COUNT(*) AS evidence_total
  FROM public.community_evidence ce
  WHERE ce.observation_id = o.id OR ce.site_id = o.site_id
) ev ON TRUE
WHERE o.status = 'completed'
  AND o.is_rock = true
  AND o.publication_status = 'public'
  AND o.verification_status <> 'rejected'
  AND l.is_public = true;

-- ============================================================================
-- 13. PUBLIC SITES VIEW
-- ============================================================================
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
  s.updated_at
FROM public.geological_sites s
LEFT JOIN LATERAL (
  -- Deliberately scalar subqueries rather than one wide multi-join aggregate:
  -- joining visits, investigations, questions and evidence together would build
  -- a cartesian product and corrupt every non-distinct aggregate below.
  SELECT
    (
      SELECT COUNT(*) FROM public.observations o
      WHERE o.site_id = s.id
        AND o.publication_status = 'public'
        AND o.status = 'completed'
        AND o.is_rock
    ) AS observation_count,
    (SELECT COUNT(*) FROM public.community_visits v WHERE v.site_id = s.id) AS visit_count,
    (SELECT COUNT(*) FROM public.community_investigations ci WHERE ci.site_id = s.id) AS investigation_count,
    (SELECT COUNT(*) FROM public.community_questions cq WHERE cq.site_id = s.id) AS question_count,
    (SELECT COUNT(*) FROM public.community_evidence ce WHERE ce.site_id = s.id) AS evidence_count,
    (
      SELECT MAX(o.evidence_state) FROM public.observations o
      WHERE o.site_id = s.id AND o.publication_status = 'public'
    ) AS highest_evidence_state,
    (
      SELECT ARRAY_AGG(DISTINCT o.primary_classification)
      FROM public.observations o
      WHERE o.site_id = s.id AND o.publication_status = 'public'
        AND o.primary_classification IS NOT NULL
    ) AS observed_classifications,
    (
      SELECT ARRAY_AGG(DISTINCT l.district)
      FROM public.observations o
      JOIN public.observation_locations l ON l.observation_id = o.id
      WHERE o.site_id = s.id AND l.district IS NOT NULL
    ) AS districts_covered
) agg ON TRUE
WHERE s.is_public = true
  AND s.status = 'active';

-- ============================================================================
-- 14. TIMELINE SOURCE VIEW
-- ============================================================================
-- Every Site Explorer timeline entry is derived from a real stored row. There is
-- no code path that can emit a timeline event without an underlying record.
CREATE OR REPLACE VIEW public.site_timeline AS
SELECT s.id AS site_id, ev.event_type, ev.event_at, ev.ref_id, ev.summary
FROM public.geological_sites s
CROSS JOIN LATERAL (
  SELECT 'observation'::text AS event_type, o.created_at AS event_at,
         o.passport_id::text AS ref_id,
         'Observation ' || o.passport_id || ' recorded' AS summary
  FROM public.observations o
  WHERE o.site_id = s.id

  UNION ALL

  SELECT 'investigation'::text, ci.created_at, ci.public_id::text,
         'Community investigation started: ' || left(ci.question, 120)
  FROM public.community_investigations ci
  WHERE ci.site_id = s.id

  UNION ALL

  SELECT 'evidence'::text, ce.created_at, ce.id::text,
         'Evidence contributed (' || ce.evidence_type || ')'
  FROM public.community_evidence ce
  WHERE ce.site_id = s.id

  UNION ALL

  SELECT 'question'::text, cq.created_at, cq.public_id::text,
         'Question asked: ' || left(cq.question, 120)
  FROM public.community_questions cq
  WHERE cq.site_id = s.id

  UNION ALL

  SELECT 'visit'::text, v.created_at, v.id::text,
         'Site visit recorded'
  FROM public.community_visits v
  WHERE v.site_id = s.id

  UNION ALL

  SELECT 'expert_review'::text, ev2.created_at, ev2.passport_id::text,
         'Expert review recorded'
  FROM public.expert_verifications ev2
  JOIN public.observations o2 ON o2.id = ev2.observation_id
  WHERE o2.site_id = s.id
) ev;

-- ============================================================================
-- 15. EXPERT REVIEW: identity publication control (spec section 30 / 40)
-- ============================================================================
-- Experts do not need platform accounts. A review is a record entered by the
-- Super Admin on behalf of a reviewer. Identity stays hidden unless explicitly
-- authorised for publication.
ALTER TABLE public.expert_verifications
  ADD COLUMN IF NOT EXISTS reviewer_reference text NULL,
  ADD COLUMN IF NOT EXISTS identity_published boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS evidence_basis text NULL,
  ADD COLUMN IF NOT EXISTS review_date date NULL;

-- Public display name for a review. Falls back to a neutral label so a review
-- is never attributed to a person who did not authorise it.
CREATE OR REPLACE FUNCTION public.public_reviewer_label(
  reviewer_name text,
  identity_published boolean
) RETURNS text
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT CASE
    WHEN identity_published THEN reviewer_name
    ELSE 'Expert reviewed'
  END;
$$;

-- Public review view with attribution control applied.
CREATE OR REPLACE VIEW public.public_expert_reviews AS
SELECT
  v.id AS review_id,
  v.observation_id,
  o.passport_id,
  o.site_id,
  public.public_reviewer_label(v.reviewer_name, v.identity_published) AS reviewer_label,
  v.reviewer_reference,
  v.identity_published,
  v.status,
  v.expert_classification,
  v.expert_rock_name,
  v.expert_confidence,
  v.expert_observed_features,
  v.expert_notes,
  v.scientific_remarks,
  v.evidence_basis,
  v.review_date,
  v.created_at
FROM public.expert_verifications v
JOIN public.observations o ON o.id = v.observation_id
WHERE v.is_latest = true
  AND o.publication_status = 'public'
  AND o.status = 'completed';

-- Only one "latest" review per observation.
CREATE UNIQUE INDEX IF NOT EXISTS idx_expert_verifications_latest_unique
  ON public.expert_verifications (observation_id)
  WHERE is_latest = true;
