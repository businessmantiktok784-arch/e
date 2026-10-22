-- 025_remove_demo_investigation_0009.sql
-- Removes a stray demonstration investigation, ET-INV-DEMO-0009, that was opened
-- while exercising the community feed and should not be on display.
--
-- Its child rows (votes, evidence, checklist checks, questions and media) all
-- reference the investigation with ON DELETE CASCADE, so deleting the parent
-- removes them too.
--
-- Written as a targeted, idempotent delete: if the row is already gone this is
-- simply a no-op.

DELETE FROM public.community_investigations
WHERE public_id = 'ET-INV-DEMO-0009';
