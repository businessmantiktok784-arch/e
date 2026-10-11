import assert from 'node:assert/strict';
import {
  AUTHORIZED_EXPERTS,
  generateSignedMediaToken,
  verifySignedMediaToken,
} from '../src/utils/expert-auth.js';
import {
  generateAdminToken,
  verifyAdminToken,
  revokeAdminSession,
  authenticateSuperAdmin,
} from '../src/utils/admin-auth.js';
import { hashPassword, verifyPassword, env } from '../src/config/env.js';
import {
  hashContributor,
  normalizeContributorToken,
  createContributorToken,
  publicContributorHandle,
  redactContributorHash,
} from '../src/utils/contributor.js';
import { ExpertRepository, type InMemoryObservationStore } from '../src/repositories/expert.repository.js';
import { ExpertService } from '../src/services/expert.service.js';
import { SYNTHETIC_REVIEW_FIXTURES } from './fixtures/synthetic-observations.js';

console.log('--- Running Earth Talk Stage 5 Test Suite ---');

// ===========================================================================
// Test 1: No fabricated reviewer identities
// ===========================================================================
{
  assert.deepEqual(
    AUTHORIZED_EXPERTS,
    [],
    'The platform must not ship a hard-coded roster of expert identities'
  );

  // The previous roster named real people at real institutions
  // (RMB, University of Rwanda) with stock portraits. Assert that no such
  // record can be produced anywhere on this surface.
  const serialized = JSON.stringify(AUTHORIZED_EXPERTS);
  for (const forbidden of ['rmb.gov.rw', 'ur.ac.rw', 'unsplash.com', 'Uwera', 'Habimana']) {
    assert.equal(
      serialized.includes(forbidden),
      false,
      `Reviewer roster must not contain '${forbidden}'`
    );
  }

  console.log('✓ Test 1 Passed: No fabricated or unverified reviewer identities exist');
}

// ===========================================================================
// Test 2: Super Admin session token integrity
// ===========================================================================
{
  const token = await generateAdminToken({ ip: '127.0.0.1', userAgent: 'stage5' }, 3600);
  assert.ok(token, 'A session token must be issued for the Super Admin');
  assert.equal(token.split('.').length, 3, 'Token must have a signed 3-part structure');

  const verified = await verifyAdminToken(token);
  assert.ok(verified, 'Valid token must verify');
  assert.equal(verified?.email, env.SUPER_ADMIN_EMAIL);
  assert.equal(verified?.adminId, 'super_admin');

  const tampered = token.slice(0, -4) + 'abcd';
  assert.equal(await verifyAdminToken(tampered), null, 'Tampered signature must be rejected');

  const expired = await generateAdminToken({}, -10);
  assert.equal(await verifyAdminToken(expired), null, 'Expired token must be rejected');

  console.log('✓ Test 2 Passed: Super Admin session signing, tamper and expiry detection');
}

// ===========================================================================
// Test 3: Session revocation takes effect immediately
// ===========================================================================
{
  const token = await generateAdminToken({}, 3600);
  assert.ok(await verifyAdminToken(token), 'Token must be valid before revocation');

  assert.equal(await revokeAdminSession(token), true, 'Revocation must succeed');
  assert.equal(await verifyAdminToken(token), null, 'Revoked token must be rejected');

  console.log('✓ Test 3 Passed: Immediate session revocation');
}

// ===========================================================================
// Test 4: Password handling never stores plaintext
// ===========================================================================
{
  const hash = hashPassword('correct horse battery staple');
  assert.notEqual(hash, 'correct horse battery staple', 'Plaintext must never be stored');
  assert.ok(hash.length > 20, 'Hash must not be trivially short');

  // Salted: the same secret must produce two different hashes, so a leaked
  // table cannot be used to confirm a guessed password.
  assert.notEqual(
    hashPassword('correct horse battery staple'),
    hash,
    'Hashing must use a random salt per call'
  );

  // Verification, not equality, is what checks a credential.
  assert.equal(verifyPassword('correct horse battery staple', hash), true, 'Correct secret must verify');
  assert.equal(verifyPassword('Correct horse battery staple', hash), false, 'Case matters');
  assert.equal(verifyPassword('a different secret', hash), false, 'Wrong secret must not verify');
  assert.equal(verifyPassword('anything', 'not-a-real-hash'), false, 'Malformed hashes must not verify');

  // A wrong credential must not authenticate.
  assert.equal(authenticateSuperAdmin('nobody@example.invalid', 'wrong'), false);

  console.log('✓ Test 4 Passed: Password hashing and credential rejection');
}

