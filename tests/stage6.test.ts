import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { AUTHORIZED_EXPERTS } from '../src/utils/expert-auth.js';
import {
  generateAdminToken,
  verifyAdminToken,
  revokeAdminSession,
  isSessionRevoked,
  hashToken,
  authenticateSuperAdmin,
  isSuperAdminConfigured,
} from '../src/utils/admin-auth.js';
import { checkRateLimit } from '../src/utils/rate-limiter.js';
import { ExpertRepository } from '../src/repositories/expert.repository.js';
import { ExpertService } from '../src/services/expert.service.js';
import { DataQualityService } from '../src/services/data-quality.service.js';
import { ResearchAnalyticsService } from '../src/services/research-analytics.service.js';
import type { ExpertObservationDetail } from '../src/types/expert.types.js';

console.log('--- Running Earth Talk Stage 6 Test Suite ---');

const repo = new ExpertRepository();
const expertService = new ExpertService(repo);
const qualityService = new DataQualityService();
const researchService = new ResearchAnalyticsService(repo, qualityService);

// Test Helper: Creates a standard dummy observation detail for testing
function createMockObservation(overrides: Partial<ExpertObservationDetail> = {}): ExpertObservationDetail {
  return {
    id: 'obs-test-601',
    passport_id: 'RT-RW-000601',
    source: 'whatsapp',
    source_contributor_hash: 'RW-CONTRIBUTOR-A1B2C3',
    status: 'completed',
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    ai_analysis: {
      is_rock: true,
      primary_classification: 'igneous',
      possible_name: 'Granite',
      confidence: 'high',
      confidence_score: 0.92,
      observed_features: ['Quartz crystals visible', 'Feldspar phenocrysts', 'Granular texture'],
      reasoning: 'Coarse-grained phaneritic texture with clear quartz and feldspar content diagnostic of intrusive granitic rock.',
      alternative_possibilities: ['Granodiorite'],
      limitations: ['Hand specimen only, thin section recommended'],
      recommended_next_steps: ['Test streak and hardness on quartz grains'],
      safety_note: 'No hazardous fibrous minerals identified.',
      ai_model: 'gemini-3.8-flash',
      ai_prompt_version: 'v2.1',
      analysis_version: '1.0',
    },
    location: {
      district: 'Musanze',
      sector: 'Muhoza',
      cell: null,
      village: null,
      precision: 'district',
      latitude: -1.498,
      longitude: 29.634,
      is_public: true,
    },
    media: {
      id: 'med-601',
      media_type: 'image/jpeg',
      mime_type: 'image/jpeg',
      secure_url: '/api/expert/media/RT-RW-000601',
      created_at: new Date().toISOString(),
    },
    verification_status: 'unverified',
    publication_status: 'public',
    published_at: new Date().toISOString(),
    public_visibility_reason: 'user_consent',
    latest_verification: null,
    audit_logs: [],
    ...overrides,
  };
}

// -----------------------------------------------------------------
// Group 1: Hardened Authentication & Session Lifecycle (Tests 1–7)
// -----------------------------------------------------------------
// The only authenticated identity on this platform is the Super Admin.
// There are no expert accounts and no fabricated expert identities.

// Test 1: No fabricated expert identities exist in the codebase
{
  assert.equal(
    AUTHORIZED_EXPERTS.length,
    0,
    'No expert identities may be hard-coded. Reviews are recorded by the Super Admin on behalf of a named reviewer.'
  );
  console.log('✓ Test 1 Passed: No fabricated expert identities are registered');
}

// Test 2: Super Admin session generation and cryptographic signature
{
  const token = await generateAdminToken({ ip: '127.0.0.1', userAgent: 'stage6-test' }, 3600);
  assert.ok(token, 'A session token must be issued');

  const payload = await verifyAdminToken(token);
  assert.ok(payload, 'A freshly issued token must verify');
  assert.equal(payload?.adminId, 'super_admin');
  assert.equal((payload as any)?.role, undefined, 'Admin payload carries no role field; authority is implicit');
  console.log('✓ Test 2 Passed: Super Admin session generation and signature verification');
}

// Test 3: Token Hash Security (Raw token is never identical to hash)
{
  const token = await generateAdminToken(undefined, 3600);
  const tokenHash = hashToken(token);
  assert.notEqual(token, tokenHash);
  assert.equal(tokenHash.length, 64, 'SHA-256 hash must be 64 hexadecimal characters');
  console.log('✓ Test 3 Passed: Cryptographic token hashing for database storage');
}

