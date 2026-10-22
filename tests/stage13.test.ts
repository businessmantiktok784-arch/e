/**
 * Stage 13 tests: the platform-improvement pass.
 *
 * What is under test here:
 *
 *   1. Reporting grew a humanitarian/community/safety reason, and one reader
 *      cannot flood the moderation queue with the same allegation twice. A
 *      repeat is answered with the existing reference; a different reader, a
 *      different target or an anonymous visitor is unaffected.
 *   2. The threaded discussion keeps working at any depth — a reply to a reply
 *      is still a reply, both in the stored tree and in the rendered thread.
 *   3. The smaller fixes hold: WhatsApp opens on a signed-in user's behalf,
 *      a Field Explorer account is never silently renumbered, and the sidebar
 *      keeps a single, honest log-out in the account menu.
 *
 * These run against the in-memory development stores; no database is required.
 */

import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { readFileSync } from 'node:fs';
import {
  ABUSE_REPORT_REASONS,
  ABUSE_REPORT_REASON_LABEL,
  ABUSE_REPORT_TARGET_TYPES,
  INVESTIGATION_STATUSES,
} from '../src/types/community.types.js';
import type { UserRow } from '../src/types/community-posts.types.js';
import { userRepository } from '../src/repositories/user.repository.js';
import { abuseReportService } from '../src/services/abuse-report.service.js';
import {
  DISPLAY_NAME_EDIT_INTERVAL_MS,
  updateProfile,
} from '../src/services/auth.service.js';
import {
  AVATAR_MAX_BYTES,
  UserAvatarError,
  getAvatarByPublicUserId,
  removeAvatar,
  setAvatar,
} from '../src/services/user-avatar.service.js';

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

function read(path: string): string {
  return readFileSync(path, 'utf8');
}

// -----------------------------------------------------------------------------
section('Reporting: the safety and humanitarian reason');
// -----------------------------------------------------------------------------

await test('safety_principles is a valid report reason with a clear label', () => {
  assert.ok(
    (ABUSE_REPORT_REASONS as readonly string[]).includes('safety_principles'),
    'safety_principles is offered as a reason'
  );
  const label = ABUSE_REPORT_REASON_LABEL.safety_principles;
  assert.ok(label.length > 0, 'the reason has a human label');
  assert.match(label, /humanitarian|community|safety/i);
});

await test('every advertised reason carries a label', () => {
  for (const reason of ABUSE_REPORT_REASONS) {
    assert.ok(
      ABUSE_REPORT_REASON_LABEL[reason]?.length > 0,
      `reason ${reason} has a label`
    );
  }
});

await test('a report filed under the safety reason is recorded offline', async () => {
  const result = await abuseReportService.fileReport({
    targetType: 'comment',
    targetId: `stage13-safety-${Date.now()}`,
    reasonCode: 'safety_principles',
    details: 'Dehumanising language about a community.',
    reporterHash: 'hash-safety-1',
  });
  assert.match(result.report.public_id, /^RPT-/);
  assert.equal(result.report.reason_code, 'safety_principles');
  assert.equal(result.report.status, 'open');
});

// -----------------------------------------------------------------------------
section('Reporting: one reader, one report per target');
// -----------------------------------------------------------------------------

await test('a repeat report returns the existing reference, not a new one', async () => {
  const target = `stage13-dup-${Date.now()}`;
  const first = await abuseReportService.fileReport({
    targetType: 'comment',
    targetId: target,
    reasonCode: 'abusive_content',
    reporterHash: 'hash-dup-1',
  });
  const second = await abuseReportService.fileReport({
    targetType: 'comment',
    targetId: target,
    reasonCode: 'abusive_content',
    reporterHash: 'hash-dup-1',
  });
  assert.equal(second.report.public_id, first.report.public_id, 'the same report is returned');
  assert.match(second.message, /already reported/i);
});

await test('a different reporter may report the same target', async () => {
  const target = `stage13-multi-${Date.now()}`;
  const a = await abuseReportService.fileReport({
    targetType: 'comment',
    targetId: target,
    reasonCode: 'abusive_content',
    reporterHash: 'hash-multi-a',
  });
  const b = await abuseReportService.fileReport({
    targetType: 'comment',
    targetId: target,
    reasonCode: 'abusive_content',
    reporterHash: 'hash-multi-b',
  });
  assert.notEqual(a.report.public_id, b.report.public_id);
});

