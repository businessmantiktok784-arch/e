-- 004_locations.sql
-- Create observation_locations table with PostGIS geometry and latitude/longitude constraints

CREATE TABLE IF NOT EXISTS public.observation_locations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  observation_id uuid NOT NULL REFERENCES public.observations(id) ON DELETE CASCADE,
  location_source text NOT NULL CHECK (
    location_source IN ('user_gps', 'user_manual', 'admin', 'future_import')
  ),
  latitude double precision CHECK (latitude IS NULL OR (latitude >= -90 AND latitude <= 90)),
  longitude double precision CHECK (longitude IS NULL OR (longitude >= -180 AND longitude <= 180)),
  accuracy_meters double precision,
  district text,
  sector text,
  cell text,
  village text,
  location_text text,
  geom extensions.geometry(Point, 4326),
  is_public boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Enable Row Level Security (RLS)
ALTER TABLE public.observation_locations ENABLE ROW LEVEL SECURITY;