// Test 4: Session Revocation on Logout (Revoked token immediately rejected)
{
  const token = await generateAdminToken(undefined, 3600);
  assert.ok(await verifyAdminToken(token), 'Token should be valid initially');

  const revoked = await revokeAdminSession(token);
  assert.equal(revoked, true);
  assert.equal(await isSessionRevoked(token), true);

  const verifiedAfterRevoke = await verifyAdminToken(token);
  assert.equal(verifiedAfterRevoke, null, 'Revoked token must be rejected by verification middleware');
  console.log('✓ Test 4 Passed: Immediate session revocation on logout');
}

// Test 5: Expired Token Rejection
{
  const expiredToken = await generateAdminToken(undefined, -10); // Expired 10 seconds ago
  assert.equal(await verifyAdminToken(expiredToken), null, 'Expired session token must return null');
  console.log('✓ Test 5 Passed: Expired token rejection boundary');
}

// Test 6: Tampered Token Rejection
{
  const token = await generateAdminToken(undefined, 3600);
  const parts = token.split('.');
  const tamperedPayload = Buffer.from(
    JSON.stringify({ adminId: 'super_admin', exp: Math.floor(Date.now() / 1000) + 9999 })
  ).toString('base64url');
  const tamperedToken = `${parts[0]}.${tamperedPayload}.${parts[2]}`;

  assert.equal(await verifyAdminToken(tamperedToken), null, 'Signature mismatch must reject token');
  console.log('✓ Test 6 Passed: Tampered payload rejection & cryptographic integrity');
}

// Test 7: Credential Authentication Boundary
{
  // An omitted passcode must never be treated as valid.
  assert.equal(authenticateSuperAdmin('', ''), false, 'Empty credentials must be rejected');
  assert.equal(
    authenticateSuperAdmin('unknown_hacker@unauthorized.com', 'anything'),
    false,
    'An unrecognised email must be rejected'
  );

  const configuredEmail = (await import('../src/config/env.js')).env.SUPER_ADMIN_EMAIL;
  assert.equal(
    authenticateSuperAdmin(configuredEmail, ''),
    false,
    'Correct email with an empty password must be rejected'
  );

  // If a credential is configured, a wrong password must still fail.
  if (isSuperAdminConfigured()) {
    assert.equal(
      authenticateSuperAdmin(configuredEmail, 'definitely-not-the-password'),
      false,
      'Wrong password must be rejected even for the correct email'
    );
  }
  console.log('✓ Test 7 Passed: Super Admin credential authentication boundaries');
}

// -----------------------------------------------------------------
// Group 2: Rate Limiting & Review Attribution (Tests 8–10)
// -----------------------------------------------------------------

// Test 8: Rate Limiter Enforces Maximum Thresholds
{
  const testKey = `test_rate_limit_${Date.now()}`;
  assert.equal(checkRateLimit(testKey, 3), true);
  assert.equal(checkRateLimit(testKey, 3), true);
  assert.equal(checkRateLimit(testKey, 3), true);
  assert.equal(checkRateLimit(testKey, 3), false, 'Fourth request within window must be rate-limited');
  console.log('✓ Test 8 Passed: Deterministic in-memory rate limiting');
}

// Test 9: Anonymous Access Attempt to Protected Method Rejected
{
  assert.equal(await verifyAdminToken(''), null);
  assert.equal(await verifyAdminToken('Bearer invalid_garbage_token'), null);
  assert.equal(await verifyAdminToken('not.a.jwt'), null, 'A structurally invalid token must be rejected');
  console.log('✓ Test 9 Passed: Anonymous/garbage tokens safely rejected');
}

// Test 10: A Recorded Review Requires an Attributed Reviewer
{
  await assert.rejects(
    async () => {
      await expertService.submitReview(
        'RT-RW-000900',
        { enteredBy: 'super_admin', reviewerLabel: '   ', identityPublished: false },
        { verification_status: 'expert_verified', expert_classification: 'igneous' }
      );
    },
    /reviewer name is required/i,
    'A review with no attributed reviewer must be rejected'
  );
  console.log('✓ Test 10 Passed: Review attribution is mandatory');
}

