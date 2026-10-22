-- =============================================================================
-- 012 — Geoscience taxonomy expansion
--
-- Rock Talk stops being rock-only: an observation is first classified into a
-- geoscience category and subcategory, and only then interpreted.
--
-- Compatibility rules for this migration:
--
--   * No existing column is dropped, renamed or re-typed.
--   * `primary_classification`, `possible_name`, `confidence`,
--     `confidence_score`, `observed_features`, `reasoning`, `limitations` and
--     `recommended_next_steps` keep their meaning and their data.
--   * The new columns are nullable or defaulted, so existing Rock Talk rows are
--     valid without a backfill and read as `rock` once backfilled.
--   * No observation is invented, altered or deleted by this file.
--
-- Nothing in this file is geological reference data. The taxonomy tables below
-- describe Rock Talk's own vocabulary, not the geology of Rwanda.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. Taxonomy tables (Rock Talk vocabulary, not geoscience datasets)
-- -----------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.geoscience_categories (
  id                  text PRIMARY KEY,
  label               text NOT NULL,
  description         text,
  -- True when the category's records keep a rock interpretation in the existing
  -- rock analysis fields. Everything else leaves those fields honestly empty.
  rock_interpretation boolean NOT NULL DEFAULT false,
  -- Sorts the category in the API, the filter list and the map layer list.
  sort_order          integer NOT NULL,
  -- Categories that must not be described with commercial or safety claims.
  restricted_claims   boolean NOT NULL DEFAULT false,
  created_at          timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.geoscience_subcategories (
  id          text PRIMARY KEY,
  category_id text NOT NULL REFERENCES public.geoscience_categories(id) ON DELETE CASCADE,
  label       text NOT NULL,
  sort_order  integer NOT NULL,
  created_at  timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_geoscience_subcategories_category
  ON public.geoscience_subcategories (category_id, sort_order);

COMMENT ON TABLE public.geoscience_categories IS
  'Rock Talk observation vocabulary. Not a geological dataset and not a claim about any place.';
COMMENT ON TABLE public.geoscience_subcategories IS
  'Subcategories of the Rock Talk observation vocabulary, mirroring src/ai/geoscience-taxonomy.ts.';

INSERT INTO public.geoscience_categories (id, label, description, rock_interpretation, sort_order, restricted_claims)
VALUES
  ('rock',                       'Rock',                               'Consolidated rock specimen or exposure.',                                    true,  10, false),
  ('mineral',                    'Mineral',                            'Mineral specimen, crystal or aggregate.',                                     false, 20, false),
  ('fossil',                     'Fossil or paleontological',          'Fossil, imprint, trace fossil or fossil fragment.',                            false, 30, false),
  ('geological_structure',       'Geological structure',               'Bedding, foliation, joints, faults, folds, veins and related structures.',   false, 40, false),
  ('geological_layer',           'Geological layer or stratigraphy',   'Exposed layers, sequences, profiles and contacts.',                           false, 50, false),
  ('geomorphology',              'Landform or geomorphology',          'Hills, valleys, landforms, erosion and depositional features.',               false, 60, false),
  ('volcanic_feature',           'Volcanic feature',                   'Lava, ash, cones, craters, flows and volcanic deposits.',                    true,  70, false),
  ('hydrogeological_feature',    'Hydrogeological feature',            'Springs, seeps, waterfalls and water-related geological features.',           false, 80, false),
  ('mining_observation',         'Mining or economic geology',         'Occurrences, workings, alteration and exploration indications.',              false, 90, true),
  ('engineering_geology',        'Engineering geology',                'Cuts, slopes, excavations and construction exposures.',                      false, 100, true),
  ('other_geoscience',           'Other geoscience',                   'A genuine geoscience observation outside the categories above.',             false, 110, false),
  ('unknown',                    'Undetermined',                       'Relevant to geoscience but the category cannot be determined.',             false, 120, false),
  ('insufficient_image',         'Insufficient image',                 'The photograph cannot be read as a geoscience observation.',                  false, 130, false),
  ('non_geoscience',             'Not geoscience',                     'The subject is not a geoscience observation.',                               false, 140, false)
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.geoscience_subcategories (id, category_id, label, sort_order)
VALUES
  -- Rock
  ('igneous',                    'rock',                     'Igneous',                                                    10),
  ('sedimentary',                'rock',                     'Sedimentary',                                                20),
  ('metamorphic',                'rock',                     'Metamorphic',                                                30),
  ('unknown_rock',               'rock',                     'Unknown rock',                                               40),
  -- Mineral
  ('mineral_specimen',           'mineral',                  'Mineral specimen',                                           10),
  ('crystal',                    'mineral',                  'Crystal',                                                    20),
  ('mineral_aggregate',          'mineral',                  'Mineral aggregate',                                          30),
  ('possible_ore_occurrence',    'mineral',                  'Possible ore or mineral occurrence',                         40),
  ('unknown_mineral',            'mineral',                  'Unknown mineral',                                            50),
  -- Fossil
  ('fossil',                     'fossil',                   'Fossil',                                                     10),
  ('possible_fossil',            'fossil',                   'Possible fossil',                                            20),
  ('fossil_imprint',             'fossil',                   'Fossil imprint',                                             30),
  ('trace_fossil',               'fossil',                   'Trace fossil',                                               40),
  ('shell_fossil_fragment',      'fossil',                   'Shell or fossil fragment',                                   50),
  ('paleontological_feature',    'fossil',                   'Paleontological feature',                                    60),
  ('unknown_fossil_like',        'fossil',                   'Unknown fossil-like object',                                 70),
  -- Geological structure
  ('bedding',                    'geological_structure',     'Bedding',                                                    10),
  ('foliation',                  'geological_structure',     'Foliation',                                                  20),
  ('cleavage',                   'geological_structure',     'Cleavage',                                                   30),
  ('lineation',                  'geological_structure',     'Lineation',                                                  40),
  ('joint',                      'geological_structure',     'Joint',                                                      50),
  ('fracture',                   'geological_structure',     'Fracture',                                                   60),
  ('fault',                      'geological_structure',     'Fault',                                                      70),
  ('fold',                       'geological_structure',     'Fold',                                                       80),
  ('unconformity',               'geological_structure',     'Unconformity',                                               90),
  ('contact',                    'geological_structure',     'Contact',                                                    100),
  ('vein',                       'geological_structure',     'Vein',                                                       110),
  ('dyke',                       'geological_structure',     'Dyke',                                                       120),
  ('sill',                       'geological_structure',     'Sill',                                                       130),
  ('other_structure',            'geological_structure',     'Other geological structure',                                 140),
  ('unknown_structure',           'geological_structure',     'Unknown structure',                                          150),
  -- Geological layer
  ('sedimentary_layer',          'geological_layer',         'Sedimentary layer',                                          10),
  ('stratigraphic_sequence',     'geological_layer',         'Stratigraphic sequence',                                     20),
  ('exposed_geological_layer',   'geological_layer',         'Exposed geological layer',                                   30),
  ('soil_regolith_profile',      'geological_layer',         'Soil or regolith profile',                                   40),
  ('weathering_profile',         'geological_layer',         'Weathering profile',                                         50),
  ('geological_contact',         'geological_layer',         'Geological contact',                                         60),
  ('unknown_layer',              'geological_layer',         'Unknown layer',                                              70),
  -- Geomorphology
  ('hill',                       'geomorphology',            'Hill',                                                       10),
  ('valley',                     'geomorphology',            'Valley',                                                     20),
  ('escarpment',                 'geomorphology',            'Escarpment',                                                 30),
  ('erosion_feature',            'geomorphology',            'Erosion feature',                                            40),
  ('landslide',                  'geomorphology',            'Landslide',                                                  50),
  ('cave',                       'geomorphology',            'Cave',                                                       60),
  ('gorge',                      'geomorphology',            'Gorge',                                                      70),
  ('cliff',                      'geomorphology',            'Cliff',                                                      80),
  ('river_terrace',              'geomorphology',            'River terrace',                                              90),
  ('alluvial_deposit',           'geomorphology',            'Alluvial deposit',                                           100),
  ('volcanic_landform',          'geomorphology',            'Volcanic landform',                                          110),
  ('other_landform',             'geomorphology',            'Other landform',                                             120),
  ('unknown_landform',            'geomorphology',            'Unknown landform',                                           130),
  -- Volcanic
  ('lava',                       'volcanic_feature',         'Lava',                                                       10),
  ('volcanic_rock',              'volcanic_feature',         'Volcanic rock',                                              20),
  ('volcanic_ash_tephra',        'volcanic_feature',         'Volcanic ash or tephra',                                     30),
  ('volcanic_cone',              'volcanic_feature',         'Volcanic cone',                                              40),
  ('crater',                     'volcanic_feature',         'Crater',                                                     50),
  ('lava_flow',                  'volcanic_feature',         'Lava flow',                                                  60),
  ('volcanic_deposit',           'volcanic_feature',         'Volcanic deposit',                                           70),
  ('geothermal_feature',         'volcanic_feature',         'Geothermal feature',                                         80),
  ('unknown_volcanic_feature',    'volcanic_feature',         'Unknown volcanic feature',                                   90),
  -- Hydrogeological
  ('spring',                     'hydrogeological_feature',  'Spring',                                                     10),
  ('geological_seep',            'hydrogeological_feature',  'Geological seep',                                            20),
  ('waterfall',                  'hydrogeological_feature',  'Waterfall',                                                  30),
  ('river_geological_feature',   'hydrogeological_feature',  'River geological feature',                                   40),
  ('lake_geological_feature',    'hydrogeological_feature',  'Lake geological feature',                                    50),
  ('groundwater_feature',        'hydrogeological_feature',  'Groundwater-related feature',                                60),
  ('mineralized_water_indication','hydrogeological_feature',  'Mineralized water indication',                               70),
  ('unknown_hydro_feature',       'hydrogeological_feature',  'Unknown water-related feature',                              80),
  -- Mining and economic geology
  ('mineral_occurrence',         'mining_observation',       'Mineral occurrence',                                         10),
  ('visible_mineralization',     'mining_observation',       'Visible mineralization',                                     20),
  ('alteration',                 'mining_observation',       'Alteration',                                                 30),
  ('vein_mining',                'mining_observation',       'Vein',                                                       40),
  ('mine_workings',              'mining_observation',       'Mine workings',                                              50),
  ('quarry',                     'mining_observation',       'Quarry',                                                     60),
  ('waste_rock',                 'mining_observation',       'Waste rock',                                                 70),
  ('tailings',                   'mining_observation',       'Tailings',                                                   80),
  ('geological_exposure',        'mining_observation',       'Geological exposure',                                        90),
  ('exploration_indication',     'mining_observation',       'Exploration indication',                                     100),
  ('unknown_mining_observation',  'mining_observation',       'Undetermined mining observation',                            110),
  -- Engineering geology
  ('rock_cut',                   'engineering_geology',      'Rock cut',                                                   10),
  ('road_cut',                   'engineering_geology',      'Road cut',                                                   20),
  ('excavation_exposure',        'engineering_geology',      'Excavation exposure',                                        30),
  ('slope',                      'engineering_geology',      'Slope',                                                      40),
  ('unstable_geological_material','engineering_geology',      'Unstable geological material',                               50),
  ('foundation_exposure',        'engineering_geology',      'Foundation exposure',                                        60),
  ('construction_geology_feature','engineering_geology',      'Construction geology feature',                               70),
  ('tunnel_geology',             'engineering_geology',      'Tunnel geology',                                             80),
  ('quarry_face',                'engineering_geology',      'Quarry face',                                                90),
  ('unknown_engineering_feature', 'engineering_geology',      'Undetermined engineering geology feature',                  100),
  -- Generic and honest exits
  ('other_geoscience',           'other_geoscience',         'Other geoscience observation',                               10),
  ('unknown',                    'unknown',                  'Undetermined',                                               10),
  ('insufficient_image',         'insufficient_image',       'Image not readable',                                         10),
  ('non_geoscience',             'non_geoscience',           'Not a geoscience observation',                               10)
ON CONFLICT (id) DO NOTHING;

-- -----------------------------------------------------------------------------
-- 2. New observation columns
-- -----------------------------------------------------------------------------

ALTER TABLE public.observations
  ADD COLUMN IF NOT EXISTS observation_category     text,
  ADD COLUMN IF NOT EXISTS observation_subcategory  text,
  ADD COLUMN IF NOT EXISTS observation_type         text,
  ADD COLUMN IF NOT EXISTS primary_interpretation   text,
  ADD COLUMN IF NOT EXISTS geological_context       text,
  ADD COLUMN IF NOT EXISTS diagnostic_features      jsonb NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS possible_alternatives   jsonb NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS uncertainties            jsonb NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS questions_for_user       jsonb NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS community_status         text NOT NULL DEFAULT 'not_started';

-- Backfill is a classification of rows that already exist, not new data. A
-- completed Rock Talk observation is a rock observation; nothing is deleted.
UPDATE public.observations
SET observation_category = 'rock',
    observation_subcategory = CASE primary_classification
      WHEN 'igneous'     THEN 'igneous'
      WHEN 'sedimentary' THEN 'sedimentary'
      WHEN 'metamorphic' THEN 'metamorphic'
      ELSE 'unknown_rock'
    END,
    observation_type = 'rock_specimen',
    primary_interpretation = COALESCE(possible_name, primary_classification)
WHERE observation_category IS NULL
  AND status = 'completed'
  AND primary_classification <> 'non_rock';

UPDATE public.observations
SET observation_category = 'non_geoscience',
    observation_subcategory = 'non_geoscience',
    observation_type = 'non_geoscience',
    primary_interpretation = 'Not a geoscience observation'
WHERE observation_category IS NULL
  AND status = 'completed'
  AND primary_classification = 'non_rock';

-- Rows that failed or are still processing are left NULL on purpose: they were
-- never interpreted, so claiming a category for them would be a fabrication.
ALTER TABLE public.observations
  ALTER COLUMN observation_category     SET DEFAULT 'unknown',
  ALTER COLUMN observation_subcategory  SET DEFAULT 'unknown',
  ALTER COLUMN observation_type         SET DEFAULT 'unknown';

-- Category and subcategory must exist in the vocabulary, and a subcategory must
-- belong to its category. Applied as NOT VALID first so a large existing table
-- is not rewritten, then validated: a mismatched pair fails loudly rather than
-- sitting in the data.
ALTER TABLE public.observations
  ADD CONSTRAINT observations_observation_category_fk
    FOREIGN KEY (observation_category) REFERENCES public.geoscience_categories(id)
    NOT VALID;

ALTER TABLE public.observations
  ADD CONSTRAINT observations_observation_subcategory_fk
    FOREIGN KEY (observation_subcategory) REFERENCES public.geoscience_subcategories(id)
    NOT VALID;

ALTER TABLE public.observations
  ADD CONSTRAINT observations_community_status_check
    CHECK (community_status IN ('not_started','open','community_supported','expert_reviewed','resolved','unresolved'));

-- The constraints above were added NOT VALID so an existing table is not
-- rewritten. They are validated immediately afterwards: a category or
-- subcategory that is not in the vocabulary must stop the deployment, not sit
-- quietly in the data where the API would have to guess what it meant.
ALTER TABLE public.observations VALIDATE CONSTRAINT observations_observation_category_fk;
ALTER TABLE public.observations VALIDATE CONSTRAINT observations_observation_subcategory_fk;

CREATE INDEX IF NOT EXISTS idx_observations_observation_category
  ON public.observations (observation_category);
CREATE INDEX IF NOT EXISTS idx_observations_observation_subcategory
  ON public.observations (observation_subcategory);
CREATE INDEX IF NOT EXISTS idx_observations_community_status
  ON public.observations (community_status);

COMMENT ON COLUMN public.observations.observation_category IS
  'Rock Talk observation vocabulary category, set before any interpretation is attempted.';
COMMENT ON COLUMN public.observations.primary_interpretation IS
  'One-line preliminary interpretation. May be hedged language; never a commercial or safety claim.';
COMMENT ON COLUMN public.observations.community_status IS
  'Community progress of an investigation attached to this observation. Never a scientific verdict.';

-- A subcategory that is not registered under its own category is rejected by
-- the trigger below. A foreign key alone cannot express that relationship.
CREATE OR REPLACE FUNCTION public.enforce_subcategory_belongs_to_category()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.observation_subcategory IS NULL OR NEW.observation_category IS NULL THEN
    RETURN NEW;
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.geoscience_subcategories s
    WHERE s.id = NEW.observation_subcategory
      AND s.category_id = NEW.observation_category
  ) THEN
    RAISE EXCEPTION
      'observation_subcategory % does not belong to observation_category %',
      NEW.observation_subcategory, NEW.observation_category
      USING ERRCODE = 'check_violation';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_observations_subcategory_category ON public.observations;
CREATE TRIGGER trg_observations_subcategory_category
  BEFORE INSERT OR UPDATE OF observation_category, observation_subcategory
  ON public.observations
  FOR EACH ROW
  EXECUTE FUNCTION public.enforce_subcategory_belongs_to_category();

-- -----------------------------------------------------------------------------
-- 3. Media metadata (specification section 23)
--
-- Existing columns are kept. New ones are nullable, so historical metadata rows
-- stay valid and no media is invented for an observation that has none.
-- -----------------------------------------------------------------------------

ALTER TABLE public.observation_media
  ADD COLUMN IF NOT EXISTS site_id            uuid REFERENCES public.geological_sites(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS file_path          text,
  ADD COLUMN IF NOT EXISTS capture_date       timestamptz,
  ADD COLUMN IF NOT EXISTS caption            text,
  ADD COLUMN IF NOT EXISTS observation_category text,
  ADD COLUMN IF NOT EXISTS visibility         text NOT NULL DEFAULT 'private';

ALTER TABLE public.observation_media
  ADD CONSTRAINT observation_media_visibility_check
    CHECK (visibility IN ('private','pending','public','hidden'));

ALTER TABLE public.observation_media
  ADD CONSTRAINT observation_media_category_fk
    FOREIGN KEY (observation_category) REFERENCES public.geoscience_categories(id)
    NOT VALID;

ALTER TABLE public.observation_media VALIDATE CONSTRAINT observation_media_category_fk;

CREATE INDEX IF NOT EXISTS idx_observation_media_visibility
  ON public.observation_media (visibility, media_type);

COMMENT ON COLUMN public.observation_media.visibility IS
  'Private by default. A media row is never public because it exists.';

-- -----------------------------------------------------------------------------
-- 4. Category counts for the API and the map layer list
-- -----------------------------------------------------------------------------

CREATE OR REPLACE VIEW public.public_category_counts AS
SELECT
  c.id AS category,
  c.label AS category_label,
  c.sort_order,
  COALESCE(agg.observation_count, 0) AS observation_count,
  COALESCE(site_counts.site_count, 0) AS site_count
FROM public.geoscience_categories c
LEFT JOIN (
  SELECT o.observation_category AS category, COUNT(*) AS observation_count
  FROM public.observations o
  WHERE o.publication_status = 'public'
    AND o.status = 'completed'
    AND o.verification_status <> 'rejected'
  GROUP BY o.observation_category
) agg ON agg.category = c.id
LEFT JOIN (
  SELECT s.primary_category AS category, COUNT(DISTINCT s.id) AS site_count
  FROM (
    SELECT gs.id, o.observation_category AS primary_category
    FROM public.geological_sites gs
    JOIN public.observations o ON o.site_id = gs.id
    WHERE o.publication_status = 'public' AND o.status = 'completed'
  ) s
  GROUP BY s.primary_category
) site_counts ON site_counts.category = c.id;

COMMENT ON VIEW public.public_category_counts IS
  'Counts of publicly published observations per category. A category with no observations reports zero; it is never estimated.';

-- -----------------------------------------------------------------------------
-- 5. Public view exposes the new fields
--
-- The privacy rules are unchanged: exact coordinates only when explicitly
-- published as exact, and no contributor identity, message id or media path is
-- ever exposed here.
--
-- The view replaces the 011 version in place. `CREATE OR REPLACE VIEW` matches
-- existing columns by name and ordinal position, so the new geo-taxonomy fields
-- are appended after the 30-column list published by 011. Inserting them earlier
-- would renumber the columns that follow and Postgres would reject the statement.
-- -----------------------------------------------------------------------------

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
  COALESCE(site.title, '')             AS site_title,
  COALESCE(o.observation_category, 'unknown')       AS observation_category,
  COALESCE(o.observation_subcategory, 'unknown')    AS observation_subcategory,
  o.observation_type,
  o.primary_interpretation,
  o.geological_context,
  o.diagnostic_features,
  o.community_status,
  o.possible_alternatives,
  o.uncertainties,
  o.questions_for_user
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
WHERE o.status = 'completed'
  AND o.publication_status = 'public'
  AND o.verification_status <> 'rejected'
  AND l.is_public = true;
-- The legacy `is_rock = true` predicate is deliberately gone. It was the
-- rock-only gate: a fossil, a structure or a landform is not a rock, so the
-- filter hid every non-rock observation from the public map. Publication is
-- decided by status, consent and review, never by whether the subject happens
-- to be a rock.

-- -----------------------------------------------------------------------------
-- 6. GIS layer registry: one layer per observation category
--
-- The registry rows describe Rock Talk's own data. `data_source` stays NULL for
-- any geological reference layer, so an unconfigured reference layer reports
-- itself as not configured rather than as an empty-but-real layer.
-- -----------------------------------------------------------------------------

INSERT INTO public.gis_layers (id, display_name, category, enabled, data_source, source_attribution, sort_order)
SELECT
  c.id,
  c.label || ' observations',
  'classification',
  c.id = 'rock',
  'public_observations',
  'Rock Talk contributors',
  c.sort_order
FROM public.geoscience_categories c
ON CONFLICT (id) DO NOTHING;