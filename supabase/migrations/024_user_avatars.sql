-- 024_user_avatars.sql
-- A contributor's own profile photo (My Earth Talk).
--
-- Kept in its own table rather than a column on `users` so that every account
-- lookup (`select('*')` on the hot auth path) stays small; the bytes are only
-- read when an avatar is actually requested. One row per account; a new upload
-- replaces it.
--
-- Bytes are validated by signature in the application before they reach here,
-- and are only ever served back with an image content type.

CREATE TABLE IF NOT EXISTS public.user_avatars (
  user_id        uuid PRIMARY KEY REFERENCES public.users(id) ON DELETE CASCADE,
  mime_type      text NOT NULL,
  content_base64 text NOT NULL,
  byte_size      integer NOT NULL,
  updated_at     timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.user_avatars IS
  'One stored profile image per account. Read only through the avatar endpoint, which serves an image content type.';