await test('an anonymous report is never matched against another anonymous one', async () => {
  const target = `stage13-anon-${Date.now()}`;
  const first = await abuseReportService.fileReport({
    targetType: 'comment',
    targetId: target,
    reasonCode: 'other',
  });
  const second = await abuseReportService.fileReport({
    targetType: 'comment',
    targetId: target,
    reasonCode: 'other',
  });
  assert.notEqual(first.report.public_id, second.report.public_id);
});

await test('the duplicate lookup is wired through the repository and controller', () => {
  const repo = read('src/repositories/abuse-report.repository.ts');
  assert.match(repo, /findExistingReport/);
  const controller = read('src/controllers/community.controller.ts');
  assert.match(controller, /reporterHash:\s*contributorOf\(req\)/);
});

await test('the reporter browser token travels with a report and is hashed server-side', () => {
  const api = read('web/src/services/postsApi.ts');
  assert.match(api, /getContributorToken/);
  assert.match(api, /X-Contributor-Token/);
});

await test('migration 022 reconciles the report table and adds the dedup index', () => {
  const sql = read('supabase/migrations/022_abuse_report_safety_and_dedup.sql');
  assert.match(sql, /ADD COLUMN IF NOT EXISTS target_type/);
  assert.match(sql, /DROP CONSTRAINT IF EXISTS community_abuse_reports_single_target/);
  assert.match(sql, /safety_principles/);
  assert.match(sql, /CREATE UNIQUE INDEX IF NOT EXISTS idx_community_abuse_reports_dedup/);
});

// -----------------------------------------------------------------------------
section('Discussion: replies to replies');
// -----------------------------------------------------------------------------

await test('the stored discussion tree attaches a reply to any parent', () => {
  const service = read('src/services/community-post.service.ts');
  assert.match(service, /comment\.parent_comment_id \? byId\.get\(comment\.parent_comment_id\)/);
  assert.match(service, /parent\.replies\.push\(comment\)/);
});

await test('the rendered thread recurses instead of showing one level', () => {
  const card = read('web/src/components/ObservationSideCard.tsx');
  const threadDef = card.indexOf('const CommentThread');
  assert.ok(threadDef > 0, 'CommentThread is defined');
  const afterDef = card.slice(threadDef);
  assert.match(afterDef, /<CommentThread/, 'CommentThread renders CommentThread recursively');
  assert.match(afterDef, /depth \+ 1/, 'nesting depth is tracked');
});

await test('a public-visibility notice sits above the composers', () => {
  const card = read('web/src/components/ObservationSideCard.tsx');
  assert.match(card, /PublicVisibilityNote/);
  assert.match(card, /visible to everyone/);
  const panel = read('web/src/components/MyQuestionsPanel.tsx');
  assert.match(panel, /renderReplies/);
  assert.match(panel, /visible to everyone/);
});

// -----------------------------------------------------------------------------
section('Accounts: the seven-day rename window is enforced on the server');
// -----------------------------------------------------------------------------

const DAY_MS = 24 * 60 * 60 * 1000;

function accountRow(over: Partial<UserRow> = {}): UserRow {
  const now = new Date().toISOString();
  return {
    id: crypto.randomUUID(),
    public_user_id: `ET-USER-${crypto.randomBytes(2).toString('hex')}`,
    display_name: null,
    display_name_updated_at: null,
    phone_hash: `stage13-phone-${crypto.randomUUID()}`,
    created_via: 'web',
    is_demo: false,
    created_at: now,
    updated_at: now,
    ...over,
  };
}

function viewerOf(user: UserRow) {
  return {
    userId: user.id,
    publicUserId: user.public_user_id,
    displayName: user.display_name,
    isDemo: user.is_demo,
  };
}

