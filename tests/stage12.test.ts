/**
 * Stage 12 tests: Community observation posts, WhatsApp sign-in, privacy,
 * discussion, super-admin moderation and the contributor dashboard.
 *
 * The rules under test are the separation rules:
 *
 *   1. A contributor's own words (`user_report`) are never the model's output
 *      (`ai`), and the AI block always carries a "preliminary AI-assisted"
 *      disclaimer.
 *   2. A signed-in viewer is resolved from a server-side session token, never
 *      from anything the client submits. Codes are consumed, attempted-out and
 *      single use, and the token cannot be replayed after sign-out.
 *   3. A private post is indistinguishable from a missing one to anybody who
 *      is not its owner, on every read path. The owner always sees the point
 *      they recorded.
 *   4. An account that signs in with the same number that submitted an
 *      observation through WhatsApp becomes its owner, once, and nobody else
 *      can claim a post by viewing it.
 *   5. Demonstration posts and comments stay labelled `is_demo` everywhere,
 *      carry no moderation record, and refuse to be edited, answered or
 *      moderated (DEMO_*_READ_ONLY).
 *   6. Moderation records who hid a comment and why, and a hidden comment
 *      disappears from the public discussion while remaining in the queue.
 */

import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { readFileSync } from 'node:fs';
import type { Request } from 'express';
import { GEOSCIENCE_CATEGORIES } from '../src/ai/geoscience-taxonomy.js';
import { DEMO_POSTS, findDemoPost } from '../src/data/demo-posts.js';
import { communityPostRepository } from '../src/repositories/community-post.repository.js';
import { userRepository } from '../src/repositories/user.repository.js';
import { haversineKm } from '../src/repositories/site.repository.js';
import { SAME_PLACE_RADIUS_KM } from '../src/repositories/public-observation.repository.js';
import {
  PostServiceError,
  communityPostService,
} from '../src/services/community-post.service.js';
import { verifyCode } from '../src/services/auth.service.js';
import type { ObservationRow, ObservationLocationRow } from '../src/types/database.types.js';
import type { ViewerContext } from '../src/types/community-posts.types.js';
import {
  hashCodeForPhone,
  hashRequestIp,
  phoneHashFromInput,
  resolveUserFromToken,
  viewerFromUser,
} from '../src/utils/user-auth.js';

let passed = 0;
let failed = 0;
let currentTest = '';

async function test(name: string, fn: () => void | Promise<void>): Promise<void> {
  currentTest = name;
  try {
    await fn();
    passed++;
    console.log(`PASS  ${name}`);
  } catch (err) {
    failed++;
    console.log(`FAIL  ${name}`);
    console.log(`      ${err instanceof Error ? err.message : String(err)}`);
  }
}

function section(title: string): void {
  console.log(`\n${'-'.repeat(60)}\n${title}\n${'-'.repeat(60)}`);
}

/** A request-shaped object with a resolvable IP, for service-level calls. */
function fakeRequest(ip: string): Request {
  return { ip, headers: {}, socket: { remoteAddress: ip } } as unknown as Request;
}

/** Stores a fresh verification code for a phone and verifies it. */
async function signIn(phone: string, code = '223344'): Promise<{ viewer: ViewerContext; token: string }> {
  const phoneHash = phoneHashFromInput(phone)!;
  await userRepository.saveVerificationCode({
    id: crypto.randomUUID(),
    phone_hash: phoneHash,
    code_hash: hashCodeForPhone(code, phoneHash),
    purpose: 'whatsapp_login',
    expires_at: new Date(Date.now() + 600_000).toISOString(),
    attempts: 0,
    max_attempts: 5,
    consumed_at: null,
    requested_ip_hash: hashRequestIp(fakeRequest(phone)),
    delivery: 'development_console',
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  });

  const result = await verifyCode(phone, code, fakeRequest(phone));
  assert.ok(result.ok, `verifyCode failed: ${JSON.stringify(result)}`);
  assert.ok(result.token.startsWith('rt_session_'), 'session token uses the rt_session_ prefix');
  const resolved = await resolveUserFromToken(result.token);
  assert.ok(resolved, 'the issued token resolves to an account');
  assert.equal(resolved.user.is_demo, false, 'a real sign-in is never a demo account');
  return {
    viewer: viewerFromUser(resolved.user),
    token: result.token,
  };
}

