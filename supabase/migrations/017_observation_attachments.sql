-- 017_observation_attachments.sql
-- Stage 12 follow-up: attachable files on observation posts.
--
-- An observation may carry documents, research papers and field reports that
-- did not arrive as WhatsApp media (photos/videos). Each such file is its own
-- row so a visitor can keep every report, research note and document separate.
--
-- Design rules enforced here:
--   * The URL is stored plainly; the bytes themselves stay out of PostgreSQL.
--     Files live on the static/media store and are served over HTTPS.
--   * Rows are owned by an observation, never by a phone number.
--   * `is_public` mirrors the privacy of `observation_media`: private rows are
--     only reachable through the authorized post detail endpoint, which checks
--     ownership before it ever touches this table.
--   * Kind is a closed set (document | research | report) so the client can
--     render a stable icon per kind without sniffing file extensions.

CREATE TABLE IF NOT EXISTS public.observation_attachments (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  observation_id  uuid NOT NULL REFERENCES public.observations(id) ON DELETE CASCADE,
  kind            text NOT NULL DEFAULT 'document'
                    CHECK (kind IN ('document', 'research', 'report')),
  title           text NOT NULL,
  description     text NULL,
  filename        text NOT NULL,
  mime_type       text NOT NULL,
  size_bytes      bigint NULL,
  url             text NOT NULL,
  is_public       boolean NOT NULL DEFAULT false,
  uploader_user_id uuid NULL REFERENCES public.users(id) ON DELETE SET NULL,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS observation_attachments_observation_id_idx
  ON public.observation_attachments (observation_id);

CREATE INDEX IF NOT EXISTS observation_attachments_kind_idx
  ON public.observation_attachments (kind);

COMMENT ON TABLE public.observation_attachments IS
  'Files attached to an observation post: documents, research papers, field reports.';

COMMENT ON COLUMN public.observation_attachments.kind IS
  'document | research | report. A closed set so the client renders per-kind icons.';

COMMENT ON COLUMN public.observation_attachments.url IS
  'Root-relative or absolute URL serving the file. The bytes are never stored in PostgreSQL.';

-- RLS: the attachment table follows observation_media. Readers reach public
-- attachments through the post detail endpoint; this table is never queried
-- directly by the client.
ALTER TABLE public.observation_attachments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "attachments_owner_all" ON public.observation_attachments
  USING (
    uploader_user_id = auth.uid() OR
    EXISTS (
      SELECT 1 FROM public.observations o WHERE o.id = observation_id AND o.owner_user_id = auth.uid()
    )
  );

CREATE POLICY "attachments_public_read" ON public.observation_attachments
  USING (is_public = true)
  FOR SELECT;