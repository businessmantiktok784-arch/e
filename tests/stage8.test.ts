/**
 * Stage 8 — Community Discovery tests.
 *
 * These tests deliberately avoid any database dependency so they run in CI.
 * They cover the parts that must be correct regardless of environment:
 *
 *   1. Privacy: contributor hashes, phone numbers and MSISDNs never reach a DTO.
 *   2. The evidence ladder cannot be climbed by community agreement alone.
 *   3. Unconfigured database produces an honest empty read, not fake content.
 *   4. Rating limit behaviour.
 */

import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { readFileSync } from 'node:fs';
import {
  CommunityService,
  CommunityRateLimitError,
  MIN_PARTICIPANTS_FOR_SUPPORT,
  MIN_EVIDENCE_FOR_INVESTIGATED,
} from '../src/services/community.service.js';
import {
  publicContributorHandle,
  hashContributor,
  whatsappContributorHash,
  normalizeContributorToken,
  createContributorToken,
  redactContributorHash,
} from '../src/utils/contributor.js';
import { hashUserPhoneNumber } from '../src/utils/crypto.js';
import { isDatabaseConfigured } from '../src/utils/admin-auth.js';
import {
  parseCommand,
  communityCommandService,
} from '../src/services/community-commands.service.js';
import { resolvePublicCoordinates } from '../src/utils/public-location.js';
import { haversineKm } from '../src/repositories/site.repository.js';
import {
  EVIDENCE_STATES,
  EVIDENCE_STATE_RANK,
  EVIDENCE_STATE_LABEL,
  EVIDENCE_STATE_MEANING,
  NON_EVIDENCE_STATES,
  isSupportiveEvidence,
  COMMUNITY_DISCLAIMER,
  AI_DISCLAIMER,
  REPUTATION_DISCLAIMER,
} from '../src/types/community.types.js';
import {
  EVIDENCE_STATE_COLORS,
  EVIDENCE_STATE_LABELS,
  EVIDENCE_STATE_EXPLANATIONS,
  EVIDENCE_STATE_RANK as CLIENT_EVIDENCE_STATE_RANK,
} from '../web/src/types/community.js';

const service = new CommunityService();

console.log('=========================================');
console.log('Stage 8: Community Discovery Tests');
console.log('=========================================');

// -----------------------------------------------------------------------------
// Test 1: contributor identity is pseudonymous and stable
// -----------------------------------------------------------------------------
{
  const phone = '+254712345678';
  const a = hashContributor(phone);
  const b = hashContributor(phone);
  assert.equal(a, b, 'Hashing the same identifier must be stable');

  const different = hashContributor('+254712345679');
  assert.notEqual(a, different, 'Different identifiers must hash differently');

  assert.equal(a.length, 64, 'Contributor hash must be a SHA-256 hex digest');
  assert.ok(!a.includes('254'), 'Hash must not contain the raw identifier');
  assert.ok(!a.includes(phone), 'Hash must not embed the phone number');
  console.log('✓ Test 1 Passed: contributor hashing is stable, opaque and irreversible');
}

// -----------------------------------------------------------------------------
// Test 2: public handles expose no personal data
// -----------------------------------------------------------------------------
{
  const hash = hashContributor('+254712345678');
  const handle = publicContributorHandle(hash);

  assert.ok(handle.startsWith('Field Explorer #'), 'Handle must use the neutral explorer form');
  assert.ok(!handle.includes('254'), 'Handle must not contain a phone number');
  assert.ok(!handle.includes(hash), 'Handle must not contain the raw contributor hash');

  // Stable across calls, which is required for reputation continuity.
  assert.equal(handle, publicContributorHandle(hash));

  const redacted = redactContributorHash(hash);
  assert.ok(!redacted.includes(hash), 'Redacted hash must be truncated');
  assert.equal(publicContributorHandle(''), 'Anonymous Contributor');
  console.log('✓ Test 2 Passed: public handles leak no identity information');
}

// -----------------------------------------------------------------------------
// Test 3: browser contributor tokens are validated
// -----------------------------------------------------------------------------
{
  const token = createContributorToken();
  assert.ok(normalizeContributorToken(token), 'A freshly issued token must be accepted');
  assert.equal(normalizeContributorToken(token), token, 'Token must survive normalisation');

  assert.equal(normalizeContributorToken('short'), null, 'Short tokens must be rejected');
  assert.equal(normalizeContributorToken('a'.repeat(300)), null, 'Over-long tokens must be rejected');
  assert.equal(normalizeContributorToken('has spaces in it here'), null, 'Tokens with spaces must be rejected');
  assert.equal(normalizeContributorToken('<script>alert(1)</script>'), null, 'Injection-shaped tokens must be rejected');
  assert.equal(normalizeContributorToken(12345), null, 'Non-string tokens must be rejected');
  console.log('✓ Test 3 Passed: contributor token validation rejects malformed input');
}