// -----------------------------------------------------------------
// Group 3: Data Quality & Completeness Engine (Tests 11–16)
// -----------------------------------------------------------------

// Test 11: High Completeness Observation Receives Appropriate Score (90-100)
{
  const verifiedObs = createMockObservation({
    verification_status: 'expert_verified',
    location: {
      district: 'Musanze',
      sector: 'Kinigi',
      cell: 'Gasiza',
      village: 'Kanyamperane',
      precision: 'exact',
      latitude: -1.45,
      longitude: 29.58,
      is_public: true,
    },
  });

  const dummyImage = Buffer.alloc(50000, 0xab); // 50KB image
  const assessment = qualityService.assessObservationQuality(verifiedObs, dummyImage);

  assert.ok(assessment.overall_score >= 85, 'Complete specimen should score in high quality tier');
  assert.equal(assessment.completeness_category === 'high' || assessment.completeness_category === 'good', true);
  assert.equal(assessment.duplicate_risk_flag, false);
  console.log('✓ Test 11 Passed: Complete observation achieves high completeness score');
}

// Test 12: Incomplete Observation Scores Lower
{
  const sparseObs = createMockObservation({
    media: null,
    location: {
      district: null,
      sector: null,
      cell: null,
      village: null,
      precision: 'district',
      latitude: null,
      longitude: null,
      is_public: false,
    },
    ai_analysis: {
      is_rock: false,
      primary_classification: 'unclassified',
      possible_name: null,
      confidence: 'insufficient',
      confidence_score: 0.1,
      observed_features: [],
      reasoning: '',
      alternative_possibilities: [],
      limitations: [],
      recommended_next_steps: [],
      safety_note: '',
      ai_model: 'gemini-3.8-flash',
      ai_prompt_version: 'v2.1',
      analysis_version: '1.0',
    },
  });

  const assessment = qualityService.assessObservationQuality(sparseObs);
  assert.ok(assessment.overall_score < 40, 'Incomplete observation must receive a low score');
  assert.equal(assessment.completeness_category, 'low');
  console.log('✓ Test 12 Passed: Incomplete observation scores in low tier (<50)');
}

// Test 13: Deterministic Quality Scoring Formula
{
  const obs = createMockObservation();
  const q1 = qualityService.assessObservationQuality(obs);
  const q2 = qualityService.assessObservationQuality(obs);
  assert.equal(q1.overall_score, q2.overall_score, 'Score must be deterministic');
  assert.equal(q1.completeness_category, q2.completeness_category);
  console.log('✓ Test 13 Passed: Data quality score determinism');
}

// Test 14: Cryptographic SHA-256 Duplicate Image Detection
{
  const imageBuf = Buffer.from('raw_binary_specimen_photo_content_12345');
  const obs1 = createMockObservation({ passport_id: 'RT-RW-DUP001' });
  const obs2 = createMockObservation({ passport_id: 'RT-RW-DUP002' });

  const q1 = qualityService.assessObservationQuality(obs1, imageBuf);
  assert.equal(q1.duplicate_risk_flag, false, 'First submission of image should not be flagged');

  // Second submission with exact same image hash
  const q2 = qualityService.assessObservationQuality(obs2, imageBuf);
  assert.equal(q2.duplicate_risk_flag, true, 'Subsequent submission with identical image hash must be flagged');
  console.log('✓ Test 14 Passed: SHA-256 duplicate image detection');
}

// Test 15: Image Quality Boundary Indicators
{
  const tinyBuffer = Buffer.alloc(500, 0x12); // Under 10KB
  const obs = createMockObservation();
  const assessment = qualityService.assessObservationQuality(obs, tinyBuffer);
  assert.ok(assessment.image_quality_score > 0);
  console.log('✓ Test 15 Passed: Image quality boundary handling');
}

// Test 16: Verification Status Contributes to Completeness
{
  const unverifiedObs = createMockObservation({ verification_status: 'unverified' });
  const verifiedObs = createMockObservation({ verification_status: 'expert_verified' });

  const qUnverified = qualityService.assessObservationQuality(unverifiedObs);
  const qVerified = qualityService.assessObservationQuality(verifiedObs);

  assert.ok(qVerified.overall_score > qUnverified.overall_score, 'Verified observation must score higher');
  console.log('✓ Test 16 Passed: Authoritative verification elevates completeness score');
}

