-- 008_expert_verification.sql
-- Stage 5: Expert Verification Dashboard & Workflow

-- 1. Create table for expert verifications (authoritative review separate from AI analysis)
CREATE TABLE IF NOT EXISTS public.expert_verifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  observation_id uuid NOT NULL REFERENCES public.observations(id) ON DELETE CASCADE,
  reviewer_id text NOT NULL,
  reviewer_name text NOT NULL,
  reviewer_role text NOT NULL DEFAULT 'expert',
  reviewer_organization text NOT NULL DEFAULT 'Rwanda Mines, Petroleum and Gas Board',
  status text NOT NULL CHECK (status IN ('under_review', 'expert_verified', 'rejected')),
  expert_classification text NULL CHECK (
    expert_classification IN ('igneous', 'sedimentary', 'metamorphic', 'unclassified', 'non_rock', 'insufficient_image')
  ),
  expert_rock_name text NULL,
  expert_confidence text NULL CHECK (expert_confidence IN ('high', 'moderate', 'low', 'insufficient')),
  expert_observed_features jsonb NOT NULL DEFAULT '[]'::jsonb,
  expert_notes text NULL,
  scientific_remarks text NULL,
  is_latest boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- 2. Create audit log table to permanently record verification transitions & actions
CREATE TABLE IF NOT EXISTS public.verification_audit_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  observation_id uuid NOT NULL REFERENCES public.observations(id) ON DELETE CASCADE,
  passport_id text NOT NULL,
  reviewer_id text NOT NULL,
  reviewer_name text NOT NULL,
  action text NOT NULL CHECK (
    action IN ('assigned_review', 'status_changed', 'verified', 'rejected', 'visibility_toggled', 'comment_added')
  ),
  previous_status text NOT NULL,
  new_status text NOT NULL,
  notes text NULL,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- 3. Indexes for fast lookup by observation and reviewer
CREATE INDEX IF NOT EXISTS idx_expert_verifications_observation_id
  ON public.expert_verifications (observation_id);

CREATE INDEX IF NOT EXISTS idx_expert_verifications_reviewer_id
  ON public.expert_verifications (reviewer_id);

CREATE INDEX IF NOT EXISTS idx_expert_verifications_created_at
  ON public.expert_verifications (created_at DESC);

CREATE INDEX IF NOT EXISTS idx_verification_audit_logs_observation_id
  ON public.verification_audit_logs (observation_id);

CREATE INDEX IF NOT EXISTS idx_verification_audit_logs_passport_id
  ON public.verification_audit_logs (passport_id);

CREATE INDEX IF NOT EXISTS idx_verification_audit_logs_created_at
  ON public.verification_audit_logs (created_at DESC);

-- 4. Enable Row Level Security (RLS) on expert tables
ALTER TABLE public.expert_verifications ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.verification_audit_logs ENABLE ROW LEVEL SECURITY;
