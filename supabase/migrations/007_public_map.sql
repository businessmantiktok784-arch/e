-- 007_public_map.sql
-- Stage 4: Public Rwanda Geological Observation Map

-- 1. Add public_location_precision to observation_locations
ALTER TABLE public.observation_locations
  ADD COLUMN IF NOT EXISTS public_location_precision text NOT NULL DEFAULT 'district'
  CHECK (public_location_precision IN ('district', 'approximate', 'exact'));

-- 2. Add published_at and public_visibility_reason to observations
ALTER TABLE public.observations
  ADD COLUMN IF NOT EXISTS published_at timestamptz NULL,
  ADD COLUMN IF NOT EXISTS public_visibility_reason text NULL
  CHECK (public_visibility_reason IN ('user_consent', 'admin_approved', 'research_demo'));

-- 3. Additional indexes for public query performance
CREATE INDEX IF NOT EXISTS idx_observations_public_filter
  ON public.observations (publication_status, status, is_rock, verification_status);

CREATE INDEX IF NOT EXISTS idx_observations_published_at
  ON public.observations (published_at DESC);

CREATE INDEX IF NOT EXISTS idx_observation_locations_is_public
  ON public.observation_locations (is_public);

CREATE INDEX IF NOT EXISTS idx_observation_locations_district
  ON public.observation_locations (district);

-- 4. Create safe public database view with whitelisted fields only
CREATE OR REPLACE VIEW public.public_observations AS
SELECT
  o.passport_id,
  o.primary_classification,
  o.possible_name,
  o.confidence,
  o.confidence_score,
  o.verification_status,
  o.observed_features,
  o.limitations,
  o.recommended_next_steps,
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
  END AS public_geom
FROM public.observations o
INNER JOIN public.observation_locations l ON o.id = l.observation_id
WHERE o.status = 'completed'
  AND o.is_rock = true
  AND o.publication_status = 'public'
  AND o.verification_status != 'rejected'
  AND l.is_public = true;
