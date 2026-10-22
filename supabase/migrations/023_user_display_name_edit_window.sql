-- 023_user_display_name_edit_window.sql
-- Records when a verified account last changed its public display name, so the
-- server can enforce the same seven-day window the browser store already
-- applies to local accounts. Previously the window existed only in the client
-- and a verified account could rename without limit.
--
-- Null means the name has never been set by the reader, which is editable.

ALTER TABLE public.users
  ADD COLUMN IF NOT EXISTS display_name_updated_at timestamptz NULL;

COMMENT ON COLUMN public.users.display_name_updated_at IS
  'When the reader last changed their public display name. The name is editable again seven days after this instant; NULL means never changed.';