await test('a rename inside the seven-day window is refused by the server', async () => {
  const user = accountRow({ display_name: 'Old Name', display_name_updated_at: new Date().toISOString() });
  userRepository.registerUser(user);
  const result = await updateProfile(viewerOf(user), 'New Name');
  assert.equal(result.ok, false, 'the rename is refused');
  if (!result.ok) {
    assert.equal(result.code, 'DISPLAY_NAME_LOCKED');
    assert.match(result.error, /7 days/);
  }
});

await test('a rename is allowed once the window has elapsed', async () => {
  const user = accountRow({
    display_name: 'Old Name',
    display_name_updated_at: new Date(Date.now() - (DISPLAY_NAME_EDIT_INTERVAL_MS + DAY_MS)).toISOString(),
  });
  userRepository.registerUser(user);
  const result = await updateProfile(viewerOf(user), 'New Name');
  assert.equal(result.ok, true, 'the rename is allowed after seven days');
  if (result.ok) {
    assert.equal(result.user.display_name, 'New Name');
    assert.ok(result.user.display_name_updated_at, 'the new timestamp is recorded');
  }
});

await test('a first-ever name (never changed) is always allowed', async () => {
  const user = accountRow({ display_name: null, display_name_updated_at: null });
  userRepository.registerUser(user);
  const result = await updateProfile(viewerOf(user), 'First Name');
  assert.equal(result.ok, true);
  if (result.ok) assert.equal(result.user.display_name, 'First Name');
});

await test('saving the same name is a no-op and does not consume the window', async () => {
  const changedAt = new Date().toISOString();
  const user = accountRow({ display_name: 'Keep Me', display_name_updated_at: changedAt });
  userRepository.registerUser(user);
  const result = await updateProfile(viewerOf(user), 'Keep Me');
  assert.equal(result.ok, true, 'an unchanged name is not treated as a rename');
  if (result.ok) assert.equal(result.user.display_name_updated_at, changedAt);
});

await test('the backend reports the window timestamp it enforces', () => {
  const service = read('src/services/auth.service.ts');
  assert.match(service, /DISPLAY_NAME_EDIT_INTERVAL_MS/);
  assert.match(service, /DISPLAY_NAME_LOCKED/);
  const controller = read('src/controllers/auth.controller.ts');
  assert.match(controller, /display_name_updated_at/);
  const migration = read('supabase/migrations/023_user_display_name_edit_window.sql');
  assert.match(migration, /display_name_updated_at/);
});

// -----------------------------------------------------------------------------
section('Accounts: the profile photo');
// -----------------------------------------------------------------------------

/** A buffer the image validator accepts: PNG magic bytes plus plausible length. */
function pngBase64(padding = 200): string {
  const buffer = Buffer.alloc(padding, 0x00);
  Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]).copy(buffer, 0);
  return buffer.toString('base64');
}

await test('a profile photo can be set, served and removed', async () => {
  const user = accountRow({ display_name: 'Photographer' });
  userRepository.registerUser(user);
  const viewer = viewerOf(user);

  const png = pngBase64();
  await setAvatar(viewer, { contentBase64: png, mimeType: 'image/png' });

  const stored = await getAvatarByPublicUserId(user.public_user_id);
  assert.ok(stored, 'the photo is stored');
  assert.equal(stored?.mimeType, 'image/png', 'the detected type is kept');
  assert.equal(stored?.base64, png, 'the bytes round-trip');

  await removeAvatar(viewer);
  assert.equal(await getAvatarByPublicUserId(user.public_user_id), null, 'removal clears it');
});

await test('a file that is not an image is refused', async () => {
  const user = accountRow();
  userRepository.registerUser(user);
  const notAnImage = Buffer.alloc(200, 0x41).toString('base64');
  await assert.rejects(
    () => setAvatar(viewerOf(user), { contentBase64: notAnImage, mimeType: 'image/png' }),
    (err: unknown) => err instanceof UserAvatarError && err.code === 'INVALID_AVATAR'
  );
});

await test('an oversized photo is refused rather than truncated', async () => {
  const user = accountRow();
  userRepository.registerUser(user);
  const big = Buffer.alloc(AVATAR_MAX_BYTES + 1000, 0x00);
  Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]).copy(big, 0);
  await assert.rejects(
    () => setAvatar(viewerOf(user), { contentBase64: big.toString('base64'), mimeType: 'image/png' }),
    (err: unknown) => err instanceof UserAvatarError && err.code === 'AVATAR_TOO_LARGE'
  );
});

