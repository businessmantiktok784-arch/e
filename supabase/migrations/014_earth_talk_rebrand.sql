-- =============================================================================
-- 014 - Earth Talk rename
--
-- The platform was previously called "Rock Talk" and is now called
-- "Earth Talk". This migration carries that rename into the database without
-- touching any observation data.
--
-- WHAT THIS FILE DELIBERATELY DOES NOT DO
-- --------------------------------------
-- It does not rename any table, column or view. `observations`,
-- `observation_media`, `geological_sites`, `validation_datasets` and every
-- other identifier keep their current names, because renaming a live table to
-- improve a label risks the existing migrations and the existing data for no
-- functional gain. The identifier `rock_*` inside the schema (for example a
-- legacy column) is preserved for exactly that reason.
--
-- What changes here is only text a human reads: map attribution, layer
-- category vocabulary, and the table comments surfaced in `psql \d+` and in
-- any schema browser.
--
-- NOTHING IN THIS FILE IS A SCIENTIFIC CLAIM, and no observation is created,
-- altered, renamed or deleted.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. Widen the gis_layers category vocabulary
--
-- Migration 011 constrained `category` to ('rock_talk', 'classification',
-- 'geological', 'base'). 'earth_talk' is added for new rows. 'rock_talk' is
-- deliberately RETAINED in the constraint rather than swapped out, because rows
-- already written with it exist in any deployed instance and a narrower
-- constraint could not be validated against them. Dropping the old value is a
-- data migration, not a rename, and is out of scope for this file.
--
-- The constraint is dropped and re-added rather than altered in place so the
-- change is atomic and its intent is visible.
-- -----------------------------------------------------------------------------

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'gis_layers_category_check'
  ) THEN
    -- Only proceed if the current definition is the one we expect. If a
    -- deployment has customised the constraint, fail loudly instead of
    -- silently replacing whatever the operator intended.
    IF NOT EXISTS (
      SELECT 1
      FROM pg_constraint
      WHERE conname = 'gis_layers_category_check'
        AND pg_get_constraintdef(oid) LIKE '%rock_talk%'
    ) THEN
      RAISE EXCEPTION
        'gis_layers_category_check exists but does not contain the expected rock_talk value. '
        'Inspect it manually before renaming the platform.';
    END IF;

    ALTER TABLE public.gis_layers DROP CONSTRAINT gis_layers_category_check;
  END IF;
END $$;

ALTER TABLE public.gis_layers
  ADD CONSTRAINT gis_layers_category_check
  CHECK (category IN ('earth_talk', 'rock_talk', 'classification', 'geological', 'base'));

-- Existing 'rock_talk' rows stay as they are. Rewriting them would be a silent
-- edit of stored data for a label change; readers of the registry handle both
-- values identically.


-- -----------------------------------------------------------------------------
-- 2. Attribution text a human sees
--
-- `source_attribution` is rendered on the map, so 'Rock Talk contributors' is
-- user-facing product text. Only text that mentions the old product name is
-- touched. Table names inside the string are left intact: 'geological_sites' and
-- 'community_investigations' are real table names and rewriting them in a label
-- would make the attribution lie about where the data came from.
-- -----------------------------------------------------------------------------

UPDATE public.gis_layers
SET source_attribution = replace(source_attribution, 'Rock Talk', 'Earth Talk')
WHERE source_attribution LIKE '%Rock Talk%';

UPDATE public.gis_layers
SET display_name = replace(display_name, 'Rock Talk', 'Earth Talk')
WHERE display_name LIKE '%Rock Talk%';


-- -----------------------------------------------------------------------------
-- 3. Table comments
--
-- Migration 012 attached comments describing the tables as 'Rock Talk
-- observation vocabulary'. Those comments are read by anyone inspecting the
-- schema, so they carry the new name. The comment text is not a constraint and
-- changing it cannot alter behaviour.
-- -----------------------------------------------------------------------------

COMMENT ON TABLE public.geoscience_categories IS
  'Earth Talk observation vocabulary. Not a geological dataset and not a claim about any place.';

COMMENT ON TABLE public.geoscience_subcategories IS
  'Subcategories of the Earth Talk observation vocabulary, mirroring src/ai/geoscience-taxonomy.ts.';

COMMENT ON COLUMN public.observations.observation_category IS
  'Earth Talk observation vocabulary category, set before any interpretation is attempted.';


-- -----------------------------------------------------------------------------
-- 4. What is intentionally NOT renamed
--
--   observations.*              All rock-era column names are preserved.
--   'rock' as a taxonomy value   Rock is one category inside Earth Talk, not
--                               the whole of it, so the category keeps its name.
--   gis_layers.category          'rock_talk' stays a legal value for existing rows.
--   ENV USER_HASH_SECRET        Rotating it would orphan every stored contributor
--                               hash and permanently break reputation continuity.
--                               The rename does not imply a re-key.
--   RESEARCH_DATASET_VERSION    Left as-is so historical exports stay traceable to
--                               the dataset version they were taken from.
-- =============================================================================