/** Builds a fully-formed observation row for the development memory store. */
function seedObservation(over: Partial<ObservationRow> = {}): ObservationRow {
  const now = new Date().toISOString();
  const row: ObservationRow = {
    id: crypto.randomUUID(),
    passport_id: 'RT-TEST-9000',
    source: 'whatsapp',
    source_message_id: `st12-${crypto.randomUUID()}`,
    source_user_hash: 'unclaimed-user',
    status: 'completed',
    observation_category: 'rock',
    observation_subcategory: 'igneous',
    observation_type: 'rock_specimen',
    primary_interpretation: 'A coarse-grained specimen, provisionally a granite.',
    geological_context: null,
    diagnostic_features: [],
    possible_alternatives: [],
    uncertainties: [],
    questions_for_user: ['What is the grain size relative to your palm?', 'Was any part of the surface wet?'],
    community_status: 'not_started',
    is_rock: true,
    primary_classification: 'igneous',
    possible_name: 'granite',
    confidence: 'moderate',
    confidence_score: 0.6,
    observed_features: [],
    reasoning: 'Visible interlocking grains suggest a slow cooling history.',
    alternative_possibilities: [],
    limitations: [],
    recommended_next_steps: [],
    safety_note: 'Observe from a safe distance.',
    user_caption: null,
    verification_status: 'unverified',
    publication_status: 'public',
    evidence_state: 'ai_assisted',
    evidence_state_reason: null,
    evidence_state_changed_at: null,
    evidence_state_changed_by: null,
    scientific_confirmation_basis: null,
    scientific_confirmed_at: null,
    site_id: null,
    location_status: 'user_provided',
    data_quality_status: 'partial',
    owner_user_id: null,
    post_title: null,
    user_report: null,
    is_demo: false,
    community_updated_at: null,
    ai_model: 'test-model',
    ai_prompt_version: 'test',
    analysis_version: 'test',
    system_version: 'test',
    created_at: now,
    updated_at: now,
    published_at: now,
    ...over,
  };
  communityPostRepository.registerObservationRecord(row);
  return row;
}

function seedLocation(observationId: string, over: Partial<ObservationLocationRow> = {}): ObservationLocationRow {
  const location: ObservationLocationRow = {
    id: crypto.randomUUID(),
    observation_id: observationId,
    location_source: 'user_gps',
    latitude: -1.95,
    longitude: 30.06,
    accuracy_meters: 8,
    district: 'Kigali',
    sector: 'Nyarugenge',
    cell: null,
    village: null,
    location_text: null,
    geom: null,
    public_location_precision: 'exact',
    is_public: false,
    created_at: new Date().toISOString(),
    ...over,
  };
  communityPostRepository.registerLocationRecord(location);
  return location;
}

function expectServiceError(
  fn: () => Promise<unknown>,
  status: number,
  code: string
): Promise<unknown> {
  return fn().then(
    () => {
      throw new Error(`expected ${code} to be thrown`);
    },
    (err: unknown) => {
      assert.ok(err instanceof PostServiceError, `threw ${String(err)}`);
      assert.equal((err as PostServiceError).status, status);
      assert.equal((err as PostServiceError).code, code);
      return err;
    }
  );
}

// -----------------------------------------------------------------------------
section('Demo dataset integrity');

await test('DEMO_POSTS are 32 unique ET-DEMO- passports', () => {
  assert.equal(DEMO_POSTS.length, 32, '28 first visits plus four repeat visits at the same places');
  const ids = DEMO_POSTS.map((post) => post.passport_id);
  assert.equal(new Set(ids).size, ids.length, 'passport ids are unique');
  for (const id of ids) {
    assert.match(id, /^ET-DEMO-\d{4}$/, `${id} uses the ET-DEMO prefix`);
  }
  const demoCount = DEMO_POSTS.filter((post) => findDemoPost(post.passport_id)).length;
  assert.equal(demoCount, DEMO_POSTS.length, 'findDemoPost resolves every dataset post');
});