await test('the avatar endpoints and public route are wired', () => {
  const authRoutes = read('src/routes/auth.routes.ts');
  assert.match(authRoutes, /\/api\/auth\/avatar/);
  const userRoutes = read('src/routes/user.routes.ts');
  assert.match(userRoutes, /\/api\/users\/:publicUserId\/avatar/);
  const server = read('src/server.ts');
  assert.match(server, /userRouter/);
  const migration = read('supabase/migrations/024_user_avatars.sql');
  assert.match(migration, /user_avatars/);
  const view = read('web/src/components/MyEarthTalkView.tsx');
  assert.match(view, /userAvatarSrc/);
  assert.match(view, /setAvatar/);
});

// -----------------------------------------------------------------------------
section('The map: tilt, rotation and the globe');
// -----------------------------------------------------------------------------

await test('the camera can be tilted continuously, not just 2D or 3D', () => {
  const view = read('web/src/components/MapView.tsx');
  assert.match(view, /handlePitchChange/, 'a pitch handler exists');
  assert.match(view, /aria-label="Map tilt"/, 'the slider is labelled');
  assert.match(view, /type="range"/, 'the control is a slider');
  assert.match(view, /map\.setPitch\(value\)/, 'the slider drives the camera pitch');
});

await test('the map can be rotated both ways and returned to north', () => {
  const view = read('web/src/components/MapView.tsx');
  assert.match(view, /handleRotate\(-45\)/, 'rotate-left calls the handler');
  assert.match(view, /handleRotate\(45\)/, 'rotate-right calls the handler');
  assert.match(view, /aria-label="Rotate left"/, 'the left button is labelled');
  assert.match(view, /aria-label="Rotate right"/, 'the right button is labelled');
  assert.match(view, /aria-label="Reset to north"/, 'the compass resets to north');
});

await test('the map can be switched between the globe and a flat projection', () => {
  const view = read('web/src/components/MapView.tsx');
  assert.match(
    view,
    /setProjection\(\{ type: next \? 'globe' : 'mercator' \}\)/,
    'the projection is actually switched'
  );
  assert.match(view, /handleToggleGlobe/, 'a globe handler exists');
  assert.match(
    view,
    /aria-label=\{globeOn \? 'Switch to the flat map' : 'Switch to the globe'\}/,
    'the globe button announces its state'
  );
});

// -----------------------------------------------------------------------------
section('My Map: the contributor\'s own private map');
// -----------------------------------------------------------------------------

await test('My Map is a signed-in destination in the sidebar', () => {
  const nav = read('web/src/navigation.ts');
  assert.match(nav, /'my-map'/, 'the view is part of AppView');
  assert.match(nav, /id: 'my-map'/, 'it is a nav entry');
  assert.match(nav, /label: 'My Map'/, 'the entry is labelled');
  assert.match(
    nav,
    /id: 'my-map'[\s\S]*?requiresSignIn: true/,
    'it is only offered to a signed-in contributor'
  );
});

await test('My Map renders its own view and fills the viewport like Explore', () => {
  const app = read('web/src/App.tsx');
  assert.match(app, /view === 'my-map'/, 'a render branch exists');
  assert.match(app, /<MyMapView/, 'the view component is mounted');
  assert.match(
    app,
    /const isFullHeightView = isMapView \|\| view === 'my-map'/,
    'the private map is treated as a full-height view'
  );
});

await test('My Map is built only from the owner endpoint and shows private points', () => {
  const view = read('web/src/components/MyMapView.tsx');
  assert.match(view, /fetchMyPosts\(\)/, 'it uses the owner-only endpoint');
  assert.match(view, /geojson=\{null\}/, 'no public observation layer is supplied');
  assert.match(view, /ownOnly/, 'the map is told to show only the owner overlay');
  assert.match(view, /Private/, 'a private post is labelled as private');
});

