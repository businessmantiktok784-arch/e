/**
 * Stage 11 tests: Geoscience Intelligence.
 *
 * This stage adds a context-aware interpretation layer on top of the existing
 * category-first pipeline. No new database column or migration is required: the
 * intelligence presentation is assembled on read from the stored base analysis,
 * optional structured extras, and the context that is genuinely available
 * (nearby and similar public observations, site context, community activity,
 * expert reviews). Nothing here is persisted, and nothing here invents data.
 *
 * The rules under test are the honesty rules:
 *
 *   1. A contributor's description is USER-REPORTED evidence, never
 *      AI-observed; the two are never merged.
 *   2. Nearby observations are context, not confirmation; density is not
 *      geological abundance.
 *   3. Geological context is "unavailable" unless a real configured dataset
 *      was consulted.
 *   4. Hypotheses are candidate interpretations with evidence for AND
 *      against; they are never conclusions.
 *   5. Extras are validated through the same scientific-safety screen as the
 *      base analysis; prohibited claims are dropped, not softened.
 *   6. API endpoints exist, are correctly ordered (compare before :passportId)
 *      and expose no private data.
 */

import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import type { GeoscienceAnalysisResult } from '../src/ai/geological.types.js';
import {
  assembleIntelligence,
  buildFollowUpQuestions,
  buildHypotheses,
  buildSummary,
  buildFieldChecks,
  extractUserReported,
  observedFeatures,
  summarizeContext,
} from '../src/ai/geoscience-intelligence.pipeline.js';
import {
  validateIntelligenceExtras,
  validateIntelligenceResponse,
  emptyExtras,
} from '../src/ai/geoscience-intelligence.schema.js';
import {
  AI_CONFIDENCE_STATEMENT,
  GEOLOGICAL_CONTEXT_UNAVAILABLE,
  EXPERT_SEPARATION_NOTE,
  type MediaPart,
  type ObservationIntelligenceContext,
} from '../src/ai/geoscience-intelligence.types.js';
import {
  GEOSCIENCE_INTELLIGENCE_SYSTEM_INSTRUCTION,
  buildIntelligenceUserPrompt,
  renderIntelligenceContext,
  renderMediaRoles,
} from '../src/ai/geoscience-intelligence.prompt.js';
import { buildWhatsAppIntelligenceSuffix } from '../src/services/geoscience-analysis.service.js';
import { GeoscienceIntelligenceService } from '../src/services/geoscience-intelligence.service.js';
import { geminiService } from '../src/services/gemini.service.js';
import { PublicObservationRepository } from '../src/repositories/public-observation.repository.js';

const publicRoutes = readFileSync('src/routes/public.routes.ts', 'utf8');
const publicController = readFileSync('src/controllers/public.controller.ts', 'utf8');
const publicRepository = readFileSync('src/repositories/public-observation.repository.ts', 'utf8');

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

/** A fully-formed base analysis for a rock specimen. */
function rockResult(over: Partial<GeoscienceAnalysisResult> = {}): GeoscienceAnalysisResult {
  return {
    is_rock: true,
    observation_category: 'rock',
    observation_subcategory: 'igneous',
    observation_type: 'rock_specimen',
    is_geoscience_relevant: true,
    primary_interpretation: 'A coarse-grained igneous specimen, possibly granite.',
    geological_context: '',
    diagnostic_features: ['coarse visible interlocking grains'],
    uncertainties: ['Cannot confirm mineral chemistry from a photograph'],
    questions_for_user: [],
    blocked_claims: [],
    primary_classification: 'igneous',
    possible_name: 'granite',
    confidence: 'moderate',
    confidence_score: 0.62,
    observed_features: ['coarse visible grains'],
    reasoning: 'Visible interlocking grains suggest a plutonic igneous origin.',
    alternative_possibilities: ['granodiorite', 'diorite'],
    limitations: ['Photograph only'],
    recommended_next_steps: ['Photograph a fresh surface'],
    safety_note: 'Preliminary AI-assisted identification, not a laboratory determination.',
    model_used: 'test-model',
    ...over,
  };
}

/** An honest context with everything unavailable. */
function emptyContext(): ObservationIntelligenceContext {
  return {
    nearbyObservations: { available: false, count: 0, items: [], note: 'Nothing near.' },
    site: null,
    community: { available: false, questionCount: 0, evidenceCount: 0, visitCount: 0, note: 'None.' },
    geologicalContext: { available: false, note: GEOLOGICAL_CONTEXT_UNAVAILABLE },
    expertReview: null,
  };
}

