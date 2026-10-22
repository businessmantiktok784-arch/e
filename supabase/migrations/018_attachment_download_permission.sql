-- 018_attachment_download_permission.sql
-- Stage 12 follow-up: per-document download permission.
--
-- The contributor who owns a post decides whether readers may download each
-- attached document or may only preview it (`read only`). The flag defaults to
-- true (downloads allowed) for every existing attachment, matching the current
-- behaviour where attached files are freely readable.

ALTER TABLE public.observation_attachments
  ADD COLUMN IF NOT EXISTS allow_download boolean NOT NULL DEFAULT true;

COMMENT ON COLUMN public.observation_attachments.allow_download IS
  'Whether readers may download the attached file. False means read-only preview.';