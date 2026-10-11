-- 001_extensions.sql
-- Enable PostGIS in a dedicated extension schema per Supabase best practices

CREATE SCHEMA IF NOT EXISTS extensions;

CREATE EXTENSION IF NOT EXISTS "uuid-ossp" SCHEMA extensions;
CREATE EXTENSION IF NOT EXISTS postgis SCHEMA extensions;
