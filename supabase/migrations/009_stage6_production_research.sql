-- 009_stage6_production_research.sql
-- Stage 6: Production Hardening, Session Store, Data Quality, Research Datasets & Compliance Audit Logs

-- 1. Server-side revocable session store for authorized experts & administrators (Section 5)
CREATE TABLE IF NOT EXISTS public.expert_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  expert_user_id text NOT NULL,
  token_hash text NOT NULL UNIQUE, -- SHA-256 hash of the session token; never raw
  role text NOT NULL CHECK (role IN ('expert', 'lead_geologist', 'admin')),
  created_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL,
  revoked_at timestamptz NULL,
  last_used_at timestamptz NOT NULL DEFAULT now(),
  ip_hash text NULL,
  user_agent_hash text NULL
);

-- 2. Observation data quality engine table (Section 10)
CREATE TABLE IF NOT EXISTS public.observation_data_quality (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  observation_id uuid NOT NULL REFERENCES public.observations(id) ON DELETE CASCADE,
  passport_id text NOT NULL,
  overall_score integer NOT NULL CHECK (overall_score >= 0 AND overall_score <= 100),
  completeness_category text NOT NULL CHECK (completeness_category IN ('high', 'good', 'moderate', 'low')),
  image_quality_score integer NOT NULL CHECK (image_quality_score >= 0 AND image_quality_score <= 100),
  classification_score integer NOT NULL CHECK (classification_score >= 0 AND classification_score <= 100),
  location_score integer NOT NULL CHECK (location_score >= 0 AND location_score <= 100),
  metadata_score integer NOT NULL CHECK (metadata_score >= 0 AND metadata_score <= 100),
  duplicate_risk_flag boolean NOT NULL DEFAULT false,
  image_sha256 text NULL,
  indicators jsonb NOT NULL DEFAULT '{}'::jsonb,
  assessed_at timestamptz NOT NULL DEFAULT now()
);

-- 3. Research dataset version registry (Section 20)
CREATE TABLE IF NOT EXISTS public.research_dataset_versions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  version_tag text NOT NULL UNIQUE,
  record_count integer NOT NULL DEFAULT 0,
  schema_version text NOT NULL DEFAULT '1.0.0',
  description text NOT NULL,
  filters_applied jsonb NOT NULL DEFAULT '{}'::jsonb,
  exported_by_actor_id text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- 4. Compliance and research audit log table (Section 21)
CREATE TABLE IF NOT EXISTS public.compliance_audit_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id text NOT NULL UNIQUE,
  actor_id text NOT NULL,
  actor_role text NOT NULL,
  event_type text NOT NULL CHECK (
    event_type IN (
      'expert_login',
      'expert_logout',
      'session_revoked',
      'expert_review_created',
      'expert_review_updated',
      'verification_status_changed',
      'publication_changed',
      'expert_account_changed',
      'research_export_created',
      'data_quality_assessed',
      'admin_action'
    )
  ),
  target_type text NOT NULL,
  target_id text NOT NULL,
  request_id text NOT NULL,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- 5. Indexes for fast lookups & performance
CREATE INDEX IF NOT EXISTS idx_expert_sessions_token_hash
  ON public.expert_sessions (token_hash);

CREATE INDEX IF NOT EXISTS idx_expert_sessions_user_active
  ON public.expert_sessions (expert_user_id, revoked_at, expires_at);

CREATE INDEX IF NOT EXISTS idx_obs_quality_observation_id
  ON public.observation_data_quality (observation_id);

CREATE INDEX IF NOT EXISTS idx_obs_quality_passport_id
  ON public.observation_data_quality (passport_id);

CREATE INDEX IF NOT EXISTS idx_obs_quality_overall_score
  ON public.observation_data_quality (overall_score);

CREATE INDEX IF NOT EXISTS idx_obs_quality_image_sha256
  ON public.observation_data_quality (image_sha256);

CREATE INDEX IF NOT EXISTS idx_research_versions_tag
  ON public.research_dataset_versions (version_tag);

CREATE INDEX IF NOT EXISTS idx_compliance_audit_created_at
  ON public.compliance_audit_logs (created_at DESC);

CREATE INDEX IF NOT EXISTS idx_compliance_audit_event_type
  ON public.compliance_audit_logs (event_type);

CREATE INDEX IF NOT EXISTS idx_compliance_audit_actor_id
  ON public.compliance_audit_logs (actor_id);

-- 6. Enable Row Level Security (RLS) on all Stage 6 tables
ALTER TABLE public.expert_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.observation_data_quality ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.research_dataset_versions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.compliance_audit_logs ENABLE ROW LEVEL SECURITY;