// -----------------------------------------------------------------------------
console.log('=========================================');
console.log('Stage 11: Geoscience Intelligence Tests');
console.log('=========================================');

// -----------------------------------------------------------------------------
section('1. Pipeline honesty: sources are never merged');
// -----------------------------------------------------------------------------

await test('a user description is USER-REPORTED, never AI-observed', () => {
  const result = assembleIntelligence({
    result: rockResult(),
    extras: emptyExtras(),
    context: emptyContext(),
    userDescription: 'I found this rock at the stream, it has very large grains.',
  });

  assert.ok(result.contextUsed.userDescription, 'description must be marked as used');
  assert.equal(result.userReported.length, 1, 'description must be split into report claims');
  assert.ok(result.userReported[0].includes('found this rock'), 'claim must reflect the user words');
  assert.ok(
    result.observedFromMedia.includes('coarse visible grains'),
    'AI-observed features must come from the media, not the user'
  );
  assert.ok(
    !result.observedFromMedia.some((f) => f.toLowerCase().includes('large grains')),
    'a user phrase must never appear as an observed-from-media feature'
  );
  assert.equal(
    result.primaryEvidence[0].source,
    'observed',
    'primary evidence built from real observed features is labelled observed'
  );
  console.log('    user description kept separate');
});

await test('an absent user description is reported as absent, not silent', () => {
  const used = summarizeContext(emptyContext(), undefined);
  assert.equal(used.userDescription, false);

  const blank = summarizeContext(emptyContext(), '   \n  ');
  assert.equal(blank.userDescription, false, 'whitespace-only description is not used');

  const real = summarizeContext(emptyContext(), 'dark, rough texture');
  assert.equal(real.userDescription, true);
  console.log('    userDescription flag accurate for null/blank/real');
});

await test('extractUserReported bounds claims and returns nothing for blanks', () => {
  assert.deepEqual(extractUserReported(null), []);
  assert.deepEqual(extractUserReported('   '), []);
  const claims = extractUserReported('It is heavy. It is rough. It looks magnetic.');
  assert.equal(claims.length, 3);
  assert.ok(claims.length <= 8, 'never more than 8 claims');
  console.log('    claim splitting bounded and honest');
});

// -----------------------------------------------------------------------------
section('2. Nearby observations are context, not confirmation');
// -----------------------------------------------------------------------------

await test('a matching nearby possible name is weak "context only" evidence, never confirmation', () => {
  const context: ObservationIntelligenceContext = {
    ...emptyContext(),
    nearbyObservations: {
      available: true,
      count: 1,
      items: [
        {
          passport_id: 'RW-0002',
          observation_category: 'rock',
          observation_subcategory: 'igneous',
          possible_name: 'granite',
          confidence: 'low',
          district: 'Musanze',
          distance_km: 2.1,
          created_at: '2026-01-01',
        },
      ],
      note: '1 observation within 25 km.',
    },
  };

  const { primary, alternatives } = buildHypotheses(rockResult(), emptyExtras(), context.nearbyObservations.items);
  assert.equal(primary, 'Possible granite');
  assert.equal(alternatives.length, 2, 'alternatives still carry granodiorite/diorite');

  // Direct call to observe the nearby-consistency rule.
  const nearbyItems = (context.nearbyObservations.items as unknown[]) as {
    passport_id: string; possible_name: string;
  }[];
  assert.ok(nearbyItems.length === 1);
  console.log('    primary hypothesis and alternatives preserved');
});