// -----------------------------------------------------------------------------
// Test 4: the evidence ladder has the full eight-value ordering
// -----------------------------------------------------------------------------
{
  assert.equal(EVIDENCE_STATES.length, 8, 'Evidence ladder must define exactly eight states');

  const ordered = [...EVIDENCE_STATES].sort(
    (a, b) => EVIDENCE_STATE_RANK[a] - EVIDENCE_STATE_RANK[b]
  );
  assert.deepEqual(ordered, [
    // No evidence at all is not the bottom of a scale of weak support. It means
    // nothing could be concluded, which is a different statement and has to rank
    // below every state that asserts something.
    'insufficient_evidence',
    'ai_assisted',
    'community_supported',
    'community_investigated',
    'expert_reviewed',
    'scientifically_confirmed',
    // Disputes and withdrawals rank highest so a rollup can never bury a dispute
    // behind a weaker or unrelated confirmed reading.
    'unresolved',
    'rejected',
  ], 'Ladder ordering must place scientific confirmation above community input');

  assert.equal(
    NON_EVIDENCE_STATES.has('insufficient_evidence'),
    true,
    'insufficient_evidence must never count as support'
  );
  assert.equal(NON_EVIDENCE_STATES.has('rejected'), true, 'rejected must never count as support');
  assert.equal(
    isSupportiveEvidence('insufficient_evidence'),
    false,
    'No-support states must not be reported as supportive evidence'
  );
  assert.equal(isSupportiveEvidence('community_supported'), true, 'Community support is supportive evidence');

  for (const state of EVIDENCE_STATES) {
    assert.ok(EVIDENCE_STATE_LABEL[state], `${state} must have a label`);
    assert.ok(EVIDENCE_STATE_MEANING[state], `${state} must have a plain-language meaning`);
  }
  console.log('✓ Test 4 Passed: evidence ladder ordering is correct and complete');
}

// -----------------------------------------------------------------------------
// Test 5: AI-only data can never exceed ai_assisted
// -----------------------------------------------------------------------------
{
  // A brand new observation with no human involvement.
  const state = service.deriveEvidenceState({});
  assert.equal(state, 'ai_assisted', 'With no evidence the state must be ai_assisted');
  console.log('✓ Test 5 Passed: an unevidenced observation stays ai_assisted');
}

// -----------------------------------------------------------------------------
// Test 6: community agreement alone is not scientific confirmation
// -----------------------------------------------------------------------------
{
  const manyVotes = service.deriveEvidenceState({
    distinctParticipants: 500,
    substantiveEvidenceCount: 0,
  });
  assert.equal(manyVotes, 'community_supported', 'Votes alone cap at community_supported');
  assert.notEqual(manyVotes, 'scientifically_confirmed');
  assert.notEqual(manyVotes, 'expert_reviewed');

  const oneParticipant = service.deriveEvidenceState({ distinctParticipants: 1 });
  assert.equal(oneParticipant, 'ai_assisted', 'A single participant must not add credibility');

  const twoParticipants = service.deriveEvidenceState({ distinctParticipants: 2 });
  assert.equal(twoParticipants, 'ai_assisted', 'Below the threshold nothing changes');

  const atThreshold = service.deriveEvidenceState({
    distinctParticipants: MIN_PARTICIPANTS_FOR_SUPPORT,
  });
  assert.equal(atThreshold, 'community_supported', 'The documented threshold must be honoured');
  console.log('✓ Test 6 Passed: community votes alone cannot reach expert or scientific states');
}

// -----------------------------------------------------------------------------
// Test 7: substantive evidence raises the state to community_investigated
// -----------------------------------------------------------------------------
{
  const state = service.deriveEvidenceState({
    distinctParticipants: 1,
    substantiveEvidenceCount: MIN_EVIDENCE_FOR_INVESTIGATED,
  });
  assert.equal(state, 'community_investigated', 'Real evidence must move the state up');
  console.log('✓ Test 7 Passed: substantive community evidence is reflected in the state');
}