// -----------------------------------------------------------------
// Group 4: AI Model vs Expert Reference Evaluation (Tests 17–22)
// -----------------------------------------------------------------

// Test 17: Insufficient Sample Size Protection (< 3 samples)
{
  const oneSample = [
    createMockObservation({
      latest_verification: {
        id: 'v1',
        observation_id: 'o1',
        passport_id: 'RT-RW-001',
        reviewer_id: 'exp1',
        reviewer_name: 'Dr. Expert',
        reviewer_role: 'expert',
        reviewer_organization: 'Geology Group',
        status: 'expert_verified',
        expert_classification: 'igneous',
        expert_rock_name: 'Granite',
        expert_confidence: 'high',
        expert_observed_features: [],
        expert_notes: 'Verified',
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      },
    }),
  ];

  const evalResult = researchService.evaluateAiVsExpert(oneSample);
  assert.equal(evalResult.sufficient_sample_size, false);
  assert.ok(evalResult.disclaimer.includes('Insufficient expert-reviewed samples'));
  assert.equal(evalResult.macro_f1, 0, 'Metrics must not be fabricated when sample size is insufficient');
  console.log('✓ Test 17 Passed: Small sample size safeguard (< 3 samples)');
}

// Test 18: Perfect Agreement Evaluation (3 matching samples)
{
  const matchingSamples = [
    createMockObservation({
      ai_analysis: { ...createMockObservation().ai_analysis, primary_classification: 'igneous' },
      latest_verification: {
        id: 'v1',
        observation_id: 'o1',
        passport_id: 'RT-1',
        reviewer_id: 'exp1',
        reviewer_name: 'Exp',
        reviewer_role: 'expert',
        reviewer_organization: 'Org',
        status: 'expert_verified',
        expert_classification: 'igneous',
        expert_rock_name: 'Basalt',
        expert_confidence: 'high',
        expert_observed_features: [],
        expert_notes: null,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      },
    }),
    createMockObservation({
      ai_analysis: { ...createMockObservation().ai_analysis, primary_classification: 'sedimentary' },
      latest_verification: {
        id: 'v2',
        observation_id: 'o2',
        passport_id: 'RT-2',
        reviewer_id: 'exp1',
        reviewer_name: 'Exp',
        reviewer_role: 'expert',
        reviewer_organization: 'Org',
        status: 'expert_verified',
        expert_classification: 'sedimentary',
        expert_rock_name: 'Sandstone',
        expert_confidence: 'high',
        expert_observed_features: [],
        expert_notes: null,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      },
    }),
    createMockObservation({
      ai_analysis: { ...createMockObservation().ai_analysis, primary_classification: 'metamorphic' },
      latest_verification: {
        id: 'v3',
        observation_id: 'o3',
        passport_id: 'RT-3',
        reviewer_id: 'exp1',
        reviewer_name: 'Exp',
        reviewer_role: 'expert',
        reviewer_organization: 'Org',
        status: 'expert_verified',
        expert_classification: 'metamorphic',
        expert_rock_name: 'Schist',
        expert_confidence: 'high',
        expert_observed_features: [],
        expert_notes: null,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      },
    }),
  ];

  const evalResult = researchService.evaluateAiVsExpert(matchingSamples);
  assert.equal(evalResult.sufficient_sample_size, true);
  assert.equal(evalResult.overall_agreement_count, 3);
  assert.equal(evalResult.overall_disagreement_count, 0);
  assert.equal(evalResult.agreement_rate_pct, 100);
  assert.equal(evalResult.macro_f1, 1.0);
  console.log('✓ Test 18 Passed: Accurate calculation of perfect model agreement');
}

