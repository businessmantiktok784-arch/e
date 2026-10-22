-- 027_webhook_message_claims.sql
-- Durable webhook idempotency (security remediation, Issue E).
--
-- The webhook acknowledges Meta immediately and then processes a media message
-- in the background. Before this table the only duplicate guard was an
-- in-process Map that vanished on restart and was shared by no other instance,
-- so a redelivery after a deploy could run the AI analysis twice and try to
-- create a second observation for the same WhatsApp message.
--
-- This table is the durable claim. A message id is inserted before any expensive
-- work; the primary key makes a second insert fail, which the server reads as
-- "already claimed". The claim survives a restart and is shared across instances.
--
-- `observations.source_message_id` remains the final uniqueness guarantee on the
-- stored record; this table moves the guard in front of the AI call.

CREATE TABLE IF NOT EXISTS public.webhook_message_claims (
  message_id text PRIMARY KEY,
  status     text NOT NULL DEFAULT 'processing'
    CHECK (status IN ('processing', 'completed', 'failed')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_webhook_message_claims_status
  ON public.webhook_message_claims (status);

COMMENT ON TABLE public.webhook_message_claims IS
  'Durable idempotency claims for WhatsApp webhook message ids. Inserted before AI processing; a duplicate insert means the message is already being or has been handled.';

ALTER TABLE public.webhook_message_claims ENABLE ROW LEVEL SECURITY;

-- Prune claims older than the provider retry window; Meta retries for a bounded
-- period, so older claims only accumulate.
CREATE OR REPLACE FUNCTION public.prune_webhook_message_claims(older_than interval DEFAULT '7 days')
RETURNS void
LANGUAGE sql
AS $$
  DELETE FROM public.webhook_message_claims WHERE created_at < now() - older_than;
$$;
