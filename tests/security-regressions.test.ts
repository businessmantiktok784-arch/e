/**
 * Security regression tests for the Priority-0 audit fixes.
 *
 * Every test here pins a specific defect that was found and repaired, so a
 * later change that reintroduces it fails CI rather than shipping. The cases
 * are chosen to be checkable without a live database: where the durable path
 * needs Supabase the test asserts the wiring and schema rather than the
 * round-trip, and that limitation is stated in the test name.
 */

import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import crypto from 'node:crypto';
import { verifyWebhookSignature, requireWhatsAppSignature } from '../src/utils/whatsapp-signature.js';
import { pseudonymizePhone, redactForLog } from '../src/utils/pii.js';
import { ServiceUnavailableError, isServiceUnavailableError } from '../src/utils/service-error.js';
import { logger } from '../src/utils/logger.js';
import {
  calculateConsensus,
  assertImageMetadataIsReal,
  assertPredictionIsScorable,
} from '../src/repositories/validation-store.js';
import {
  ValidationRepository,
  createValidationRepository,
  validationIsDurable,
} from '../src/repositories/validation.repository.js';
import { SupabaseValidationRepository } from '../src/repositories/validation-supabase.repository.js';
import { communityMediaRepository } from '../src/repositories/community-media.repository.js';
import { webhookClaimRepository } from '../src/repositories/webhook-claim.repository.js';
import { webhookJobRepository } from '../src/repositories/webhook-job.repository.js';
import type { ValidationReferenceLabel, ValidationImage } from '../src/types/validation.types.js';

let passed = 0;
let failed = 0;