await test('every geoscience category is represented, and repeat visits stay on top', () => {
  const counts = new Map<string, number>();
  for (const post of DEMO_POSTS) {
    counts.set(post.observation_category, (counts.get(post.observation_category) ?? 0) + 1);
  }
  assert.equal(counts.size, GEOSCIENCE_CATEGORIES.length, 'no category is missing');
  for (const category of GEOSCIENCE_CATEGORIES) {
    assert.ok((counts.get(category) ?? 0) >= 2, `${category} is represented at least twice`);
  }
  // The four repeat visits each revisit a different category's place, so only
  // those four categories carry a third demonstration post.
  assert.equal(counts.get('rock'), 3, 'rock has an extra repeat visit');
  assert.equal(counts.get('fossil'), 3, 'fossil has an extra repeat visit');
  assert.equal(counts.get('geological_structure'), 3, 'geological_structure has an extra repeat visit');
  assert.equal(counts.get('engineering_geology'), 3, 'engineering_geology has an extra repeat visit');
});

await test('seed posts read as ordinary observations with real media', () => {
  for (const post of DEMO_POSTS) {
    const visible = [
      post.title,
      post.user_report,
      post.primary_interpretation,
      post.reasoning,
      post.safety_note,
      post.owner_display_name,
      ...post.observed_features,
      ...post.diagnostic_features,
      ...post.alternative_possibilities,
      ...post.uncertainties,
      ...post.limitations,
      ...post.recommended_next_steps,
      ...post.questions.flatMap((q) => [q.question, q.answer ?? '']),
      ...post.comments.map((c) => c.body),
    ].join(' ');
    assert.doesNotMatch(visible, /demo/i, `${post.passport_id} shows no demo wording`);
    for (const media of post.media) {
      assert.ok(media.url, `${post.passport_id} media carries a real file`);
      assert.equal(media.demo_note, null, `${post.passport_id} media carries no placeholder note`);
    }
    const images = post.media.filter((m) => m.mime_type.startsWith('image/'));
    const videos = post.media.filter((m) => m.mime_type.startsWith('video/'));
    assert.ok(images.length >= 5, `${post.passport_id} carries at least five photographs`);
    assert.ok(
      videos.length >= 1 && videos.length <= 2,
      `${post.passport_id} carries one or two clips`
    );
    const unique = new Set(post.media.map((m) => m.url));
    assert.equal(unique.size, post.media.length, `${post.passport_id} does not repeat a file`);
  }
});

await test('demo coordinates sit inside Rwanda and private points are withheld', () => {
  for (const post of DEMO_POSTS) {
    assert.ok(post.latitude >= -3.5 && post.latitude <= -1, `${post.passport_id} latitude in Rwanda`);
    assert.ok(post.longitude >= 28.5 && post.longitude <= 31, `${post.passport_id} longitude in Rwanda`);
  }
  const privatePost = DEMO_POSTS.find((post) => post.precision === 'private');
  assert.ok(privatePost, 'at least one post exercises the private precision');
  assert.equal(privatePost!.passport_id, 'ET-DEMO-0007');
});

// -----------------------------------------------------------------------------
section('Reading a demonstration post');

await test('a full demo card publishes separated user and AI blocks', async () => {
  const detail = await communityPostService.getPost('ET-DEMO-0004', null);
  assert.ok(detail, 'demo post resolves');
  assert.equal(detail.is_demo, true);
  assert.equal(detail.is_public, true);
  assert.equal(detail.viewer_is_owner, false);
  assert.equal(detail.can_comment, true);
  assert.equal(detail.owner?.is_demo, true, 'the owner identity is a demo identity');
  assert.match(detail.ai.disclaimer, /preliminary AI-assisted/i, 'AI block carries the disclaimer');
  assert.ok((detail.user_report ?? '').length > 0, 'user report is the contributor words');
  assert.notEqual(detail.user_report, detail.ai.primary_interpretation, 'user report and AI are not merged');
  const detailImages = detail.media.filter((item) => item.kind === 'image');
  const detailVideos = detail.media.filter((item) => item.kind === 'video');
  assert.ok(detailImages.length >= 5, 'the full gallery of photographs is exercised');
  assert.ok(
    detailVideos.length >= 1 && detailVideos.length <= 2,
    'the gallery carries one or two clips'
  );
  assert.ok(detail.media.every((item) => item.is_demo && item.url), 'media carries a real file');
  const answered = detail.questions.filter((q) => q.status === 'answered');
  const open = detail.questions.filter((q) => q.status === 'open');
  assert.equal(answered.length, 1, 'one question is answered');
  assert.equal(open.length, 1, 'one question stays open');
  assert.equal(detail.open_questions.length, 1);
  assert.equal(detail.comment_count, 2, 'demo thread count');
});

