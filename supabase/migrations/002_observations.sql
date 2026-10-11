-- 002_observations.sql
-- Create sequence and observations table for Rock Passports

CREATE SEQUENCE IF NOT EXISTS passport_id_seq START WITH 1 INCREMENT BY 1;

CREATE OR REPLACE FUNCTION generate_passport_id()
RETURNS text AS $$
BEGIN
  RETURN 'RT-RW-' || lpad(nextval('passport_id_seq')::text, 6, '0');
END;
$$ LANGUAGE plpgsql;

CREATE TABLE IF NOT EXISTS public.observations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  passport_id text NOT NULL UNIQUE DEFAULT generate_passport_id(),
  source text NOT NULL DEFAULT 'whatsapp',
  source_message_id text NOT NULL UNIQUE,
  source_user_hash text NOT NULL,
  status text NOT NULL DEFAULT 'processing' CHECK (status IN ('processing', 'completed', 'failed')),
  is_rock boolean NOT NULL,
  primary_classification text NOT NULL CHECK (
    primary_classification IN ('igneous', 'sedimentary', 'metamorphic', 'unclassified', 'non_rock', 'insufficient_image')
  ),
  possible_name text,
  confidence text NOT NULL CHECK (confidence IN ('high', 'moderate', 'low', 'insufficient')),
  confidence_score double precision NOT NULL CHECK (confidence_score >= 0 AND confidence_score <= 1),
  observed_features jsonb NOT NULL DEFAULT '[]'::jsonb,
  reasoning text NOT NULL,
  alternative_possibilities jsonb NOT NULL DEFAULT '[]'::jsonb,
  limitations jsonb NOT NULL DEFAULT '[]'::jsonb,
  recommended_next_steps jsonb NOT NULL DEFAULT '[]'::jsonb,
  safety_note text NOT NULL,
  user_caption text,
  verification_status text NOT NULL DEFAULT 'unverified' CHECK (
    verification_status IN ('unverified', 'under_review', 'expert_verified', 'rejected')
  ),
  publication_status text NOT NULL DEFAULT 'private' CHECK (
    publication_status IN ('private', 'pending', 'public', 'hidden')
  ),
  location_status text NOT NULL DEFAULT 'not_provided' CHECK (
    location_status IN ('not_provided', 'user_provided', 'approximate', 'exact_private')
  ),
  data_quality_status text NOT NULL DEFAULT 'partial' CHECK (
    data_quality_status IN ('complete', 'partial', 'insufficient')
  ),
  ai_model text NOT NULL DEFAULT 'gemini-3.8-flash',
  ai_prompt_version text NOT NULL DEFAULT 'geological-v1',
  analysis_version text NOT NULL DEFAULT 'stage2-v1',
  system_version text NOT NULL DEFAULT 'stage3-v1',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Enable Row Level Security (RLS)
ALTER TABLE public.observations ENABLE ROW LEVEL SECURITY;
