-- 005_processing_events.sql
-- Create processing_events table for non-sensitive pipeline auditing

CREATE TABLE IF NOT EXISTS public.processing_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  observation_id uuid REFERENCES public.observations(id) ON DELETE CASCADE,
  event_type text NOT NULL CHECK (
    event_type IN (
      'observation_created',
      'media_received',
      'media_validated',
      'ai_analysis_started',
      'ai_analysis_completed',
      'database_saved',
      'whatsapp_response_sent',
      'processing_failed'
    )
  ),
  status text NOT NULL CHECK (status IN ('started', 'completed', 'failed')),
  duration_ms integer,
  error_code text,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Enable Row Level Security (RLS)
ALTER TABLE public.processing_events ENABLE ROW LEVEL SECURITY;