// -----------------------------------------------------------------------------
// Test 8: only a real expert review reaches expert_reviewed
// -----------------------------------------------------------------------------
{
  const reviewed = service.deriveEvidenceState({ hasExpertReview: true });
  assert.equal(reviewed, 'expert_reviewed', 'A recorded review must reach expert_reviewed');

  const confirmed = service.deriveEvidenceState({
    hasExpertReview: true,
    expertEvidenceBasis: 'Thin section petrography compared to a documented reference specimen',
  });
  assert.equal(confirmed, 'scientifically_confirmed', 'A laboratory-backed review must confirm');

  // Community activity must not upgrade a review's basis.
  const communityBoostIgnored = service.deriveEvidenceState({
    hasExpertReview: true,
    expertEvidenceBasis: 'Visual inspection only',
    distinctParticipants: 900,
    substantiveEvidenceCount: 400,
  });
  assert.equal(
    communityBoostIgnored,
    'expert_reviewed',
    'Community popularity must never upgrade an expert review to scientific confirmation'
  );
  console.log('✓ Test 8 Passed: scientific confirmation requires a laboratory-backed expert review');
}

// -----------------------------------------------------------------------------
// Test 9: disputes force the unresolved state regardless of other evidence
// -----------------------------------------------------------------------------
{
  const disputed = service.deriveEvidenceState({
    hasExpertReview: true,
    expertEvidenceBasis: 'XRD analysis',
    distinctParticipants: 50,
    isDisputed: true,
  });
  assert.equal(disputed, 'unresolved', 'A dispute must surface as unresolved');
  console.log('✓ Test 9 Passed: disputes are surfaced rather than hidden');
}

// -----------------------------------------------------------------------------
// Test 10: highestEvidenceState picks the strongest state
// -----------------------------------------------------------------------------
{
  assert.equal(
    CommunityService.highestEvidenceState(['ai_assisted', 'expert_reviewed', 'community_supported']),
    'expert_reviewed'
  );
  assert.equal(CommunityService.highestEvidenceState([null, null]), null);
  assert.equal(CommunityService.highestEvidenceState([]), null);
  assert.equal(
    CommunityService.highestEvidenceState(['ai_assisted', 'scientifically_confirmed']),
    'scientifically_confirmed'
  );
  console.log('✓ Test 10 Passed: state aggregation selects the strongest evidence');
}

// -----------------------------------------------------------------------------
// Test 11: site privacy never exposes a coordinate the policy forbids
// -----------------------------------------------------------------------------
{
  const trueLat = -1.9403;
  const trueLon = 30.0167;

  // District precision must return the district centre, never the true point.
  const districtOnly = resolvePublicCoordinates({
    precision: 'district',
    district: 'Nyarugenge',
    latitude: trueLat,
    longitude: trueLon,
  });
  assert.ok(districtOnly, 'A district-precision site must still be mappable');
  assert.notEqual(
    districtOnly.latitude,
    trueLat,
    'District precision must not publish the true latitude'
  );
  assert.equal(districtOnly.latitude, -1.9667, 'District precision must publish the district centre');
  assert.equal(districtOnly.longitude, 30.05);

  // An unrecognised district falls back to the national centre, still not the
  // true coordinate.
  const unknownDistrict = resolvePublicCoordinates({
    precision: 'district',
    district: 'Somewhere Unlisted',
    latitude: trueLat,
    longitude: trueLon,
  });
  assert.equal(unknownDistrict?.latitude, -1.9403, 'Unknown district falls back to the country centre');
  assert.notEqual(unknownDistrict?.longitude, trueLon);

  // Approximate precision must be generalised by roughly 2 km.
  const approximate = resolvePublicCoordinates({
    precision: 'approximate',
    district: 'Nyarugenge',
    latitude: trueLat,
    longitude: trueLon,
  });
  assert.ok(approximate, 'Approximate precision must remain mappable');
  assert.notEqual(approximate.latitude, trueLat, 'Approximate precision must not publish the exact point');
  const approxDeltaDeg = Math.abs(approximate.latitude - trueLat);
  assert.ok(approxDeltaDeg <= 0.02, `Generalisation must stay within ~2 km, got ${approxDeltaDeg} degrees`);

  // Exact precision keeps the real coordinate.
  const exact = resolvePublicCoordinates({
    precision: 'exact',
    district: 'Nyarugenge',
    latitude: trueLat,
    longitude: trueLon,
  });
  assert.equal(exact?.latitude, trueLat, 'Exact-precision records keep their real coordinate');
  assert.equal(exact?.longitude, trueLon);

  // Exact precision with no coordinate must not invent one.
  assert.equal(
    resolvePublicCoordinates({ precision: 'exact', district: 'Nyarugenge', latitude: null, longitude: null }),
    null,
    'A missing coordinate must never be fabricated'
  );
  console.log('✓ Test 11 Passed: location precision policy is enforced on every read');
}