await test('the map forces the owner overlay on when it is the whole view', () => {
  const map = read('web/src/components/MapView.tsx');
  assert.match(map, /ownOnly\?: boolean/, 'the prop exists');
  assert.match(map, /useState\(ownOnly\)/, 'the overlay starts on in this view');
  assert.match(
    map,
    /!ownOnly && ownerPosts && ownerPosts\.length > 0/,
    'the optional toggle is hidden when the overlay is the view'
  );
});

// -----------------------------------------------------------------------------
section('Investigations: report, evidence and status parity');
// -----------------------------------------------------------------------------

await test('an investigation can be reported, like a question', async () => {
  assert.ok(
    (ABUSE_REPORT_TARGET_TYPES as readonly string[]).includes('investigation'),
    'investigation is an accepted report target'
  );
  const result = await abuseReportService.fileReport({
    targetType: 'investigation',
    targetId: `INV-${Date.now()}`,
    reasonCode: 'misleading_claim',
    details: 'The claim is not supported by what is shown.',
    reporterHash: 'hash-investigation-1',
  });
  assert.equal(result.report.target_type, 'investigation');
  assert.match(result.report.public_id, /^RPT-/);
});

await test('the investigation card offers the report action', () => {
  const view = read('web/src/components/CommunityDiscoveryView.tsx');
  assert.match(view, /targetType="investigation"/, 'it reports as an investigation');
  assert.match(view, /Report this investigation/, 'the control is labelled');
});

await test('evidence can be listed and added from an investigation card', () => {
  const view = read('web/src/components/CommunityDiscoveryView.tsx');
  assert.match(view, /fetchInvestigation/, 'the detail (with evidence) is fetched');
  assert.match(view, /submitEvidence/, 'evidence can be submitted');
  assert.match(view, /Add evidence/, 'the action is offered');
  assert.match(view, /EVIDENCE_TYPE_LABELS/, 'the evidence kind is chosen from labels');
  const api = read('web/src/services/communityApi.ts');
  assert.match(api, /export async function fetchInvestigation/);
  assert.match(api, /export async function submitEvidence/);
});

await test('the web investigation statuses mirror the server exactly', () => {
  const webTypes = read('web/src/types/community.ts');
  for (const status of INVESTIGATION_STATUSES) {
    assert.match(
      webTypes,
      new RegExp(`\\b${status}\\b`),
      `the web type knows the status "${status}"`
    );
  }
});

// -----------------------------------------------------------------------------
section('WhatsApp, accounts and the sidebar');
// -----------------------------------------------------------------------------

await test('openWhatsApp does not lose the handle to the noopener feature', () => {
  const source = read('web/src/services/whatsapp.ts');
  assert.doesNotMatch(source, /noopener,noreferrer/);
  assert.match(source, /opener = null/);
});

await test('a Field Explorer account is never renumbered on re-entry', () => {
  const source = read('web/src/services/localAccount.ts');
  assert.match(source, /if \(existing\) return existing;/);
});

await test('the sidebar keeps one log-out, inside the account menu', () => {
  const source = read('web/src/components/Sidebar.tsx');
  assert.match(source, /accountMenu/);
  assert.match(source, /Log out/);
});

await test('history can drop a single entry', () => {
  const source = read('web/src/services/history.ts');
  assert.match(source, /export function removeHistory/);
  const view = read('web/src/components/HistoryView.tsx');
  assert.match(view, /removeHistory/);
});

// -----------------------------------------------------------------------------
section('Moderation: the report queue is readable and decisions are attributed');
// -----------------------------------------------------------------------------

await test('the queue lists filed reports with a human reason label', async () => {
  const target = `stage13-queue-${Date.now()}`;
  const filed = await abuseReportService.fileReport({
    targetType: 'question',
    targetId: target,
    reasonCode: 'abusive_content',
    reporterHash: 'hash-queue-1',
  });
  const queue = await abuseReportService.listQueue();
  const found = queue.find((item) => item.public_id === filed.report.public_id);
  assert.ok(found, 'the filed report appears in the queue');
  assert.equal(found.reason_label, ABUSE_REPORT_REASON_LABEL.abusive_content);
  assert.equal(found.has_reporter_identity, true);
});

