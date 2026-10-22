-- 010_stage7_validation.sql
-- Stage 7: Field Validation, Controlled Sample Registry, Multi-Expert Consensus & AI Evaluation Runs

-- 1. Controlled Validation Datasets (Section 6)
CREATE TABLE IF NOT EXISTS public.validation_datasets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  dataset_code text NOT NULL UNIQUE, -- e.g. ET-VAL-2026-V1
  -- This single-column UNIQUE is retained as originally written so that this
  -- migration still reproduces the schema an existing deployment has.
  -- Migration 015 drops it and replaces it with UNIQUE (dataset_code, version),
  -- which is what a versioned dataset registry actually requires.
  name text NOT NULL,
  description text NOT NULL,
  version text NOT NULL DEFAULT '1.0.0',
  status text NOT NULL CHECK (status IN ('draft', 'active', 'locked', 'archived')),
  target_classification_level text NOT NULL DEFAULT 'broad_class' CHECK (target_classification_level IN ('broad_class', 'lithology')),
  created_by text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- 2. Physical Validation Samples Registry (Section 7)
CREATE TABLE IF NOT EXISTS public.validation_samples (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  dataset_id uuid NOT NULL REFERENCES public.validation_datasets(id) ON DELETE CASCADE,
  sample_code text NOT NULL UNIQUE, -- e.g. RT-VAL-0001
  source_type text NOT NULL CHECK (
    source_type IN (
      'field_collected',
      'laboratory_reference',
      'university_collection',
      'museum_reference',
      'existing_verified_sample'
    )
  ),
  collection_date date NULL,
  country text NOT NULL DEFAULT 'Rwanda',
  district text NULL,
  site_description text NULL,
  specimen_notes text NULL,
  sample_status text NOT NULL DEFAULT 'registered' CHECK (sample_status IN ('registered', 'labeled', 'disputed', 'locked', 'excluded')),
  data_partition text NOT NULL DEFAULT 'evaluation' CHECK (data_partition IN ('reference', 'evaluation', 'held_out_test')),
  research_use_consent boolean NOT NULL DEFAULT true,
  image_use_consent boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- 3. Standardized Validation Images (Section 13 & 14)
CREATE TABLE IF NOT EXISTS public.validation_images (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  sample_id uuid NOT NULL REFERENCES public.validation_samples(id) ON DELETE CASCADE,
  storage_path text NOT NULL,
  image_hash text NOT NULL, -- SHA-256 for duplicate detection
  image_width integer NULL,
  image_height integer NULL,
  file_size_bytes bigint NULL,
  lighting_condition text NULL CHECK (lighting_condition IN ('natural_daylight', 'direct_sun', 'overcast', 'diffuse_lab', 'smartphone_flash', 'mixed')),
  background_condition text NULL CHECK (background_condition IN ('neutral_grey', 'scale_grid', 'field_ground', 'white_card', 'natural_outcrop')),
  view_type text NOT NULL DEFAULT 'overview' CHECK (view_type IN ('overview', 'closeup', 'texture', 'fresh_surface', 'multiple_angles')),
  scale_reference_present boolean NOT NULL DEFAULT false,
  quality_status text NOT NULL DEFAULT 'accepted' CHECK (quality_status IN ('accepted', 'rejected', 'needs_review')),
  quality_notes text NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- 4. Multi-Expert Reference Labels (Section 9 & 10)
CREATE TABLE IF NOT EXISTS public.validation_reference_labels (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  sample_id uuid NOT NULL REFERENCES public.validation_samples(id) ON DELETE CASCADE,
  reviewer_id text NOT NULL,
  reviewer_name text NOT NULL,
  reviewer_role text NOT NULL DEFAULT 'expert',
  reviewer_organization text NOT NULL DEFAULT 'Rock Talk Geological Evaluation Group',
  classification text NOT NULL CHECK (
    classification IN ('igneous', 'sedimentary', 'metamorphic', 'unclassified', 'non_rock', 'insufficient_image')
  ),
  rock_name text NULL,
  confidence text NOT NULL DEFAULT 'high' CHECK (confidence IN ('high', 'moderate', 'low', 'insufficient')),
  diagnostic_features jsonb NOT NULL DEFAULT '[]'::jsonb,
  notes text NULL,
  reference_method text NOT NULL DEFAULT 'expert_visual_identification' CHECK (
    reference_method IN (
      'expert_visual_identification',
      'laboratory_confirmed',
      'existing_curated_reference',
      'consensus_expert_review'
    )
  ),
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT uq_sample_reviewer UNIQUE (sample_id, reviewer_id)
);

-- 5. AI Evaluation Runs (Section 18 & 20)
CREATE TABLE IF NOT EXISTS public.validation_ai_runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  dataset_id uuid NOT NULL REFERENCES public.validation_datasets(id) ON DELETE CASCADE,
  run_code text NOT NULL UNIQUE, -- e.g. RUN-2026-VAL-001
  model_name text NOT NULL,
  prompt_version text NOT NULL,
  analysis_version text NOT NULL DEFAULT '1.0',
  application_version text NOT NULL DEFAULT '1.0.0',
  status text NOT NULL DEFAULT 'queued' CHECK (status IN ('queued', 'running', 'completed', 'failed', 'cancelled')),
  total_samples integer NOT NULL DEFAULT 0,
  successful_samples integer NOT NULL DEFAULT 0,
  failed_samples integer NOT NULL DEFAULT 0,
  started_at timestamptz NULL,
  completed_at timestamptz NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- 6. AI Prediction Records (Section 19)
CREATE TABLE IF NOT EXISTS public.validation_ai_predictions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  run_id uuid NOT NULL REFERENCES public.validation_ai_runs(id) ON DELETE CASCADE,
  sample_id uuid NOT NULL REFERENCES public.validation_samples(id) ON DELETE CASCADE,
  image_id uuid NULL REFERENCES public.validation_images(id) ON DELETE SET NULL,
  is_rock boolean NOT NULL DEFAULT true,
  classification text NOT NULL CHECK (
    classification IN ('igneous', 'sedimentary', 'metamorphic', 'unclassified', 'non_rock', 'insufficient_image')
  ),
  possible_name text NULL,
  confidence text NOT NULL CHECK (confidence IN ('high', 'moderate', 'low', 'insufficient')),
  confidence_score numeric NULL CHECK (confidence_score >= 0.0 AND confidence_score <= 1.0),
  observed_features jsonb NOT NULL DEFAULT '[]'::jsonb,
  reasoning text NOT NULL,
  limitations jsonb NOT NULL DEFAULT '[]'::jsonb,
  response_time_ms integer NOT NULL DEFAULT 0,
  model_name text NOT NULL,
  prompt_version text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT uq_run_sample UNIQUE (run_id, sample_id)
);

-- 7. Structured Error Categorization Records (Section 25)
CREATE TABLE IF NOT EXISTS public.validation_errors (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  run_id uuid NOT NULL REFERENCES public.validation_ai_runs(id) ON DELETE CASCADE,
  sample_id uuid NOT NULL REFERENCES public.validation_samples(id) ON DELETE CASCADE,
  reference_classification text NOT NULL,
  ai_classification text NOT NULL,
  ai_confidence text NOT NULL,
  error_category text NOT NULL CHECK (
    error_category IN (
      'visual_similarity',
      'poor_image_quality',
      'lighting',
      'weathering',
      'mixed_or_complex_sample',
      'insufficient_context',
      'expert_disagreement',
      'non_rock_confusion',
      'unknown'
    )
  ),
  error_notes text NULL,
  annotated_by text NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- 8. Indexes for Research Query Performance
CREATE INDEX IF NOT EXISTS idx_val_samples_dataset ON public.validation_samples (dataset_id);
CREATE INDEX IF NOT EXISTS idx_val_samples_partition ON public.validation_samples (data_partition);
CREATE INDEX IF NOT EXISTS idx_val_images_sample ON public.validation_images (sample_id);
CREATE INDEX IF NOT EXISTS idx_val_images_hash ON public.validation_images (image_hash);
CREATE INDEX IF NOT EXISTS idx_val_labels_sample ON public.validation_reference_labels (sample_id);
CREATE INDEX IF NOT EXISTS idx_val_ai_runs_dataset ON public.validation_ai_runs (dataset_id);
CREATE INDEX IF NOT EXISTS idx_val_ai_preds_run ON public.validation_ai_predictions (run_id);
CREATE INDEX IF NOT EXISTS idx_val_errors_run ON public.validation_errors (run_id);

-- 9. Row Level Security
ALTER TABLE public.validation_datasets ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.validation_samples ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.validation_images ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.validation_reference_labels ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.validation_ai_runs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.validation_ai_predictions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.validation_errors ENABLE ROW LEVEL SECURITY;