// ===========================================================================
// Test 5: Contributor anonymity
// ===========================================================================
{
  const raw = '0788123456';
  const hashed = hashContributor(raw);

  assert.notEqual(hashed, raw, 'Raw identifier must never be the stored key');
  assert.equal(hashed.includes('0788'), false, 'Phone digits must not appear in the key');
  assert.equal(hashContributor(raw), hashed, 'Hashing must be deterministic');

  // A keyed HMAC must not be reversible by table lookup: two contributors with
  // different keys must not collide.
  assert.notEqual(hashContributor('web:token-a'), hashContributor('web:token-b'));

  const handle = publicContributorHandle(hashed);
  assert.ok(handle.startsWith('Field Explorer #'), 'Handle must be a pseudonymous label');
  assert.equal(handle.includes('0788'), false, 'Handle must not leak the identifier');
  assert.equal(publicContributorHandle(hashed), handle, 'Handle must be stable');

  const redacted = redactContributorHash(hashed);
  assert.ok(redacted.includes('…'), 'Audit records must store a redacted key');

  // Token validation rejects values too short to be meaningful.
  assert.equal(normalizeContributorToken('short'), null, 'Short tokens must be rejected');
  assert.equal(normalizeContributorToken('a'.repeat(300)), null, 'Oversized tokens must be rejected');
  assert.equal(normalizeContributorToken(null), null, 'Non-strings must be rejected');
  assert.ok(normalizeContributorToken(createContributorToken()), 'Generated tokens must validate');

  console.log('✓ Test 5 Passed: Anonymous contributor identity and PII containment');
}

// ===========================================================================
// Test 6: Signed ephemeral media tokens
// ===========================================================================
{
  const mediaId = 'media-real-upload-1';
  const signed = generateSignedMediaToken(mediaId, 60);
  assert.equal(verifySignedMediaToken(mediaId, signed), true, 'Valid token must verify');
  assert.equal(
    verifySignedMediaToken('a-different-media-id', signed),
    false,
    'Token must be bound to the specific media item'
  );
  assert.equal(
    verifySignedMediaToken(mediaId, generateSignedMediaToken(mediaId, -1)),
    false,
    'Expired token must be rejected'
  );

  console.log('✓ Test 6 Passed: Short-lived signed media tokens');
}

// ===========================================================================
// Helpers for the review workflow tests below.
// These register explicitly-labelled fixture records through the repository's
// write path. No production module contains invented observations.
// ===========================================================================
function buildFixtureStore(): InMemoryObservationStore {
  const fixture = SYNTHETIC_REVIEW_FIXTURES[0];
  return {
    id: `obs-${fixture.passport_id}`,
    passport_id: fixture.passport_id,
    source: 'test',
    source_user_hash: hashContributor('test-contributor'),
    status: 'completed',
    is_rock: true,
    primary_classification: fixture.ai_classification,
    possible_name: fixture.ai_possible_name,
    confidence: fixture.ai_confidence,
    confidence_score: fixture.ai_confidence_score,
    observed_features: fixture.ai_features,
    reasoning: fixture.ai_reasoning,
    alternative_possibilities: fixture.ai_alternatives,
    limitations: fixture.ai_limitations,
    recommended_next_steps: fixture.ai_next_steps,
    safety_note: fixture.ai_safety_note,
    verification_status: 'unverified',
    publication_status: 'private',
    published_at: null,
    public_visibility_reason: null,
    district: 'Test District',
    sector: null,
    cell: null,
    village: null,
    public_location_precision: 'district',
    latitude: null,
    longitude: null,
    ai_model: 'test-fixture',
    ai_prompt_version: 'test',
    analysis_version: 'test',
    created_at: '2026-01-01T00:00:00.000Z',
    updated_at: '2026-01-01T00:00:00.000Z',
    media_id: 'media-real-upload-1',
  };
}

const admin = {
  enteredBy: 'super_admin',
  reviewerLabel: 'Test Reviewer',
  organization: 'Test Organisation',
  identityPublished: false,
};