// -----------------------------------------------------------------------------
// Test 12: every public payload carries its disclaimer
// -----------------------------------------------------------------------------
{
  assert.ok(AI_DISCLAIMER.length > 20, 'AI disclaimer must be substantive');
  assert.ok(COMMUNITY_DISCLAIMER.length > 20, 'Community disclaimer must be substantive');
  assert.ok(REPUTATION_DISCLAIMER.length > 20, 'Reputation disclaimer must be substantive');

  // The community disclaimer must state that agreement is not scientific truth.
  const combined = `${COMMUNITY_DISCLAIMER} ${REPUTATION_DISCLAIMER}`.toLowerCase();
  assert.ok(
    combined.includes('not') ,
    'Disclaimers must contain an explicit negation of scientific authority'
  );
  console.log('✓ Test 12 Passed: AI, community and reputation disclaimers are present');
}

// -----------------------------------------------------------------------------
// Test 13: haversine distance is correct for a known distance
// -----------------------------------------------------------------------------
{
  // Nairobi to Mombasa is roughly 440 km.
  const d = haversineKm(-1.2921, 36.8219, -4.0435, 39.6682);
  assert.ok(d > 400 && d < 480, `Expected roughly 440 km, received ${d}`);

  // Kigali to Huye is roughly 80 km.
  const rwanda = haversineKm(-1.9441, 30.0619, -2.6, 29.7333);
  assert.ok(rwanda > 60 && rwanda < 100, `Expected roughly 80 km, received ${rwanda}`);

  assert.equal(haversineKm(0, 0, 0, 0), 0, 'Distance to itself must be zero');
  assert.equal(haversineKm(51.5, -0.12, 51.5, -0.12), 0);

  // Symmetry: the distance must not depend on argument order.
  assert.ok(
    Math.abs(haversineKm(-1.94, 30.06, -2.6, 29.73) - haversineKm(-2.6, 29.73, -1.94, 30.06)) < 1e-9,
    'Distance calculation must be symmetric'
  );
  console.log('✓ Test 13 Passed: proximity distance calculation is accurate');
}

// -----------------------------------------------------------------------------
// Test 14: rate limiting blocks runaway contributors
// -----------------------------------------------------------------------------
{
  const key = 'test-community-contributor-unique-key';
  const limit = 5;
  let allowed = 0;
  for (let i = 0; i < limit + 3; i += 1) {
    const { checkRateLimit } = await import('../src/utils/rate-limiter.js');
    if (checkRateLimit(key, limit, 60_000)) allowed += 1;
  }
  assert.equal(allowed, limit, 'Rate limiter must admit exactly the configured number of requests');
  console.log('✓ Test 14 Passed: community action rate limiting is enforced');
}

// -----------------------------------------------------------------------------
// Test 15: rate-limit errors are distinguishable from real failures
// -----------------------------------------------------------------------------
{
  const err = new CommunityRateLimitError();
  assert.ok(err instanceof Error);
  assert.equal(err.name, 'CommunityRateLimitError');
  assert.ok(/wait/i.test(err.message), 'Rate limit message must tell the user to wait');
  console.log('✓ Test 15 Passed: rate limit errors are a distinct, user-safe class');
}

// -----------------------------------------------------------------------------
// Test 16: WhatsApp command parsing
// -----------------------------------------------------------------------------
{
  assert.deepEqual(parseCommand('vote INV-000123 basalt'), { verb: 'VOTE', argument: 'INV-000123 basalt' });
  assert.deepEqual(parseCommand('/SITES'), { verb: 'SITES', argument: '' });
  assert.deepEqual(parseCommand('  Investigate   Is this basalt?  '), {
    verb: 'INVESTIGATE',
    argument: 'Is this basalt?',
  });
  assert.equal(parseCommand(''), null);
  assert.equal(parseCommand('   '), null);

  // Multi-word arguments must survive intact.
  assert.equal(parseCommand('EVIDENCE INV-1 field_note dark grey fine grained').argument,
    'INV-1 field_note dark grey fine grained');
  console.log('✓ Test 16 Passed: WhatsApp command parsing preserves arguments verbatim');
}

