-- 006_indexes.sql
-- Create targeted indexes for observations, media, locations, and events

CREATE INDEX IF NOT EXISTS idx_observations_passport_id ON public.observations (passport_id);
CREATE INDEX IF NOT EXISTS idx_observations_source_message_id ON public.observations (source_message_id);
CREATE INDEX IF NOT EXISTS idx_observations_source_user_hash ON public.observations (source_user_hash);
CREATE INDEX IF NOT EXISTS idx_observations_created_at ON public.observations (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_observations_primary_classification ON public.observations (primary_classification);
CREATE INDEX IF NOT EXISTS idx_observations_confidence ON public.observations (confidence);
CREATE INDEX IF NOT EXISTS idx_observations_verification_status ON public.observations (verification_status);
CREATE INDEX IF NOT EXISTS idx_observations_publication_status ON public.observations (publication_status);
CREATE INDEX IF NOT EXISTS idx_observations_location_status ON public.observations (location_status);

-- Spatial index on postgis geometry
CREATE INDEX IF NOT EXISTS idx_observation_locations_geom ON public.observation_locations USING GIST (geom);
CREATE INDEX IF NOT EXISTS idx_observation_locations_observation_id ON public.observation_locations (observation_id);

CREATE INDEX IF NOT EXISTS idx_observation_media_observation_id ON public.observation_media (observation_id);
CREATE INDEX IF NOT EXISTS idx_processing_events_observation_id ON public.processing_events (observation_id);