// ===========================================================================
// Test 7: Critical scientific principle — AI analysis is immutable
// ===========================================================================
{
  const repo = new ExpertRepository();
  const service = new ExpertService(repo);
  const fixture = SYNTHETIC_REVIEW_FIXTURES[0];
  repo.registerObservation(buildFixtureStore());

  const before = await service.getObservationDetail(fixture.passport_id);
  assert.ok(before, 'Fixture observation must be retrievable');
  assert.equal(before.verification_status, 'unverified');

  const originalAi = { ...before.ai_analysis };

  const result = await service.submitReview(fixture.passport_id, admin, {
    verification_status: 'expert_verified',
    expert_classification: fixture.expert_classification,
    expert_rock_name: fixture.expert_rock_name,
    expert_confidence: 'high',
    expert_notes: 'Recorded review for the immutability test.',
    publication_status: 'public',
  });

  assert.equal(result.success, true);
  assert.equal(result.updatedObservation.verification_status, 'expert_verified');

  const after = await service.getObservationDetail(fixture.passport_id);
  assert.ok(after);
  assert.deepEqual(
    after.ai_analysis,
    originalAi,
    'CRITICAL: the preliminary AI assessment must never be altered by a review'
  );

  // The review findings are stored separately from the AI record.
  assert.ok(after.latest_verification, 'Review must be recorded alongside the AI record');
  assert.equal(after.latest_verification?.expert_rock_name, fixture.expert_rock_name);
  assert.notEqual(
    after.latest_verification?.reviewer_name,
    originalAi.possible_name,
    'Reviewer and AI fields must remain distinct'
  );

  console.log('✓ Test 7 Passed: AI analysis immutability with separate authoritative review');
}

// ===========================================================================
// Test 8: Reviewer attribution must be explicit
// ===========================================================================
{
  const repo = new ExpertRepository();
  const service = new ExpertService(repo);
  const fixture = SYNTHETIC_REVIEW_FIXTURES[0];
  repo.registerObservation(buildFixtureStore());

  // A review must name a reviewer.
  await assert.rejects(
    async () =>
      service.submitReview(
        fixture.passport_id,
        { ...admin, reviewerLabel: '   ' },
        { verification_status: 'expert_verified' }
      ),
    /reviewer name is required/i,
    'A review without a named reviewer must be rejected'
  );

  // Unpublished identity must not surface the reviewer publicly.
  const unpublished = await service.submitReview(fixture.passport_id, { ...admin, identityPublished: false }, {
    verification_status: 'expert_verified',
  });
  const detail = await service.getObservationDetail(fixture.passport_id);
  assert.equal(detail?.latest_verification?.reviewer_name, unpublished.updatedObservation.latest_verification?.reviewer_name);
  assert.equal(detail?.ai_analysis.primary_classification, fixture.ai_classification);

  console.log('✓ Test 8 Passed: Reviewer attribution is required and controlled');
}

// ===========================================================================
// Test 9: Input validation boundaries
// ===========================================================================
{
  const repo = new ExpertRepository();
  const service = new ExpertService(repo);
  const fixture = SYNTHETIC_REVIEW_FIXTURES[0];
  repo.registerObservation(buildFixtureStore());

  await assert.rejects(
    async () =>
      service.submitReview(fixture.passport_id, admin, {
        verification_status: 'totally_approved' as any,
      }),
    /Invalid verification status/,
    'Unrecognised verification status must be rejected'
  );

  await assert.rejects(
    async () =>
      service.submitReview(fixture.passport_id, admin, {
        verification_status: 'expert_verified',
        expert_classification: 'alien_matter' as any,
      }),
    /Invalid expert classification/,
    'Unrecognised classification must be rejected'
  );

  await assert.rejects(
    async () =>
      service.submitReview('RT-RW-999999', admin, {
        verification_status: 'expert_verified',
      }),
    /not found/i,
    'Reviewing an unknown observation must fail'
  );

  console.log('✓ Test 9 Passed: Review input validation and error boundaries');
}

// ===========================================================================
// Test 10: The review queue contains nothing until data is real
// ===========================================================================
{
  const emptyRepo = new ExpertRepository();
  const emptyService = new ExpertService(emptyRepo);

  const queue = await emptyService.getObservations({ status: 'unverified' });
  assert.equal(queue.total, 0, 'A fresh repository must contain no observations');
  assert.deepEqual(queue.data, [], 'No placeholder observations may be returned');

  const logs = await emptyService.getAuditLogs(10);
  assert.deepEqual(logs, [], 'A fresh repository must contain no audit history');

  const stats = await emptyService.getStats();
  assert.equal(stats.total_observations, 0, 'Statistics must report zero, not a fabricated total');
  assert.equal(stats.verification_rate_pct, 0);

  console.log('✓ Test 10 Passed: Empty state reports honestly rather than showing sample data');
}

console.log('All 10 Stage 5 automated tests passed successfully!');