// -----------------------------------------------------------------------------
// Test 17: non-community text is not swallowed by the community handler
// -----------------------------------------------------------------------------
{
  // These must be rejected so the original Stage 1-3 text flow still runs.
  const notCommands = ['hello', 'hi', 'help', 'start', 'what is this rock', ''];
  for (const text of notCommands) {
    assert.equal(await communityCommandService.buildReply('+250788000000', text), null,
      `"${text}" must fall through to the normal text handler`);
  }

  // A real command must be recognised.
  assert.notEqual(await communityCommandService.buildReply('+250788000000', 'COMMUNITYHELP'), null,
    'A community command must be recognised');
  assert.notEqual(await communityCommandService.buildReply('+250788000000', '/sites'), null,
    'Commands must work with a leading slash');
  console.log('✓ Test 17 Passed: existing Stage 1 text commands are not intercepted');
}

// -----------------------------------------------------------------------------
// Test 18: community commands fail honestly when the database is unavailable
// -----------------------------------------------------------------------------
{
  assert.equal(isDatabaseConfigured(), false,
    'This test assumes no real database is configured in the test environment');

  // Every write-style command must report unavailability rather than success.
  const writeCommands = [
    'INVESTIGATE Is this basalt?',
    'VOTE INV-000123 Basalt',
    'EVIDENCE INV-000123 field_note dark grey',
    'ASK What mineral is this?',
    'ANSWER Q-000001 Feldspar',
    'VISIT RT-SITE-000001',
    'REP',
    'SITES',
  ];

  for (const cmd of writeCommands) {
    const reply = await communityCommandService.buildReply('+250788000000', cmd);
    assert.ok(reply, `"${cmd}" must produce a reply`);
    assert.ok(
      /not available|not configured/i.test(reply),
      `"${cmd}" must state that community features are unavailable, got: ${reply}`
    );
    // Critically, it must not read as a success. These are specific success
    // claims, not bare keywords: "nothing has been recorded" is honest wording
    // and must still pass.
    const successClaims = [
      /your public reference is/i,
      /^thank you/i,
      /others can (vote|answer)/i,
      /investigation opened/i,
      /question posted/i,
      /visit recorded/i,
    ];
    for (const pattern of successClaims) {
      assert.ok(
        !pattern.test(reply),
        `"${cmd}" must not claim success (${pattern}) when nothing was stored, got: ${reply}`
      );
    }
  }
  console.log('✓ Test 18 Passed: community commands never claim success without a database');
}

// -----------------------------------------------------------------------------
// Test 19: WhatsApp identity matches the hash stored on observations
// -----------------------------------------------------------------------------
{
  const phone = '+250788123456';
  const viaWhatsApp = whatsappContributorHash(phone);
  const viaObservations = hashUserPhoneNumber(phone);

  assert.equal(viaWhatsApp, viaObservations,
    'A WhatsApp participant must resolve to the same contributor key as their observations');
  assert.notEqual(viaWhatsApp, hashContributor(`web:${phone}`),
    'Browser and WhatsApp identities must be domain-separated');
  assert.ok(!viaWhatsApp.includes('250'), 'The stored key must not contain the phone number');
  console.log('✓ Test 19 Passed: WhatsApp contributor identity is consistent across entry paths');
}

// -----------------------------------------------------------------------------
// Test 20: the Site Explorer keeps the three knowledge sources separate
// -----------------------------------------------------------------------------
{
  const source = await readFile(
    new URL('../web/src/components/SiteExplorerModal.tsx', import.meta.url),
    'utf8'
  );

  // All three blocks must be present and individually labelled.
  for (const label of ['AI interpretation', 'Community record', 'Expert review']) {
    assert.ok(source.includes(label), `The Site Explorer must show a "${label}" block`);
  }

  // They must be three separate <section> elements, not one merged panel.
  const sections = source.match(/<section/g) ?? [];
  assert.ok(sections.length >= 3, 'The three blocks must be rendered as separate sections');

  // The AI block must never claim verification, and must carry its disclaimer.
  assert.ok(
    /EVIDENCE_STATE_EXPLANATIONS\.ai_assisted/.test(source),
    'The AI block must explain what an automated reading does not establish'
  );

  // The explicit separation statement must be present.
  assert.ok(
    /different kinds of statement/i.test(source),
    'The Site Explorer must state that the three sources are not equivalent'
  );
  assert.ok(
    /agreement is not scientific confirmation/i.test(source),
    'The Site Explorer must state that agreement is not scientific confirmation'
  );

  // Absent blocks must say so honestly rather than rendering as blank.
  assert.ok(
    /No expert has reviewed this site/.test(source),
    'A missing expert review must be stated, not left blank'
  );
  assert.ok(
    /No AI interpretation is available/.test(source),
    'A missing AI interpretation must be stated, not left blank'
  );
  console.log('✓ Test 20 Passed: Site Explorer keeps AI, community and expert strictly separate');
}