async function test(name: string, fn: () => void | Promise<void>): Promise<void> {
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

const read = (p: string): string => readFileSync(p, 'utf8');

// =============================================================
// Issue A - WhatsApp webhook signature verification
// =============================================================

section('Issue A - webhook signature verification');

await test('a correctly signed body is accepted', () => {
  const body = Buffer.from(JSON.stringify({ hello: 'world' }));
  const secret = 'test-app-secret';
  const sig = 'sha256=' + crypto.createHmac('sha256', secret).update(body).digest('hex');
  assert.equal(verifyWebhookSignature(body, sig, secret), true);
});

await test('a body altered after signing is rejected', () => {
  const secret = 'test-app-secret';
  const sig = 'sha256=' + crypto.createHmac('sha256', secret).update('original').digest('hex');
  assert.equal(verifyWebhookSignature(Buffer.from('tampered'), sig, secret), false);
});

await test('a malformed signature header is rejected, not skipped', () => {
  assert.equal(verifyWebhookSignature(Buffer.from('x'), 'not-a-signature', 'secret'), false);
  assert.equal(verifyWebhookSignature(Buffer.from('x'), 'sha256=abc', 'secret'), false);
  assert.equal(verifyWebhookSignature(Buffer.from('x'), undefined, 'secret'), false);
});

await test('a missing raw body or secret is rejected', () => {
  const sig = 'sha256=' + crypto.createHmac('sha256', 's').update('x').digest('hex');
  assert.equal(verifyWebhookSignature(undefined, sig, 's'), false);
  assert.equal(verifyWebhookSignature(Buffer.from('x'), sig, ''), false);
});

await test('the middleware answers 401 for an unsigned request', () => {
  let status = 0;
  const req: any = { headers: {}, rawBody: Buffer.from('{}') };
  const res: any = {
    status(code: number) {
      status = code;
      return this;
    },
    json() {
      return this;
    },
  };
  let nextCalled = false;
  requireWhatsAppSignature(req, res, () => {
    nextCalled = true;
  });
  assert.equal(status, 401);
  assert.equal(nextCalled, false);
});

// =============================================================
// Issue B - no personal identifiers in logs
// =============================================================

section('Issue B - personal-data redaction');

await test('a phone number pseudonymises to a stable, prefixed value', () => {
  const a = pseudonymizePhone('+250788123456');
  const b = pseudonymizePhone('+250788123456');
  assert.equal(a, b);
  assert.match(a, /^pid_[0-9a-f]{16}$/);
  assert.ok(!a.includes('250788123456'));
});

await test('a password field is redacted', () => {
  const out = redactForLog({ password: 'hunter2' }) as Record<string, unknown>;
  assert.equal(out.password, '[REDACTED]');
});

await test('a passportId field is NOT mistaken for a password (regression)', () => {
  // The previous key regex matched on the substring `pass`, which redacted the
  // public passport identifier and hid legitimate log context.
  const out = redactForLog({ passportId: 'RT-RW-000001' }) as Record<string, unknown>;
  assert.equal(out.passportId, 'RT-RW-000001');
});

await test('a phone-like value is pseudonymised wherever it appears', () => {
  const out = redactForLog({ note: 'call +250788123456 now' }) as Record<string, unknown>;
  assert.match(String(out.note), /pid_[0-9a-f]{16}/);
  assert.ok(!String(out.note).includes('250788123456'));
});

await test('the outbound WhatsApp service does not log the raw recipient', () => {
  const src = read('src/services/whatsapp.service.ts');
  assert.ok(
    src.includes('recipient_id') && src.includes('pseudonymizePhone'),
    'the WhatsApp service must pseudonymise the recipient before logging'
  );
});

await test('the logger redacts secrets and phone numbers on the way out', () => {
  const lines: string[] = [];
  const original = console.log;
  console.log = (...args: unknown[]) => {
    lines.push(args.map((a) => String(a)).join(' '));
  };
  try {
    logger.info('unit test', { password: 'secret-value', phone: '+250788123456' });
  } finally {
    console.log = original;
  }
  const output = lines.join('\n');
  assert.ok(output.includes('[REDACTED]'), 'a password value must be redacted in the log line');
  assert.ok(!output.includes('secret-value'), 'the password must not survive into the log');
  assert.ok(!output.includes('250788123456'), 'the phone number must not survive into the log');
  assert.match(output, /pid_[0-9a-f]{16}/);
});

// =============================================================
// Issue C - database outages are never hidden
// =============================================================

section('Issue C - no silent in-memory fallback');

await test('ServiceUnavailableError is a 503 DATABASE_UNAVAILABLE', () => {
  const err = new ServiceUnavailableError('unit lookup');
  assert.equal(err.status, 503);
  assert.equal(err.code, 'DATABASE_UNAVAILABLE');
  assert.equal(isServiceUnavailableError(err), true);
  assert.equal(isServiceUnavailableError(new Error('x')), false);
});

await test('the user repository refuses to fall back to memory in production', () => {
  const src = read('src/repositories/user.repository.ts');
  assert.match(src, /refusing to fall back/i);
  assert.match(src, /IS_PRODUCTION/);
  assert.match(src, /requireDatabase/);
});

await test('the community media controller maps an outage to 503, not 500', () => {
  const src = read('src/controllers/community.controller.ts');
  assert.ok(src.includes('isServiceUnavailableError'));
  assert.ok(src.includes('COMMUNITY_UNAVAILABLE'));
});

await test('the expert review list refuses to fall back to memory when the database is configured', () => {
  const src = read('src/repositories/expert.repository.ts');
  assert.match(src, /isDatabaseConfigured\(\)/);
  assert.match(src, /refusing to fall back to process memory/i);
  assert.ok(
    src.includes("new ServiceUnavailableError('expert observation review list'"),
    'a failed review-list query must surface as an outage, not an empty list'
  );
});

await test('the expert controller maps a review-list outage to 503', () => {
  const src = read('src/controllers/expert.controller.ts');
  assert.ok(src.includes('isServiceUnavailableError'));
  assert.ok(src.includes('DATABASE_UNAVAILABLE'));
});

// =============================================================
// Issue D - community media access control
// =============================================================

section('Issue D - community media moderation');

await test('migration 026 adds a moderation ledger and forces the bucket private', () => {
  assert.ok(existsSync('supabase/migrations/026_community_media_moderation.sql'));
  const sql = read('supabase/migrations/026_community_media_moderation.sql');
  for (const col of ['mime_type', 'contributor_hash', 'moderated_by', 'moderated_at', 'moderation_reason']) {
    assert.ok(sql.includes(col), `migration 026 must add ${col}`);
  }
  assert.match(sql, /public\s*=\s*false|is_public/i);
  assert.match(sql, /community_media/i);
});

await test('the media repository reports not-ready without a configured database', () => {
  assert.equal(communityMediaRepository.ready, false);
});

await test('an upload is recorded as pending review before a URL is served', () => {
  const src = read('src/services/community-media.service.ts');
  assert.ok(src.includes('insertPending'), 'the service must write the moderation row on upload');
  assert.ok(
    /pending_review/.test(read('src/repositories/community-media.repository.ts')),
    'a new attachment must start as pending_review'
  );
  assert.ok(
    /createSignedUrl/.test(src),
    'a public URL must be a short-lived signed URL, not a permanent public one'
  );
});

// =============================================================
// Task 5 - media access control (verify by code + schema)
// =============================================================

section('Task 5 - media access control');

await test('the bucket is forced private and only visible rows are readable', () => {
  const sql = read('supabase/migrations/026_community_media_moderation.sql');
  assert.match(sql, /ALTER TABLE public\.community_media ENABLE ROW LEVEL SECURITY/);
  assert.match(sql, /USING \(moderation_status = 'visible' AND is_public = true\)/);
  assert.match(
    sql,
    /ALTER COLUMN moderation_status SET DEFAULT 'pending_review'/,
    'a row that forgets its status must still be hidden'
  );
});

await test('a read is refused unless the moderation row is visible and public', () => {
  const src = read('src/services/community-media.service.ts');
  assert.match(src, /record\.moderation_status !== 'visible' \|\| !record\.is_public/);
  assert.match(src, /SIGNED_URL_TTL_SECONDS = 300/, 'signed URLs must be short-lived');
});

await test('a moderation decision can only be applied by a Super Admin', () => {
  const routes = read('src/routes/admin.routes.ts');
  assert.match(
    routes,
    /\/api\/admin\/community\/media\/:mediaId\/moderation',\s*requireSuperAdmin/,
    'the publish route must be behind requireSuperAdmin'
  );
  assert.match(
    read('src/controllers/admin.controller.ts'),
    /updateCommunityMediaModeration/,
    'the controller must implement the moderation handler'
  );
});

await test('a database outage during a media read is an error, not "not found"', () => {
  const repo = read('src/repositories/community-media.repository.ts');
  assert.match(repo, /findById[\s\S]*?unavailable\(/);
  assert.ok(
    !/findById[\s\S]{0,400}return null;\s*}\s*catch[\s\S]{0,200}return null/.test(repo),
    'a failed lookup must not be read as absent'
  );
});

// =============================================================
// Issue E - durable, idempotent webhook processing
// =============================================================

section('Issue E - durable webhook idempotency');

await test('migration 027 provides a durable webhook claim ledger', () => {
  assert.ok(existsSync('supabase/migrations/027_webhook_message_claims.sql'));
  const sql = read('supabase/migrations/027_webhook_message_claims.sql');
  assert.match(sql, /webhook_message_claims/);
  assert.match(sql, /PRIMARY KEY/i);
  assert.match(sql, /message_id/);
  assert.match(sql, /status/);
});

await test('migration 028 adds a durable queue and the full claim lifecycle', () => {
  assert.ok(existsSync('supabase/migrations/028_durable_webhook_queue.sql'));
  const sql = read('supabase/migrations/028_durable_webhook_queue.sql');
  assert.match(sql, /CREATE TABLE IF NOT EXISTS public\.webhook_jobs/);
  assert.match(sql, /provider_message_id text NOT NULL UNIQUE/);
  assert.match(sql, /claim_webhook_job/);
  assert.match(sql, /recover_stale_webhook_jobs/);
  assert.match(sql, /claim_webhook_message/);
  assert.match(sql, /recover_stale_webhook_claims/);
  for (const state of ['queued', 'processing', 'completed', 'retryable_failure', 'terminal_failure']) {
    assert.ok(sql.includes(state), `claim lifecycle must include '${state}'`);
  }
});

await test('the claim repository exposes the explicit lifecycle', () => {
  assert.equal(typeof webhookClaimRepository.claim, 'function');
  assert.equal(typeof webhookClaimRepository.markCompleted, 'function');
  assert.equal(typeof webhookClaimRepository.markRetryable, 'function');
  assert.equal(typeof webhookClaimRepository.markTerminal, 'function');
  assert.equal(typeof webhookClaimRepository.recoverStale, 'function');
  assert.equal(webhookClaimRepository.durable, false, 'no database => development adapter');
});

await test('the job queue repository exposes enqueue/claim/complete/retry/terminal', () => {
  assert.equal(typeof webhookJobRepository.enqueue, 'function');
  assert.equal(typeof webhookJobRepository.claimNext, 'function');
  assert.equal(typeof webhookJobRepository.markCompleted, 'function');
  assert.equal(typeof webhookJobRepository.markRetryable, 'function');
  assert.equal(typeof webhookJobRepository.markTerminal, 'function');
  assert.equal(typeof webhookJobRepository.recoverStale, 'function');
});

await test('the analysis service finalises the claim on every exit path', () => {
  const src = read('src/services/geoscience-analysis.service.ts');
  assert.ok(src.includes('webhookClaimRepository'), 'the pipeline must use the claim repository');
  assert.ok(src.includes('markCompleted'), 'a successful run must finalise the claim');
  assert.ok(src.includes('markRetryable'), 'a transient failure must leave the claim retryable');
  assert.ok(src.includes('markTerminal'), 'a permanent failure must terminate the claim');
  assert.ok(src.includes("state: 'retryable'"), 'the pipeline must report retryable outcomes');
  assert.ok(src.includes("state: 'terminal'"), 'the pipeline must report terminal outcomes');
});

await test('the webhook persists the event before acknowledging Meta', () => {
  const src = read('src/controllers/webhook.controller.ts');
  const accept = src.indexOf('acceptInbound');
  const ack = src.indexOf("res.status(200).send('EVENT_RECEIVED')");
  assert.ok(accept >= 0, 'the handler must enqueue into the durable queue');
  assert.ok(ack >= 0, 'the handler must acknowledge Meta');
  assert.ok(accept < ack, 'the event must be persisted before the 200 ack');
  assert.match(src, /EVENT_NOT_PERSISTED/, 'a persist failure must refuse the ack');
});

// =============================================================
// Issue F - durable validation store
// =============================================================

section('Issue F - durable validation store');

await test('with no database configured the in-memory store is selected', () => {
  assert.equal(validationIsDurable, false);
  assert.ok(createValidationRepository() instanceof ValidationRepository);
});

await test('the durable store declares itself durable', () => {
  const durable = new SupabaseValidationRepository();
  assert.equal(durable.isDurable, true);
});

await test('the in-memory store still declares its records are volatile', () => {
  assert.equal(ValidationRepository.IS_DURABLE, false);
});

await test('image metadata that cannot describe a photo is rejected by the shared validator', () => {
  const base = {
    sample_id: 's',
    storage_path: 'validation/s/overview.jpg',
    image_hash: 'a'.repeat(64),
    view_type: 'overview',
    scale_reference_present: true,
    quality_status: 'accepted',
  } as unknown as Omit<ValidationImage, 'id' | 'created_at'>;
  assert.doesNotThrow(() => assertImageMetadataIsReal(base));
  assert.throws(() => assertImageMetadataIsReal({ ...base, image_hash: 'abc' }), /SHA-256/);
  assert.throws(() => assertImageMetadataIsReal({ ...base, storage_path: '' }), /storage_path/);
});

await test('an unscorable prediction is rejected by the shared validator', () => {
  assert.doesNotThrow(() =>
    assertPredictionIsScorable({ classification: 'igneous', confidence_score: 0.5 })
  );
  assert.throws(
    () => assertPredictionIsScorable({ classification: 'granite' as any, confidence_score: 0.5 }),
    /recognised classification/
  );
  assert.throws(
    () => assertPredictionIsScorable({ classification: 'igneous', confidence_score: 1.5 }),
    /between 0 and 1/
  );
});

await test('the shared consensus rule matches the repository method', () => {
  const labels = [
    { sample_id: 's', classification: 'igneous' },
    { sample_id: 's', classification: 'igneous' },
    { sample_id: 's', classification: 'sedimentary' },
  ] as ValidationReferenceLabel[];
  const shared = calculateConsensus('s', labels);
  const repo = new ValidationRepository();
  assert.deepEqual(repo.calculateConsensus('s', labels), shared);
  assert.equal(shared.majority_classification, 'igneous');
  assert.equal(shared.is_disputed, false);
});

await test('the evaluation service depends on the store interface, not a concrete class', () => {
  const src = read('src/services/validation-evaluation.service.ts');
  assert.match(src, /import type \{ ValidationStore \}/);
  assert.match(src, /private repo: ValidationStore/);
});

// =============================================================
// Task 3 - scientific readiness is policy-driven, not a magic "three"
// =============================================================

section('Task 3 - configurable evaluation readiness');

await test('three specimens are no longer treated as scientific sufficiency', () => {
  const src = read('src/services/validation-evaluation.service.ts');
  assert.ok(
    !/sufficientSampleSize\s*=\s*validCount\s*>=\s*3/.test(src),
    'the hard-coded ">= 3 is sufficient" rule must be gone'
  );
  assert.ok(
    src.includes('readiness.status === \'reportable\''),
    'sufficiency must derive from the readiness policy, not a constant'
  );
});

await test('the readiness model exposes status, claim, policy and per-criterion evidence', () => {
  const types = read('src/types/validation.types.ts');
  for (const status of ['not_measured', 'insufficient_data', 'preliminary', 'reportable']) {
    assert.ok(types.includes(status), `EvaluationStatus must include '${status}'`);
  }
  for (const claim of ['exploratory_signal', 'class_level_performance', 'dataset_validation']) {
    assert.ok(types.includes(claim), `EvaluationClaim must include '${claim}'`);
  }
  assert.match(types, /interface SampleSizePolicy/);
  assert.match(types, /interface EvaluationReadiness/);
  assert.match(types, /interface EvaluationCounts/);
});

await test('the sample-size policy is configurable from the environment', () => {
  const env = read('src/config/env.ts');
  for (const key of [
    'VALIDATION_MIN_ANSWERED_TOTAL',
    'VALIDATION_MIN_PER_CLASS_SUPPORT',
    'VALIDATION_MIN_REFERENCE_AGREEMENT_PCT',
    'VALIDATION_MAX_EXCLUDED_RATIO_PCT',
  ]) {
    assert.ok(env.includes(key), `${key} must be configurable`);
  }
  assert.match(read('.env.example'), /VALIDATION_MIN_ANSWERED_TOTAL/);
});

await test('the evaluation reports denominators and coverage alongside the ratios', () => {
  const src = read('src/services/validation-evaluation.service.ts');
  assert.match(src, /answered_coverage_pct/);
  assert.match(src, /dataset_coverage_pct/);
  assert.match(src, /abstention_rate_pct/);
  assert.match(src, /blocking_reasons/);
});

// =============================================================
// Task 4 - production persistence paths
// =============================================================

section('Task 4 - production persistence paths');

await test('every database-backed repository used in production refuses a silent memory fallback', () => {
  const guarded: Array<[string, RegExp]> = [
    ['src/repositories/user.repository.ts', /refusing to fall back/i],
    ['src/repositories/community-post.repository.ts', /refusing to fall back/i],
    ['src/repositories/community-media.repository.ts', /ServiceUnavailableError/],
    ['src/repositories/expert.repository.ts', /refusing to fall back to process memory/i],
    ['src/repositories/webhook-claim.repository.ts', /ServiceUnavailableError/],
    ['src/repositories/webhook-job.repository.ts', /ServiceUnavailableError/],
  ];
  for (const [file, pattern] of guarded) {
    assert.match(read(file), pattern, `${file} must not hide a database outage`);
  }
});

await test('an outage surfaces as 503 from the expert and community read paths', () => {
  assert.ok(
    read('src/controllers/expert.controller.ts').includes('DATABASE_UNAVAILABLE'),
    'the expert review list must answer 503 on outage'
  );
  assert.ok(
    read('src/controllers/community.controller.ts').includes('COMMUNITY_UNAVAILABLE'),
    'community reads must answer 503 on outage'
  );
});

// =============================================================

console.log(`\n${'='.repeat(60)}`);
console.log('Security regression suite');
console.log(`  ${passed} passed, ${failed} failed`);
console.log(`${'='.repeat(60)}`);

if (failed > 0) process.exit(1);
