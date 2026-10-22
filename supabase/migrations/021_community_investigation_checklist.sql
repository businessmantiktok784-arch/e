-- 021_community_investigation_checklist.sql
-- Community investigations: an evidence checklist the community can check off.
--
-- An investigation may carry a short list of evidence requests the opener
-- writes (for example "a clear close-up of a fresh surface" or "the location
-- written down"). Other contributors can then check off the items they can
-- provide. A check is a statement of availability, never a verdict: it does not
-- verify the investigation and does not climb the evidence ladder on its own.
--
-- Two notes on intent:
--
--   * `checklist` is stored as jsonb (an ordered array of {id, text}) rather
--     than a child table. The requests are fixed when the investigation is
--     opened and each check row references one item by its stable id, so a
--     single ordered array keeps the list legible without a join.
--   * item ids are positional ("item-1", "item-2", ...). They are stable while
--     the list is unchanged, which is what a check needs; editing the list
--     regenerates it, so checks for removed or reordered items no longer match.
--
-- Deployment note: this migration only adds schema. Demo mode keeps the list
-- and checks in process memory and needs no database.

-- ----------------------------------------------------------------------------
-- Investigations: the opener's evidence checklist
-- ----------------------------------------------------------------------------
ALTER TABLE public.community_investigations
  ADD COLUMN IF NOT EXISTS checklist jsonb NOT NULL DEFAULT '[]'::jsonb;

COMMENT ON COLUMN public.community_investigations.checklist IS
  'Ordered evidence requests the opener wrote, as an array of {id, text}. Empty when the opener listed none.';

-- ----------------------------------------------------------------------------
-- Community investigation checks (spec: evidence checklist)
-- ----------------------------------------------------------------------------
-- One check per anonymous contributor per item. Enforced by the database, not
-- by application convention, so re-checking cannot inflate the count.
CREATE TABLE IF NOT EXISTS public.community_investigation_checks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  investigation_id uuid NOT NULL
    REFERENCES public.community_investigations(id) ON DELETE CASCADE,
  item_id text NOT NULL,
  contributor_hash text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT community_investigation_checks_one_per_contributor
    UNIQUE (investigation_id, item_id, contributor_hash)
);

CREATE INDEX IF NOT EXISTS idx_community_investigation_checks_investigation
  ON public.community_investigation_checks (investigation_id);
CREATE INDEX IF NOT EXISTS idx_community_investigation_checks_contributor
  ON public.community_investigation_checks (contributor_hash);

ALTER TABLE public.community_investigation_checks ENABLE ROW LEVEL SECURITY;