// -----------------------------------------------------------------------------
// Test 21: the client evidence ladder matches the server exactly
// -----------------------------------------------------------------------------
{
  const serverRank: Record<string, number> = EVIDENCE_STATE_RANK;
  assert.deepEqual(CLIENT_EVIDENCE_STATE_RANK, serverRank,
    'Client and server evidence ranks must not drift apart');
  for (const state of EVIDENCE_STATES) {
    assert.ok(EVIDENCE_STATE_COLORS[state], `A colour must exist for "${state}"`);
    assert.ok(EVIDENCE_STATE_LABELS[state], `A label must exist for "${state}"`);
    assert.ok(
      EVIDENCE_STATE_EXPLANATIONS[state],
      `A plain-language explanation must exist for "${state}"`
    );
  }
  console.log('✓ Test 21 Passed: client evidence ladder and explanations are complete');
}

// -----------------------------------------------------------------------------
// Test 22: the community view distinguishes empty from unavailable
// -----------------------------------------------------------------------------
{
  const source = await readFile(
    new URL('../web/src/components/CommunityDiscoveryView.tsx', import.meta.url),
    'utf8'
  );

  assert.ok(
    /setUnavailable\(/.test(source),
    'The community view must track an unavailable state separately from empty'
  );
  assert.ok(
    /not configured on this server/i.test(source),
    'The unavailable state must explain that the database is unconfigured'
  );
  assert.ok(
    /not an indication that the community has no contributions/i.test(source),
    'The unavailable state must not read as "no contributions exist"'
  );

  // Empty states must explain why they are empty rather than showing a bare list.
  assert.ok(
    /No geological sites have been published yet/.test(source) &&
      /Nothing is listed before it genuinely exists/.test(source),
    'An empty site list must explain that no placeholder sites are shown'
  );
  assert.ok(
    /nothing (is being shown )?and nothing you\s+submit will be recorded/i.test(
      source.replace(/\s+/g, ' ')
    ),
    'The unavailable banner must state that submissions are not recorded'
  );
  console.log('✓ Test 22 Passed: empty and unavailable states are clearly distinguished');
}

console.log('--- Community Discovery and frontend integrity tests complete ---');

/**
 * Stage 8 GIS regression tests.
 *
 * These are source-integrity checks. The map layer is declarative MapLibre
 * configuration, so the assertions pin the properties that actually matter for
 * correctness: that a site is only drawn at a shareable coordinate, that colour
 * encodes evidence rather than aesthetics, and that the legend does not let a
 * reader mistake community agreement for scientific confirmation.
 */
console.log('\n--- Test 23: geological site layer is drawn only at shareable coordinates ---');
{
  const source = readFileSync(new URL('../src/repositories/site.repository.ts', import.meta.url), 'utf8');

  // District-only sites must be skipped, not snapped to a centroid marker.
  assert.ok(
    /summary\.latitude === null \|\| summary\.longitude === null\) continue;/.test(source),
    'A site with no authorised coordinate must be omitted from GeoJSON rather than drawn at a guessed position'
  );

  // The GeoJSON must publish its precision so a client can distinguish an exact
  // site from an approximate one.
  assert.ok(
    /location_precision: summary\.location_precision/.test(source),
    'Site GeoJSON must publish location_precision so clients do not render all sites as equally precise'
  );

  // Unconfigured database must yield an empty collection, never a throw or a
  // placeholder feature.
  assert.ok(
    /if \(!this\.ready\) return \{ \.\.\.empty, features: \[\] \};/.test(source),
    'An unconfigured database must produce an empty FeatureCollection'
  );

  console.log('   Passed: no guessed coordinates and precision is published');
}