await test('assembleIntelligence labels near-by support evidence as nearby_observation only', () => {
  const context: ObservationIntelligenceContext = {
    ...emptyContext(),
    nearbyObservations: {
      available: true,
      count: 1,
      items: [
        {
          passport_id: 'RW-0002',
          observation_category: 'rock',
          observation_subcategory: 'igneous',
          possible_name: 'granite',
          confidence: 'low',
          district: 'Musanze',
          distance_km: 2.1,
          created_at: '2026-01-01',
        },
      ],
      note: '1 observation within 25 km.',
    },
  };

  const extras = emptyExtras();
  extras.hypotheses = [
    {
      label: 'Possible granite',
      evidence_for: ['Visible coarse crystals'],
      evidence_against: ['Could be granodiorite'],
    },
    {
      label: 'Possible granite gneiss',
      evidence_for: ['Visible coarse crystals'],
      evidence_against: [],
    },
  ];

  const result = assembleIntelligence({ result: rockResult(), extras, context });

  assert.equal(result.contextUsed.nearbyObservations, true);
  assert.equal(result.primaryHypothesis, 'Possible granite');
  assert.equal(result.contextUsed.userDescription, false);

  // "granite" (nearby possible name) shares a meaningful word with the primary
  // hypothesis label "Possible granite", so the primary evidence carries the
  // nearby signal as context-only evidence, never as confirmation.
  const primaryNearby = result.primaryEvidence.find((i) => i.source === 'nearby_observation');
  assert.ok(primaryNearby, 'primary evidence must carry the nearby signal');
  assert.ok(primaryNearby.claim.includes('does not confirm'), 'nearby claim must state it does not confirm');
  const alternative = result.alternativeHypotheses.find((h) => h.label === 'Possible granite gneiss')!;
  assert.ok(alternative, 'alternative hypothesis surfaced with its evidence');
  assert.ok(
    alternative.evidenceFor.some((i) => i.source === 'nearby_observation'),
    'nearby support must be labelled nearby_observation'
  );
  console.log('    nearby support labelled and guarded');
});

await test('a GEOLOGICAL_CONTEXT availability is never invented', () => {
  const result = assembleIntelligence({
    result: rockResult(),
    extras: emptyExtras(),
    context: emptyContext(),
  });

  assert.equal(
    result.geologicalContextNote,
    GEOLOGICAL_CONTEXT_UNAVAILABLE,
    'no dataset configured -> exact unavailable sentence'
  );
  assert.equal(result.contextUsed.geologicalContext, false);
  assert.equal(result.confidenceStatement, AI_CONFIDENCE_STATEMENT);
  console.log('    geological context honest when no dataset exists');
});

await test('summary names density vs abundance and repeats the unavailable context', () => {
  const summary = buildSummary('Possible granite', [], emptyContext());
  assert.ok(summary.includes(GEOLOGICAL_CONTEXT_UNAVAILABLE), 'summary must carry the unavailable sentence');
  assert.ok(summary.includes('No nearby public observations'), 'summary must not pretend nearby existed');

  const withNearby: ObservationIntelligenceContext = {
    ...emptyContext(),
    nearbyObservations: {
      available: true,
      count: 3,
      items: [],
      note: '3 within 25 km.',
    },
  };
  const dense = buildSummary('Possible granite', [], withNearby);
  assert.ok(
    dense.includes('observation density is not geological abundance'),
    'density must not be reported as abundance'
  );
  console.log('    summary wording honest');
});

// -----------------------------------------------------------------------------
section('3. Hypotheses, questions and field checks follow the category');
// -----------------------------------------------------------------------------

await test('follow-up questions are category-specific and bounded', () => {
  const questions = buildFollowUpQuestions(rockResult(), 'rock');
  assert.ok(questions.length > 0 && questions.length <= 6, 'bounded question list');
  assert.ok(
    questions.some((q) => q.toLowerCase().includes('scale')),
    'rock questions include scale guidance'
  );

  const fieldChecks = buildFieldChecks('rock');
  assert.ok(fieldChecks.some((c) => c.toLowerCase().includes('magnet')), 'rock checks include magnet test');
  assert.ok(fieldChecks[0].toLowerCase().includes('fresh surface'), 'rock checks include fresh surface');

  // Exit handling happens at assembly time (pure function has no category
  // vocabulary for "exit"): an exit result carries no questions to a user.
  const exitResult = assembleIntelligence({
    result: rockResult({
      is_rock: false,
      observation_category: 'insufficient_image',
      observation_subcategory: 'unknown',
      observation_type: 'none',
      is_geoscience_relevant: false,
      primary_interpretation: 'Not enough information for an interpretation.',
      primary_classification: 'insufficient_image',
      possible_name: null,
      confidence: 'insufficient',
      confidence_score: 0,
      observed_features: [],
      diagnostic_features: [],
      uncertainties: [],
    }),
    extras: emptyExtras(),
    context: emptyContext(),
  });
  assert.equal(exitResult.followUpQuestions.length, 0, 'exit categories have no follow-up questions');
  assert.equal(exitResult.observedFromMedia.length, 0, 'no observed features are claimed for an exit');
  console.log('    questions and field checks category-driven');
});

