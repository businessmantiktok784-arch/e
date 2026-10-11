-- 016_community_posts.sql
-- Stage 12: community observation posts, WhatsApp-linked accounts, comments,
-- AI questions and answers, and the privacy audit trail.
--
-- Design rules enforced here:
--   * A raw phone number is NEVER stored. Only a one-way salted HMAC hash.
--   * A verification code is NEVER stored in plaintext. Only a scrypt hash.
--   * A session token is NEVER stored in plaintext. Only a SHA-256 hash.
--   * Public identity is `users.public_user_id` (ET-USER-…). Nothing derived
--     from a phone number is ever published.
--   * Comments carry an author user id, never a phone number, never a handle
--     chosen by the client. The author is always resolved server-side.
--   * AI answers are provenance-controlled: `observation_questions.answered_by`
--     records who answered, and an owner edit can never rewrite an AI row.
--   * Demo/test records are flagged `is_demo` and are excluded from research,
--     validation and accuracy accounting by the application layer.

-- ============================================================================
-- 1. USERS AND WHATSAPP IDENTITY
-- ============================================================================

CREATE SEQUENCE IF NOT EXISTS public.user_public_id_seq START WITH 1 INCREMENT BY 1;

CREATE OR REPLACE FUNCTION public.generate_public_user_id()
RETURNS text
LANGUAGE sql
AS $$
  SELECT 'ET-USER-' || upper(lpad(to_hex(nextval('public.user_public_id_seq')), 4, '0'));
$$;

CREATE TABLE IF NOT EXISTS public.users (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  public_user_id text NOT NULL UNIQUE DEFAULT public.generate_public_user_id(),
  -- Optional chosen public name. When null the public identity is the id.
  display_name  text NULL,
  -- One-way salted HMAC of the verified phone number (E.164, no spaces).
  phone_hash    text NOT NULL UNIQUE,
  -- 'whatsapp' when created from a WhatsApp message, 'web' when created by the
  -- website verification flow. Both end at the same row for the same number.
  created_via   text NOT NULL DEFAULT 'web'
                  CHECK (created_via IN ('web', 'whatsapp')),
  -- Demo accounts are synthetic and are never treated as people or research
  -- participants. No demo account is ever created by this schema; the flag
  -- exists so an explicitly labelled demonstration row can be excluded.
  is_demo       boolean NOT NULL DEFAULT false,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now()
);

COMMENT ON COLUMN public.users.phone_hash IS
  'HMAC-SHA256 of the raw phone number. The raw number is never written to this table.';

