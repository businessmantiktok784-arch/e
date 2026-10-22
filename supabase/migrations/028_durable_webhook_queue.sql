-- 028_durable_webhook_queue.sql
-- Durable inbound-event queue and explicit message-claim states.
--
-- Two problems are fixed here.
--
-- 1. The webhook acknowledged Meta (HTTP 200) and only then started the work in
--    a detached promise. If the process died between the acknowledgement and the
--    work, the event was gone but Meta believed it had been delivered, so it was
--    never retried. A database claim is not a queue: claiming a message id proves
--    "some worker already started", but it does not preserve the event payload
--    for a worker that has not started yet. `webhook_jobs` is that durable queue:
--    the event is written before Meta is acknowledged, and a worker drains it.
--
-- 2. `webhook_message_claims` had only 'processing', 'completed' and 'failed'. A
--    claim that left `processing` without a final write - a rate-limited message,
--    invalid media, or a database-save failure that returned early - stayed
--    `processing` forever. There was no way to tell "still running on a live
--    worker" from "abandoned", so an interrupted message could never be retried
--    and a duplicate could never be distinguished from a stuck one. The claim now
--    carries the full lifecycle plus attempt/lock metadata.

-- =============================================================================
-- 1. Durable job queue
-- =============================================================================

CREATE TABLE IF NOT EXISTS public.webhook_jobs (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  -- The provider's message id. Unique per message, so a redelivery of the same
  -- Meta event cannot enqueue a second job.
  provider_message_id text NOT NULL UNIQUE,
  job_type            text NOT NULL CHECK (job_type IN ('media', 'location', 'text', 'unsupported')),
  -- The full normalized event, so a worker can process it after a restart
  -- without the original HTTP request.
  payload             jsonb NOT NULL DEFAULT '{}'::jsonb,
  status              text NOT NULL DEFAULT 'queued'
    CHECK (status IN ('queued', 'processing', 'completed', 'retryable_failure', 'terminal_failure')),
  attempts            integer NOT NULL DEFAULT 0,
  max_attempts        integer NOT NULL DEFAULT 6,
  -- When the job becomes eligible to run. Backoff pushes this into the future.
  next_attempt_at     timestamptz NOT NULL DEFAULT now(),
  -- Which worker holds the job and since when. `locked_at` is how a stale lock
  -- (a worker that crashed mid-processing) is detected and recovered.
  locked_at           timestamptz NULL,
  locked_by           text NULL,
  -- Human-readable cause of the most recent failure, for operators.
  last_error          text NULL,
  created_at          timestamptz NOT NULL DEFAULT now(),
  updated_at          timestamptz NOT NULL DEFAULT now()
);

-- The worker's hot path: find the next due job. A partial ordering by
-- next_attempt_at keeps the claim query cheap.
CREATE INDEX IF NOT EXISTS idx_webhook_jobs_due
  ON public.webhook_jobs (status, next_attempt_at);

-- Stale-lock recovery scans processing jobs by lock age.
CREATE INDEX IF NOT EXISTS idx_webhook_jobs_locked
  ON public.webhook_jobs (status, locked_at);

COMMENT ON TABLE public.webhook_jobs IS
  'Durable queue of inbound WhatsApp webhook events. Written before Meta is acknowledged so an event survives a crash; drained by workers that may run on any instance.';

COMMENT ON COLUMN public.webhook_jobs.next_attempt_at IS
  'Earliest time the job may run again. A retryable failure sets this to now() + backoff.';

COMMENT ON COLUMN public.webhook_jobs.locked_at IS
  'When the current worker claimed the job. A processing job whose lock is older than the configured timeout is treated as abandoned and recovered.';

ALTER TABLE public.webhook_jobs ENABLE ROW LEVEL SECURITY;

-- Atomically claim the oldest due job for one worker.
--
-- `FOR UPDATE SKIP LOCKED` lets any number of workers run concurrently: each
-- gets a different row, and none blocks on another's lock. The row is marked
-- `processing` and its attempt counter is incremented in the same statement, so
-- two workers can never claim the same job.
CREATE OR REPLACE FUNCTION public.claim_webhook_job(p_worker_id text)
RETURNS SETOF public.webhook_jobs
LANGUAGE plpgsql
AS $$
DECLARE
  v_id uuid;
BEGIN
  SELECT id INTO v_id
    FROM public.webhook_jobs
   WHERE status IN ('queued', 'retryable_failure')
     AND next_attempt_at <= now()
   ORDER BY next_attempt_at ASC
   FOR UPDATE SKIP LOCKED
   LIMIT 1;

  IF v_id IS NULL THEN
    RETURN;
  END IF;

  RETURN QUERY
  UPDATE public.webhook_jobs
     SET status = 'processing',
         locked_at = now(),
         locked_by = p_worker_id,
         attempts = attempts + 1,
         updated_at = now()
   WHERE id = v_id
   RETURNING *;
END;
$$;

COMMENT ON FUNCTION public.claim_webhook_job(text) IS
  'Claims the oldest due webhook job for a worker. Safe to call concurrently from many instances; SKIP LOCKED guarantees each job goes to exactly one worker.';

-- Recover jobs abandoned by a crashed worker.
--
-- A job stuck in `processing` whose lock is older than the stale window is
-- returned to the retryable pool so it is picked up again. It is NOT marked
-- completed or terminal: the worker may have died before any side effect, and a
-- retry is idempotent because observation creation is keyed on the same message
-- id.
CREATE OR REPLACE FUNCTION public.recover_stale_webhook_jobs(p_stale_seconds integer DEFAULT 300)
RETURNS integer
LANGUAGE plpgsql
AS $$
DECLARE
  v_count integer;