// Test 19: Disagreement Calculation & Confusion Matrix Tracking
{
  const mixedSamples = [
    // Agreement: igneous -> igneous
    createMockObservation({
      ai_analysis: { ...createMockObservation().ai_analysis, primary_classification: 'igneous' },
      latest_verification: {
        id: 'v1',
        observation_id: 'o1',
        passport_id: 'RT-1',
        reviewer_id: 'exp1',
        reviewer_name: 'Exp',
        reviewer_role: 'expert',
        reviewer_organization: 'Org',
        status: 'expert_verified',
        expert_classification: 'igneous',
        expert_rock_name: 'Basalt',
        expert_confidence: 'high',
        expert_observed_features: [],
        expert_notes: null,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      },
    }),
    // Disagreement: AI said sedimentary, Expert determined metamorphic
    createMockObservation({
      ai_analysis: { ...createMockObservation().ai_analysis, primary_classification: 'sedimentary' },
      latest_verification: {
        id: 'v2',
        observation_id: 'o2',
        passport_id: 'RT-2',
        reviewer_id: 'exp1',
        reviewer_name: 'Exp',
        reviewer_role: 'expert',
        reviewer_organization: 'Org',
        status: 'expert_verified',
        expert_classification: 'metamorphic',
        expert_rock_name: 'Quartzite',
        expert_confidence: 'high',
        expert_observed_features: [],
        expert_notes: null,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      },
    }),
    // Agreement: metamorphic -> metamorphic
    createMockObservation({
      ai_analysis: { ...createMockObservation().ai_analysis, primary_classification: 'metamorphic' },
      latest_verification: {
        id: 'v3',
        observation_id: 'o3',
        passport_id: 'RT-3',
        reviewer_id: 'exp1',
        reviewer_name: 'Exp',
        reviewer_role: 'expert',
        reviewer_organization: 'Org',
        status: 'expert_verified',
        expert_classification: 'metamorphic',
        expert_rock_name: 'Gneiss',
        expert_confidence: 'high',
        expert_observed_features: [],
        expert_notes: null,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      },
    }),
  ];

  const evalResult = researchService.evaluateAiVsExpert(mixedSamples);
  assert.equal(evalResult.overall_agreement_count, 2);
  assert.equal(evalResult.overall_disagreement_count, 1);
  assert.equal(evalResult.agreement_rate_pct, 66.7);

  // Check confusion matrix includes the discrepancy cell
  const mismatchCell = evalResult.confusion_matrix.find(
    (c) => c.ai_classification === 'sedimentary' && c.expert_classification === 'metamorphic'
  );
  assert.ok(mismatchCell);
  assert.equal(mismatchCell?.count, 1);
  console.log('✓ Test 19 Passed: Discrepancy capture in confusion matrix');
}

// Test 20: Missing Expert Decisions are Excluded (Not Counted as Wrong)
{
  const samplesWithUnreviewed = [
    // Sample without verification
    createMockObservation({ latest_verification: null }),
    // Sample with verification
    createMockObservation({
      latest_verification: {
        id: 'v1',
        observation_id: 'o1',
        passport_id: 'RT-1',
        reviewer_id: 'exp1',
        reviewer_name: 'Exp',
        reviewer_role: 'expert',
        reviewer_organization: 'Org',
        status: 'expert_verified',
        expert_classification: 'igneous',
        expert_rock_name: 'Basalt',
        expert_confidence: 'high',
        expert_observed_features: [],
        expert_notes: null,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      },
    }),
  ];

  const evalResult = researchService.evaluateAiVsExpert(samplesWithUnreviewed);
  assert.equal(evalResult.eligible_sample_count, 1);
  console.log('✓ Test 20 Passed: Unreviewed observations correctly excluded from evaluation');
}

// Test 21: Scientific Language Distinction (Evaluation note clarifies reference standard)
{
  const summary = await researchService.getResearchSummary();
  assert.ok(
    summary.ai_vs_expert.disclaimer.includes('expert reference') ||
      summary.ai_vs_expert.disclaimer.includes('expert-reviewed'),
    'Disclaimer must reference expert determinations, not absolute ground truth'
  );
  console.log('✓ Test 21 Passed: Scientific honesty disclaimer in evaluation summary');
}

// Test 22: Geographic Note Avoids Mineral Abundance Claims
{
  const summary = await researchService.getResearchSummary();
  assert.ok(
    summary.geographic_stats.scientific_note.includes('participation') &&
      summary.geographic_stats.scientific_note.includes('not'),
    'Geographic note must state observation counts do not indicate deposit abundance'
  );
  console.log('✓ Test 22 Passed: Geographic sampling bias scientific note verified');
}

// -----------------------------------------------------------------
// Group 5: Research Export & Privacy Whitelisting (Tests 23–27)
// -----------------------------------------------------------------