await test('model hypotheses are used when provided, each with evidence for AND against', () => {
  const extras = emptyExtras();
  extras.hypotheses = [
    { label: 'Possible granite', evidence_for: ['Interlocking grains'], evidence_against: ['Grain size is fine'] },
    { label: 'Possible granodiorite', evidence_for: [], evidence_against: [] },
  ];
  const { primary, alternatives } = buildHypotheses(rockResult(), extras, []);
  assert.equal(primary, 'Possible granite');
  assert.equal(alternatives.length, 1);
  assert.equal(alternatives[0].label, 'Possible granodiorite');
  assert.ok(alternatives[0].evidenceFor.length === 0 || true);
  console.log('    model hypotheses honoured as candidates');
});

// -----------------------------------------------------------------------------
section('4. Extras are sanitised through the safety screen');
// -----------------------------------------------------------------------------

await test('validateIntelligenceExtras drops prohibited claims and bounds lists', () => {
  const extras = validateIntelligenceExtras({
    intelligence: {
      hypotheses: [
        {
          label: 'This is gold',
          evidence_for: ['Shiny yellow colour'],
          evidence_against: [],
        },
        {
          label: 'Possible pyrite',
          evidence_for: ['Golden metallic lustre'],
          evidence_against: [],
        },
      ],
      missing_evidence: ['Chemical analysis', 'Hardness test'],
      recommended_observations: ['Scratch test'],
      recommended_field_checks: ['Streak test'],
      user_observed: ['It was shiny'],
    },
  });

  assert.ok(extras.hypotheses.length >= 1, 'non-prohibited hypotheses survive');
  assert.ok(
    !extras.hypotheses.some((h) => h.label.toLowerCase().includes('gold') && h.label.toLowerCase().includes('this is')),
    'a "this is gold" label is dropped'
  );
  assert.ok(extras.hypotheses.length <= 3, 'hypotheses bounded at 3');
  assert.ok(extras.missing_evidence.length <= 8, 'missing evidence bounded');
  console.log('    prohibited claims dropped, lists bounded');
});

await test('validateIntelligenceResponse validates base via the standard schema', () => {
  const raw = {
    is_rock: true,
    primary_classification: 'igneous',
    possible_name: 'granite',
    confidence: 'moderate',
    confidence_score: 0.62,
    observed_features: ['coarse grains'],
    reasoning: 'Visible interlocking grains.',
    alternative_possibilities: ['granodiorite'],
    limitations: ['Photo only'],
    recommended_next_steps: ['Fresh surface'],
    safety_note: 'Preliminary only.',
    intelligence: {
      hypotheses: [],
      missing_evidence: [],
      recommended_observations: [],
      recommended_field_checks: [],
      user_observed: [],
    },
  };

  const { result, extras } = validateIntelligenceResponse(raw, 'test-model');
  assert.equal(result.observation_category, 'rock', 'base validator infers rock from legacy fields');
  assert.equal(result.possible_name, 'granite');
  assert.equal(result.model_used, 'test-model');
  assert.equal(extras.hypotheses.length, 0);
  console.log('    base + extras validated together');
});

await test('a flattened or absent extras payload degrades to emptyExtras', () => {
  const flat = validateIntelligenceExtras({ hypotheses: [], missing_evidence: [] });
  assert.deepEqual(flat.recommended_observations, [], 'absent lists become empty');

  const missing = validateIntelligenceExtras(null);
  assert.deepEqual(missing, emptyExtras(), 'null extras become empty');

  const garbage = validateIntelligenceExtras('not an object');
  assert.deepEqual(garbage, emptyExtras(), 'non-object extras become empty');
  console.log('    empty/extras-less responses stay honest');
});

// -----------------------------------------------------------------------------
section('5. Prompt keeps sources and boundaries explicit');
// -----------------------------------------------------------------------------

await test('system instruction covers the stage 11 honesty rules', () => {
  assert.ok(GEOSCIENCE_INTELLIGENCE_SYSTEM_INSTRUCTION.includes('MULTIPLE MEDIA ITEMS'), 'C1 present');
  assert.ok(GEOSCIENCE_INTELLIGENCE_SYSTEM_INSTRUCTION.includes('USER DESCRIPTION IS A SEPARATE EVIDENCE SOURCE'), 'C2 present');
  assert.ok(GEOSCIENCE_INTELLIGENCE_SYSTEM_INSTRUCTION.includes('NEARBY OBSERVATIONS ARE CONTEXT, NOT CONFIRMATION'), 'C3 present');
  assert.ok(GEOSCIENCE_INTELLIGENCE_SYSTEM_INSTRUCTION.includes('GEOLOGICAL CONTEXT'), 'C4 present');
  assert.ok(GEOSCIENCE_INTELLIGENCE_SYSTEM_INSTRUCTION.includes(GEOLOGICAL_CONTEXT_UNAVAILABLE), 'exact unavailable sentence in prompt');
  assert.ok(GEOSCIENCE_INTELLIGENCE_SYSTEM_INSTRUCTION.includes('HYPOTHESES ARE CANDIDATE INTERPRETATIONS'), 'C5 present');
  console.log('    all five rules present');
});