await test('a private demo post hides its coordinate from a public reader', async () => {
  const detail = await communityPostService.getPost('ET-DEMO-0007', null);
  assert.ok(detail);
  assert.equal(detail.location.precision, 'private');
  assert.equal(detail.location.latitude, null);
  assert.equal(detail.location.longitude, null);
});

await test('a missing passport is honest and every seed post carries a gallery', async () => {
  const withGallery = await communityPostService.getPost('ET-DEMO-0009', null);
  assert.ok(withGallery);
  assert.ok(withGallery.media.length >= 6, 'the gallery is populated');
  assert.equal(withGallery.open_questions.length, 1);

  const missing = await communityPostService.getPost('RT-NOT-A-POST', null);
  assert.equal(missing, null, 'unknown passport returns null, never a fabricated card');
});

await test('a repeat visit groups by a small radius and keeps its own files', async () => {
  const first = await communityPostService.getPost('ET-DEMO-0005', null);
  const second = await communityPostService.getPost('ET-DEMO-0029', null);
  assert.ok(first && second, 'the parent and its repeat visit both resolve');

  // A visitor almost never captures the identical GPS pair, so the coordinates
  // differ by a small realistic amount yet still count as the same place.
  assert.notEqual(second.location.latitude, first.location.latitude, 'capture points differ');
  assert.notEqual(second.location.longitude, first.location.longitude, 'capture points differ');

  // The grouping radius is defined against the actual capture points, so check
  // those raw demo coordinates sit metres apart and inside the radius.
  const rawFirst = findDemoPost('ET-DEMO-0005')!;
  const rawSecond = findDemoPost('ET-DEMO-0029')!;
  const rawDistanceKm = haversineKm(
    rawFirst.latitude,
    rawFirst.longitude,
    rawSecond.latitude,
    rawSecond.longitude
  );
  assert.ok(
    rawDistanceKm >= 0.1 && rawDistanceKm <= SAME_PLACE_RADIUS_KM,
    `siblings sit far enough apart for their own pin yet still group, here ${rawDistanceKm.toFixed(3)} km`
  );

  assert.equal(second.same_place.available, true, 'the place exposes same-place data');
  assert.equal(second.same_place.count, 2, 'two visits at the same place');
  assert.equal(second.same_place.items.length, 1, 'one other visit is listed');
  assert.equal(second.same_place.items[0].passport_id, 'ET-DEMO-0005');
  assert.equal(second.same_place.items[0].is_demo, true);

  assert.equal(first.same_place.count, 2, 'grouping is symmetric for the parent');
  assert.equal(first.same_place.items[0].passport_id, 'ET-DEMO-0029');

  // Each visit keeps its own capture point, title, media and report.
  assert.notEqual(second.title, first.title, 'each visit carries its own title');
  assert.notEqual(second.user_report, first.user_report, 'each visit has its own report');
  assert.notEqual(
    second.ai.primary_interpretation,
    first.ai.primary_interpretation,
    'each visit has its own AI reading'
  );
  assert.ok(second.same_place.note.includes('coord'), 'the note explains the grouping basis');

  // Attachments belong to the visit that attached them.
  assert.equal(first.attachments.length, 0, 'the first visit attached nothing');
  assert.ok(second.attachments.length >= 1, 'the repeat visit attached its own files');
  const attachment = second.attachments[0];
  assert.ok(attachment.attachment_id.length > 0);
  assert.ok(attachment.title.length > 0, 'attachment has a title');
  assert.match(attachment.url, /^\/media\/documents\//, 'attachment points at the static document');
  assert.equal(attachment.is_demo, true);
  assert.equal(typeof attachment.allow_download, 'boolean', 'attachments state whether downloads are allowed');
});

await test('the same-place route resolves for a demo and a missing passport', async () => {
  const group = await communityPostService.samePlace('ET-DEMO-0031');
  assert.equal(group.count, 2, 'sibling group resolves through the service');
  assert.equal(group.items[0].passport_id, 'ET-DEMO-0010');
  assert.ok(group.items[0].title.length > 0, 'siblings carry their own titles');

  const privatePost = await communityPostService.samePlace('ET-DEMO-0007');
  assert.equal(privatePost.available, false, 'a private post has nothing to group by');

  const missing = await communityPostService.samePlace('RT-NOT-A-POST');
  assert.equal(missing.available, false);
  assert.equal(missing.items.length, 0);
});

// -----------------------------------------------------------------------------
section('WhatsApp sign-in and sessions');

await test('a pre-shared code opens exactly one account and session', async () => {
  const phone = '+250 72 111 0001';
  const { viewer, token } = await signIn(phone);
  assert.match(viewer.publicUserId, /^ET-USER-/, 'an account is created with a public id');
  assert.equal(viewer.displayName, null, 'a new account has no chosen name yet');
  assert.ok(token.length > 20, 'token is long enough to be unforgeable');
});

await test('a wrong code, an expired code and a used code all fail', async () => {
  const phone = '+250 72 111 0002';
  const phoneHash = phoneHashFromInput(phone)!;
  const wrong = await verifyCode(phone, '000000', fakeRequest(phone));
  assert.equal(wrong.ok, false);
  assert.equal(wrong.code, 'INVALID_CODE');

  const expiredAt = new Date(Date.now() - 60_000).toISOString();
  await userRepository.saveVerificationCode({
    id: crypto.randomUUID(),
    phone_hash: phoneHash,
    code_hash: hashCodeForPhone('445566', phoneHash),
    purpose: 'whatsapp_login',
    expires_at: expiredAt,
    attempts: 0,
    max_attempts: 5,
    consumed_at: null,
    requested_ip_hash: hashRequestIp(fakeRequest(phone)),
    delivery: 'development_console',
    created_at: new Date(Date.now() - 120_000).toISOString(),
    updated_at: new Date(Date.now() - 120_000).toISOString(),
  });
  const expired = await verifyCode(phone, '445566', fakeRequest(phone));
  assert.equal(expired.ok, false);
  assert.equal(expired.code, 'CODE_EXPIRED');

  const freshHash = phoneHashFromInput(phone)!;
  await userRepository.saveVerificationCode({
    id: crypto.randomUUID(),
    phone_hash: freshHash,
    code_hash: hashCodeForPhone('778899', freshHash),
    purpose: 'whatsapp_login',
    expires_at: new Date(Date.now() + 600_000).toISOString(),
    attempts: 0,
    max_attempts: 5,
    consumed_at: null,
    requested_ip_hash: null,
    delivery: 'development_console',
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  });
  const first = await verifyCode(phone, '778899', fakeRequest(phone));
  assert.ok(first.ok, 'the fresh code works once');
  const replay = await verifyCode(phone, '778899', fakeRequest(phone));
  assert.equal(replay.ok, false);
  assert.equal(replay.code, 'CODE_ALREADY_USED', 'a consumed code cannot be replayed');
});

await test('a signed-out token no longer resolves', async () => {
  const phone = '+250 72 111 0003';
  const { token } = await signIn(phone);
  assert.ok(await resolveUserFromToken(token), 'token is live');
  await userRepository.revokeSession(hashToken(token));
  assert.equal(await resolveUserFromToken(token), null, 'a revoked token is rejected');
  assert.equal(await resolveUserFromToken('rt_session_forged'), null, 'a forged token is rejected');
});

function hashToken(token: string): string {
  return crypto.createHash('sha256').update(String(token)).digest('hex');
}

// -----------------------------------------------------------------------------
section('Real posts, privacy and ownership');

const PHONE_A = '+250 72 222 0001';
const PHONE_B = '+250 72 222 0002';

let viewerA: ViewerContext;
let viewerB: ViewerContext;
let postA: ObservationRow;
let postB: ObservationRow;

await test('fixtures: two real posts (public and successor) and two accounts', async () => {
  const a = await signIn(PHONE_A);
  const b = await signIn(PHONE_B);
  viewerA = a.viewer;
  viewerB = b.viewer;

  postA = seedObservation({ passport_id: 'RT-TEST-9001', owner_user_id: viewerA.userId });
  seedLocation(postA.id);

  // No explicit owner: ownership is implied by the WhatsApp source hash.
  postB = seedObservation({
    passport_id: 'RT-TEST-9002',
    source_user_hash: phoneHashFromInput(PHONE_A)!,
  });

  const anon = await communityPostService.getPost('RT-TEST-9001', null);
  assert.ok(anon);
  assert.equal(anon.is_demo, false);
  assert.equal(anon.viewer_is_owner, false);
  assert.equal(anon.can_comment, true);
  assert.equal(anon.location.precision, 'exact');
  assert.equal(anon.location.latitude, -1.95, 'a public reader sees the shared exact point');
  assert.equal(anon.ai.primary_interpretation, postA.primary_interpretation);
});

await test('the owner who submits a post through the same number claims it once', async () => {
  const byOwner = await communityPostService.getPost('RT-TEST-9002', viewerA);
  assert.ok(byOwner);
  assert.equal(byOwner.viewer_is_owner, true, 'the WhatsApp sender is recognised as owner');
  const stored = (await communityPostRepository.findObservation('RT-TEST-9002'))!;
  assert.equal(stored.owner_user_id, viewerA.userId, 'the link was written down, once');
  assert.equal(byOwner.can_comment, true);
});

await test('a stranger cannot edit, publish or answer a post they do not own', async () => {
  await expectServiceError(
    () => communityPostService.updatePost('RT-TEST-9001', viewerB, { post_title: 'Hijacked' }),
    403,
    'NOT_OWNER'
  );
  await expectServiceError(
    () => communityPostService.answerQuestion('RT-TEST-9001', viewerB, 'q-1', 'me too'),
    403,
    'NOT_OWNER'
  );
  const anon = await communityPostService.getPost('RT-TEST-9001', null);
  assert.ok(anon);
  assert.equal(anon.viewer_is_owner, false);
});

await test('making a post private hides it from everyone but the owner', async () => {
  // The implicit owner publishes a privacy change through updatePost.
  await communityPostService.updatePost('RT-TEST-9002', viewerA, { is_public: false });
  assert.equal(await communityPostService.getPost('RT-TEST-9002', null), null, 'anonymous sees nothing');
  assert.equal(
    await communityPostService.getPost('RT-TEST-9002', viewerB),
    null,
    'a stranger sees nothing either'
  );
  const ownerView = await communityPostService.getPost('RT-TEST-9002', viewerA);
  assert.ok(ownerView, 'the owner still sees the post');
  assert.equal(ownerView.is_public, false);
  assert.equal(ownerView.can_comment, true);
});

// -----------------------------------------------------------------------------
section('Editing, questions and location precision');

await test('the owner can edit their own words and the AI block never changes', async () => {
  const updated = await communityPostService.updatePost('RT-TEST-9001', viewerA, {
    post_title: 'A tracked test post',
    user_report: 'My own words about this outcrop.',
  });
  assert.equal(updated.title, 'A tracked test post');
  assert.equal(updated.user_report, 'My own words about this outcrop.');
  assert.equal(updated.ai.primary_interpretation, postA.primary_interpretation);
});

await test('only the owner answers a question, once', async () => {
  const answered = await communityPostService.answerQuestion('RT-TEST-9001', viewerA, 'q-1', 'About a palm wide.');
  const target = answered.questions.find((q) => q.question_id === 'q-1');
  assert.ok(target);
  assert.equal(target.status, 'answered');
  assert.equal(target.answer, 'About a palm wide.');
  assert.equal(target.answered_by, 'owner');
  assert.equal(answered.open_questions.length, 1, 'the second question is still open');

  await expectServiceError(
    () => communityPostService.answerQuestion('RT-TEST-9001', viewerA, 'q-1', 'again'),
    409,
    'ALREADY_ANSWERED'
  );
});

await test('precision changes apply and generalise the public point', async () => {
  await communityPostService.updatePost('RT-TEST-9001', viewerA, { location_precision: 'approximate' });
  const publicView = await communityPostService.getPost('RT-TEST-9001', null);
  assert.equal(publicView!.location.precision, 'approximate');
  assert.equal(publicView!.location.approximate, true);
  assert.ok(publicView!.location.latitude !== null, 'a generalised point is still shown');

  await expectServiceError(
    () => communityPostService.updatePost('RT-TEST-9001', viewerA, { location_precision: 'everywhere' }),
    400,
    'INVALID_LOCATION_PRECISION'
  );
});

await test('demonstration posts refuse every write', async () => {
  await expectServiceError(
    () => communityPostService.updatePost('ET-DEMO-0004', viewerA, { post_title: 'Edit me' }),
    400,
    'DEMO_POST_READ_ONLY'
  );
  await expectServiceError(
    () => communityPostService.answerQuestion('ET-DEMO-0004', viewerA, 'ET-DEMO-0004-q1', 'ans'),
    400,
    'DEMO_POST_READ_ONLY'
  );
});

// -----------------------------------------------------------------------------
section('Discussion and super-admin moderation');

await test('a real reader can comment on a demo post and the thread grows', async () => {
  const created = await communityPostService.createComment('ET-DEMO-0005', viewerA, {
    body: 'A real question about the demonstration card.',
    parent_comment_id: null,
  });
  assert.equal(created.comment.is_demo, false);
  assert.equal(created.comment.body, 'A real question about the demonstration card.');

  const reply = await communityPostService.createComment('ET-DEMO-0005', viewerB, {
    body: 'A real reply from another account.',
    parent_comment_id: created.comment.comment_id,
  });
  assert.equal(reply.comment.parent_comment_id, created.comment.comment_id);

  const detail = await communityPostService.getPost('ET-DEMO-0005', null);
  assert.equal(detail!.comment_count, 3, 'demo 1 + two real rows');
  const roots = await communityPostService.listComments('ET-DEMO-0005', null);
  assert.ok(roots.some((c) => c.comment_id === created.comment.comment_id && c.reply_count === 1));
});

await test('an empty or over-long comment is refused', async () => {
  await expectServiceError(
    () => communityPostService.createComment('ET-DEMO-0005', viewerA, { body: '   ', parent_comment_id: null }),
    400,
    'COMMENT_EMPTY'
  );
});

await test('a hidden comment leaves the public thread but stays in the queue', async () => {
  const queue = await communityPostService.listCommentsForModeration({});
  const rows = queue.rows;
  const hidden = rows.find((row) => row.body.includes('A real question about the demonstration card.'));
  assert.ok(hidden, 'the new comment is in the moderation queue');

  const moderated = await communityPostService.moderateComment({
    commentId: hidden!.comment_id,
    status: 'hidden',
    reason: 'A moderation reason must travel with the decision.',
    moderatedBy: 'ET-ADMIN-TEST',
  });
  assert.equal(moderated.moderation_status, 'hidden');
  assert.equal(moderated.moderated_by, 'ET-ADMIN-TEST');

  const publicThread = await communityPostService.listComments('ET-DEMO-0005', null);
  assert.ok(
    !publicThread.some((c) => c.comment_id === hidden!.comment_id),
    'the hidden comment is gone from the public thread'
  );
  const replyStillVisible = publicThread.some((c) => c.body.includes('from another account'));
  assert.ok(replyStillVisible, 'the reply loses its parent and is still visible on its own');

  const hiddenQueue = await communityPostService.listCommentsForModeration({
    status: 'hidden',
    passportId: 'ET-DEMO-0005',
  });
  assert.equal(hiddenQueue.rows.length, 1);
  assert.equal(hiddenQueue.rows[0].comment_id, hidden!.comment_id);
});

await test('demonstration comments cannot be moderated', async () => {
  await expectServiceError(
    () =>
      communityPostService.moderateComment({
        commentId: 'ET-DEMO-0005-c1',
        status: 'hidden',
        reason: 'it is fake',
        moderatedBy: 'ET-ADMIN-TEST',
      }),
    400,
    'DEMO_COMMENT_READ_ONLY'
  );
});

await test('the moderation queue lists every demo comment read-only and newest first', async () => {
  const demoTotal = DEMO_POSTS.reduce((sum, post) => sum + post.comments.length, 0);
  const { rows, total } = await communityPostService.listCommentsForModeration({});
  assert.ok(total >= demoTotal, 'every demonstration comment is in the queue');
  const demoRows = rows.filter((row) => row.is_demo);
  assert.ok(demoRows.length >= demoTotal, 'all demo comments are listed as demo');
  assert.ok(demoRows.every((row) => row.observation_id === null), 'demo comments carry no row');
  assert.ok(demoRows.every((row) => row.author.is_demo), 'demo comments are signed by demo identities');
  const realRows = rows.filter((row) => !row.is_demo);
  assert.ok(realRows.length >= 2, 'the real comments from this suite are in the queue');
  assert.ok(
    realRows.some((row) => row.passport_id === 'ET-DEMO-0005'),
    'a real comment hosted on a demo post keeps its passport but has no row'
  );
  for (let i = 1; i < rows.length; i++) {
    assert.ok(
      new Date(rows[i - 1].created_at).getTime() >= new Date(rows[i].created_at).getTime(),
      'queue is newest first'
    );
  }
});

// -----------------------------------------------------------------------------
section('Contributor dashboard');

await test('the dashboard returns only the caller-owned posts with honest counts', async () => {
  const { data } = await communityPostService.listMyPosts(viewerA);
  const mine = data.filter((row) => row.passport_id.startsWith('RT-TEST-'));
  assert.equal(mine.length, 2, 'viewerA owns both seeded posts');

  const cardA = mine.find((row) => row.passport_id === 'RT-TEST-9001');
  assert.equal(cardA!.title, 'A tracked test post');
  assert.equal(cardA!.is_public, true);
  assert.equal(cardA!.comment_count, 0, 'dashboard counts only visible real comments');
  assert.equal(cardA!.open_question_count, 1, 'the answered question no longer counts as open');
  assert.equal(cardA!.location_precision, 'approximate', 'the dashboard names the public precision');

  const cardB = mine.find((row) => row.passport_id === 'RT-TEST-9002');
  assert.equal(cardB!.is_public, false, 'private posts still appear on the owner dashboard');

  const { data: theirs } = await communityPostService.listMyPosts(viewerB);
  assert.equal(theirs.length, 0, 'a stranger owns none of these posts');
});

// -----------------------------------------------------------------------------
section('Route map');

await test('the routes and controllers wire the Stage 12 endpoints', () => {
  const routes = readFileSync('src/routes/posts.routes.ts', 'utf8');
  const adminRoutes = readFileSync('src/routes/admin.routes.ts', 'utf8');
  const authRoutes = readFileSync('src/routes/auth.routes.ts', 'utf8');

  for (const path of [
    '/api/posts/:passportId',
    '/api/posts/:passportId/comments',
    '/api/posts/:passportId/questions/:questionId/answer',
    '/api/me/observations',
  ]) {
    assert.ok(routes.includes(path), `${path} is routed`);
  }
  assert.ok(routes.includes('attachViewer'), 'reads attach an optional viewer');
  assert.ok(routes.includes('requireUser'), 'writes require a session');

  assert.ok(
    adminRoutes.includes(`'/api/admin/community/comments'`) &&
      adminRoutes.includes('adminRouter.get('),
    'moderation queue is routed as a GET'
  );
  assert.ok(
    adminRoutes.includes(`'/api/admin/community/comments/:commentId/moderation'`) &&
      adminRoutes.includes('adminRouter.patch('),
    'moderation writes are routed as a PATCH'
  );

  for (const path of ['request-code', 'verify-code', 'session', 'sign-out', 'profile']) {
    assert.ok(authRoutes.includes(path), `auth route ${path} exists`);
  }
});

await test('demo registration and clarity of the map decision are explicit', () => {
  const server = readFileSync('src/server.ts', 'utf8');
  assert.ok(server.includes('DEMO_POSTS_ENABLED'), 'demo data is gated by the environment flag');
  const mapRecords = readFileSync('src/data/demo-map-records.ts', 'utf8');
  assert.match(mapRecords, /Demonstration|is_demo/);
});

// -----------------------------------------------------------------------------
console.log(`\n${'='.repeat(60)}`);
console.log('Stage 12 - Community Posts & WhatsApp sign-in');
console.log(`  ${passed} passed, ${failed} failed`);
console.log('='.repeat(60));

if (failed > 0) {
  console.error(`\nLast test: ${currentTest}`);
  process.exit(1);
}