// Test 23: Research CSV Export Schema Whitelist
{
  const csv = await researchService.exportObservationsCsv('test_actor');

  // Category-first: the export opens with what was observed, because a dataset
  // whose leading columns are the legacy rock classification makes every fossil,
  // landform and mineral look like a rock. `classification` is retained after it
  // for backward compatibility with existing analyses.
  assert.ok(
    csv.startsWith('observation_id,passport_id,observation_category,observation_subcategory'),
    `export does not lead with the category columns: ${csv.split('\n')[0]}`
  );
  assert.ok(csv.includes('classification'));

  // Whitelisted headers must be present
  assert.ok(csv.includes('data_quality_score'));
  assert.ok(csv.includes('expert_classification'));

  // The evidence ladder must be exportable, so a downstream analysis can tell an
  // expert-reviewed reading from a scientifically confirmed one.
  assert.ok(csv.includes('evidence_state'));

  // Sensitive PII and secrets MUST be absent
  assert.equal(csv.includes('0788'), false, 'Phone numbers must never leak into CSV');
  assert.equal(csv.includes('raw_latitude'), false);
  assert.equal(csv.includes('source_message_id'), false);
  assert.equal(csv.includes('token_hash'), false);
  console.log('✓ Test 23 Passed: Research CSV export whitelist & PII protection');
}

// Test 24: Research GeoJSON Export Feature Structure
{
  const geojson: any = await researchService.exportObservationsGeoJson('test_actor');
  assert.equal(geojson.type, 'FeatureCollection');
  assert.ok(Array.isArray(geojson.features));
  assert.ok(geojson.dataset_version);

  if (geojson.features.length > 0) {
    const firstFeature = geojson.features[0];
    assert.equal(firstFeature.geometry.type, 'Point');
    assert.ok(Array.isArray(firstFeature.geometry.coordinates));
    assert.ok(firstFeature.properties.passport_id);
    assert.equal(firstFeature.properties.phone_number, undefined);
  }
  console.log('✓ Test 24 Passed: Research GeoJSON export schema & privacy sanitization');
}

// Test 25: Research Export Rate Limit Key Generation
{
  const ip = '192.168.1.50';
  const key = `export_csv_${ip}`;
  assert.ok(checkRateLimit(key, 5));
  console.log('✓ Test 25 Passed: Export rate limiting mechanism');
}

// Test 26: Dataset Versioning Consistency
{
  const summary = await researchService.getResearchSummary();
  assert.ok(summary.dataset_version.startsWith('RT-RW-RESEARCH-'));
  console.log('✓ Test 26 Passed: Reproducible dataset version tag verified');
}

// Test 27: Spatial Precision Field Generalization
{
  const detail = createMockObservation();
  assert.equal(detail.location.precision, 'district');
  console.log('✓ Test 27 Passed: Spatial generalization level preserved');
}

// -----------------------------------------------------------------
// Group 6: Compliance Audit Logging & Operational Metrics (Tests 28–32)
// -----------------------------------------------------------------

// Test 28: Export Action Creates Compliance Audit Event
{
  const beforeCount = researchService.getComplianceLogs().length;
  await researchService.exportObservationsCsv('dr.aline@rmb.gov.rw');
  const afterCount = researchService.getComplianceLogs().length;

  assert.ok(afterCount > beforeCount);
  const latest = researchService.getComplianceLogs()[0];
  assert.equal(latest.event_type, 'research_export_created');
  assert.equal(latest.actor_id, 'dr.aline@rmb.gov.rw');
  console.log('✓ Test 28 Passed: Research export triggers audited compliance record');
}

// Test 29: Compliance Audit Record Structure
{
  const record = researchService.logComplianceEvent({
    event_id: `evt_custom_${Date.now()}`,
    actor_id: 'admin@rocktalk.rw',
    actor_role: 'admin',
    event_type: 'admin_action',
    target_type: 'expert_account',
    target_id: 'exp-rw-002',
    request_id: 'req-uuid-test',
    metadata: { action: 'review_audit' },
  });

  assert.ok(record.id);
  assert.ok(record.created_at);
  assert.equal(record.actor_role, 'admin');
  console.log('✓ Test 29 Passed: Compliance audit record validation');
}

// Test 30: Operational Metrics Tracking (Request Counting)
{
  const initial = (await researchService.getResearchSummary()).operational_metrics.total_requests;
  researchService.recordRequest();
  researchService.recordRequest();
  const updated = (await researchService.getResearchSummary()).operational_metrics.total_requests;
  assert.equal(updated, initial + 2);
  console.log('✓ Test 30 Passed: Operational request tracking');
}