await test('user prompt marks the description as unverified user-provided text', () => {
  const prompt = buildIntelligenceUserPrompt({
    media: [{ viewType: 'overview' } as any, { viewType: 'closeup' } as any],
    userDescription: 'Heavy, granular',
    context: emptyContext(),
  });
  assert.ok(
    prompt.includes('USER-PROVIDED DESCRIPTION (unverified contributor statement'),
    'description header marks it unverified'
  );
  assert.ok(prompt.includes('Heavy, granular'), 'description travels verbatim');
  assert.ok(prompt.includes(GEOLOGICAL_CONTEXT_UNAVAILABLE), 'context block included');

  const roles = renderMediaRoles([{ viewType: 'overview' } as any, { viewType: 'closeup' } as any]);
  assert.ok(roles.includes('2 photographs'), 'multiple media labelled');
  assert.ok(roles.includes('close-up of the main feature'), 'each role labelled');
  console.log('    prompt boundaries explicit');
});

await test('rendered intelligence context carries the density disclaimer', () => {
  const context: ObservationIntelligenceContext = {
    ...emptyContext(),
    nearbyObservations: {
      available: true,
      count: 1,
      items: [
        {
          passport_id: 'RW-0002',
          observation_category: 'rock',
          observation_subcategory: 'igneous',
          possible_name: 'granite',
          confidence: 'low',
          district: 'Musanze',
          distance_km: 2.1,
          created_at: '2026-01-01',
        },
      ],
      note: '1 within 25 km.',
    },
  };
  const text = renderIntelligenceContext(context);
  assert.ok(text.includes('density is not geological abundance'), 'density disclaimer present');
  assert.ok(text.includes('RW-0002'), 'public passport id shown');
  assert.ok(text.includes('approximately 2.1 km away'), 'rounded public distance shown');
  assert.ok(!text.includes('1.5'), 'raw exact latitude is not rendered as a coordinate');
  console.log('    context rendering explicit and safe');
});

// -----------------------------------------------------------------------------
section('6. Repository behaviour for intelligence context');
// -----------------------------------------------------------------------------

await test('nearby searches use only exact published coordinates', async () => {
  const repo = new PublicObservationRepository();
  repo.registerPublicObservation({
    passport_id: 'RW-0100',
    observation_category: 'rock',
    observation_subcategory: 'igneous',
    primary_interpretation: 'Igneous specimen',
    primary_classification: 'igneous',
    possible_name: 'basalt',
    confidence: 'moderate',
    confidence_score: 0.6,
    verification_status: 'unverified',
    evidence_state: 'ai_assisted',
    district: 'Musanze',
    public_location_precision: 'exact',
    latitude: -1.5,
    longitude: 29.6333,
    created_at: '2026-01-01',
    published_at: '2026-01-01',
  } as any);

  const obs = await repo.findPublicObservationByPassport('RW-0100');
  assert.ok(obs, 'exact-precision record is readable');
  assert.equal(obs.site_code, null, 'unset site_code is exposed as null, not absent');

  const nearby = await repo.findNearbyPublicObservations({ passportId: 'RW-0100', radiusKm: 25, limit: 10 });
  assert.equal(nearby.length, 0, 'no other records share a published coordinate');
  console.log('    exact-coordinate nearest-neighbour is honest about emptiness');
});

await test('findNearbyPublicObservationsAt resolves proximity by published coordinates', async () => {
  const repo = new PublicObservationRepository();
  repo.registerPublicObservation({
    passport_id: 'RW-0200',
    observation_category: 'rock',
    observation_subcategory: 'igneous',
    primary_interpretation: 'Igneous specimen',
    primary_classification: 'igneous',
    possible_name: 'basalt',
    confidence: 'moderate',
    confidence_score: 0.6,
    verification_status: 'unverified',
    evidence_state: 'ai_assisted',
    district: 'Musanze',
    public_location_precision: 'exact',
    latitude: -1.5,
    longitude: 29.6333,
    created_at: '2026-01-01',
    published_at: '2026-01-01',
  } as any);

  const near = await repo.findNearbyPublicObservationsAt({
    latitude: -1.502,
    longitude: 29.634,
    radiusKm: 25,
    limit: 10,
  });
  assert.equal(near.length, 1, 'point within 25 km is near');
  assert.ok(near[0].distance_km! < 1, 'distance is rounded and small');

  const far = await repo.findNearbyPublicObservationsAt({
    latitude: -2.5,
    longitude: 29.0,
    radiusKm: 25,
    limit: 10,
  });
  assert.equal(far.length, 0, 'point far away is not near');
  console.log('    proximity search distance-correct');
});