-- A WhatsApp sender maps to exactly one Earth Talk account. The identity is
-- stored as a one-way hash, so the table cannot be used to recover a number.
CREATE TABLE IF NOT EXISTS public.user_whatsapp_identities (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id       uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  -- HMAC of the WhatsApp sender id / phone number as delivered by the webhook.
  wa_identity_hash text NOT NULL UNIQUE,
  first_seen_at timestamptz NOT NULL DEFAULT now(),
  last_seen_at  timestamptz NOT NULL DEFAULT now(),
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_user_whatsapp_identities_user
  ON public.user_whatsapp_identities (user_id);

-- ============================================================================
-- 2. AUTHENTICATION
-- ============================================================================

-- The code the user typed is compared against `code_hash` (scrypt + per-row
-- salt). `attempts` is incremented on every wrong entry and the row is
-- consumed on success, so a code cannot be replayed.
CREATE TABLE IF NOT EXISTS public.auth_verification_codes (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  phone_hash    text NOT NULL,
  code_hash     text NOT NULL,
  purpose       text NOT NULL DEFAULT 'whatsapp_login'
                  CHECK (purpose IN ('whatsapp_login')),
  expires_at    timestamptz NOT NULL,
  attempts      integer NOT NULL DEFAULT 0,
  max_attempts  integer NOT NULL DEFAULT 5,
  consumed_at   timestamptz NULL,
  requested_ip_hash text NULL,
  delivery      text NULL CHECK (delivery IN ('whatsapp', 'development_console', 'failed')),
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_auth_verification_codes_phone
  ON public.auth_verification_codes (phone_hash, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_auth_verification_codes_expiry
  ON public.auth_verification_codes (expires_at);

CREATE TABLE IF NOT EXISTS public.auth_sessions (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id       uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  token_hash    text NOT NULL UNIQUE,
  expires_at    timestamptz NOT NULL,
  revoked_at    timestamptz NULL,
  last_used_at  timestamptz NOT NULL DEFAULT now(),
  ip_hash       text NULL,
  user_agent_hash text NULL,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_auth_sessions_user
  ON public.auth_sessions (user_id);
CREATE INDEX IF NOT EXISTS idx_auth_sessions_expiry
  ON public.auth_sessions (expires_at);

-- ============================================================================
-- 3. OBSERVATION POST FIELDS
-- ============================================================================

-- The WhatsApp pipeline already writes `observations`. These columns turn that
-- record into a community post without a second, parallel observation table.
ALTER TABLE public.observations
  ADD COLUMN IF NOT EXISTS owner_user_id uuid NULL REFERENCES public.users(id),
  ADD COLUMN IF NOT EXISTS post_title text NULL,
  ADD COLUMN IF NOT EXISTS user_report text NULL,
  ADD COLUMN IF NOT EXISTS is_demo boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS community_updated_at timestamptz NULL;

COMMENT ON COLUMN public.observations.user_report IS
  'What the contributor personally reported. Never presented as AI output or as scientific fact.';
COMMENT ON COLUMN public.observations.is_demo IS
  'True only for labelled demonstration records. Demo rows are excluded from research, validation and accuracy metrics.';

CREATE INDEX IF NOT EXISTS idx_observations_owner
  ON public.observations (owner_user_id);
CREATE INDEX IF NOT EXISTS idx_observations_public_community
  ON public.observations (publication_status, is_demo, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_observations_category_public
  ON public.observations (observation_category, publication_status);

-- Media attached or edited from the website. WhatsApp media remains metadata
-- only (no object storage is wired up), so `content_base64` is NULL for those
-- rows and the API reports the bytes as unavailable rather than inventing a URL.
ALTER TABLE public.observation_media
  ADD COLUMN IF NOT EXISTS caption text NULL,
  ADD COLUMN IF NOT EXISTS media_role text NOT NULL DEFAULT 'field'
    CHECK (media_role IN ('main', 'close_up', 'field', 'context', 'video', 'other')),
  ADD COLUMN IF NOT EXISTS sort_order integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS is_public boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS content_base64 text NULL,
  ADD COLUMN IF NOT EXISTS stored_by_user_id uuid NULL REFERENCES public.users(id),
  ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now();

CREATE INDEX IF NOT EXISTS idx_observation_media_public
  ON public.observation_media (observation_id, is_public, sort_order);

-- ============================================================================
-- 4. AI QUESTIONS AND USER ANSWERS
-- ============================================================================

-- Rows are created by the AI after it analyses an observation and are never
-- deleted when the contributor does not answer: an unanswered question stays
-- visible as an open question. `answered_by` records who actually answered so
-- an AI question can never be presented as if the model answered it itself.
CREATE TABLE IF NOT EXISTS public.observation_questions (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  observation_id uuid NOT NULL REFERENCES public.observations(id) ON DELETE CASCADE,
  question_id   text NOT NULL,
  question      text NOT NULL,
  asked_by      text NOT NULL DEFAULT 'ai' CHECK (asked_by IN ('ai')),
  asked_at      timestamptz NOT NULL DEFAULT now(),
  status        text NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'answered')),
  answer        text NULL,
  answered_at   timestamptz NULL,
  answered_by   text NULL CHECK (answered_by IN ('owner', 'whatsapp_sender', 'system')),
  answered_by_user_id uuid NULL REFERENCES public.users(id),
  -- Public visibility of the question and its answer.
  is_public     boolean NOT NULL DEFAULT true,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT observation_questions_answer_consistency
    CHECK ((status = 'answered') = (answer IS NOT NULL AND answered_at IS NOT NULL))
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_observation_questions_unique
  ON public.observation_questions (observation_id, question_id);
CREATE INDEX IF NOT EXISTS idx_observation_questions_observation
  ON public.observation_questions (observation_id, status);

-- ============================================================================
-- 5. COMMENTS AND REPLIES
-- ============================================================================

-- One table for comments and replies. A reply is a row whose
-- `parent_comment_id` points at the root comment, which keeps thread ordering,
-- counts and moderation in one place instead of two tables that can disagree.
--
-- The key is `passport_id`: the stable public identifier. `observation_id` is
-- nullable because a labelled demonstration post has no row in `observations`
-- and must still be discussable through the same endpoint. Every real post
-- carries both.
CREATE TABLE IF NOT EXISTS public.observation_comments (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  passport_id   text NOT NULL,
  observation_id uuid NULL REFERENCES public.observations(id) ON DELETE CASCADE,
  parent_comment_id uuid NULL REFERENCES public.observation_comments(id) ON DELETE CASCADE,
  author_user_id uuid NOT NULL REFERENCES public.users(id),
  body          text NOT NULL,
  moderation_status text NOT NULL DEFAULT 'visible'
                    CHECK (moderation_status IN ('visible', 'hidden', 'removed')),
  moderation_reason text NULL,
  moderated_by  text NULL,
  moderated_at  timestamptz NULL,
  edited_at     timestamptz NULL,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_observation_comments_passport
  ON public.observation_comments (passport_id, created_at);
CREATE INDEX IF NOT EXISTS idx_observation_comments_observation
  ON public.observation_comments (observation_id, created_at);
CREATE INDEX IF NOT EXISTS idx_observation_comments_parent
  ON public.observation_comments (parent_comment_id);
CREATE INDEX IF NOT EXISTS idx_observation_comments_author
  ON public.observation_comments (author_user_id);
CREATE INDEX IF NOT EXISTS idx_observation_comments_moderation
  ON public.observation_comments (moderation_status, created_at DESC);

-- ============================================================================
-- 6. PRIVACY AUDIT
-- ============================================================================

-- Every public/private transition is recorded. The previous and new value are
-- stored so "who made this public, and when" is always answerable.
CREATE TABLE IF NOT EXISTS public.observation_privacy_audit (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  observation_id uuid NOT NULL REFERENCES public.observations(id) ON DELETE CASCADE,
  actor_user_id uuid NULL REFERENCES public.users(id),
  actor         text NOT NULL,
  previous_privacy text NOT NULL,
  new_privacy   text NOT NULL,
  reason        text NULL,
  created_at    timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_observation_privacy_audit_observation
  ON public.observation_privacy_audit (observation_id, created_at DESC);

ALTER TABLE public.users ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_whatsapp_identities ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.auth_verification_codes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.auth_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.observation_questions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.observation_comments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.observation_privacy_audit ENABLE ROW LEVEL SECURITY;

COMMENT ON TABLE public.observation_comments IS
  'Community discussion on an observation. The author is always a users row resolved from a server-side session, never an identity supplied by the client.';
COMMENT ON TABLE public.auth_verification_codes IS
  'Hashed WhatsApp verification codes with expiry, attempt limits and single use. A plaintext code is never written here.';