await test('the queue can be filtered by status and rejects an unknown one', async () => {
  const open = await abuseReportService.listQueue('open');
  assert.ok(open.every((item) => item.status === 'open'), 'every row is open');
  await assert.rejects(
    () => abuseReportService.listQueue('not-a-status'),
    (err: unknown) => (err as { code?: string }).code === 'INVALID_STATUS'
  );
});

await test('acknowledging a report records the actor without ending it', async () => {
  const filed = await abuseReportService.fileReport({
    targetType: 'comment',
    targetId: `stage13-ack-${Date.now()}`,
    reasonCode: 'commercial_or_spam',
    reporterHash: 'hash-ack-1',
  });
  const updated = await abuseReportService.resolveReport(
    filed.report.public_id,
    { status: 'acknowledged' },
    'admin@example.com'
  );
  assert.equal(updated.status, 'acknowledged');
  assert.equal(updated.resolved_by, 'admin@example.com');
  assert.equal(updated.resolved_at, null, 'acknowledging is not terminal');
});

await test('actioning a report requires a note and records it', async () => {
  const filed = await abuseReportService.fileReport({
    targetType: 'investigation',
    targetId: `stage13-action-${Date.now()}`,
    reasonCode: 'misleading_claim',
    reporterHash: 'hash-action-1',
  });
  await assert.rejects(
    () => abuseReportService.resolveReport(filed.report.public_id, { status: 'actioned' }, 'admin@example.com'),
    (err: unknown) => (err as { code?: string }).code === 'NOTE_REQUIRED'
  );
  const updated = await abuseReportService.resolveReport(
    filed.report.public_id,
    { status: 'actioned', note: 'Removed the unsupported claim.' },
    'admin@example.com'
  );
  assert.equal(updated.status, 'actioned');
  assert.equal(updated.resolution_note, 'Removed the unsupported claim.');
  assert.ok(updated.resolved_at, 'a terminal decision carries a timestamp');
});

await test('resolving a report that does not exist fails cleanly', async () => {
  await assert.rejects(
    () => abuseReportService.resolveReport('RPT-DOES-NOT-EXIST', { status: 'dismissed', note: 'x' }, 'admin@example.com'),
    (err: unknown) => (err as { code?: string }).code === 'REPORT_NOT_FOUND'
  );
});

await test('the report routes and handlers are registered behind the Super Admin guard', () => {
  const routes = read('src/routes/admin.routes.ts');
  assert.match(routes, /adminRouter\.get\(\s*'\/api\/admin\/community\/reports'/);
  assert.match(routes, /adminRouter\.patch\(/);
  assert.match(routes, /'\/api\/admin\/community\/reports\/:publicId'/);
  assert.match(routes, /requireSuperAdmin/);
  const controller = read('src/controllers/admin.controller.ts');
  assert.match(controller, /getAbuseReports/);
  assert.match(controller, /resolveAbuseReport/);
});

await test('the web admin client and moderation screen consume the routes', () => {
  const api = read('web/src/services/adminApi.ts');
  assert.match(api, /fetchAbuseReports/);
  assert.match(api, /resolveAbuseReport/);
  assert.match(api, /\/api\/admin\/community\/reports/);
  const screen = read('web/src/components/AdminModerationDashboard.tsx');
  assert.match(screen, /fetchAbuseReports/);
  assert.match(screen, /resolveAbuseReport/);
});

await test('moderation is a Super-Admin-only destination wired into the shell', () => {
  const nav = read('web/src/navigation.ts');
  assert.match(nav, /'moderation'/);
  assert.match(nav, /ShieldAlert/);
  const app = read('web/src/App.tsx');
  assert.match(app, /AdminModerationDashboard/);
  assert.match(app, /view === 'moderation'/);
});

// -----------------------------------------------------------------------------
console.log(`\n${'='.repeat(60)}`);
console.log('Stage 13 - Platform improvements');
console.log(`  ${passed} passed, ${failed} failed`);
console.log('='.repeat(60));

if (failed > 0) {
  console.error(`\nLast test: ${currentTest}`);
  process.exit(1);
}