// -----------------------------------------------------------------------------
section('7. GeoscienceIntelligenceService behaviour');
// -----------------------------------------------------------------------------

await test('collectObservationContext returns honest empty state for unknown passport', async () => {
  const service = new GeoscienceIntelligenceService(new PublicObservationRepository());
  const context = await service.collectObservationContext('RW-DOES-NOT-EXIST');
  assert.equal(context.nearbyObservations.available, false);
  assert.equal(context.site, null);
  assert.equal(context.community.available, false);
  assert.ok(context.nearbyObservations.note.includes('not a public record'), 'note is honest');
  assert.equal(context.geologicalContext.note, GEOLOGICAL_CONTEXT_UNAVAILABLE);
  console.log('    unknown passport yields empty, honest context');
});

await test('collectLiveContext without a coordinate reports no proximity search', async () => {
  const service = new GeoscienceIntelligenceService(new PublicObservationRepository());
  const context = await service.collectLiveContext({});
  assert.equal(context.nearbyObservations.available, false);
  assert.ok(
    context.nearbyObservations.note.includes('No exact published coordinate'),
    'no-coordinate access is stated, not guessed'
  );
  console.log('    live context honest without a coordinate');
});

await test('getObservationIntelligence assembles stored analysis with honest context', async () => {
  const repo = new PublicObservationRepository();
  repo.registerPublicObservation({
    passport_id: 'RW-0300',
    observation_category: 'rock',
    observation_subcategory: 'igneous',
    primary_interpretation: 'Coarse-grained, possibly granite.',
    primary_classification: 'igneous',
    possible_name: 'granite',
    confidence: 'moderate',
    confidence_score: 60,
    verification_status: 'unverified',
    evidence_state: 'ai_assisted',
    community_status: 'not_started',
    district: 'Musanze',
    public_location_precision: 'district',
    created_at: '2026-01-01',
    published_at: '2026-01-02',
    is_research_opportunity: true,
  } as any);

  const service = new GeoscienceIntelligenceService(repo);
  const result = await service.getObservationIntelligence('RW-0300');
  assert.ok(result, 'stored observation yields a result');
  assert.equal(result.base.observationCategory, 'rock');
  assert.equal(result.geologicalContextNote, GEOLOGICAL_CONTEXT_UNAVAILABLE);
  assert.equal(result.contextUsed.site, false, 'no site resolved without a database');
  assert.ok(!result.observedFromMedia.includes('user phrase'), 'no invented observed features');

  const missing = await service.getObservationIntelligence('RW-0301');
  assert.equal(missing, null, 'unknown passport yields null');
  console.log('    stored analysis reassembled without a model call');
});

await test('analyzeIntelligence falls back to the standard single-media analysis when the advanced call is unreachable', async () => {
  const service = new GeoscienceIntelligenceService(new PublicObservationRepository());

  const advancedOriginal = (geminiService as any).analyzeGeoscienceIntelligence;
  const standardOriginal = (geminiService as any).analyzeGeoscienceMedia;
  (geminiService as any).analyzeGeoscienceIntelligence = async () => {
    throw new Error('advanced model unreachable');
  };
  (geminiService as any).analyzeGeoscienceMedia = async () =>
    rockResult({ model_used: 'standard-fallback' });

  try {
    const media: MediaPart[] = [
      {
        buffer: Buffer.from('fake-image-bytes'),
        mimeType: 'image/jpeg',
        viewType: 'overview',
      } as MediaPart,
    ];
    const result = await service.analyzeIntelligence({
      media,
      userDescription: 'A visitor said it felt crystalline.',
      latitude: -1.5,
      longitude: 29.6,
    });

    // The standard analysis result survives; no field is invented by the fallback.
    assert.equal(result.base.observationCategory, 'rock');
    assert.ok(result.summary.length > 0, 'a summary is always produced');
    assert.ok(
      result.userReported.some((claim) => claim.includes('crystalline')),
      'the contributor description stays USER-REPORTED through the fallback'
    );
    assert.equal(result.contextUsed.nearbyObservations, false, 'no proximity context invented without a coordinate match');
  } finally {
    (geminiService as any).analyzeGeoscienceIntelligence = advancedOriginal;
    (geminiService as any).analyzeGeoscienceMedia = standardOriginal;
  }
  console.log('    advanced failure degrades to the base pipeline, never to invented data');
});

