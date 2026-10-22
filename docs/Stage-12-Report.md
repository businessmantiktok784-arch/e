# Stage 12 Report — Community Observation Posts & WhatsApp Sign-in

**Status: Complete** · Backend, frontend, demo content, moderation and tests all land together.
Full regression suite (Stages 2–12 + fake-data audit) passes: **274 assertions, 0 failures**.
`npm run lint` and `npm run build` both pass.

---

## What Stage 12 delivers

The platform can now collect, own and discuss geographic observations as *posts*:

1. **A reader-facing post card** for every public observation. The contributor's own
   words (`user_report`) and the model's interpretation (`ai`) are separate, labelled
   blocks, so a renderer cannot present one as the other. The AI block always carries
   the "preliminary AI-assisted" disclaimer.
2. **WhatsApp verification login.** A six-digit code is delivered over WhatsApp (or the
   dev console), verified, consumed, and exchanged for an opaque `rt_session_`-prefixed
   token stored only as a SHA-256 hash. A phone number is never stored or returned; the
   code is scrypt-hashed, expires, and is attempt-limited. Sessions are revocable.
3. **Ownership + privacy.** Signing in with the same number that submitted an observation
   through WhatsApp claims it once. `publication_status` (public/private) and a location
   precision (exact/approximate/district/private) are resolved server-side per viewer — a
   private post is indistinguishable from a missing one to everyone but its owner.
4. **Questions, discussion, gallery.** AI follow-up questions can be answered by the
   owner (once); comments and threaded replies open after sign-in; the gallery renders
   what is actually stored and honestly reports when a file is metadata only.
5. **MY EARTH TALK dashboard.** The contributor's own posts with editable profile name and
   per-post counts that reflect the post the owner sees (open questions now count fallback
   `questions_for_user` too).
6. **Super-admin moderation.** A two-route queue (`GET /api/admin/community/comments`,
   `PATCH .../:commentId/moderation`) hides/restores/removes a comment while recording the
   actor and reason on the row itself. Demonstration comments are listed read-only and
   refuse to be moderated.
7. **Demonstration content.** 28 `ET-DEMO-` posts, two for each of the 14 categories,
   serve the map, card and discussion on a fresh deployment (`DEMO_POSTS_ENABLED`). Every
   field is `is_demo`, every string says "Demonstration entry: ...", and demo records are
   excluded from research, validation, aggregates, category counts and nearby results.

## Not supplied (deliberately)

- No synthetic users, seed accounts or placeholder reviewer identities. The account store
  starts empty; accounts are created only by a verified code.
- Media object storage is not wired up: WhatsApp submissions keep their metadata, and the
  card reports "not replayable on this deployment" rather than faking a thumbnail.
- A phone number, code, or token is never serialised into any public type or response.

## Files that carry the stage

- Types: `src/types/community-posts.types.ts`, `web/src/types/communityPosts.ts`
- Demo dataset: `src/data/demo-posts.ts`, `src/data/demo-map-records.ts`
- Auth: `src/utils/user-auth.ts`, `src/services/auth.service.ts`, `src/routes/auth.routes.ts`
- Posts: `src/services/community-post.service.ts`, `src/repositories/community-post.repository.ts`,
  `src/routes/posts.routes.ts`, `src/controllers/posts.controller.ts`
- Moderation: `src/routes/admin.routes.ts`, `src/controllers/admin.controller.ts`
- Migration: `supabase/migrations/016_community_posts.sql` (accounts, codes, sessions,
  comments, questions, privacy audit)
- Frontend: `web/src/components/{WhatsAppLoginModal,ObservationSideCard,MyEarthTalkView}.tsx`,
  `web/src/components/MapView.tsx` (category pin markers), `MapLegend.tsx`, `web/src/App.tsx`,
  `web/src/navigation.ts`, `web/src/services/{communityAuth,postsApi}.ts`
- Tests: `tests/stage12.test.ts` (26 assertions), appended to `npm test`

## Honesty rules under test (`tests/stage12.test.ts`)

1. user words vs. AI output never merge; the AI block always carries the disclaimer.
2. session resolution is server-side and non-replayable; a sent code cannot be replayed.
3. a private post is null to everybody but its owner, on every read path.
4. an observation is claimed by its WhatsApp sender once, and claimed by nobody on view.
5. demonstration posts/comments refuse writes (`DEMO_POST_READ_ONLY`,
   `DEMO_COMMENT_READ_ONLY`).
6. moderation travels with its reason and actor; a hidden comment leaves the public
   thread but stays in the queue.

## Verification

- `npm run test` — all 12 test suites green (Stage 2–12 + fake-data audit).
- `npm run lint` — `tsc --noEmit` and `tsc -p web/tsconfig.json --noEmit` pass.
- `npm run build` — vite production build + full typecheck pass.
- Demo map integration verified: 28 demo posts registered, 27 features on the map
  (the `ET-DEMO-0007` private post is excluded with no leaked coordinate), category
  counts remain 0 (real-only policy), detail for `ET-DEMO-0027`/`non_geoscience` served.
- Super-admin queue smoke-checked: 39 demo + real comments, status/passport filtering,
  reason/actor recording, and demo-comment rejection all confirmed.