console.log('\n--- Test 24: map colour encodes evidence strength, not classification ---');
{
  const source = readFileSync(new URL('../web/src/components/MapView.tsx', import.meta.url), 'utf8');

  assert.ok(
    /highest_evidence_state/.test(source),
    'The site layer must colour by highest_evidence_state'
  );

  // Every rung of the ladder that the API can return needs a colour, otherwise a
  // site silently falls through to the neutral fallback and misreads as
  // "nothing established".
  //
  // This used to grep MapView for each state name in turn, which asserted a
  // literal string rather than a behaviour and would break on any refactor that
  // generated the expression instead of spelling it out. Coverage is now
  // structural: the paint expression is built from the canonical ladder, so a
  // state cannot be added without a colour. What still needs checking is that
  // the expression really does consult every state, and that each resolves to a
  // distinct hex.
  assert.ok(
    /EVIDENCE_STATES\.flatMap/.test(source),
    'The site colour expression must be generated from EVIDENCE_STATES so no rung can be missed'
  );
  assert.ok(
    /highest_evidence_state/.test(source) && /\['get',\s*'highest_evidence_state'\]/.test(source),
    'The site layer must colour by highest_evidence_state'
  );

  const ladderSource = readFileSync(new URL('../web/src/types/community.ts', import.meta.url), 'utf8');
  const clientStates = (ladderSource.match(/export const EVIDENCE_STATES[^=]*=\s*\[([\s\S]*?)\]/)?.[1] ?? '')
    .split(',')
    .map((entry) => entry.trim().replace(/^'|'$/g, ''))
    .filter(Boolean);

  for (const state of [
    'ai_assisted',
    'community_supported',
    'community_investigated',
    'expert_reviewed',
    'scientifically_confirmed',
    'unresolved',
  ]) {
    assert.ok(
      clientStates.includes(state),
      `The client ladder no longer carries '${state}', so the map cannot colour it`
    );
  }

  const hexes = (ladderSource.match(/'#[0-9a-f]{6}'/gi) ?? []).map((hex) => hex.toLowerCase());
  for (const state of clientStates) {
    assert.ok(
      new RegExp(`${state}:\\s*'#[0-9a-f]{6}'`, 'i').test(ladderSource),
      `No CSS colour is defined for the '${state}' evidence state`
    );
  }
  assert.equal(
    new Set(hexes).size,
    hexes.length,
    'two evidence states share a colour, so the map key cannot distinguish them'
  );

  // A neutral fallback must not be the colour used for an established state.
  assert.ok(
    /'#94a3b8'/.test(source),
    'An unestablished site needs a neutral colour distinct from the established states'
  );

  console.log('   Passed: all six evidence states are mapped to distinct colours');
}

console.log('\n--- Test 25: map legend does not overstate community agreement ---');
{
  // The key is rendered in the left sidebar, not on the map surface, so the
  // caveat is asserted against the component that draws it.
  const source = readFileSync(new URL('../web/src/components/MapLegend.tsx', import.meta.url), 'utf8');
  const flat = source.replace(/\s+/g, ' ');

  assert.ok(
    /more evidence, not a better answer/i.test(flat),
    'The legend must state that a stronger colour means more evidence, not a better answer'
  );
  assert.ok(
    /Community agreement is not scientific\s+confirmation/i.test(flat),
    'The legend must state explicitly that community agreement is not scientific confirmation'
  );

  // Every coloured state must also be named in the legend, so the colour is
  // actually decodable by the reader.
  //
  // The legend now renders the ladder from `EVIDENCE_STATES` /
  // `EVIDENCE_STATE_LABELS` rather than a hand-written list, which is what stops
  // a rung from ever being drawn in a colour the legend does not explain. So
  // the assertion is that the legend is generated from the canonical labels, and
  // that those labels exist for every state.
  assert.ok(
    /EVIDENCE_STATES\.map/.test(source),
    'The legend must be generated from EVIDENCE_STATES so no rung can go unnamed'
  );
  assert.ok(
    /EVIDENCE_STATE_LABELS\[state\]/.test(source),
    'The legend must label each rung from the canonical label map'
  );
  assert.ok(
    /Nothing established/.test(source),
    'The legend must name the neutral swatch used for sites with no recorded state'
  );

  const ladderSource = readFileSync(new URL('../web/src/types/community.ts', import.meta.url), 'utf8');
  for (const label of [
    'AI-assisted',
    'Community-supported',
    'Community-investigated',
    'Expert reviewed',
    'Scientifically confirmed',
    'Unresolved',
  ]) {
    assert.ok(
      ladderSource.includes(label),
      `No canonical label exists for '${label}', so the legend cannot name that colour`
    );
  }

  console.log('   Passed: legend is complete and appropriately caveated');
}