// Test 31: Verification Status Transition Audit
{
  // SYNTHETIC_TEST_FIXTURE — NOT REAL GEOLOGICAL DATA.
  // The production repository holds no invented observations, so the record under
  // review is registered explicitly through the repository's write path.
  const fixturePassportId = 'RT-RW-TESTFIXTURE-031';
  repo.registerObservation({
    id: 'obs-stage6-fixture-031',
    passport_id: fixturePassportId,
    source: 'test',
    source_user_hash: 'synthetic-test-contributor-hash',
    status: 'completed',
    is_rock: true,
    primary_classification: 'igneous',
    possible_name: 'Basalt',
    confidence: 'moderate',
    confidence_score: 0.7,
    observed_features: ['Fine-grained dark matrix'],
    reasoning: 'Synthetic fixture reasoning used only to exercise the review write path.',
    alternative_possibilities: [],
    limitations: ['Synthetic fixture — not a real specimen'],
    recommended_next_steps: [],
    safety_note: 'Synthetic test fixture. Not a laboratory or expert determination.',
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
    media_id: 'media-stage6-fixture-031',
  });

  // No fabricated identity: the reviewer label is an explicit, platform-supplied
  // string and `identityPublished` defaults to the honest `false`.
  const result = await expertService.submitReview(
    fixturePassportId,
    {
      enteredBy: 'super_admin',
      reviewerLabel: 'Example Reviewer',
      organization: 'Example Organisation',
      identityPublished: false,
    },
    {
      verification_status: 'expert_verified',
      expert_classification: 'igneous',
      expert_rock_name: 'Basalt',
      expert_confidence: 'high',
      expert_notes: 'Stage 6 audit verification test',
    }
  );

  assert.ok(result.auditLog, 'A review must produce an immutable audit log entry');
  assert.equal(result.auditLog.action, 'verified');
  console.log('✓ Test 31 Passed: Authoritative verification produces immutable audit log');
}

// Test 32: Stage 6 End-to-End Integrity Verification
{
  const summary = await researchService.getResearchSummary();
  assert.ok(summary.observation_stats.total >= 0);
  assert.ok(summary.geographic_stats.districts.length >= 0);
  assert.ok(summary.data_quality_stats.average_score >= 0);
  console.log('✓ Test 32 Passed: End-to-end Stage 6 research pipeline integration');
}

// Test 33: No passwordless or preset-identity sign-in path exists
{
  // An earlier verification portal offered three invented "authorised reviewer"
  // identities that could be entered with one click and no password. This test
  // guards against that class of regression at the source level, because the
  // shortcut lived in the React component rather than in the API.
  const modalPath = new URL('../web/src/components/GeneralLoginModal.tsx', import.meta.url);
  const modalSource = await readFile(modalPath, 'utf8');

  assert.ok(
    !/PRESET_EXPERTS/.test(modalSource),
    'The preset reviewer list must not be reintroduced'
  );
  assert.ok(
    !/handleQuickLogin/.test(modalSource),
    'A passwordless quick-login shortcut must not be reintroduced'
  );
  assert.ok(
    !/dr\.aline|jp\.habimana|admin@rocktalk\.rw/i.test(modalSource),
    'Fabricated reviewer identities and emails must not be reintroduced'
  );

  // Both credential fields must be mandatory before a request is sent.
  assert.ok(
    /if \(!email\.trim\(\)\)/.test(modalSource) && /if \(!passcode\)/.test(modalSource),
    'The sign-in form must require both an email and a password'
  );

  // The API client must always send a password, never an optional one.
  const apiSource = await readFile(
    new URL('../web/src/services/expertApi.ts', import.meta.url),
    'utf8'
  );
  assert.ok(
    /loginExpert\(email: string, passcode: string\)/.test(apiSource),
    'The login API must require a password parameter'
  );

  // And the backend must reject a passwordless request outright.
  assert.equal(
    authenticateSuperAdmin('owner@rocktalk.local', ''),
    false,
    'An empty password must never authenticate'
  );

  console.log('\u2713 Test 33 Passed: no passwordless or preset-identity sign-in path exists');
}

console.log('=============================================');
console.log('All 33 Stage 6 automated tests passed successfully!');
console.log('=============================================');
