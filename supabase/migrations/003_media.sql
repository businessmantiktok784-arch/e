-- 003_media.sql
-- Create observation_media table

CREATE TABLE IF NOT EXISTS public.observation_media (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  observation_id uuid NOT NULL REFERENCES public.observations(id) ON DELETE CASCADE,
  media_type text NOT NULL DEFAULT 'image',
  mime_type text NOT NULL,
  file_size bigint NOT NULL,
  sha256 text,
  source_media_id text NOT NULL,
  storage_status text NOT NULL DEFAULT 'metadata_only' CHECK (
    storage_status IN ('metadata_only', 'stored', 'failed')
  ),
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Enable Row Level Security (RLS)
ALTER TABLE public.observation_media ENABLE ROW LEVEL SECURITY;