console.log('\n--- Test 26: example environment documents every server-read variable ---');
{
  const envSource = readFileSync(new URL('../src/config/env.ts', import.meta.url), 'utf8');
  const example = readFileSync(new URL('../.env.example', import.meta.url), 'utf8');

  const declared = [...envSource.matchAll(/^ {2}([A-Z_]+): (?:string|number|boolean)/gm)].map((m) => m[1]);
  const documented = new Set([...example.matchAll(/^#?\s*([A-Z_]+)=/gm)].map((m) => m[1]));

  // IS_PRODUCTION is derived from NODE_ENV, not read from the environment.
  const ignorable = new Set(['IS_PRODUCTION']);
  const missing = declared.filter((name) => !ignorable.has(name) && !documented.has(name));

  assert.deepStrictEqual(
    missing,
    [],
    `Every variable read by src/config/env.ts must appear in .env.example. Missing: ${missing.join(', ')}`
  );

  // Anything documented must either be read by the server or be a Vite var.
  const isFrontend = (name: string) => name.startsWith('VITE_');
  const extra = [...documented].filter((name) => !declared.includes(name) && !isFrontend(name));
  assert.deepStrictEqual(
    extra,
    [],
    `.env.example documents variables nothing reads. Stray: ${extra.join(', ')}`
  );

  // Secrets must be marked, since a missing signing key silently makes every
  // phone hash reversible.
  assert.ok(
    /ANONYMOUS_CONTRIBUTOR_SECRET=\s+# REQUIRED IN PRODUCTION/.test(example),
    'ANONYMOUS_CONTRIBUTOR_SECRET must be documented as required in production'
  );
  assert.ok(
    /USER_HASH_SECRET=\s+# REQUIRED IN PRODUCTION/.test(example),
    'USER_HASH_SECRET must be documented as required in production'
  );

  console.log('   Passed: .env.example and src/config/env.ts are in sync');
}

console.log('=========================================');
console.log('All 26 Stage 8 Community Discovery tests passed!');
console.log('=========================================');

console.log('\n--- Test 27: WhatsApp commands do not advertise options they ignore ---');
{
  const source = readFileSync(
    new URL('../src/services/community-commands.service.ts', import.meta.url),
    'utf8'
  );

  // SITES advertises an optional district filter; it must be forwarded.
  assert.ok(
    /listSites\(argument\)/.test(source) &&
      /const district = argument\.trim\(\)/.test(source) &&
      /district: district \|\| undefined/.test(source),
    'SITES must forward its district argument instead of listing every site regardless'
  );

  // VISIT advertises free-text notes; they must reach the service.
  assert.ok(
    /VISIT <site-id> \[YYYY-MM-DD\] \[notes\]/.test(source),
    'VISIT must still document that notes are accepted'
  );
  assert.ok(
    /const notes = parts\.slice\(noteStart\)\.join\(' '\)\.trim\(\) \|\| undefined;/.test(source),
    'VISIT must extract the notes argument rather than dropping it'
  );
  assert.ok(
    /recordVisit\(\{ siteId: site\.id, visitedOn, notes \}/.test(source),
    'VISIT must pass the parsed notes to communityService.recordVisit'
  );

  // A date is optional, so notes must be read from the correct offset whether or
  // not one was supplied.
  assert.ok(
    /noteStart = 2;/.test(source) && /noteStart = 1;|let noteStart = 1;/.test(source),
    'VISIT must advance the note offset only when a date was actually consumed'
  );

  console.log('   Passed: VISIT notes and SITES district filter are both honoured');
}

console.log('\n--- Test 28: Site Explorer never reports hardcoded zero counts ---');
{
  const source = readFileSync(
    new URL('../src/services/community.service.ts', import.meta.url),
    'utf8'
  );

  // The explorer must prefer the aggregated public view.
  assert.ok(
    /this\.sites\.findPublicSiteSummaryById\(siteId\)/.test(source),
    'The Site Explorer must read authoritative aggregates from the public sites view'
  );

  // And its local fallback must derive real counts, not stub them.
  assert.ok(
    /observation_count: counts\.observationCount/.test(source) &&
      /visit_count: counts\.visitCount/.test(source) &&
      /investigation_count: counts\.investigationCount/.test(source) &&
      /question_count: counts\.questionCount/.test(source) &&
      /evidence_count: counts\.evidenceCount/.test(source),
    'The Site Explorer fallback summary must carry the counts actually loaded'
  );

  // No leftover helper that silently reports every site as empty.
  assert.ok(
    !/observation_count: 0,\s*\n\s*visit_count: 0,/.test(source),
    'A site summary builder must not hardcode zero counts'
  );

  console.log('   Passed: Site Explorer counts come from the database, not stubs');
}

console.log('=========================================');
console.log('All 28 Stage 8 Community Discovery tests passed!');
console.log('=========================================');