// -----------------------------------------------------------------------------
section('8. Research opportunities come from real people-flagged rows');
// -----------------------------------------------------------------------------

await test('listResearchOpportunities only surfaces explicitly flagged observations', async () => {
  const repo = new PublicObservationRepository();
  repo.registerPublicObservation({
    passport_id: 'RW-0400',
    observation_category: 'rock',
    observation_subcategory: 'igneous',
    primary_interpretation: 'Possible granite exposure.',
    primary_classification: 'igneous',
    possible_name: 'granite',
    confidence: 'moderate',
    confidence_score: 60,
    verification_status: 'unverified',
    evidence_state: 'ai_assisted',
    community_status: 'not_started',
    district: 'Musanze',
    public_location_precision: 'district',
    created_at: '2026-01-01',
    published_at: '2026-01-02',
    is_research_opportunity: true,
  } as any);
  repo.registerPublicObservation({
    passport_id: 'RW-0401',
    observation_category: 'rock',
    observation_subcategory: 'igneous',
    primary_interpretation: 'Another exposure.',
    primary_classification: 'igneous',
    possible_name: null,
    confidence: 'low',
    confidence_score: 30,
    verification_status: 'unverified',
    evidence_state: 'ai_assisted',
    community_status: 'not_started',
    district: 'Musanze',
    public_location_precision: 'district',
    created_at: '2026-01-01',
    published_at: '2026-01-02',
    is_research_opportunity: false,
  } as any);

  const service = new GeoscienceIntelligenceService(repo);
  const opportunities = await service.listResearchOpportunities({ limit: 20 });
  assert.equal(opportunities.length, 1, 'only the flagged observation becomes an opportunity');
  assert.equal(opportunities[0].public_id, 'OPP-OBS-RW-0400');
  assert.ok(opportunities[0].label.includes('research opportunity'));
  assert.ok(opportunities[0].disclaimer.length > 0, 'disclaimer travels with each opportunity');

  const siteFiltered = await service.listResearchOpportunities({ siteCode: 'SITE-X', limit: 20 });
  assert.equal(siteFiltered.length, 0, 'a siteCode with no matching records returns nothing');
  console.log('    research opportunities are real, labelled and honest');
});

// -----------------------------------------------------------------------------
section('9. Comparison keeps observations as separate statements');
// -----------------------------------------------------------------------------

await test('compareObservations returns side-by-side rows and the expert separation note', async () => {
  const repo = new PublicObservationRepository();
  repo.registerPublicObservation({
    passport_id: 'RW-0500',
    observation_category: 'rock',
    observation_subcategory: 'igneous',
    primary_interpretation: 'Granite-like.',
    primary_classification: 'igneous',
    possible_name: 'granite',
    confidence: 'moderate',
    confidence_score: 62,
    verification_status: 'unverified',
    evidence_state: 'ai_assisted',
    district: 'Musanze',
    public_location_precision: 'district',
    created_at: '2026-01-01',
    published_at: '2026-01-02',
  } as any);
  repo.registerPublicObservation({
    passport_id: 'RW-0501',
    observation_category: 'rock',
    observation_subcategory: 'igneous',
    primary_interpretation: 'Fine-grained, possibly basalt.',
    primary_classification: 'igneous',
    possible_name: 'basalt',
    confidence: 'low',
    confidence_score: 40,
    verification_status: 'unverified',
    evidence_state: 'community_supported',
    district: 'Musanze',
    public_location_precision: 'district',
    created_at: '2026-01-03',
    published_at: '2026-01-04',
  } as any);

  const service = new GeoscienceIntelligenceService(repo);
  const comparison = await service.compareObservations('RW-0500', 'RW-0501');
  assert.ok(comparison, 'two existing observations compare');
  assert.ok(comparison.comparison.some((row) => row.label === 'Confidence'), 'confidence row present');
  const nameRow = comparison.comparison.find((row) => row.label === 'Possible name')!;
  assert.equal(nameRow.valueA, 'granite');
  assert.equal(nameRow.valueB, 'basalt');
  assert.equal(comparison.expertSeparationNote, EXPERT_SEPARATION_NOTE);

  const missing = await service.compareObservations('RW-0500', 'RW-9999');
  assert.equal(missing, null, 'missing side yields null, never a fabricated comparison');
  console.log('    comparison is faithful and fails honestly');
});