BEGIN
  UPDATE public.webhook_jobs
     SET status = 'retryable_failure',
         locked_at = NULL,
         locked_by = NULL,
         last_error = COALESCE(last_error, 'recovered: worker lock expired (likely crash)'),
         next_attempt_at = now(),
         updated_at = now()
   WHERE status = 'processing'
     AND locked_at < now() - make_interval(secs => p_stale_seconds);

  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN v_count;
END;
$$;

COMMENT ON FUNCTION public.recover_stale_webhook_jobs(integer) IS
  'Returns interrupted jobs to the queue after a worker crash. Safe to run on every instance at startup; the lock-age test makes it idempotent.';

-- Operator visibility: counts per status.
CREATE OR REPLACE FUNCTION public.webhook_job_stats()
RETURNS TABLE(status text, job_count bigint, oldest_age_seconds double precision)
LANGUAGE sql
AS $$
  SELECT status,
         COUNT(*)::bigint,
         EXTRACT(EPOCH FROM (now() - COALESCE(MIN(created_at), now())))::double precision
    FROM public.webhook_jobs
   GROUP BY status;
$$;

-- =============================================================================
-- 2. Explicit message-claim lifecycle
-- =============================================================================

ALTER TABLE public.webhook_message_claims
  ADD COLUMN IF NOT EXISTS attempts integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS last_error text NULL,
  ADD COLUMN IF NOT EXISTS next_attempt_at timestamptz NOT NULL DEFAULT now(),
  ADD COLUMN IF NOT EXISTS locked_at timestamptz NULL;

-- Widen the status set. The original CHECK allowed only
-- ('processing','completed','failed'); replace it so a claim can record the
-- reason it stopped and whether a retry is permitted.
DO $$
DECLARE
  v_constraint text;
BEGIN
  SELECT conname INTO v_constraint
    FROM pg_constraint
   WHERE conrelid = 'public.webhook_message_claims'::regclass
     AND contype = 'c'
     AND pg_get_constraintdef(oid) LIKE '%status%'
   LIMIT 1;

  IF v_constraint IS NOT NULL THEN
    EXECUTE format('ALTER TABLE public.webhook_message_claims DROP CONSTRAINT %I', v_constraint);
  END IF;

  ALTER TABLE public.webhook_message_claims
    ADD CONSTRAINT webhook_message_claims_status_check
    CHECK (status IN ('queued', 'processing', 'completed', 'retryable_failure', 'terminal_failure'));
END
$$;

COMMENT ON COLUMN public.webhook_message_claims.status IS
  'Claim lifecycle: queued (registered, not started), processing (a worker holds it), completed (terminal success), retryable_failure (transient, may be re-claimed), terminal_failure (permanent, never retried).';

-- Atomically acquire (or re-acquire) a claim.
--
-- Returns 'claimed' when the caller now owns the message, 'duplicate' when it is
-- already being processed or has reached a terminal state. A retryable_failure
-- may be re-claimed, which is how a transient error is retried without losing the
-- guarantee that two workers never run the same message at once.
CREATE OR REPLACE FUNCTION public.claim_webhook_message(p_message_id text)
RETURNS text
LANGUAGE plpgsql
AS $$
DECLARE
  v_status text;
BEGIN
  SELECT status INTO v_status
    FROM public.webhook_message_claims
   WHERE message_id = p_message_id
   FOR UPDATE;

  IF NOT FOUND THEN
    BEGIN
      INSERT INTO public.webhook_message_claims (message_id, status, attempts, locked_at, updated_at)
      VALUES (p_message_id, 'processing', 1, now(), now());
      RETURN 'claimed';
    EXCEPTION WHEN unique_violation THEN
      -- Another worker inserted the same message between our SELECT and INSERT.
      RETURN 'duplicate';
    END;
  END IF;

  -- Already running, or finished for good: nothing to do.
  IF v_status IN ('processing', 'completed', 'terminal_failure') THEN
    RETURN 'duplicate';
  END IF;

  -- queued or retryable_failure: this caller takes it over.
  UPDATE public.webhook_message_claims
     SET status = 'processing',
         attempts = attempts + 1,
         locked_at = now(),
         updated_at = now()
   WHERE message_id = p_message_id;

  RETURN 'claimed';
END;
$$;

COMMENT ON FUNCTION public.claim_webhook_message(text) IS
  'Acquires or re-acquires a per-message processing claim. Row-locked so concurrent workers cannot both claim the same message.';

-- Recover claims abandoned by a crashed worker.
CREATE OR REPLACE FUNCTION public.recover_stale_webhook_claims(p_stale_seconds integer DEFAULT 300)
RETURNS integer
LANGUAGE plpgsql
AS $$
DECLARE
  v_count integer;
BEGIN
  UPDATE public.webhook_message_claims
     SET status = 'retryable_failure',
         last_error = COALESCE(last_error, 'recovered: worker lock expired (likely crash)'),
         next_attempt_at = now(),
         locked_at = NULL,
         updated_at = now()
   WHERE status = 'processing'
     AND locked_at < now() - make_interval(secs => p_stale_seconds);

  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN v_count;
END;
$$;

COMMENT ON FUNCTION public.recover_stale_webhook_claims(integer) IS
  'Returns interrupted message claims to the retryable pool after a worker crash.';