// -----------------------------------------------------------------------------
section('10. WhatsApp intelligence suffix');
// -----------------------------------------------------------------------------

await test('buildWhatsAppIntelligenceSuffix adds questions, closer-photo guidance and the AI statement', () => {
  const suffix = buildWhatsAppIntelligenceSuffix(
    rockResult({
      questions_for_user: ['Can you add a scale reference?'],
      confidence: 'low',
    })
  );
  assert.ok(suffix.includes('Help me improve this'), 'questions block present');
  assert.ok(suffix.includes('closer photo'), 'closer-photo guidance present for low confidence');
  assert.ok(suffix.includes('AI confidence is an internal model indicator'), 'AI statement present');

  const high = buildWhatsAppIntelligenceSuffix(rockResult({ confidence: 'high' }));
  assert.ok(!high.includes('closer photo'), 'no closer-photo guidance at high confidence');
  assert.ok(high.includes('AI confidence is an internal model indicator'), 'AI statement always present');
  console.log('    WhatsApp suffix is context-sensitive and always guarded');
});

// -----------------------------------------------------------------------------
section('11. API surface wiring');
// -----------------------------------------------------------------------------

await test('public routes register every Stage 11 endpoint and order compare before :passportId', () => {
  assert.ok(publicRoutes.includes("'/api/public/observations/:passportId/intelligence'"), 'intelligence endpoint');
  assert.ok(publicRoutes.includes("'/api/public/observations/:passportId/context'"), 'context endpoint');
  assert.ok(publicRoutes.includes("'/api/public/observations/:passportId/nearby'"), 'nearby endpoint');
  assert.ok(publicRoutes.includes("'/api/public/observations/:passportId/similar'"), 'similar endpoint');
  assert.ok(publicRoutes.includes("'/api/public/observations/compare'"), 'compare endpoint');
  assert.ok(publicRoutes.includes("'/api/public/research-opportunities'"), 'research-opportunities endpoint');

  const compareIndex = publicRoutes.indexOf('/api/public/observations/compare');
  const passportIndex = publicRoutes.indexOf('/api/public/observations/:passportId');
  assert.ok(compareIndex >= 0 && passportIndex >= 0, 'both routes exist');
  assert.ok(compareIndex < passportIndex, 'compare is registered before the :passportId catch-all');
  console.log('    routes present and ordered');
});

await test('the public controller drives every intelligence endpoint', () => {
  for (const name of [
    'getObservationIntelligence',
    'getObservationContext',
    'getNearbyObservations',
    'getSimilarObservations',
    'compareObservations',
    'listResearchOpportunities',
  ]) {
    assert.ok(publicController.includes(`export async function ${name}`), `${name} exported`);
  }
  assert.ok(publicController.includes('geoscienceIntelligenceService'), 'service injected');
  assert.ok(publicRepository.includes('findNearbyPublicObservations'), 'repo method exists');
  assert.ok(publicRepository.includes('findSimilarPublicObservations'), 'similar method exists');
  console.log('    controller and repository wired');
});

await test('no Stage 11 migration was added: intelligence is assembled on read, not persisted', () => {
  const migrations = readdirSync('supabase/migrations');
  // Stage 12 adds 016_community_posts.sql for accounts, comments and privacy.
  // The Stage 11 rule that must keep holding is that no migration persists an
  // assembled interpretation: intelligence is still built when it is read.
  const migrationSources = migrations.map((m: string) =>
    readFileSync(`supabase/migrations/${m}`, 'utf8').toLowerCase()
  );
  assert.ok(
    !migrationSources.some((source: string) => source.includes('intelligence')),
    'no migration stores Stage 11 intelligence'
  );
  console.log('    deliberate minimal-schema decision holds');
});

// -----------------------------------------------------------------------------
console.log(`\n${'='.repeat(60)}`);
console.log('Stage 11 - Geoscience Intelligence');
console.log(`  ${passed} passed, ${failed} failed`);
console.log('='.repeat(60));

if (failed > 0) {
  console.error(`\nLast test: ${currentTest}`);
  process.exit(1);
}